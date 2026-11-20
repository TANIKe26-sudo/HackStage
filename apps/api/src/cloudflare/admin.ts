import { admin, audit, blocked, fail, hashPassword, id, input, ip, now, notify, page, rate, text, tokenHash, verifyPassword, type App, type Row } from './core.js';
import { dailyTopic } from './daily-topic.js';
import { adminHtml } from './admin-ui.js';
export function adminRoutes(app: App) {
    app.get('/admin', c => { c.header('Cache-Control', 'no-store'); c.header('X-Content-Type-Options', 'nosniff'); c.header('Referrer-Policy', 'no-referrer'); return c.html(adminHtml); });
    app.post('/admin/login', async (c) => {
        await rate(c, 'admin-login', ip(c), 5);
        const body = await input(c), email = text(body.email, 254, true).toLowerCase(), secret = text(body.password, 128, true);
        const staff = await c.env.DB.prepare('SELECT * FROM admin_staff WHERE email=? AND active=1').bind(email).first<Row>();
        if (!staff || !await verifyPassword(secret, staff.password_hash))
            return fail(401, 'invalid_credentials');
        const token = `${id()}${id()}`;
        await c.env.DB.prepare('INSERT INTO admin_sessions(token_hash,staff_id,expires_at) VALUES(?,?,?)').bind(await tokenHash(c.env, token), staff.id, new Date(Date.now() + 8 * 3600000).toISOString()).run();
        await audit(c.env, 'staff_login', staff.id);
        return c.json({ token, roles: JSON.parse(staff.roles) });
    });
    app.post('/admin/logout', async (c) => { const token = c.req.header('authorization')?.replace(/^Bearer\s+/i, '') ?? ''; await c.env.DB.prepare('DELETE FROM admin_sessions WHERE token_hash=?').bind(await tokenHash(c.env, token)).run(); return c.json({ ok: true }); });
    app.get('/admin/me', async (c) => { await admin(c, ['users', 'content', 'safety', 'audit']); return c.json({ actorId: c.get('actorId'), roles: c.get('roles') }); });
    app.get('/admin/staff', async (c) => { await admin(c, ['audit']); return c.json(await c.env.DB.prepare('SELECT id,email,roles,active,created_at FROM admin_staff ORDER BY created_at').all()); });
    app.post('/admin/staff', async (c) => {
        await admin(c, ['audit']);
        const body = await input(c), roles = body.roles;
        if (!Array.isArray(roles) || !roles.length || roles.some(r => !['users', 'content', 'safety', 'audit'].includes(r)))
            fail(400, 'invalid_roles');
        const email = text(body.email, 254, true).toLowerCase(), secret = text(body.password, 128, true);
        if (secret.length < 12)
            fail(400, 'invalid_password');
        if (await c.env.DB.prepare('SELECT 1 FROM admin_staff WHERE email=?').bind(email).first())
            fail(409, 'staff_exists');
        const staffId = id();
        await c.env.DB.prepare('INSERT INTO admin_staff(id,email,password_hash,roles,created_at) VALUES(?,?,?,?,?)').bind(staffId, email, await hashPassword(secret), JSON.stringify([...new Set(roles)]), now()).run();
        await audit(c.env, 'staff_created', c.get('actorId'), staffId, { roles });
        return c.json({ id: staffId }, 201);
    });
    app.patch('/admin/staff/:id', async (c) => {
        await admin(c, ['audit']);
        const body = await input(c), target = c.req.param('id');
        if (target === c.get('actorId'))
            fail(400, 'cannot_modify_own_permissions');
        const row = await c.env.DB.prepare('SELECT id,roles,active FROM admin_staff WHERE id=?').bind(target).first<Row>();
        if (!row)
            fail(404, 'not_found');
        const roles = body.roles ?? JSON.parse(row!.roles), active = body.active ?? !!row!.active;
        if (typeof active !== 'boolean' || !Array.isArray(roles) || !roles.length || roles.some(r => !['users', 'content', 'safety', 'audit'].includes(r)))
            fail(400, 'invalid_roles');
        await c.env.DB.batch([c.env.DB.prepare('UPDATE admin_staff SET roles=?,active=? WHERE id=?').bind(JSON.stringify(roles), active ? 1 : 0, target), c.env.DB.prepare('DELETE FROM admin_sessions WHERE staff_id=?').bind(target)]);
        await audit(c.env, 'staff_updated', c.get('actorId'), target, { roles, active });
        return c.json({ ok: true });
    });
    app.get('/admin/users', async (c) => {
        await admin(c, ['users', 'safety']);
        const { limit, offset } = page(c), query = (c.req.query('q') ?? '').slice(0, 200);
        return c.json(await c.env.DB.prepare('SELECT u.id,u.email,u.email_verified,u.status,u.created_at,p.display_name,p.throat_class FROM users u LEFT JOIN profiles p ON p.user_id=u.id WHERE u.email LIKE ? OR p.display_name LIKE ? ORDER BY u.created_at DESC LIMIT ? OFFSET ?').bind(`%${query}%`, `%${query}%`, limit, offset).all());
    });
    app.patch('/admin/users/:id/status', async (c) => {
        await admin(c, ['users', 'safety']);
        const body = await input(c);
        if (!['active', 'suspended'].includes(body.status))
            fail(400, 'invalid_status');
        const result = await c.env.DB.prepare('UPDATE users SET status=?,updated_at=? WHERE id=?').bind(body.status, now(), c.req.param('id')).run();
        if (!result.meta.changes)
            fail(404, 'not_found');
        // Sessions remain valid only for appeals, session revocation and deletion when suspended.
        await audit(c.env, 'account_status_changed', c.get('actorId'), c.req.param('id'), { status: body.status });
        await notify(c.env, c.req.param('id'), 'account_status', { status: body.status });
        return c.json({ ok: true });
    });
    app.post('/admin/users/:id/limits', async (c) => {
        await admin(c, ['safety']);
        const body = await input(c), expires = new Date(body.expiresAt ?? ''), target = c.req.param('id');
        if (!['all', 'messaging', 'posting', 'discovery'].includes(body.scope) || !Number.isFinite(expires.getTime()) || expires.getTime() <= Date.now() || expires.getTime() > Date.now() + 30 * 86400000)
            fail(400, 'invalid_limit');
        if (!await c.env.DB.prepare('SELECT 1 FROM users WHERE id=?').bind(target).first())
            fail(404, 'not_found');
        const limitId = id(), reason = text(body.reason, 1000, true);
        await c.env.DB.prepare('INSERT INTO user_limits(id,user_id,scope,reason,expires_at,created_at,created_by) VALUES(?,?,?,?,?,?,?)').bind(limitId, target, body.scope, reason, expires.toISOString(), now(), c.get('actorId')).run();
        await audit(c.env, 'user_limit_added', c.get('actorId'), target, { limitId, scope: body.scope });
        await notify(c.env, target, 'restriction', { limitId, scope: body.scope, reason });
        return c.json({ id: limitId }, 201);
    });
    app.delete('/admin/users/:id/limits/:limitId', async (c) => {
        await admin(c, ['safety']);
        await c.env.DB.prepare('UPDATE user_limits SET revoked_at=? WHERE id=? AND user_id=?').bind(now(), c.req.param('limitId'), c.req.param('id')).run();
        await audit(c.env, 'user_limit_revoked', c.get('actorId'), c.req.param('id'), { limitId: c.req.param('limitId') });
        return c.json({ ok: true });
    });
    app.get('/admin/users/:id/limits', async (c) => { await admin(c, ['safety', 'users']); return c.json(await c.env.DB.prepare('SELECT * FROM user_limits WHERE user_id=? ORDER BY created_at DESC').bind(c.req.param('id')).all()); });
    app.get('/api/restrictions', async (c) => c.json(await c.env.DB.prepare('SELECT id,scope,reason,expires_at FROM user_limits WHERE user_id=? AND revoked_at IS NULL AND expires_at>?').bind(c.get('userId'), now()).all()));
    app.get('/admin/daily-topics', async (c) => { await admin(c, ['content']); await dailyTopic(c.env); const { limit, offset } = page(c); return c.json(await c.env.DB.prepare('SELECT * FROM daily_topics ORDER BY topic_date DESC LIMIT ? OFFSET ?').bind(limit, offset).all()); });
    app.post('/admin/daily-topics', async (c) => {
        await admin(c, ['content']);
        return fail(409, 'daily_topic_fixed');
    });
    app.post('/api/blocks', async (c) => {
        const target = text((await input(c)).userId, 100, true), me = c.get('userId');
        if (target === me)
            fail(400, 'invalid_user');
        if (!await c.env.DB.prepare('SELECT 1 FROM users WHERE id=?').bind(target).first())
            fail(404, 'not_found');
        await c.env.DB.batch([
            c.env.DB.prepare('INSERT OR IGNORE INTO blocks(blocker_id,blocked_id,created_at) VALUES(?,?,?)').bind(me, target, now()),
            c.env.DB.prepare('DELETE FROM matches WHERE (user_low=? AND user_high=?) OR (user_low=? AND user_high=?)').bind(me, target, target, me),
            c.env.DB.prepare('DELETE FROM stage_grants WHERE (owner_id=? AND viewer_id=?) OR (owner_id=? AND viewer_id=?)').bind(me, target, target, me),
            c.env.DB.prepare('DELETE FROM likes WHERE (from_user=? AND to_user=?) OR (from_user=? AND to_user=?)').bind(me, target, target, me),
        ]);
        await audit(c.env, 'user_blocked', me, target);
        return c.json({ ok: true });
    });
    app.get('/api/blocks', async c => {
        const rows = await c.env.DB.prepare(`SELECT b.blocked_id,b.blocked_id AS user_id,p.display_name,b.created_at FROM blocks b JOIN profiles p ON p.user_id=b.blocked_id WHERE b.blocker_id=? ORDER BY b.created_at DESC`).bind(c.get('userId')).all();
        return c.json({ ...rows, blocks: rows.results });
    });
    app.delete('/api/blocks/:id', async (c) => { await c.env.DB.prepare('DELETE FROM blocks WHERE blocker_id=? AND blocked_id=?').bind(c.get('userId'), c.req.param('id')).run(); return c.json({ ok: true }); });
    app.post('/api/reports', async (c) => {
        const body = await input(c), target = text(body.subjectId, 100, true), category = text(body.category, 60, true), details = text(body.details ?? '', 3000);
        await rate(c, 'report', c.get('userId'), 10, 3600);
        if (target === c.get('userId') || !await c.env.DB.prepare('SELECT 1 FROM users WHERE id=?').bind(target).first())
            fail(400, 'invalid_subject');
        const reportId = id();
        await c.env.DB.prepare('INSERT INTO reports(id,reporter_id,subject_id,category,details,created_at,updated_at) VALUES(?,?,?,?,?,?,?)').bind(reportId, c.get('userId'), target, category, details, now(), now()).run();
        await audit(c.env, 'report_created', c.get('userId'), reportId);
        return c.json({ id: reportId, status: 'open' }, 201);
    });
    app.get('/api/reports', async (c) => c.json(await c.env.DB.prepare('SELECT id,subject_id,category,status,resolution,created_at,updated_at FROM reports WHERE reporter_id=? ORDER BY created_at DESC LIMIT 100').bind(c.get('userId')).all()));
    app.get('/admin/reports', async (c) => { await admin(c, ['safety']); const { limit, offset } = page(c); return c.json(await c.env.DB.prepare('SELECT * FROM reports ORDER BY created_at DESC LIMIT ? OFFSET ?').bind(limit, offset).all()); });
    app.patch('/admin/reports/:id', async (c) => {
        await admin(c, ['safety']);
        const body = await input(c);
        if (!['open', 'reviewing', 'resolved', 'dismissed'].includes(body.status))
            fail(400, 'invalid_status');
        const row = await c.env.DB.prepare('UPDATE reports SET status=?,resolution=?,assigned_to=?,updated_at=? WHERE id=? RETURNING reporter_id').bind(body.status, text(body.resolution ?? '', 2000), c.get('actorId'), now(), c.req.param('id')).first<Row>();
        if (!row)
            return fail(404, 'not_found');
        await audit(c.env, 'report_reviewed', c.get('actorId'), c.req.param('id'), { status: body.status });
        await notify(c.env, row.reporter_id, 'report_update', { reportId: c.req.param('id'), status: body.status });
        return c.json({ ok: true });
    });
    app.get('/admin/safety-flags', async (c) => { await admin(c, ['safety']); const { limit, offset } = page(c); return c.json(await c.env.DB.prepare('SELECT * FROM safety_flags ORDER BY created_at DESC LIMIT ? OFFSET ?').bind(limit, offset).all()); });
    app.patch('/admin/safety-flags/:id', async (c) => {
        await admin(c, ['safety']);
        const body = await input(c);
        if (!['warn', 'delete_message', 'dismiss', 'reviewed'].includes(body.action))
            fail(400, 'invalid_action');
        const flag = await c.env.DB.prepare('SELECT * FROM safety_flags WHERE id=?').bind(c.req.param('id')).first<Row>();
        if (!flag)
            return fail(404, 'not_found');
        if (body.action === 'delete_message')
            await c.env.DB.prepare('UPDATE messages SET deleted_at=? WHERE id=?').bind(now(), flag!.message_id).run();
        await c.env.DB.prepare('UPDATE safety_flags SET status=?,reviewed_by=?,reviewed_at=? WHERE id=?').bind(body.action, c.get('actorId'), now(), flag!.id).run();
        if (body.action === 'warn')
            await notify(c.env, flag!.user_id, 'safety_warning', { reason: text(body.reason ?? '勧誘や外部サイトへの誘導に関する投稿を確認しました。', 1000) });
        await audit(c.env, 'safety_flag_reviewed', c.get('actorId'), flag!.id, { action: body.action });
        return c.json({ ok: true });
    });
    app.post('/api/appeals', async (c) => {
        const body = await input(c), reason = text(body.reason, 3000, true), limitId = body.limitId ? text(body.limitId, 100, true) : null;
        await rate(c, 'appeal', c.get('userId'), 5, 3600);
        if (limitId && !await c.env.DB.prepare('SELECT 1 FROM user_limits WHERE id=? AND user_id=?').bind(limitId, c.get('userId')).first())
            fail(404, 'limit_not_found');
        const appealId = id();
        await c.env.DB.prepare('INSERT INTO appeals(id,user_id,reason,limit_id,created_at,updated_at) VALUES(?,?,?,?,?,?)').bind(appealId, c.get('userId'), reason, limitId, now(), now()).run();
        await audit(c.env, 'appeal_created', c.get('userId'), appealId);
        return c.json({ id: appealId, status: 'open' }, 201);
    });
    app.get('/api/appeals', async (c) => c.json(await c.env.DB.prepare('SELECT * FROM appeals WHERE user_id=? ORDER BY created_at DESC LIMIT 100').bind(c.get('userId')).all()));
    app.get('/admin/appeals', async (c) => { await admin(c, ['safety']); const { limit, offset } = page(c); return c.json(await c.env.DB.prepare('SELECT * FROM appeals ORDER BY created_at DESC LIMIT ? OFFSET ?').bind(limit, offset).all()); });
    app.patch('/admin/appeals/:id', async (c) => {
        await admin(c, ['safety']);
        const body = await input(c);
        if (!['reviewing', 'accepted', 'rejected'].includes(body.status))
            fail(400, 'invalid_status');
        const row = await c.env.DB.prepare('UPDATE appeals SET status=?,resolution=?,updated_at=? WHERE id=? RETURNING user_id,limit_id').bind(body.status, text(body.resolution ?? '', 2000), now(), c.req.param('id')).first<Row>();
        if (!row)
            return fail(404, 'not_found');
        if (body.status === 'accepted' && row.limit_id)
            await c.env.DB.prepare('UPDATE user_limits SET revoked_at=? WHERE id=? AND user_id=?').bind(now(), row.limit_id, row.user_id).run();
        await audit(c.env, 'appeal_reviewed', c.get('actorId'), c.req.param('id'), { status: body.status });
        await notify(c.env, row.user_id, 'appeal_update', { appealId: c.req.param('id'), status: body.status });
        return c.json({ ok: true });
    });
    app.get('/admin/audit', async (c) => { await admin(c, ['audit']); const { limit, offset } = page(c); return c.json(await c.env.DB.prepare('SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT ? OFFSET ?').bind(limit, offset).all()); });
    app.get('/admin/image-access', async (c) => { await admin(c, ['audit']); const { limit, offset } = page(c); return c.json(await c.env.DB.prepare('SELECT * FROM image_access_logs ORDER BY accessed_at DESC LIMIT ? OFFSET ?').bind(limit, offset).all()); });
    app.get('/admin/operations/summary', async (c) => {
        await admin(c, ['audit']);
        const tables = ['users', 'matches', 'messages', 'reports', 'safety_flags', 'email_outbox', 'push_jobs'], counts: Row = {};
        for (const table of tables)
            counts[table] = (await c.env.DB.prepare(`SELECT COUNT(*) AS n FROM ${table}`).first<Row>())?.n ?? 0;
        const failures = await c.env.DB.prepare("SELECT 'email' AS kind,COUNT(*) AS count FROM email_outbox WHERE status='failed' UNION ALL SELECT 'push',COUNT(*) FROM push_jobs WHERE status='failed'").all();
        return c.json({ counts, failures: failures.results });
    });
    app.post('/admin/operations/maintenance', async (c) => {
        await admin(c, ['audit']);
        const body = await input(c);
        if (typeof body.enabled !== 'boolean')
            fail(400, 'invalid_maintenance_state');
        const until = body.enabled ? new Date(Date.now() + 15 * 60000).toISOString() : now();
        await c.env.DB.prepare("INSERT INTO service_state(key,value) VALUES('maintenance_until',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(until).run();
        await audit(c.env, body.enabled ? 'maintenance_started' : 'maintenance_ended', c.get('actorId'));
        return c.json({ enabled: body.enabled, until });
    });
}
