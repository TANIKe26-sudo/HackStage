import { usesAppwrite } from './appwrite.js';
import { providerAuth } from './appwrite-auth.js';
import { audit, configured, contactHash, fail, hashPassword, id, input, ip, now, password, rate, text, tokenHash, verifyPassword, type App, type Ctx, type Env, type Row } from './core.js';
function email(value: unknown) {
    const result = text(value, 254, true).toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result))
        fail(400, 'invalid_email');
    return result;
}
async function session(c: Ctx, user: Row, device: unknown) {
    const token = `${id()}${id()}`, time = now(), expiresAt = new Date(Date.now() + 30 * 86400000).toISOString();
    await c.env.DB.prepare('INSERT INTO sessions(token_hash,user_id,device_name,created_at,expires_at,last_used_at) VALUES(?,?,?,?,?,?)').bind(await tokenHash(c.env, token), user.id, typeof device === 'string' ? device.slice(0, 100) : '', time, expiresAt, time).run();
    return { token, expiresAt, user: { id: user.id, email: user.email, status: user.status } };
}
const localMail = (c: Ctx) => c.env.APP_ENV !== 'production' && c.env.MAIL_MODE === 'local' && /^(?:localhost|127\.0\.0\.1|10(?:\.\d{1,3}){3}|192\.168(?:\.\d{1,3}){2})$/.test(new URL(c.req.url).hostname);
export async function dispatchMail(env: Env) {
    if (!env.RESEND_API_KEY || !env.MAIL_FROM)
        return;
    const jobs = await env.DB.prepare("SELECT * FROM email_outbox WHERE status='queued' AND attempts<5 AND available_at<=? ORDER BY created_at LIMIT 25").bind(now()).all<Row>();
    for (const job of jobs.results) {
        try {
            const response = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json', 'Idempotency-Key': job.id }, body: JSON.stringify({ from: env.MAIL_FROM, to: [job.recipient], subject: job.subject, text: job.body }), signal: AbortSignal.timeout(10000) });
            if (!response.ok)
                throw new Error(`mail_http_${response.status}`);
            await env.DB.prepare("UPDATE email_outbox SET status='sent',body='',last_error=NULL WHERE id=?").bind(job.id).run();
        }
        catch (e) {
            await env.DB.prepare("UPDATE email_outbox SET attempts=attempts+1,status=CASE WHEN attempts>=4 THEN 'failed' ELSE 'queued' END,available_at=?,last_error=? WHERE id=?").bind(new Date(Date.now() + 60000 * 2 ** job.attempts).toISOString(), e instanceof Error ? e.message : 'mail_failed', job.id).run();
        }
    }
}
async function issueCode(c: Ctx, user: Row, kind: 'verify' | 'reset') {
    if (!localMail(c) && (!c.env.RESEND_API_KEY || !c.env.MAIL_FROM))
        fail(503, 'mail_not_configured');
    const random = crypto.getRandomValues(new Uint32Array(1))[0], code = String(random % 1000000).padStart(6, '0'), time = now();
    await c.env.DB.batch([
        c.env.DB.prepare('DELETE FROM email_actions WHERE user_id=? AND kind=?').bind(user.id, kind),
        c.env.DB.prepare('INSERT INTO email_actions(token_hash,user_id,kind,expires_at,created_at) VALUES(?,?,?,?,?)').bind(await tokenHash(c.env, `${kind}:${user.id}:${code}`), user.id, kind, new Date(Date.now() + 15 * 60000).toISOString(), time),
    ]);
    if (localMail(c))
        return { delivery: 'local', code };
    await c.env.DB.prepare('INSERT INTO email_outbox(id,recipient,subject,body,created_at,available_at) VALUES(?,?,?,?,?,?)').bind(id(), user.email, kind === 'verify' ? 'NODOBITO メールアドレス確認' : 'NODOBITO パスワード再設定', `確認コード: ${code}\n15分以内にアプリで入力してください。`, time, time).run();
    c.executionCtx.waitUntil(dispatchMail(c.env));
    return { delivery: 'queued' };
}
export function authRoutes(app: App) {
    app.post('/auth/signup', async (c) => {
        if (usesAppwrite(c.env)) return providerAuth.signup(c);
        if (!configured(c.env))
            fail(503, 'server_auth_not_configured');
        const body = await input(c), address = email(body.email), secret = password(body.password);
        await rate(c, 'signup-ip', ip(c), 8);
        if (await c.env.DB.prepare('SELECT 1 FROM users WHERE email=?').bind(address).first())
            fail(409, 'email_already_registered');
        const user = { id: id(), email: address, status: 'active' }, time = now();
        try {
            await c.env.DB.batch([
                c.env.DB.prepare('INSERT INTO users(id,google_sub,email,email_verified,created_at,updated_at) VALUES(?,?,?,0,?,?)').bind(user.id, `password:${user.id}`, address, time, time),
                c.env.DB.prepare('INSERT INTO password_credentials(user_id,password_hash,created_at,updated_at) VALUES(?,?,?,?)').bind(user.id, await hashPassword(secret), time, time),
                c.env.DB.prepare('INSERT INTO profiles(user_id,updated_at) VALUES(?,?)').bind(user.id, time),
                c.env.DB.prepare('INSERT INTO discovery_preferences(user_id) VALUES(?)').bind(user.id),
                c.env.DB.prepare('INSERT INTO user_contact_identifiers(user_id,contact_hash) VALUES(?,?)').bind(user.id, await contactHash(c.env, address)),
            ]);
        }
        catch (e) {
            if (await c.env.DB.prepare('SELECT 1 FROM users WHERE email=?').bind(address).first())
                fail(409, 'email_already_registered');
            throw e;
        }
        await audit(c.env, 'account_created', user.id);
        return c.json(await session(c, user, body.deviceName), 201);
    });
    app.post('/auth/login', async (c) => {
        if (usesAppwrite(c.env)) return providerAuth.login(c);
        if (!configured(c.env))
            fail(503, 'server_auth_not_configured');
        const body = await input(c), address = email(body.email), secret = typeof body.password === 'string' && body.password.length <= 128 ? body.password : '';
        await rate(c, 'login-ip', ip(c), 30);
        await rate(c, 'login-email', address, 10);
        const user = await c.env.DB.prepare('SELECT u.*,p.password_hash FROM users u JOIN password_credentials p ON p.user_id=u.id WHERE email=?').bind(address).first<Row>();
        const valid = await verifyPassword(secret, user?.password_hash ?? `pbkdf2_sha256$310000$${'0'.repeat(32)}$${'0'.repeat(64)}`);
        if (!user || !valid)
            return fail(401, 'invalid_credentials');
        return c.json(await session(c, user, body.deviceName));
    });
    app.post('/auth/logout', async (c) => {
        if (usesAppwrite(c.env)) return providerAuth.logout(c);
        const token = c.req.header('authorization')?.replace(/^Bearer\s+/i, '') ?? '';
        await c.env.DB.prepare('DELETE FROM sessions WHERE token_hash=?').bind(await tokenHash(c.env, token)).run();
        return c.json({ ok: true });
    });
    app.post('/auth/password/forgot', async (c) => {
        if (usesAppwrite(c.env)) return providerAuth.forgot(c);
        const body = await input(c), address = email(body.email);
        await rate(c, 'reset-ip', ip(c), 10);
        await rate(c, 'reset-email', address, 3);
        if (!localMail(c) && (!c.env.RESEND_API_KEY || !c.env.MAIL_FROM))
            fail(503, 'mail_not_configured');
        const user = await c.env.DB.prepare('SELECT id,email FROM users WHERE email=?').bind(address).first<Row>();
        const delivery = user ? await issueCode(c, user, 'reset') : {};
        return c.json({ ok: true, message: '登録がある場合は再設定コードを送信します。', ...(localMail(c) ? delivery : {}) });
    });
    app.post('/auth/password/reset', async (c) => {
        if (usesAppwrite(c.env)) return providerAuth.reset(c);
        const body = await input(c), address = email(body.email), code = text(body.code, 6, true), secret = password(body.password);
        await rate(c, 'reset-code-ip', ip(c), 20);
        await rate(c, 'reset-code', address, 5);
        const user = await c.env.DB.prepare('SELECT id FROM users WHERE email=?').bind(address).first<Row>();
        if (!user)
            return fail(400, 'invalid_or_expired_code');
        const hash = await hashPassword(secret);
        const action = await c.env.DB.prepare("DELETE FROM email_actions WHERE token_hash=? AND user_id=? AND kind='reset' AND expires_at>? RETURNING user_id").bind(await tokenHash(c.env, `reset:${user.id}:${code}`), user.id, now()).first();
        if (!action)
            fail(400, 'invalid_or_expired_code');
        await c.env.DB.batch([c.env.DB.prepare('UPDATE password_credentials SET password_hash=?,updated_at=? WHERE user_id=?').bind(hash, now(), user.id), c.env.DB.prepare('DELETE FROM email_actions WHERE user_id=?').bind(user.id), c.env.DB.prepare('DELETE FROM sessions WHERE user_id=?').bind(user.id)]);
        await audit(c.env, 'password_reset', user.id);
        return c.json({ ok: true });
    });
    app.post('/api/email/verification', async (c) => {
        if (usesAppwrite(c.env)) return providerAuth.sendVerification(c);
        const me = c.get('userId');
        await rate(c, 'verify-email', me, 3);
        const user = await c.env.DB.prepare('SELECT id,email FROM users WHERE id=?').bind(me).first<Row>();
        return c.json({ ok: true, ...await issueCode(c, user!, 'verify') });
    });
    app.post('/api/email/confirm', async (c) => {
        if (usesAppwrite(c.env)) return providerAuth.confirmVerification(c);
        const body = await input(c), me = c.get('userId'), code = text(body.code, 6, true);
        await rate(c, 'verify-code', me, 5);
        const action = await c.env.DB.prepare("DELETE FROM email_actions WHERE token_hash=? AND user_id=? AND kind='verify' AND expires_at>? RETURNING user_id").bind(await tokenHash(c.env, `verify:${me}:${code}`), me, now()).first();
        if (!action)
            fail(400, 'invalid_or_expired_code');
        await c.env.DB.prepare('UPDATE users SET email_verified=1,updated_at=? WHERE id=?').bind(now(), me).run();
        return c.json({ ok: true });
    });
    app.post('/api/password/change', async (c) => {
        if (usesAppwrite(c.env)) return providerAuth.changePassword(c);
        const body = await input(c), secret = password(body.newPassword), me = c.get('userId');
        await rate(c, 'password-change', me, 5);
        const credential = await c.env.DB.prepare('SELECT password_hash FROM password_credentials WHERE user_id=?').bind(me).first<Row>();
        if (!credential || !await verifyPassword(password(body.password), credential.password_hash))
            fail(401, 'reauthentication_failed');
        await c.env.DB.batch([
            c.env.DB.prepare('UPDATE password_credentials SET password_hash=?,updated_at=? WHERE user_id=?').bind(await hashPassword(secret), now(), me),
            c.env.DB.prepare('DELETE FROM sessions WHERE user_id=?').bind(me), c.env.DB.prepare('DELETE FROM email_actions WHERE user_id=?').bind(me),
        ]);
        await audit(c.env, 'password_changed', me);
        return c.json({ ok: true, loginRequired: true });
    });
    app.get('/api/sessions', async (c) => {
        const rows = await c.env.DB.prepare('SELECT token_hash,device_name,created_at,last_used_at,expires_at FROM sessions WHERE user_id=? AND expires_at>? ORDER BY last_used_at DESC').bind(c.get('userId'), now()).all<Row>();
        return c.json({ sessions: rows.results.map(r => ({ id: r.token_hash.slice(0, 24), deviceName: r.device_name, createdAt: r.created_at, lastUsedAt: r.last_used_at, expiresAt: r.expires_at })) });
    });
    app.delete('/api/sessions/:id', async (c) => {
        if (usesAppwrite(c.env)) return providerAuth.revokeSessions(c);
        await c.env.DB.prepare('DELETE FROM sessions WHERE user_id=? AND substr(token_hash,1,24)=?').bind(c.get('userId'), c.req.param('id')).run();
        return c.json({ revoked: true });
    });
    app.delete('/api/sessions', async (c) => { if (usesAppwrite(c.env)) return providerAuth.revokeSessions(c); await c.env.DB.prepare('DELETE FROM sessions WHERE user_id=?').bind(c.get('userId')).run(); return c.json({ revoked: true }); });
}
