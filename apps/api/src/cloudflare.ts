import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { bodyLimit } from 'hono/body-limit';
import { registerMobileRoutes, visibleStage } from './cloudflare/mobile';
import { imageVariants } from './cloudflare/images';

export interface Env {
  DB: D1Database;
  CAPTURES: R2Bucket;
  SESSION_SECRET: string;
  CONTACT_HASH_KEY: string;
  DATE_LOCATION_KEY: string;
  EXPO_ACCESS_TOKEN?: string;
  ALLOWED_ORIGINS?: string;
  ADMIN_SAFETY_KEY?: string;
  ADMIN_USERS_KEY?: string;
  ADMIN_CONTENT_KEY?: string;
  ADMIN_AUDIT_KEY?: string;
}
type Vars = { userId: string };
export type AppEnv = { Bindings: Env; Variables: Vars };
type UserRow = { id: string; status: string; email: string };

const app = new Hono<AppEnv>();
app.use('*', bodyLimit({ maxSize: 10 * 1024 * 1024, onError: c => c.json({ error: 'request_too_large' }, 413) }));
const now = () => new Date().toISOString();
const id = () => crypto.randomUUID();
const json = (c: any, body: unknown, status = 200) => c.json(body, status);
const sessionSecretConfigured = (env: Env) => typeof env.SESSION_SECRET === 'string' && env.SESSION_SECRET.length >= 32;
const sha256 = async (value: string) => hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)));
function hex(buffer: ArrayBuffer): string { return [...new Uint8Array(buffer)].map((x) => x.toString(16).padStart(2, '0')).join(''); }
async function hmac(secret: string, value: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return hex(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value.trim().toLowerCase())));
}
async function sessionHash(secret: string, token: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return hex(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(token)));
}
const passwordIterations = 310_000;
function bytesToHex(bytes: Uint8Array): string { return [...bytes].map((value) => value.toString(16).padStart(2, '0')).join(''); }
function hexToBytes(value: string): Uint8Array { return Uint8Array.from(value.match(/.{2}/g) ?? [], (part) => Number.parseInt(part, 16)); }
async function derivePassword(password: string, salt: Uint8Array, iterations: number): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const saltBuffer = Uint8Array.from(salt).buffer as ArrayBuffer;
  const result = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: saltBuffer, iterations }, key, 256);
  return bytesToHex(new Uint8Array(result));
}
async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return `pbkdf2_sha256$${passwordIterations}$${bytesToHex(salt)}$${await derivePassword(password, salt, passwordIterations)}`;
}
async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, iterationsText, saltHex, expected] = stored.split('$');
  const iterations = Number(iterationsText);
  if (scheme !== 'pbkdf2_sha256' || !Number.isInteger(iterations) || iterations < 100_000 || iterations > 1_000_000 || !/^[a-f0-9]{32}$/.test(saltHex ?? '') || !/^[a-f0-9]{64}$/.test(expected ?? '')) return false;
  const actual = await derivePassword(password, hexToBytes(saltHex), iterations);
  let difference = 0;
  for (let index = 0; index < expected.length; index += 1) difference |= actual.charCodeAt(index) ^ expected.charCodeAt(index);
  return difference === 0;
}
async function consumeAuthAttempt(c: any, scope: string, identity: string, maxAttempts: number): Promise<boolean> {
  const ip = c.req.header('cf-connecting-ip') ?? c.req.header('x-forwarded-for')?.split(',')[0] ?? 'unknown';
  const keyHash = await sha256(`${scope}:${ip}:${identity}`);
  const windowStart = Math.floor(Date.now() / (15 * 60_000));
  const existing = await c.env.DB.prepare('SELECT count FROM auth_attempts WHERE key_hash=? AND window_start=?').bind(keyHash, windowStart).first() as { count: number } | null;
  if ((existing?.count ?? 0) >= maxAttempts) return false;
  await c.env.DB.prepare(`INSERT INTO auth_attempts(key_hash,window_start,count) VALUES(?,?,1)
    ON CONFLICT(key_hash) DO UPDATE SET window_start=excluded.window_start,count=CASE WHEN auth_attempts.window_start=excluded.window_start THEN auth_attempts.count+1 ELSE 1 END`)
    .bind(keyHash, windowStart).run();
  return true;
}
async function createSession(c: any, userId: string, deviceName: string) {
  const token = `${crypto.randomUUID()}${crypto.randomUUID()}`;
  const createdAt = now();
  const expiresAt = new Date(Date.now() + 30 * 86400000).toISOString();
  await c.env.DB.prepare('INSERT INTO sessions(token_hash,user_id,device_name,created_at,expires_at,last_used_at) VALUES(?,?,?,?,?,?)')
    .bind(await sessionHash(c.env.SESSION_SECRET, token), userId, deviceName.slice(0, 100), createdAt, expiresAt, createdAt).run();
  return { token, expiresAt };
}
async function audit(db: D1Database, action: string, actor?: string, subject?: string, metadata: Record<string, unknown> = {}) {
  await db.prepare('INSERT INTO audit_logs(id,actor_id,action,subject_id,metadata,created_at) VALUES(?,?,?,?,?,?)')
    .bind(id(), actor ?? null, action, subject ?? null, JSON.stringify(metadata), now()).run();
}
async function notify(db: D1Database, userId: string, kind: string, payload: Record<string, unknown> = {}) {
  const eventId = id(); const created = now(); const value = JSON.stringify(payload);
  await db.batch([
    db.prepare('INSERT INTO notifications(id,user_id,kind,payload,created_at) VALUES(?,?,?,?,?)').bind(eventId, userId, kind, value, created),
    db.prepare('INSERT INTO push_jobs(id,user_id,kind,payload,created_at) VALUES(?,?,?,?,?)').bind(id(), userId, kind, value, created),
  ]);
}
async function pushPending(env: Env, limit = 100) {
  const jobs = await env.DB.prepare('SELECT j.id,j.user_id,j.kind,j.payload,d.expo_token FROM push_jobs j JOIN push_devices d ON d.user_id=j.user_id WHERE j.sent_at IS NULL AND j.attempts < 5 ORDER BY j.created_at LIMIT ?').bind(limit).all<any>();
  for (const job of jobs.results ?? []) {
    try {
      const response = await fetch('https://exp.host/--/api/v2/push/send', { method: 'POST', headers: { 'content-type': 'application/json', ...(env.EXPO_ACCESS_TOKEN ? { authorization: `Bearer ${env.EXPO_ACCESS_TOKEN}` } : {}) }, body: JSON.stringify({ to: job.expo_token, title: job.kind, body: 'アプリを開いて確認してください。', data: { kind: job.kind } }) });
      if (!response.ok) throw new Error(`Expo push failed: ${response.status}`);
      await env.DB.prepare('UPDATE push_jobs SET sent_at=? WHERE id=?').bind(now(), job.id).run();
    } catch { await env.DB.prepare('UPDATE push_jobs SET attempts=attempts+1 WHERE id=?').bind(job.id).run(); }
  }
}

app.use('*', async (c, next) => {
  const allowed = (c.env.ALLOWED_ORIGINS ?? '').split(',').map((v) => v.trim()).filter(Boolean);
  return cors({ origin: (origin) => allowed.includes(origin) ? origin : '', allowHeaders: ['Authorization', 'Content-Type'], allowMethods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'], maxAge: 600 })(c, next);
});
app.use('/api/*', async (c, next) => {
  if (!sessionSecretConfigured(c.env)) return json(c, { error: 'server_auth_not_configured' }, 503);
  const token = c.req.header('authorization')?.replace(/^Bearer\s+/i, '');
  if (!token || token.length > 300) return json(c, { error: 'unauthorized' }, 401);
  const tokenHash = await sessionHash(c.env.SESSION_SECRET, token);
  const row = await c.env.DB.prepare('SELECT u.id,u.status,u.email FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>?').bind(tokenHash, now()).first<UserRow>();
  if (!row || row.status === 'deleted' || row.status === 'suspended') return json(c, { error: 'unauthorized' }, 401);
  c.set('userId', row.id);
  await c.env.DB.prepare('UPDATE sessions SET last_used_at=? WHERE token_hash=?').bind(now(), tokenHash).run();
  await next();
});

app.get('/health/live', (c) => c.json({ ok: true }));
app.get('/health/ready', async (c) => {
  try {
    await c.env.DB.prepare('SELECT 1').first();
    if (!sessionSecretConfigured(c.env)) return c.json({ ok: false, database: 'ready', error: 'server_auth_not_configured' }, 503);
    return c.json({ ok: true, database: 'ready' });
  }
  catch { return c.json({ ok: false, database: 'unavailable' }, 503); }
});

app.post('/auth/signup', async (c) => {
  if (!sessionSecretConfigured(c.env)) return json(c, { error: 'server_auth_not_configured' }, 503);
  let input: { email?: string; password?: string; deviceName?: string };
  try { input = await c.req.json(); } catch { return json(c, { error: 'invalid_json' }, 400); }
  const email = typeof input?.email === 'string' ? input.email.trim().toLowerCase() : '';
  const password = typeof input?.password === 'string' ? input.password : '';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) return json(c, { error: 'invalid_email' }, 400);
  if (password.length < 12 || password.length > 128) return json(c, { error: 'invalid_password' }, 400);
  if (!await consumeAuthAttempt(c, 'signup', 'all', 8)) return json(c, { error: 'rate_limited' }, 429);
  if (await c.env.DB.prepare('SELECT 1 FROM users WHERE email=?').bind(email).first()) return json(c, { error: 'email_already_registered' }, 409);
  const userId = id(); const time = now();
  try {
    await c.env.DB.batch([
      // The initial D1 schema requires a unique google_sub; this marker is never used for authentication.
      c.env.DB.prepare('INSERT INTO users(id,google_sub,email,email_verified,created_at,updated_at) VALUES(?,?,?,0,?,?)').bind(userId, `password:${userId}`, email, time, time),
      c.env.DB.prepare('INSERT INTO password_credentials(user_id,password_hash,created_at,updated_at) VALUES(?,?,?,?)').bind(userId, await hashPassword(password), time, time),
      c.env.DB.prepare('INSERT INTO profiles(user_id,updated_at) VALUES(?,?)').bind(userId, time),
      c.env.DB.prepare('INSERT OR IGNORE INTO user_contact_identifiers(user_id,contact_hash) VALUES(?,?)').bind(userId, await hmac(c.env.CONTACT_HASH_KEY, email)),
    ]);
  } catch {
    if (await c.env.DB.prepare('SELECT 1 FROM users WHERE email=?').bind(email).first()) return json(c, { error: 'email_already_registered' }, 409);
    throw new Error('Could not create account');
  }
  const session = await createSession(c, userId, typeof input.deviceName === 'string' ? input.deviceName : '');
  return c.json({ token: session.token, expiresAt: session.expiresAt, user: { id: userId, email, status: 'active' } }, 201);
});
app.post('/auth/login', async (c) => {
  if (!sessionSecretConfigured(c.env)) return json(c, { error: 'server_auth_not_configured' }, 503);
  let input: { email?: string; password?: string; deviceName?: string };
  try { input = await c.req.json(); } catch { return json(c, { error: 'invalid_json' }, 400); }
  const email = typeof input?.email === 'string' ? input.email.trim().toLowerCase() : '';
  const password = typeof input?.password === 'string' ? input.password : '';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 || password.length > 128) return json(c, { error: 'invalid_credentials' }, 401);
  if (!await consumeAuthAttempt(c, 'login', email, 5)) return json(c, { error: 'rate_limited' }, 429);
  const user = await c.env.DB.prepare(`SELECT u.id,u.email,u.status,p.password_hash FROM users u
    JOIN password_credentials p ON p.user_id=u.id WHERE u.email=?`).bind(email).first<{ id: string; email: string; status: string; password_hash: string }>();
  const valid = await verifyPassword(password, user?.password_hash ?? `pbkdf2_sha256$${passwordIterations}$00000000000000000000000000000000$${'0'.repeat(64)}`);
  if (!user || !valid) return json(c, { error: 'invalid_credentials' }, 401);
  if (user.status !== 'active') return json(c, { error: 'account_unavailable' }, 403);
  await c.env.DB.prepare('INSERT OR IGNORE INTO user_contact_identifiers(user_id,contact_hash) VALUES(?,?)').bind(user.id, await hmac(c.env.CONTACT_HASH_KEY, user.email)).run();
  const session = await createSession(c, user.id, typeof input.deviceName === 'string' ? input.deviceName : '');
  return c.json({ token: session.token, expiresAt: session.expiresAt, user: { id: user.id, email: user.email, status: user.status } });
});
app.post('/auth/logout', async (c) => {
  if (!sessionSecretConfigured(c.env)) return json(c, { error: 'server_auth_not_configured' }, 503);
  const token = c.req.header('authorization')?.replace(/^Bearer\s+/i, '') ?? '';
  await c.env.DB.prepare('DELETE FROM sessions WHERE token_hash=?').bind(await sessionHash(c.env.SESSION_SECRET, token)).run();
  return c.json({ ok: true });
});

app.get('/api/me', async (c) => {
  const userId = c.get('userId');
  const profile = await c.env.DB.prepare("SELECT p.*,u.email,u.status,(SELECT id FROM captures WHERE owner_id=p.user_id AND stage=0 ORDER BY created_at DESC LIMIT 1) AS profile_photo_capture_id FROM profiles p JOIN users u ON u.id=p.user_id WHERE p.user_id=?").bind(userId).first();
  return c.json({ profile });
});
app.patch('/api/profile', async (c) => {
  const value = await c.req.json<Record<string, unknown>>();
  const allowed = ['display_name', 'birth_year', 'area', 'bio', 'purpose', 'conversation_pace', 'location_scope', 'throat_class'];
  const sets: string[] = []; const values: unknown[] = [];
  for (const key of allowed) if (Object.hasOwn(value, key)) {
    const field = value[key];
    if (key !== 'birth_year' && typeof field !== 'string') return json(c, { error: `invalid_${key}` }, 400);
    if (key === 'location_scope' && !['hidden', 'area', 'meetup'].includes(String(field))) return json(c, { error: 'invalid_location_scope' }, 400);
    if (key === 'birth_year' && (!Number.isInteger(field) || Number(field) < 1900 || Number(field) > new Date().getUTCFullYear() - 18)) return json(c, { error: 'invalid_birth_year' }, 400);
    if (key === 'throat_class' && !['present', 'absent', 'pending'].includes(String(field))) return json(c, { error: 'invalid_throat_class' }, 400);
    const max = key === 'bio' ? 300 : key === 'display_name' ? 30 : key === 'area' ? 80 : 100;
    if (typeof field === 'string' && field.length > max) return json(c, { error: `invalid_${key}` }, 400);
    sets.push(`${key}=?`); values.push(field ?? null);
  }
  if (!sets.length) return json(c, { error: 'no_profile_fields' }, 400);
  sets.push('updated_at=?'); values.push(now(), c.get('userId'));
  await c.env.DB.prepare(`UPDATE profiles SET ${sets.join(',')} WHERE user_id=?`).bind(...values).run();
  return c.json({ ok: true });
});

registerMobileRoutes(app);

app.post('/api/captures', async (c) => {
  const { dataUrl, stage = 0 } = await c.req.json<{ dataUrl?: string; stage?: number }>();
  const match = dataUrl?.match(/^data:image\/(jpeg|png);base64,([A-Za-z0-9+/=]+)$/);
  if (!match || !Number.isInteger(stage) || stage! < 0 || stage! > 4 || match[2].length > 12_000_000) return json(c, { error: 'invalid_capture' }, 400);
  const bytes = Uint8Array.from(atob(match[2]), (char) => char.charCodeAt(0));
  const jpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const png = bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
  if (!(jpeg && match[1] === 'jpeg') && !(png && match[1] === 'png')) return json(c, { error: 'invalid_image_signature' }, 400);
  let variants: Uint8Array[];
  try { variants = imageVariants(bytes, `image/${match[1]}`); }
  catch { return json(c, { error: 'invalid_capture_size' }, 400); }
  const group = id(), created = now(), records = variants.map((_, stage) => ({ id: id(), stage, key: `public/${c.get('userId')}/${group}/${stage}` }));
  try {
    for (const record of records) await c.env.CAPTURES.put(record.key, variants[record.stage], { httpMetadata: { contentType: 'image/jpeg', cacheControl: 'private, no-store' } });
    await c.env.DB.batch(records.map(record => c.env.DB.prepare('INSERT INTO captures(id,owner_id,stage,object_key,media_type,created_at) VALUES(?,?,?,?,?,?)').bind(record.id, c.get('userId'), record.stage, record.key, 'image/jpeg', created)));
  } catch (error) {
    for (const record of records) await c.env.CAPTURES.delete(record.key);
    throw error;
  }
  return c.json({ id: records[0].id, stage: 0 }, 201);
});
app.delete('/api/captures/:id', async (c) => {
  const capture = await c.env.DB.prepare('SELECT object_key FROM captures WHERE id=? AND owner_id=?').bind(c.req.param('id'), c.get('userId')).first<{ object_key: string }>();
  if (!capture) return json(c, { error: 'not_found' }, 404);
  const keys = capture.object_key.startsWith('public/') ? Array.from({ length: 5 }, (_, stage) => capture.object_key.replace(/\/\d$/, `/${stage}`)) : [capture.object_key];
  for (const key of keys) { await c.env.CAPTURES.delete(key); await c.env.DB.prepare('DELETE FROM captures WHERE owner_id=? AND object_key=?').bind(c.get('userId'), key).run(); }
  return c.json({ deleted: true });
});
app.get('/api/captures/:id/image', async (c) => {
  const me = c.get('userId'); const capture = await c.env.DB.prepare('SELECT * FROM captures WHERE id=?').bind(c.req.param('id')).first<any>();
  if (!capture) return json(c, { error: 'not_found' }, 404);
  if (capture.owner_id !== me) {
    if (!capture.object_key.startsWith('public/')) return json(c, { error: 'forbidden' }, 403);
    const allowed = await visibleStage(c.env.DB, me, capture.owner_id);
    if (capture.stage > allowed) return json(c, { error: 'forbidden' }, 403);
  }
  const obj = await c.env.CAPTURES.get(capture.object_key); if (!obj) return json(c, { error: 'not_found' }, 404);
  await c.env.DB.prepare('INSERT INTO image_access_logs(id,capture_id,viewer_id,accessed_at) VALUES(?,?,?,?)').bind(id(), capture.id, me, now()).run();
  return new Response(obj.body, { headers: { 'Content-Type': capture.media_type, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' } });
});

app.post('/api/blocks', async (c) => {
  const { userId } = await c.req.json<{ userId?: string }>(); if (!userId || userId === c.get('userId')) return json(c, { error: 'invalid_user' }, 400);
  await c.env.DB.prepare('INSERT OR IGNORE INTO blocks(blocker_id,blocked_id,created_at) VALUES(?,?,?)').bind(c.get('userId'), userId, now()).run();
  await c.env.DB.prepare('DELETE FROM matches WHERE (user_low=? AND user_high=?) OR (user_low=? AND user_high=?)').bind(c.get('userId'), userId, userId, c.get('userId')).run();
  await audit(c.env.DB, 'user_blocked', c.get('userId'), userId); return c.json({ ok: true });
});
app.post('/api/reports', async (c) => {
  const { subjectId, category, details = '' } = await c.req.json<{ subjectId?: string; category?: string; details?: string }>();
  if (!subjectId || !category || details.length > 3000) return json(c, { error: 'invalid_report' }, 400);
  const reportId = id(); await c.env.DB.prepare('INSERT INTO reports(id,reporter_id,subject_id,category,details,created_at,updated_at) VALUES(?,?,?,?,?,?,?)').bind(reportId, c.get('userId'), subjectId, category.slice(0, 60), details, now(), now()).run();
  await audit(c.env.DB, 'report_created', c.get('userId'), subjectId, { reportId }); return c.json({ id: reportId, status: 'open' }, 201);
});
app.post('/api/appeals', async (c) => {
  const { reason } = await c.req.json<{ reason?: string }>(); if (!reason?.trim() || reason.length > 3000) return json(c, { error: 'invalid_appeal' }, 400);
  const appealId = id(); await c.env.DB.prepare('INSERT INTO appeals(id,user_id,reason,created_at,updated_at) VALUES(?,?,?,?,?)').bind(appealId, c.get('userId'), reason.trim(), now(), now()).run();
  return c.json({ id: appealId, status: 'open' }, 201);
});
app.get('/api/sessions', async (c) => {
  const rows = await c.env.DB.prepare('SELECT token_hash,device_name,created_at,last_used_at,expires_at FROM sessions WHERE user_id=? ORDER BY last_used_at DESC').bind(c.get('userId')).all<any>();
  return c.json({ sessions: (rows.results ?? []).map((row: any) => ({ id: row.token_hash.slice(0, 24), deviceName: row.device_name, createdAt: row.created_at, lastUsedAt: row.last_used_at, expiresAt: row.expires_at })) });
});
app.delete('/api/sessions/:id', async (c) => {
  const result = await c.env.DB.prepare('DELETE FROM sessions WHERE user_id=? AND substr(token_hash,1,24)=?').bind(c.get('userId'), c.req.param('id')).run();
  if (!result.meta.changes) return json(c, { error: 'session_not_found' }, 404); return c.json({ revoked: true });
});
app.delete('/api/matches/:id/messages', async (c) => {
  const match = await c.env.DB.prepare('SELECT 1 FROM matches WHERE id=? AND (user_low=? OR user_high=?)').bind(c.req.param('id'), c.get('userId'), c.get('userId')).first();
  if (!match) return json(c, { error: 'match_not_found' }, 404);
  await c.env.DB.prepare('UPDATE messages SET deleted_at=? WHERE match_id=?').bind(now(), c.req.param('id')).run(); return c.json({ cleared: true });
});
app.post('/api/contacts/hide', async (c) => {
  const { contacts } = await c.req.json<{ contacts?: string[] }>();
  if (!Array.isArray(contacts) || contacts.length > 1000 || contacts.some((x) => typeof x !== 'string' || x.length > 100)) return json(c, { error: 'invalid_contacts' }, 400);
  const statements = await Promise.all(contacts.map(async (contact) => c.env.DB.prepare('INSERT OR IGNORE INTO contact_hides(user_id,contact_hash,created_at) VALUES(?,?,?)').bind(c.get('userId'), await hmac(c.env.CONTACT_HASH_KEY, contact), now())));
  if (statements.length) await c.env.DB.batch(statements); return c.json({ hidden: statements.length });
});
app.post('/api/push-devices', async (c) => {
  const { expoPushToken } = await c.req.json<{ expoPushToken?: string }>();
  if (!expoPushToken || !/^ExponentPushToken\[[^\]]+\]$|^ExpoPushToken\[[^\]]+\]$/.test(expoPushToken)) return json(c, { error: 'invalid_push_token' }, 400);
  await c.env.DB.prepare('INSERT INTO push_devices(expo_token,user_id,created_at) VALUES(?,?,?) ON CONFLICT(expo_token) DO UPDATE SET user_id=excluded.user_id').bind(expoPushToken, c.get('userId'), now()).run(); return c.json({ ok: true });
});
app.get('/api/notifications', async (c) => c.json(await c.env.DB.prepare('SELECT id,kind,payload,created_at,read_at FROM notifications WHERE user_id=? ORDER BY created_at DESC LIMIT 100').bind(c.get('userId')).all()));

// Date plans require both matched users to confirm before private location sharing is enabled.
app.post('/api/matches/:id/date-plans', async (c) => {
  const me = c.get('userId'); const match = await c.env.DB.prepare('SELECT user_low,user_high FROM matches WHERE id=? AND (user_low=? OR user_high=?)').bind(c.req.param('id'), me, me).first<{ user_low: string; user_high: string }>();
  if (!match) return json(c, { error: 'match_not_found' }, 404);
  const input = await c.req.json<{ startsAt?: string; placeLabel?: string; exactLocation?: string; shareConsent?: boolean }>();
  const date = new Date(input.startsAt ?? ''); if (!Number.isFinite(date.getTime()) || date.getTime() < Date.now() || date.getTime() > Date.now() + 180 * 86400000 || !input.placeLabel?.trim()) return json(c, { error: 'invalid_date_plan' }, 400);
  if (input.exactLocation && input.exactLocation.length > 500) return json(c, { error: 'location_too_long' }, 400);
  const exactCipher = input.exactLocation ? await encrypt(c.env.DATE_LOCATION_KEY, input.exactLocation) : null; const planId = id();
  const lowConsent = me === match.user_low && input.shareConsent ? 1 : 0; const highConsent = me === match.user_high && input.shareConsent ? 1 : 0;
  await c.env.DB.prepare('INSERT INTO date_plans(id,match_id,created_by,starts_at,place_label,exact_location_cipher,share_expires_at,share_consent_user_low,share_consent_user_high,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)').bind(planId, c.req.param('id'), me, date.toISOString(), input.placeLabel.trim().slice(0, 200), exactCipher, new Date(date.getTime() + 12 * 3600000).toISOString(), lowConsent, highConsent, now()).run();
  await audit(c.env.DB, 'date_plan_created', me, planId); return c.json({ id: planId, status: 'proposed' }, 201);
});
app.post('/api/date-plans/:id/confirm', async (c) => {
  const me = c.get('userId'); const plan = await c.env.DB.prepare('SELECT d.*,m.user_low,m.user_high FROM date_plans d JOIN matches m ON m.id=d.match_id WHERE d.id=? AND (m.user_low=? OR m.user_high=?)').bind(c.req.param('id'), me, me).first<any>();
  if (!plan || plan.status === 'cancelled' || plan.share_expires_at <= now()) return json(c, { error: 'not_found' }, 404);
  const { consentToLocation = false } = await c.req.json<{ consentToLocation?: boolean }>(); const low = me === plan.user_low;
  await c.env.DB.prepare(`UPDATE date_plans SET ${low ? 'confirmed_user_low' : 'confirmed_user_high'}=1,${low ? 'share_consent_user_low' : 'share_consent_user_high'}=?,status=CASE WHEN ${low ? 'confirmed_user_high' : 'confirmed_user_low'}=1 THEN 'confirmed' ELSE 'proposed' END,updated_at=? WHERE id=?`).bind(consentToLocation ? 1 : 0, now(), plan.id).run();
  await audit(c.env.DB, 'date_plan_confirmed', me, plan.id, { consentToLocation }); return c.json({ confirmed: true });
});
app.post('/api/date-plans/:id/arrive', async (c) => {
  const me = c.get('userId'); const plan = await c.env.DB.prepare('SELECT d.*,m.user_low,m.user_high FROM date_plans d JOIN matches m ON m.id=d.match_id WHERE d.id=? AND (m.user_low=? OR m.user_high=?)').bind(c.req.param('id'), me, me).first<any>();
  if (!plan || plan.status !== 'confirmed' || !plan.confirmed_user_low || !plan.confirmed_user_high || plan.share_expires_at <= now()) return json(c, { error: 'not_found_or_unconfirmed' }, 404);
  await c.env.DB.prepare(`UPDATE date_plans SET ${me === plan.user_low ? 'arrived_user_low_at' : 'arrived_user_high_at'}=?,updated_at=? WHERE id=?`).bind(now(), now(), plan.id).run();
  return c.json({ arrived: true });
});
app.post('/api/date-plans/:id/cancel', async (c) => {
  const result = await c.env.DB.prepare(`UPDATE date_plans SET status='cancelled',exact_location_cipher=NULL,updated_at=? WHERE id=? AND match_id IN (SELECT id FROM matches WHERE user_low=? OR user_high=?)`).bind(now(), c.req.param('id'), c.get('userId'), c.get('userId')).run();
  if (!result.meta.changes) return json(c, { error: 'not_found' }, 404); return c.json({ cancelled: true });
});
app.get('/api/date-plans/:id', async (c) => {
  const me = c.get('userId'); const plan = await c.env.DB.prepare('SELECT d.*,m.user_low,m.user_high FROM date_plans d JOIN matches m ON m.id=d.match_id WHERE d.id=? AND (m.user_low=? OR m.user_high=?)').bind(c.req.param('id'), me, me).first<any>();
  if (!plan) return json(c, { error: 'not_found' }, 404);
  const bothConsent = plan.status !== 'cancelled' && plan.share_consent_user_low && plan.share_consent_user_high && plan.confirmed_user_low && plan.confirmed_user_high && plan.share_expires_at > now();
  const exactLocation = bothConsent && plan.exact_location_cipher ? await decrypt(c.env.DATE_LOCATION_KEY, plan.exact_location_cipher) : null;
  return c.json({ id: plan.id, startsAt: plan.starts_at, placeLabel: plan.place_label, exactLocation, status: plan.status, confirmed: { you: me === plan.user_low ? !!plan.confirmed_user_low : !!plan.confirmed_user_high, other: me === plan.user_low ? !!plan.confirmed_user_high : !!plan.confirmed_user_low }, arrived: { you: me === plan.user_low ? plan.arrived_user_low_at : plan.arrived_user_high_at, other: me === plan.user_low ? plan.arrived_user_high_at : plan.arrived_user_low_at } });
});
async function encrypt(secret: string, value: string): Promise<string> {
  const keyBytes = Uint8Array.from(atob(secret), (c) => c.charCodeAt(0));
  if (keyBytes.length !== 32) throw new Error('DATE_LOCATION_KEY must be base64 for 32 bytes');
  const key = await crypto.subtle.importKey('raw', keyBytes, 'AES-GCM', false, ['encrypt']); const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(value));
  return `${btoa(String.fromCharCode(...iv))}.${btoa(String.fromCharCode(...new Uint8Array(cipher)))}`;
}
async function decrypt(secret: string, value: string): Promise<string> {
  const [ivPart, dataPart] = value.split('.'); const raw = Uint8Array.from(atob(secret), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['decrypt']); const result = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: Uint8Array.from(atob(ivPart), (c) => c.charCodeAt(0)) }, key, Uint8Array.from(atob(dataPart), (c) => c.charCodeAt(0)));
  return new TextDecoder().decode(result);
}

app.post('/api/account/delete', async (c) => {
  let input: { password?: string };
  try { input = await c.req.json(); } catch { return json(c, { error: 'invalid_json' }, 400); }
  const credential = await c.env.DB.prepare('SELECT password_hash FROM password_credentials WHERE user_id=?').bind(c.get('userId')).first<{ password_hash: string }>();
  if (!credential || !input.password || !await verifyPassword(input.password, credential.password_hash)) return json(c, { error: 'reauthentication_failed' }, 401);
  const captures = await c.env.DB.prepare('SELECT object_key FROM captures WHERE owner_id=?').bind(c.get('userId')).all<{ object_key: string }>();
  for (const capture of captures.results ?? []) await c.env.CAPTURES.delete(capture.object_key);
  await audit(c.env.DB, 'account_deleted', c.get('userId'));
  await c.env.DB.prepare('DELETE FROM users WHERE id=?').bind(c.get('userId')).run();
  return c.json({ deleted: true });
});

function adminRole(c: any): string | null {
  const key = c.req.header('x-admin-key'); if (!key) return null;
  for (const [role, secret] of Object.entries({ safety: c.env.ADMIN_SAFETY_KEY, users: c.env.ADMIN_USERS_KEY, content: c.env.ADMIN_CONTENT_KEY, audit: c.env.ADMIN_AUDIT_KEY })) if (secret && key === secret) return role;
  return null;
}
app.get('/admin/reports', async (c) => { if (!adminRole(c)) return json(c, { error: 'forbidden' }, 403); return c.json(await c.env.DB.prepare('SELECT * FROM reports ORDER BY created_at LIMIT 200').all()); });
app.patch('/admin/reports/:id', async (c) => {
  if (!['safety', 'audit'].includes(adminRole(c) ?? '')) return json(c, { error: 'forbidden' }, 403);
  const { status, resolution } = await c.req.json<{ status?: string; resolution?: string }>();
  await c.env.DB.prepare('UPDATE reports SET status=?,resolution=?,updated_at=? WHERE id=?').bind((status ?? 'reviewing').slice(0, 30), (resolution ?? '').slice(0, 2000), now(), c.req.param('id')).run();
  await audit(c.env.DB, 'report_reviewed', undefined, c.req.param('id'), { status }); return c.json({ ok: true });
});
app.post('/admin/daily-topics', async (c) => {
  if (!['content', 'audit'].includes(adminRole(c) ?? '')) return json(c, { error: 'forbidden' }, 403);
  const { date, title, prompt } = await c.req.json<{ date?: string; title?: string; prompt?: string }>();
  if (!date || !/^\d{4}-\d\d-\d\d$/.test(date) || !title?.trim() || !prompt?.trim()) return json(c, { error: 'invalid_topic' }, 400);
  await c.env.DB.prepare('INSERT INTO daily_topics(id,topic_date,title,prompt,created_by,created_at) VALUES(?,?,?,?,?,?) ON CONFLICT(topic_date) DO UPDATE SET title=excluded.title,prompt=excluded.prompt,created_by=excluded.created_by').bind(id(), date, title.slice(0, 120), prompt.slice(0, 1000), 'admin', now()).run();
  return c.json({ ok: true });
});
app.post('/admin/users/:userId/contact-identifier', async (c) => {
  if (!['users', 'audit'].includes(adminRole(c) ?? '')) return json(c, { error: 'forbidden' }, 403);
  const { identifier } = await c.req.json<{ identifier?: string }>(); if (!identifier?.trim() || identifier.length > 200) return json(c, { error: 'invalid_identifier' }, 400);
  const contactHash = await hmac(c.env.CONTACT_HASH_KEY, identifier);
  await c.env.DB.prepare('INSERT OR IGNORE INTO user_contact_identifiers(user_id,contact_hash) VALUES(?,?)').bind(c.req.param('userId'), contactHash).run();
  await audit(c.env.DB, 'verified_contact_identifier_added', undefined, c.req.param('userId')); return c.json({ ok: true });
});
app.patch('/admin/users/:userId/status', async (c) => {
  if (!['safety', 'audit'].includes(adminRole(c) ?? '')) return json(c, { error: 'forbidden' }, 403);
  const { status } = await c.req.json<{ status?: string }>(); if (!['active', 'limited', 'suspended'].includes(status ?? '')) return json(c, { error: 'invalid_status' }, 400);
  await c.env.DB.prepare('UPDATE users SET status=?,updated_at=? WHERE id=?').bind(status, now(), c.req.param('userId')).run();
  await audit(c.env.DB, 'account_status_changed', undefined, c.req.param('userId'), { status }); return c.json({ ok: true });
});
app.get('/admin/appeals', async (c) => { if (!['safety', 'audit'].includes(adminRole(c) ?? '')) return json(c, { error: 'forbidden' }, 403); return c.json(await c.env.DB.prepare('SELECT * FROM appeals ORDER BY created_at LIMIT 200').all()); });
app.patch('/admin/appeals/:id', async (c) => {
  if (!['safety', 'audit'].includes(adminRole(c) ?? '')) return json(c, { error: 'forbidden' }, 403);
  const { status, resolution } = await c.req.json<{ status?: string; resolution?: string }>();
  await c.env.DB.prepare('UPDATE appeals SET status=?,resolution=?,updated_at=? WHERE id=?').bind((status ?? 'reviewing').slice(0, 30), (resolution ?? '').slice(0, 2000), now(), c.req.param('id')).run();
  await audit(c.env.DB, 'appeal_reviewed', undefined, c.req.param('id'), { status }); return c.json({ ok: true });
});
app.get('/admin/audit', async (c) => { if (!['audit', 'safety'].includes(adminRole(c) ?? '')) return json(c, { error: 'forbidden' }, 403); return c.json(await c.env.DB.prepare('SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 200').all()); });
app.get('/admin/safety-flags', async (c) => { if (!['safety', 'audit'].includes(adminRole(c) ?? '')) return json(c, { error: 'forbidden' }, 403); return c.json(await c.env.DB.prepare('SELECT * FROM safety_flags ORDER BY created_at DESC LIMIT 200').all()); });
app.patch('/admin/safety-flags/:id', async (c) => {
  if (!['safety', 'audit'].includes(adminRole(c) ?? '')) return json(c, { error: 'forbidden' }, 403);
  const { status } = await c.req.json<{ status?: string }>(); if (!['reviewed', 'dismissed', 'actioned'].includes(status ?? '')) return json(c, { error: 'invalid_status' }, 400);
  await c.env.DB.prepare('UPDATE safety_flags SET status=?,reviewed_by=?,reviewed_at=? WHERE id=?').bind(status, 'admin', now(), c.req.param('id')).run();
  await audit(c.env.DB, 'safety_flag_reviewed', undefined, c.req.param('id'), { status }); return c.json({ ok: true });
});

app.notFound((c) => c.json({ error: 'not_found' }, 404));
app.onError((err, c) => { console.error('worker request failed', err); return c.json({ error: 'internal_error' }, 500); });

export default {
  fetch: app.fetch,
  async scheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil((async () => {
      await env.DB.batch([
        env.DB.prepare('DELETE FROM sessions WHERE expires_at<=?').bind(now()),
        env.DB.prepare('DELETE FROM stage_grants WHERE expires_at<=? OR revoked_at IS NOT NULL').bind(now()),
        env.DB.prepare('UPDATE date_plans SET exact_location_cipher=NULL WHERE share_expires_at<=?').bind(now()),
        env.DB.prepare('DELETE FROM auth_attempts WHERE window_start<?').bind(Math.floor(Date.now() / 60000) - 60),
      ]);
      await pushPending(env);
    })());
  },
};
