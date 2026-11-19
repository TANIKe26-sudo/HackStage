import type { Context, Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
export interface Env {
    DB: D1Database;
    SESSION_SECRET: string;
    CONTACT_HASH_KEY: string;
    DATE_LOCATION_KEY: string;
    ALLOWED_ORIGINS?: string;
    EXPO_ACCESS_TOKEN?: string;
    ADMIN_USERS_KEY?: string;
    ADMIN_CONTENT_KEY?: string;
    ADMIN_SAFETY_KEY?: string;
    ADMIN_AUDIT_KEY?: string;
    RESEND_API_KEY?: string;
    MAIL_FROM?: string;
    MAIL_MODE?: string;
    OPERATIONS_WEBHOOK_URL?: string;
    APP_ENV?: string;
    AUTH_PROVIDER?: string;
    APPWRITE_ENDPOINT?: string;
    APPWRITE_PROJECT_ID?: string;
    APPWRITE_API_KEY?: string;
    AI?: {
        run(model: string, input: Record<string, unknown>): Promise<unknown>;
    };
}
export type AppEnv = {
    Bindings: Env;
    Variables: {
        userId: string;
        actorId: string;
        roles: string[];
    };
};
export type App = Hono<AppEnv>;
export type Ctx = Context<AppEnv>;
export type Row = Record<string, any>;
export const now = () => new Date().toISOString();
export const id = () => crypto.randomUUID();
export const fail = (status: 400 | 401 | 403 | 404 | 409 | 413 | 429 | 503, error: string): never => {
    throw new HTTPException(status, { message: error });
};
export async function input(c: Ctx): Promise<Row> {
    try {
        const value = await c.req.json();
        if (!value || typeof value !== 'object' || Array.isArray(value))
            fail(400, 'invalid_json');
        return value;
    }
    catch (e) {
        if (e instanceof HTTPException)
            throw e;
        return fail(400, 'invalid_json');
    }
}
export function text(value: unknown, max: number, required = false): string {
    if (typeof value !== 'string' || value.length > max || (required && !value.trim()))
        fail(400, 'invalid_text');
    return (value as string).trim();
}
export function page(c: Ctx, max = 100) {
    const limit = Number(c.req.query('limit') ?? 30), offset = Number(c.req.query('offset') ?? 0);
    if (!Number.isInteger(limit) || limit < 1 || limit > max || !Number.isInteger(offset) || offset < 0)
        fail(400, 'invalid_pagination');
    return { limit, offset };
}
export const hex = (buffer: ArrayBuffer) => [...new Uint8Array(buffer)].map(v => v.toString(16).padStart(2, '0')).join('');
export const sha256 = async (s: string) => hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)));
export async function hmac(secret: string, value: string) {
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    return hex(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value)));
}
export const contactHash = (env: Env, value: string) => hmac(env.CONTACT_HASH_KEY, value.trim().toLowerCase());
export const tokenHash = (env: Env, value: string) => hmac(env.SESSION_SECRET, value);
export const configured = (env: Env) => typeof env.SESSION_SECRET === 'string' && env.SESSION_SECRET.length >= 32;
export async function hashPassword(password: string, salt = crypto.getRandomValues(new Uint8Array(16))) {
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
    const hash = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: Uint8Array.from(salt).buffer, iterations: 310000 }, key, 256);
    return `pbkdf2_sha256$310000$${hex(Uint8Array.from(salt).buffer)}$${hex(hash)}`;
}
export async function verifyPassword(password: string, stored: string) {
    const [scheme, rounds, salt, expected] = stored.split('$');
    if (scheme !== 'pbkdf2_sha256' || rounds !== '310000' || !/^[a-f0-9]{32}$/.test(salt ?? '') || !/^[a-f0-9]{64}$/.test(expected ?? ''))
        return false;
    const actual = (await hashPassword(password, Uint8Array.from(salt.match(/../g)!, v => parseInt(v, 16)))).split('$')[3];
    let d = 0;
    for (let i = 0; i < expected.length; i++)
        d |= expected.charCodeAt(i) ^ actual.charCodeAt(i);
    return d === 0;
}
export function password(value: unknown) { if (typeof value !== 'string' || value.length < 9 || value.length > 128 || !value.trim())
    return fail(400, 'invalid_password'); return value; }
export async function rate(c: Ctx, scope: string, identity: string, max: number, seconds = 900) {
    const key = await sha256(`${scope}:${identity}`), window = Math.floor(Date.now() / (seconds * 1000));
    const row = await c.env.DB.prepare(`INSERT INTO auth_attempts(key_hash,window_start,count,expires_at) VALUES(?,?,1,?)
    ON CONFLICT(key_hash) DO UPDATE SET window_start=excluded.window_start,expires_at=excluded.expires_at,count=CASE WHEN auth_attempts.window_start=excluded.window_start THEN auth_attempts.count+1 ELSE 1 END RETURNING count`).bind(key, window, new Date((window + 1) * seconds * 1000).toISOString()).first<{
        count: number;
    }>();
    if ((row?.count ?? max + 1) > max) {
        c.header('Retry-After', String(seconds));
        fail(429, 'rate_limited');
    }
}
export const ip = (c: Ctx) => c.req.header('cf-connecting-ip') ?? 'local';
export async function audit(env: Env, action: string, actor: string | null, subject: string | null = null, metadata: Row = {}) {
    await env.DB.prepare('INSERT INTO audit_logs(id,actor_id,action,subject_id,metadata,created_at) VALUES(?,?,?,?,?,?)').bind(id(), actor, action, subject, JSON.stringify(metadata), now()).run();
}
export async function notify(env: Env, user: string, kind: string, payload: Row = {}) {
    const value = JSON.stringify(payload), time = now();
    await env.DB.batch([
        env.DB.prepare('INSERT INTO notifications(id,user_id,kind,payload,created_at) VALUES(?,?,?,?,?)').bind(id(), user, kind, value, time),
        env.DB.prepare('INSERT INTO push_jobs(id,user_id,kind,payload,created_at,available_at,expo_token) SELECT lower(hex(randomblob(16))),?,?,?,?,?,expo_token FROM push_devices WHERE user_id=?').bind(user, kind, value, time, time, user),
    ]);
}
export async function blocked(env: Env, a: string, b: string) {
    return !!await env.DB.prepare('SELECT 1 FROM blocks WHERE (blocker_id=? AND blocked_id=?) OR (blocker_id=? AND blocked_id=?)').bind(a, b, b, a).first();
}
export async function member(c: Ctx, matchId: string): Promise<Row & {
    other: string;
    low: boolean;
}> {
    const me = c.get('userId');
    const row = await c.env.DB.prepare('SELECT * FROM matches WHERE id=? AND (user_low=? OR user_high=?)').bind(matchId, me, me).first<Row>();
    if (!row || await blocked(c.env, row.user_low, row.user_high))
        return fail(404, 'match_not_found');
    return { ...row, other: row.user_low === me ? row.user_high : row.user_low, low: row.user_low === me };
}
export async function limited(c: Ctx, scope: string) {
    const row = await c.env.DB.prepare("SELECT id,scope,reason,expires_at FROM user_limits WHERE user_id=? AND revoked_at IS NULL AND expires_at>? AND scope IN ('all',?) LIMIT 1").bind(c.get('userId'), now(), scope).first();
    if (row)
        fail(403, 'feature_restricted');
}
export async function authenticate(c: Ctx) {
    const maintenance = await c.env.DB.prepare("SELECT value FROM service_state WHERE key='maintenance_until'").first<{
        value: string;
    }>();
    if (maintenance && maintenance.value > now())
        fail(503, 'maintenance');
    if (!configured(c.env))
        fail(503, 'server_auth_not_configured');
    const token = c.req.header('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1];
    if (!token || token.length > 300)
        return fail(401, 'unauthorized');
    const row = await c.env.DB.prepare('SELECT u.id,u.status,u.email,u.appwrite_id,s.appwrite_secret_cipher FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>?').bind(await tokenHash(c.env, token), now()).first<Row>();
    if (!row)
        return fail(401, 'unauthorized');
    const appealOrExit = /^\/api\/(appeals(?:\/|$)|restrictions$|sessions(?:\/|$)|account(?:\/delete)?$)/.test(c.req.path);
    if (row.status !== 'active' && !appealOrExit)
        fail(403, 'account_unavailable');
    const { usesAppwrite, validateProviderSession } = await import('./appwrite.js');
    if (usesAppwrite(c.env)) await validateProviderSession(c, row);
    c.set('userId', row.id);
    await c.env.DB.prepare('UPDATE sessions SET last_used_at=? WHERE token_hash=?').bind(now(), await tokenHash(c.env, token)).run();
}
export async function admin(c: Ctx, roles: string[]) {
    const key = c.req.header('x-admin-key');
    let actor = '', granted: string[] = [];
    if (key && key.length <= 300) {
        for (const [role, value] of Object.entries({ users: c.env.ADMIN_USERS_KEY, content: c.env.ADMIN_CONTENT_KEY, safety: c.env.ADMIN_SAFETY_KEY, audit: c.env.ADMIN_AUDIT_KEY })) {
            if (value && value.length >= 32 && await sha256(key) === await sha256(value)) {
                actor = `key:${role}`;
                granted = [role];
            }
        }
    }
    const token = c.req.header('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1];
    if (token && token.length < 300) {
        const staff = await c.env.DB.prepare('SELECT a.id,a.roles FROM admin_sessions s JOIN admin_staff a ON a.id=s.staff_id WHERE s.token_hash=? AND s.expires_at>? AND a.active=1').bind(await tokenHash(c.env, token), now()).first<Row>();
        if (staff) {
            actor = staff.id;
            granted = JSON.parse(staff.roles);
        }
    }
    if (!actor || !roles.some(role => granted.includes(role)))
        fail(403, 'forbidden');
    c.set('actorId', actor);
    c.set('roles', granted);
}
export async function stageProgress(env: Env, matchId: string) {
    const match = await env.DB.prepare('SELECT * FROM matches WHERE id=?').bind(matchId).first<Row>();
    if (!match)
        return fail(404, 'match_not_found');
    const days = await env.DB.prepare("SELECT COUNT(*) AS n FROM (SELECT date(created_at,'+9 hours') FROM messages WHERE match_id=? AND deleted_at IS NULL GROUP BY date(created_at,'+9 hours') HAVING COUNT(DISTINCT sender_id)=2)").bind(matchId).first<{
        n: number;
    }>();
    const daily = await env.DB.prepare('SELECT COUNT(*) AS n FROM daily_answers a JOIN daily_answers b ON a.topic_id=b.topic_id WHERE a.user_id=? AND b.user_id=?').bind(match.user_low, match.user_high).first<{
        n: number;
    }>();
    const mutualDays = days?.n ?? 0, sharedDaily = daily?.n ?? 0;
    const stage = mutualDays >= 30 && sharedDaily >= 7 ? 4 : mutualDays >= 14 && sharedDaily >= 3 ? 3 : mutualDays >= 7 && sharedDaily >= 1 ? 2 : mutualDays >= 3 ? 1 : 0;
    return { stage, mutualDays, sharedDaily };
}
export async function encrypt(env: Env, value: string) {
    const raw = Uint8Array.from(atob(env.DATE_LOCATION_KEY), c => c.charCodeAt(0));
    if (raw.length !== 32)
        fail(503, 'location_key_not_configured');
    const key = await crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt']), iv = crypto.getRandomValues(new Uint8Array(12));
    const bytes = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(value));
    return `${btoa(String.fromCharCode(...iv))}.${btoa(String.fromCharCode(...new Uint8Array(bytes)))}`;
}
export async function decrypt(env: Env, value: string) {
    const [iv, data] = value.split('.'), raw = Uint8Array.from(atob(env.DATE_LOCATION_KEY), c => c.charCodeAt(0));
    const key = await crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['decrypt']);
    return new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: Uint8Array.from(atob(iv), c => c.charCodeAt(0)) }, key, Uint8Array.from(atob(data), c => c.charCodeAt(0))));
}
