import { appwrite, AppwriteError, createProviderSession, mappedError, providerLogin, providerSession } from './appwrite.js';
import { audit, contactHash, decrypt, fail, id, input, ip, now, password, rate, text, tokenHash, verifyPassword, type Ctx, type Row } from './core.js';

function address(value: unknown) {
    const email = text(value, 254, true).toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail(400, 'invalid_email');
    return email;
}
async function connect(c: Ctx, account: Row, existing?: Row | null) {
    const local = existing ?? await c.env.DB.prepare('SELECT * FROM users WHERE appwrite_id=? OR email=?').bind(account.$id, account.email.toLowerCase()).first<Row>();
    if (local) {
        if (local.appwrite_id !== account.$id) fail(409, 'auth_migration_required');
        await c.env.DB.prepare('UPDATE users SET email_verified=?,updated_at=? WHERE id=?').bind(account.emailVerification === true ? 1 : 0, now(), local.id).run();
        return { ...local, email_verified: account.emailVerification === true ? 1 : 0 };
    }
    if (await c.env.DB.prepare('SELECT 1 FROM appwrite_deletions WHERE appwrite_id=?').bind(account.$id).first()) fail(403, 'account_unavailable');
    const user = { id: account.$id, email: account.email.toLowerCase(), email_verified: account.emailVerification === true ? 1 : 0, status: 'active' };
    await c.env.DB.batch([
        c.env.DB.prepare('INSERT INTO users(id,google_sub,email,email_verified,created_at,updated_at,appwrite_id) VALUES(?,?,?,?,?,?,?)').bind(user.id, `appwrite:${account.$id}`, user.email, user.email_verified, now(), now(), account.$id),
        c.env.DB.prepare('INSERT INTO profiles(user_id,updated_at) VALUES(?,?)').bind(user.id, now()),
        c.env.DB.prepare('INSERT INTO discovery_preferences(user_id) VALUES(?)').bind(user.id),
        c.env.DB.prepare('INSERT INTO user_contact_identifiers(user_id,contact_hash) VALUES(?,?)').bind(user.id, await contactHash(c.env, user.email)),
    ]);
    return user;
}
async function authenticated(c: Ctx, email: string, secret: string, device: unknown) {
    let local = await c.env.DB.prepare('SELECT u.*,p.password_hash FROM users u LEFT JOIN password_credentials p ON p.user_id=u.id WHERE u.email=?').bind(email).first<Row>();
    // Lazy migration: require the old password before binding a pre-existing D1 account.
    // Never attach an arbitrary Appwrite account merely because its email matches.
    if (local && !local.appwrite_id) {
        if (!local.password_hash || !await verifyPassword(secret, local.password_hash)) fail(401, 'invalid_credentials');
        try { await appwrite(c.env, '/account', 'POST', { userId: local.id, email, password: secret }); }
        catch (e) {
            if (!(e instanceof AppwriteError && e.status === 409)) throw e;
            const existing = await appwrite(c.env, `/users/${encodeURIComponent(local.id)}`).catch(() => fail(409, 'auth_migration_required'));
            if (existing.$id !== local.id || String(existing.email).toLowerCase() !== email) fail(409, 'auth_migration_required');
        }
    }
    const remote = await providerLogin(c.env, email, secret);
    try {
        if (local && !local.appwrite_id) {
            if (remote.account.$id !== local.id) fail(409, 'auth_migration_required');
            await c.env.DB.batch([
                c.env.DB.prepare('UPDATE users SET appwrite_id=?,email_verified=?,updated_at=? WHERE id=? AND appwrite_id IS NULL').bind(remote.account.$id, remote.account.emailVerification === true ? 1 : 0, now(), local.id),
                c.env.DB.prepare('DELETE FROM password_credentials WHERE user_id=?').bind(local.id),
                c.env.DB.prepare('DELETE FROM sessions WHERE user_id=?').bind(local.id),
                c.env.DB.prepare('DELETE FROM email_actions WHERE user_id=?').bind(local.id),
            ]);
            local = { ...local, appwrite_id: remote.account.$id };
        }
        const user = await connect(c, remote.account, local);
        return await createProviderSession(c, user, remote.session, device);
    } catch (e) {
        await appwrite(c.env, '/account/sessions/current', 'DELETE', undefined, remote.session.secret).catch(() => undefined);
        throw e;
    }
}
export const providerAuth = {
    signup: (c: Ctx) => mappedError(async () => {
        const body = await input(c), email = address(body.email), secret = password(body.password);
        await rate(c, 'signup-ip', ip(c), 8);
        if (await c.env.DB.prepare('SELECT 1 FROM users WHERE email=?').bind(email).first()) fail(409, 'email_already_registered');
        await appwrite(c.env, '/account', 'POST', { userId: id(), email, password: secret });
        const result = await authenticated(c, email, secret, body.deviceName);
        await audit(c.env, 'account_created', result.user.id);
        // A failed delivery must not lose the newly registered account/session.
        // The verification screen offers a rate-limited resend.
        let verificationSent = false;
        try {
            const row = await c.env.DB.prepare('SELECT appwrite_secret_cipher FROM sessions WHERE token_hash=?').bind(await tokenHash(c.env, result.token)).first<Row>();
            await appwrite(c.env, '/account/verifications/email/otp', 'POST', {}, await decrypt(c.env, row!.appwrite_secret_cipher));
            verificationSent = true;
        } catch { /* Show resend in the app; never log the provider response. */ }
        return c.json({ ...result, verificationSent }, 201);
    }),
    login: (c: Ctx) => mappedError(async () => {
        const body = await input(c), email = address(body.email), secret = password(body.password);
        await rate(c, 'login-ip', ip(c), 30); await rate(c, 'login-email', email, 10);
        return c.json(await authenticated(c, email, secret, body.deviceName));
    }),
    logout: (c: Ctx) => mappedError(async () => {
        const token = c.req.header('authorization')?.replace(/^Bearer\s+/i, '') ?? '';
        try {
            const session = await providerSession(c);
            await appwrite(c.env, '/account/sessions/current', 'DELETE', undefined, session.secret);
        } catch { /* Local revocation is mandatory even if Appwrite is unavailable. */ }
        await c.env.DB.prepare('DELETE FROM sessions WHERE token_hash=?').bind(await tokenHash(c.env, token)).run();
        return c.json({ ok: true });
    }),
    forgot: (c: Ctx) => mappedError(async () => {
        const body = await input(c), email = address(body.email);
        await rate(c, 'reset-ip', ip(c), 10); await rate(c, 'reset-email', email, 3);
        const result = await appwrite(c.env, '/account/recovery/otp', 'POST', { email });
        // Appwrite returns an indistinguishable random userId for unknown emails.
        if (typeof result.userId !== 'string' || !result.userId) fail(503, 'auth_service_unavailable');
        return c.json({ ok: true, delivery: 'appwrite', userId: result.userId, message: '登録がある場合は再設定コードを送信します。' });
    }),
    reset: (c: Ctx) => mappedError(async () => {
        const body = await input(c), email = address(body.email), userId = text(body.userId, 36, true), secret = text(body.code, 6, true), next = password(body.password);
        await rate(c, 'reset-code-ip', ip(c), 20); await rate(c, 'reset-code', email, 5);
        if (!/^\d{6}$/.test(secret)) fail(400, 'invalid_or_expired_code');
        await appwrite(c.env, '/account/recovery/otp', 'PUT', { userId, secret, password: next });
        // Revoke only the account whose code was verified, never one selected by email input.
        const user = await c.env.DB.prepare('SELECT id FROM users WHERE appwrite_id=?').bind(userId).first<Row>();
        if (user) {
            await c.env.DB.prepare('DELETE FROM sessions WHERE user_id=?').bind(user.id).run();
            await audit(c.env, 'password_reset', user.id);
        }
        await appwrite(c.env, `/users/${encodeURIComponent(userId)}/sessions`, 'DELETE');
        return c.json({ ok: true });
    }),
    sendVerification: (c: Ctx) => mappedError(async () => {
        await rate(c, 'verify-email', c.get('userId'), 3);
        const session = await providerSession(c);
        try { await appwrite(c.env, '/account/verifications/email/otp', 'POST', {}, session.secret); }
        catch (e) { if (!(e instanceof AppwriteError && e.type === 'user_email_already_verified')) throw e; }
        return c.json({ ok: true, delivery: 'appwrite' });
    }),
    confirmVerification: (c: Ctx) => mappedError(async () => {
        await rate(c, 'verify-code', c.get('userId'), 5);
        const body = await input(c), secret = text(body.code, 6, true), session = await providerSession(c);
        if (!/^\d{6}$/.test(secret)) fail(400, 'invalid_or_expired_code');
        await appwrite(c.env, '/account/verifications/email/otp', 'PUT', { userId: session.appwrite_id, secret }, session.secret);
        const account = await appwrite(c.env, '/account', 'GET', undefined, session.secret);
        if (account.$id !== session.appwrite_id || account.emailVerification !== true) fail(400, 'invalid_or_expired_code');
        await c.env.DB.prepare('UPDATE users SET email_verified=1,updated_at=? WHERE id=?').bind(now(), c.get('userId')).run();
        await audit(c.env, 'email_verified', c.get('userId'));
        return c.json({ ok: true });
    }),
    changePassword: (c: Ctx) => mappedError(async () => {
        const body = await input(c), next = password(body.newPassword), oldPassword = password(body.password), session = await providerSession(c);
        await rate(c, 'password-change', c.get('userId'), 5);
        await appwrite(c.env, '/account/password', 'PATCH', { password: next, oldPassword }, session.secret);
        await c.env.DB.prepare('DELETE FROM sessions WHERE user_id=?').bind(c.get('userId')).run();
        await appwrite(c.env, `/users/${encodeURIComponent(session.appwrite_id)}/sessions`, 'DELETE');
        await audit(c.env, 'password_changed', c.get('userId'));
        return c.json({ ok: true, loginRequired: true });
    }),
    revokeSessions: (c: Ctx) => mappedError(async () => {
        const target = c.req.param('id'), me = c.get('userId');
        const condition = target ? 'user_id=? AND substr(token_hash,1,24)=?' : 'user_id=?';
        const bindings = target ? [me, target] : [me];
        const sessions = await c.env.DB.prepare(`SELECT appwrite_secret_cipher FROM sessions WHERE ${condition}`).bind(...bindings).all<Row>();
        await c.env.DB.prepare(`DELETE FROM sessions WHERE ${condition}`).bind(...bindings).run();
        for (const session of sessions.results) {
            if (session.appwrite_secret_cipher) {
                try { await appwrite(c.env, '/account/sessions/current', 'DELETE', undefined, await decrypt(c.env, session.appwrite_secret_cipher)); }
                catch { console.error('appwrite_session_revocation_failed'); }
            }
        }
        return c.json({ revoked: true });
    }),
};
