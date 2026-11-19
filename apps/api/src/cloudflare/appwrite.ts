import { decrypt, encrypt, fail, id, now, tokenHash, type Ctx, type Env, type Row } from './core.js';

export const usesAppwrite = (env: Env) => env.APP_ENV === 'production' || env.AUTH_PROVIDER !== 'local';
export const appwriteConfigured = (env: Env) => {
    try {
        return Boolean(env.APPWRITE_PROJECT_ID && env.APPWRITE_ENDPOINT && env.APPWRITE_API_KEY &&
            env.SESSION_SECRET?.length >= 32 && env.CONTACT_HASH_KEY?.length >= 32 && atob(env.DATE_LOCATION_KEY).length === 32);
    } catch { return false; }
};
export class AppwriteError extends Error {
    constructor(public status: number, public type: string) { super('Appwrite request failed'); }
}
export async function appwrite(env: Env, path: string, method = 'GET', body?: object, sessionSecret?: string): Promise<Row> {
    if (!appwriteConfigured(env)) fail(503, 'appwrite_not_configured');
    const endpoint = new URL(env.APPWRITE_ENDPOINT!);
    if (endpoint.protocol !== 'https:' || !endpoint.hostname.endsWith('.cloud.appwrite.io') || endpoint.pathname.replace(/\/$/, '') !== '/v1') fail(503, 'appwrite_not_configured');
    let response: Response;
    try {
        response = await fetch(`${endpoint.href.replace(/\/$/, '')}${path}`, {
            method, redirect: 'manual', signal: AbortSignal.timeout(10000),
            headers: { 'Content-Type': 'application/json', 'X-Appwrite-Project': env.APPWRITE_PROJECT_ID!,
                ...(sessionSecret ? { 'X-Appwrite-Session': sessionSecret } : { 'X-Appwrite-Key': env.APPWRITE_API_KEY! }) },
            ...(body ? { body: JSON.stringify(body) } : {}),
        });
    } catch { console.error('appwrite_transport_failed'); return fail(503, 'auth_service_unavailable'); }
    const result = response.status === 204 ? {} : await response.json().catch(() => ({})) as Row;
    if (!response.ok) {
        console.error('appwrite_request_failed', { method, status: response.status, type: typeof result.type === 'string' && /^[a-z_]{1,80}$/.test(result.type) ? result.type : 'unknown' });
        if (response.status === 429) fail(429, 'rate_limited');
        if (response.status >= 500) fail(503, 'auth_service_unavailable');
        // Never expose upstream messages, credentials, cookies or response bodies.
        throw new AppwriteError(response.status, typeof result.type === 'string' ? result.type : 'unknown');
    }
    return result;
}
export async function mappedError(work: () => Promise<Response>): Promise<Response> {
    try { return await work(); }
    catch (e) {
        if (!(e instanceof AppwriteError)) throw e;
        if (e.type === 'user_already_exists' || e.type === 'user_email_already_exists') return fail(409, 'email_already_registered');
        if (e.type === 'user_invalid_token' || e.type === 'user_not_found') return fail(400, 'invalid_or_expired_code');
        if (e.type.includes('password')) return fail(400, 'password_policy_rejected');
        if (e.type === 'user_invalid_credentials') return fail(401, 'invalid_credentials');
        if (e.type === 'general_unauthorized_scope' || e.type === 'project_unknown' || e.type === 'general_unauthorized') return fail(503, 'appwrite_not_configured');
        return fail(503, 'auth_service_unavailable');
    }
}
export async function providerLogin(env: Env, email: string, password: string) {
    const session = await appwrite(env, '/account/sessions/email', 'POST', { email, password });
    if (typeof session.secret !== 'string' || !session.secret || typeof session.userId !== 'string') fail(503, 'appwrite_not_configured');
    try {
        const account = await appwrite(env, '/account', 'GET', undefined, session.secret);
        if (account.$id !== session.userId || String(account.email).toLowerCase() !== email || account.status !== true) fail(401, 'invalid_credentials');
        return { session, account };
    } catch (error) {
        await appwrite(env, '/account/sessions/current', 'DELETE', undefined, session.secret).catch(() => undefined);
        throw error;
    }
}
export async function providerSession(c: Ctx) {
    const token = c.req.header('authorization')?.replace(/^Bearer\s+/i, '') ?? '';
    const row = await c.env.DB.prepare('SELECT s.appwrite_secret_cipher,u.appwrite_id,u.email FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>?').bind(await tokenHash(c.env, token), now()).first<{ appwrite_secret_cipher: string; appwrite_id: string; email: string }>();
    if (!row?.appwrite_secret_cipher || !row.appwrite_id) return fail(401, 'unauthorized');
    return { ...row, secret: await decrypt(c.env, row.appwrite_secret_cipher) };
}
export async function createProviderSession(c: Ctx, user: Row, provider: Row, device: unknown) {
    const token = `${id()}${id()}`, time = now();
    const expiry = Date.parse(provider.expire);
    if (!Number.isFinite(expiry) || expiry <= Date.now()) fail(503, 'auth_service_unavailable');
    const expiresAt = new Date(Math.min(expiry, Date.now() + 30 * 86400000)).toISOString();
    try {
        await c.env.DB.prepare('INSERT INTO sessions(token_hash,user_id,device_name,created_at,expires_at,last_used_at,appwrite_secret_cipher) VALUES(?,?,?,?,?,?,?)').bind(await tokenHash(c.env, token), user.id, typeof device === 'string' ? device.slice(0, 100) : '', time, expiresAt, time, await encrypt(c.env, provider.secret)).run();
    } catch (error) {
        await appwrite(c.env, '/account/sessions/current', 'DELETE', undefined, provider.secret).catch(() => undefined);
        throw error;
    }
    return { token, expiresAt, user: { id: user.id, email: user.email, status: user.status }, emailVerificationRequired: !user.email_verified };
}
export async function validateProviderSession(c: Ctx, row: Row) {
    if (!row.appwrite_secret_cipher || !row.appwrite_id) return fail(401, 'unauthorized');
    let account: Row;
    try { account = await appwrite(c.env, '/account', 'GET', undefined, await decrypt(c.env, row.appwrite_secret_cipher)); }
    catch (e) { if (e instanceof AppwriteError && [401, 403, 404].includes(e.status)) return fail(401, 'unauthorized'); throw e; }
    if (account.$id !== row.appwrite_id || String(account.email).toLowerCase() !== row.email || account.status !== true) fail(401, 'unauthorized');
    const verified = account.emailVerification === true;
    await c.env.DB.prepare('UPDATE users SET email_verified=? WHERE id=?').bind(verified ? 1 : 0, row.id).run();
    const allowed = /^\/api\/(me$|email\/(verification|confirm)$|password\/change$|appeals(?:\/|$)|restrictions$|sessions(?:\/|$)|account(?:\/delete)?$)/.test(c.req.path);
    if (!verified && !allowed) fail(403, 'email_verification_required');
}
export async function dispatchAccountDeletions(env: Env) {
    if (!appwriteConfigured(env)) return;
    const rows = await env.DB.prepare('SELECT appwrite_id FROM appwrite_deletions ORDER BY created_at LIMIT 20').all<Row>();
    for (const row of rows.results) {
        try { await appwrite(env, `/users/${encodeURIComponent(row.appwrite_id)}`, 'DELETE'); }
        catch (e) { if (!(e instanceof AppwriteError && e.status === 404)) { console.error('appwrite_deletion_pending'); continue; } }
        await env.DB.prepare('DELETE FROM appwrite_deletions WHERE appwrite_id=?').bind(row.appwrite_id).run();
    }
}
