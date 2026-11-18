import { Hono } from 'hono';
import { registerMobileRoutes } from './cloudflare/mobile.js';
import { cors } from 'hono/cors';
import { bodyLimit } from 'hono/body-limit';
import { HTTPException } from 'hono/http-exception';
import { authenticate, configured, now, rate, type AppEnv, type Env } from './cloudflare/core.js';
import { authRoutes, dispatchMail } from './cloudflare/auth.js';
import { profileRoutes } from './cloudflare/profiles.js';
import { communicationRoutes, dispatchDaily, dispatchPush } from './cloudflare/communication.js';
import { mediaRoutes } from './cloudflare/media.js';
import { dateRoutes } from './cloudflare/dates.js';
import { adminRoutes } from './cloudflare/admin.js';
export const app = new Hono<AppEnv>();
app.use('*', async (c, next) => {
    const requestId = crypto.randomUUID(), start = Date.now();
    c.header('X-Request-Id', requestId);
    await next();
    console.log(JSON.stringify({ requestId, method: c.req.method, path: c.req.path, status: c.res.status, durationMs: Date.now() - start }));
});
app.use('*', async (c, next) => {
    if (c.req.method !== 'GET' && c.req.method !== 'OPTIONS' && c.req.path !== '/admin/operations/maintenance') {
        const row = await c.env.DB.prepare("SELECT value FROM service_state WHERE key='maintenance_until'").first<{
            value: string;
        }>();
        if (row && row.value > now())
            return c.json({ error: 'maintenance' }, 503);
    }
    await next();
});
app.use('*', bodyLimit({ maxSize: 10 * 1024 * 1024, onError: c => c.json({ error: 'request_too_large' }, 413) }));
app.use('*', async (c, next) => {
    const origins = (c.env.ALLOWED_ORIGINS ?? '').split(',').map(v => v.trim()).filter(Boolean);
    return cors({ origin: origin => origins.includes(origin) ? origin : '', allowHeaders: ['Authorization', 'Content-Type', 'X-Admin-Key'], allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'], maxAge: 600 })(c, next);
});
app.use('/api/*', async (c, next) => { await authenticate(c); await rate(c, 'api', c.get('userId'), 300, 60); await next(); });
app.get('/health/live', c => c.json({ ok: true }));
app.get('/health/ready', async (c) => {
    try {
        await c.env.DB.prepare('SELECT id FROM user_limits LIMIT 1').first();
        await c.env.DB.prepare('SELECT key FROM service_state LIMIT 1').first();
        if (!configured(c.env))
            return c.json({ ok: false, database: 'ready', error: 'server_auth_not_configured' }, 503);
        return c.json({ ok: true, database: 'ready' });
    }
    catch {
        return c.json({ ok: false, database: 'unavailable_or_migration_required' }, 503);
    }
});
authRoutes(app);
profileRoutes(app);
communicationRoutes(app);
mediaRoutes(app);
dateRoutes(app);
adminRoutes(app);
registerMobileRoutes(app);
app.notFound(c => c.json({ error: 'not_found' }, 404));
app.onError((error, c) => {
    if (error instanceof HTTPException)
        return c.json({ error: error.message }, error.status);
    console.error('worker_request_failed', { message: error instanceof Error ? error.message : 'unknown' });
    return c.json({ error: 'internal_error' }, 500);
});
export async function maintenance(env: Env) {
    const state = await env.DB.prepare("SELECT value FROM service_state WHERE key='maintenance_until'").first<{
        value: string;
    }>();
    if (state && state.value > now())
        return;
    await env.DB.batch([
        env.DB.prepare('DELETE FROM sessions WHERE expires_at<=?').bind(now()),
        env.DB.prepare('DELETE FROM admin_sessions WHERE expires_at<=?').bind(now()),
        env.DB.prepare('DELETE FROM email_actions WHERE expires_at<=?').bind(now()),
        env.DB.prepare('DELETE FROM email_outbox WHERE created_at<?').bind(new Date(Date.now() - 86400000).toISOString()),
        env.DB.prepare('DELETE FROM stage_grants WHERE expires_at<=? OR revoked_at IS NOT NULL').bind(now()),
        env.DB.prepare("UPDATE date_plans SET status='expired',exact_location_cipher=NULL,scope_low='{}',scope_high='{}' WHERE status IN ('proposed','confirmed') AND (share_expires_at<=? OR expires_low<=? OR expires_high<=?)").bind(now(), now(), now()),
        env.DB.prepare('DELETE FROM auth_attempts WHERE expires_at<=? OR expires_at IS NULL').bind(now()),
        env.DB.prepare('DELETE FROM messages WHERE deleted_at<?').bind(new Date(Date.now() - 30 * 86400000).toISOString()),
        env.DB.prepare('DELETE FROM audit_logs WHERE created_at<?').bind(new Date(Date.now() - 90 * 86400000).toISOString()),
    ]);
    await dispatchDaily(env);
    await dispatchMail(env);
    await dispatchPush(env);
}
export default { fetch: app.fetch, async scheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext) {
        ctx.waitUntil(maintenance(env).catch(async (error) => {
            console.error('maintenance_failed', error instanceof Error ? error.message : 'unknown');
            if (env.OPERATIONS_WEBHOOK_URL)
                await fetch(env.OPERATIONS_WEBHOOK_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ service: 'nodobito-api', event: 'maintenance_failed', at: now() }), signal: AbortSignal.timeout(10000) });
            throw error;
        }));
    } };
