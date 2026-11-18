import { audit, decrypt, encrypt, fail, id, input, member, now, notify, page, text, type App, type Ctx, type Row } from './core.js';
type Scope = {
    schedule: boolean;
    area: boolean;
    exactLocation: boolean;
    arrival: boolean;
};
function scope(value: unknown): Scope {
    if (!value || typeof value !== 'object' || Array.isArray(value))
        fail(400, 'invalid_share_scope');
    const v = value as Row;
    for (const key of Object.keys(v))
        if (!['schedule', 'area', 'exactLocation', 'arrival'].includes(key) || typeof v[key] !== 'boolean')
            fail(400, 'invalid_share_scope');
    return { schedule: v.schedule === true, area: v.area === true, exactLocation: v.exactLocation === true, arrival: v.arrival === true };
}
function expiry(value: unknown, startsAt: string) { const d = new Date(typeof value === 'string' ? value : Date.parse(startsAt) + 12 * 3600000); if (!Number.isFinite(d.getTime()) || d.getTime() <= Date.now() || d.getTime() > Date.parse(startsAt) + 12 * 3600000)
    fail(400, 'invalid_expiry'); return d.toISOString(); }
async function plan(c: Ctx) {
    const row = await c.env.DB.prepare('SELECT * FROM date_plans WHERE id=?').bind(c.req.param('id')).first<Row>();
    if (!row)
        return fail(404, 'not_found');
    const match = await member(c, row.match_id);
    return { row, match };
}
async function serialize(c: Ctx, row: Row, match: Row) {
    const side = match.low ? 'low' : 'high', other = match.low ? 'high' : 'low', mine = JSON.parse(row[`scope_${side}`] ?? '{}'), theirs = JSON.parse(row[`scope_${other}`] ?? '{}');
    const ownExpiry = row[`expires_${side}`] ?? row.share_expires_at, otherExpiry = row[`expires_${other}`] ?? row.share_expires_at;
    const active = row.status !== 'cancelled' && row.status !== 'expired' && ownExpiry > now() && otherExpiry > now();
    const both = active && row.confirmed_user_low && row.confirmed_user_high;
    const visible = (key: string) => both && mine[key] === true && theirs[key] === true;
    const proposerSide = row.created_by === match.user_low ? 'low' : 'high', proposal = JSON.parse(row[`scope_${proposerSide}`] ?? '{}'), proposalExpiry = row[`expires_${proposerSide}`] ?? row.share_expires_at;
    const own = row.created_by === c.get('userId'), proposalVisible = (key: string) => own || row.status === 'proposed' && proposalExpiry > now() && proposal[key] === true;
    return { id: row.id, matchId: row.match_id, revision: row.revision, status: row.status === 'confirmed' && !active ? 'expired' : row.status,
        startsAt: visible('schedule') || proposalVisible('schedule') ? row.starts_at : null, placeLabel: visible('area') || proposalVisible('area') ? row.place_label : null,
        exactLocation: visible('exactLocation') && row.exact_location_cipher ? await decrypt(c.env, row.exact_location_cipher) : null,
        myConsent: { scope: mine, expiresAt: ownExpiry }, theirConsent: { scope: theirs, expiresAt: otherExpiry },
        confirmed: { you: !!row[`confirmed_user_${side}`], other: !!row[`confirmed_user_${other}`] },
        arrived: { you: row[`arrived_user_${side}_at`], other: visible('arrival') ? row[`arrived_user_${other}_at`] : null } };
}
export function dateRoutes(app: App) {
    app.get('/api/matches/:id/date-plans', async (c) => {
        const match = await member(c, c.req.param('id')), { limit, offset } = page(c);
        const rows = await c.env.DB.prepare('SELECT * FROM date_plans WHERE match_id=? ORDER BY starts_at DESC LIMIT ? OFFSET ?').bind(match.id, limit, offset).all<Row>();
        return c.json({ plans: await Promise.all(rows.results.map(row => serialize(c, row, match))) });
    });
    app.post('/api/matches/:id/date-plans', async (c) => {
        const match = await member(c, c.req.param('id')), body = await input(c), starts = new Date(body.startsAt ?? '');
        if (!Number.isFinite(starts.getTime()) || starts.getTime() <= Date.now() || starts.getTime() > Date.now() + 180 * 86400000)
            fail(400, 'invalid_date_plan');
        const place = text(body.placeLabel, 200, true), exact = body.exactLocation ? text(body.exactLocation, 500) : null, sharing = scope(body.scope ?? { schedule: true, area: true, exactLocation: body.shareConsent === true, arrival: true });
        const expires = expiry(body.expiresAt, starts.toISOString()), planId = id(), low = match.low;
        await c.env.DB.prepare(`INSERT INTO date_plans(id,match_id,created_by,starts_at,place_label,exact_location_cipher,share_expires_at,scope_low,scope_high,expires_low,expires_high,share_consent_user_low,share_consent_user_high,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(planId, match.id, c.get('userId'), starts.toISOString(), place, exact ? await encrypt(c.env, exact) : null, expires, JSON.stringify(low ? sharing : {}), JSON.stringify(low ? {} : sharing), low ? expires : null, low ? null : expires, low && sharing.exactLocation ? 1 : 0, !low && sharing.exactLocation ? 1 : 0, now()).run();
        await audit(c.env, 'date_plan_created', c.get('userId'), planId);
        await notify(c.env, match.other, 'date_plan', { planId, matchId: match.id });
        return c.json({ id: planId, status: 'proposed', revision: 1 }, 201);
    });
    app.get('/api/date-plans/:id', async (c) => { const { row, match } = await plan(c); return c.json(await serialize(c, row, match)); });
    app.patch('/api/date-plans/:id/consent', async (c) => {
        const { row, match } = await plan(c), body = await input(c);
        if (['cancelled', 'expired'].includes(row.status))
            fail(409, 'plan_inactive');
        const side = match.low ? 'low' : 'high', sharing = scope(body.scope), expires = expiry(body.expiresAt, row.starts_at);
        const result = await c.env.DB.prepare(`UPDATE date_plans SET scope_${side}=?,expires_${side}=?,share_consent_user_${side}=?,confirmed_user_${side}=0,status='proposed',revision=revision+1,updated_at=? WHERE id=? AND revision=?`).bind(JSON.stringify(sharing), expires, sharing.exactLocation ? 1 : 0, now(), row.id, body.revision ?? row.revision).run();
        if (!result.meta.changes)
            fail(409, 'plan_changed');
        await audit(c.env, 'date_consent_changed', c.get('userId'), row.id, { scope: sharing, expiresAt: expires });
        return c.json({ ok: true, revision: row.revision + 1 });
    });
    app.delete('/api/date-plans/:id/consent', async (c) => {
        const { row, match } = await plan(c), side = match.low ? 'low' : 'high';
        await c.env.DB.prepare(`UPDATE date_plans SET scope_${side}='{}',expires_${side}=?,share_consent_user_${side}=0,confirmed_user_${side}=0,status=CASE WHEN status IN ('cancelled','expired') THEN status ELSE 'proposed' END,revision=revision+1,updated_at=? WHERE id=?`).bind(now(), now(), row.id).run();
        await audit(c.env, 'date_consent_revoked', c.get('userId'), row.id);
        return c.json({ revoked: true });
    });
    app.post('/api/date-plans/:id/confirm', async (c) => {
        const { row, match } = await plan(c), body = await input(c), side = match.low ? 'low' : 'high', other = match.low ? 'high' : 'low';
        if (['cancelled', 'expired'].includes(row.status) || row.starts_at <= now())
            fail(409, 'plan_inactive');
        // Compatibility: a confirm request can carry explicit location consent, while
        // fine-grained callers set scope using PATCH consent before confirming.
        const existing = JSON.parse(row[`scope_${side}`] ?? '{}');
        const sharing = body.scope ? scope(body.scope) : Object.keys(existing).length ? existing : scope({ schedule: true, area: true, arrival: true, exactLocation: body.consentToLocation === true });
        const expires = expiry(body.expiresAt ?? row[`expires_${side}`] ?? row.share_expires_at, row.starts_at);
        const confirmed = row[`confirmed_user_${other}`] === 1;
        const result = await c.env.DB.prepare(`UPDATE date_plans SET scope_${side}=?,expires_${side}=?,share_consent_user_${side}=?,confirmed_user_${side}=1,status=?,revision=revision+1,updated_at=? WHERE id=? AND revision=?`).bind(JSON.stringify(sharing), expires, sharing.exactLocation ? 1 : 0, confirmed ? 'confirmed' : 'proposed', now(), row.id, body.revision ?? row.revision).run();
        if (!result.meta.changes)
            fail(409, 'plan_changed');
        await audit(c.env, 'date_plan_confirmed', c.get('userId'), row.id);
        await notify(c.env, match.other, 'date_confirmed', { planId: row.id });
        return c.json({ confirmed: true, bothConfirmed: confirmed, status: confirmed ? 'confirmed' : 'proposed', revision: row.revision + 1 });
    });
    app.post('/api/date-plans/:id/reschedule', async (c) => {
        const { row, match } = await plan(c), body = await input(c), starts = new Date(body.startsAt ?? '');
        if (row.status === 'cancelled' || !Number.isFinite(starts.getTime()) || starts.getTime() <= Date.now() || starts.getTime() > Date.now() + 180 * 86400000)
            fail(400, 'invalid_date_plan');
        const result = await c.env.DB.prepare(`UPDATE date_plans SET starts_at=?,place_label=?,exact_location_cipher=?,share_expires_at=?,scope_low='{}',scope_high='{}',expires_low=NULL,expires_high=NULL,confirmed_user_low=0,confirmed_user_high=0,share_consent_user_low=0,share_consent_user_high=0,arrived_user_low_at=NULL,arrived_user_high_at=NULL,status='proposed',revision=revision+1,updated_at=? WHERE id=? AND revision=?`).bind(starts.toISOString(), text(body.placeLabel ?? row.place_label, 200, true), body.exactLocation ? await encrypt(c.env, text(body.exactLocation, 500)) : null, expiry(body.expiresAt, starts.toISOString()), now(), row.id, body.revision ?? row.revision).run();
        if (!result.meta.changes)
            fail(409, 'plan_changed');
        await audit(c.env, 'date_plan_rescheduled', c.get('userId'), row.id);
        await notify(c.env, match.other, 'date_rescheduled', { planId: row.id });
        return c.json({ ok: true, confirmationRequired: true, revision: row.revision + 1 });
    });
    app.post('/api/date-plans/:id/arrive', async (c) => {
        const { row, match } = await plan(c), side = match.low ? 'low' : 'high';
        if (row.status !== 'confirmed' || !row.confirmed_user_low || !row.confirmed_user_high || row.share_expires_at <= now() || row.expires_low <= now() || row.expires_high <= now())
            fail(409, 'plan_unconfirmed_or_expired');
        await c.env.DB.prepare(`UPDATE date_plans SET arrived_user_${side}_at=?,updated_at=? WHERE id=?`).bind(now(), now(), row.id).run();
        await audit(c.env, 'date_arrival', c.get('userId'), row.id);
        return c.json({ arrived: true });
    });
    app.post('/api/date-plans/:id/cancel', async (c) => {
        const { row, match } = await plan(c);
        await c.env.DB.prepare("UPDATE date_plans SET status='cancelled',exact_location_cipher=NULL,scope_low='{}',scope_high='{}',confirmed_user_low=0,confirmed_user_high=0,updated_at=?,revision=revision+1 WHERE id=?").bind(now(), row.id).run();
        await audit(c.env, 'date_plan_cancelled', c.get('userId'), row.id);
        await notify(c.env, match.other, 'date_cancelled', { planId: row.id });
        return c.json({ cancelled: true });
    });
}
