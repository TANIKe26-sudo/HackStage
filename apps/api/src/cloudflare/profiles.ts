import { imageStore } from './image-store.js';
import { audit, blocked, contactHash, fail, id, input, limited, now, notify, page, password, rate, stageProgress, text, verifyPassword, type App, type Ctx, type Row } from './core.js';
import { isLocationRange, prefectureNames, prefectureRegionSql, type LocationRange } from './locations.js';
export async function publicProfile(c: Ctx, userId: string) {
    const me = c.get('userId');
    if (me !== userId && await blocked(c.env, me, userId))
        return fail(404, 'profile_not_found');
    const row = await c.env.DB.prepare(`SELECT p.user_id,p.display_name,p.birth_year,CASE WHEN p.user_id=? OR p.location_scope='area' THEN p.area ELSE NULL END AS area,p.bio,p.purpose,p.conversation_pace,p.throat_class,
    (SELECT id FROM captures WHERE owner_id=p.user_id AND stage=0 AND (original_key IS NOT NULL OR object_key LIKE 'public/%') ORDER BY created_at DESC LIMIT 1) AS initial_capture_id
    FROM profiles p JOIN users u ON u.id=p.user_id WHERE p.user_id=? AND u.status='active'`).bind(me, userId).first<Row>();
    if (!row)
        return fail(404, 'profile_not_found');
    return row;
}
function choices(value: unknown) {
    if (!Array.isArray(value) || value.length > 20 || value.some(v => typeof v !== 'string' || !v.trim() || v.length > 100))
        return fail(400, 'invalid_preferences');
    return [...new Set(value as string[])];
}
export function profileRoutes(app: App) {
    app.get('/api/me', async (c) => {
        const profile = await c.env.DB.prepare(`SELECT p.*,u.email,u.email_verified,u.status,
      (SELECT id FROM captures WHERE owner_id=p.user_id AND stage=0 AND (original_key IS NOT NULL OR object_key LIKE 'public/%') ORDER BY created_at DESC LIMIT 1) AS profile_photo_capture_id FROM profiles p JOIN users u ON u.id=p.user_id WHERE p.user_id=?`).bind(c.get('userId')).first();
        return c.json({ profile });
    });
    app.patch('/api/profile', async (c) => {
        const body = await input(c), sets: string[] = [], values: unknown[] = [];
        const prefectureCode = body.prefecture_code === undefined ? undefined : text(body.prefecture_code, 2, true);
        if (prefectureCode !== undefined && !prefectureNames[prefectureCode])
            fail(400, 'invalid_prefecture');
        for (const key of ['display_name', 'birth_year', 'bio', 'purpose', 'conversation_pace', 'location_scope', 'throat_class'])
            if (Object.hasOwn(body, key)) {
                let value = body[key];
                if (key === 'birth_year') {
                    if (!Number.isInteger(value) || value < 1900 || value > new Date().getUTCFullYear() - 18)
                        fail(400, 'invalid_birth_year');
                }
                else {
                    value = text(value, key === 'bio' ? 300 : key === 'display_name' ? 30 : 100, key === 'display_name');
                }
                if (key === 'throat_class' && !['present', 'absent', 'pending'].includes(value))
                    fail(400, 'invalid_throat_class');
                if (key === 'location_scope' && !['hidden', 'area', 'meetup'].includes(value))
                    fail(400, 'invalid_location_scope');
                sets.push(`${key}=?`);
                values.push(value);
            }
        if (prefectureCode !== undefined) {
            sets.push('prefecture_code=?', 'area=?');
            values.push(prefectureCode, prefectureNames[prefectureCode]);
        }
        else if (Object.hasOwn(body, 'area')) {
            // Legacy clients may still send a free-text area. Do not trust it for
            // regional matching because it cannot be normalized reliably.
            sets.push('area=?', 'prefecture_code=NULL');
            values.push(text(body.area, 100));
        }
        if (!sets.length)
            fail(400, 'no_profile_fields');
        await c.env.DB.prepare(`UPDATE profiles SET ${sets.join(',')},updated_at=? WHERE user_id=?`).bind(...values, now(), c.get('userId')).run();
        return c.json({ ok: true });
    });
    app.get('/api/profiles/:id', async (c) => c.json({ profile: await publicProfile(c, c.req.param('id')) }));
    app.get('/api/preferences/discovery', async (c) => {
        const row = await c.env.DB.prepare('SELECT * FROM discovery_preferences WHERE user_id=?').bind(c.get('userId')).first<Row>();
        return c.json({ preferences: { acceptedPurposes: JSON.parse(row?.accepted_purposes ?? '[]'), acceptedPaces: JSON.parse(row?.accepted_paces ?? '[]'), preferredClassification: row?.preferred_classification ?? null, minAge: row?.min_age ?? 18, maxAge: row?.max_age ?? 120, locationRange: row?.location_range ?? null } });
    });
    app.put('/api/preferences/discovery', async (c) => {
        const body = await input(c), purposes = choices(body.acceptedPurposes ?? []), paces = choices(body.acceptedPaces ?? []), classification = body.preferredClassification ?? null, min = body.minAge ?? 18, max = body.maxAge ?? 120;
        if (classification !== null && !['present', 'absent', 'pending'].includes(classification) || !Number.isInteger(min) || !Number.isInteger(max) || min < 18 || max > 120 || min > max)
            fail(400, 'invalid_preferences');
        await c.env.DB.prepare(`INSERT INTO discovery_preferences(user_id,accepted_purposes,accepted_paces,preferred_classification,min_age,max_age) VALUES(?,?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET accepted_purposes=excluded.accepted_purposes,accepted_paces=excluded.accepted_paces,preferred_classification=excluded.preferred_classification,min_age=excluded.min_age,max_age=excluded.max_age`).bind(c.get('userId'), JSON.stringify(purposes), JSON.stringify(paces), classification, min, max).run();
        return c.json({ ok: true });
    });
    app.patch('/api/preferences/discovery', async c => {
        const body = await input(c), me = c.get('userId');
        const previous = await c.env.DB.prepare('SELECT * FROM discovery_preferences WHERE user_id=?').bind(me).first<Row>();
        const min = body.minAge ?? previous?.min_age ?? 18, max = body.maxAge ?? previous?.max_age ?? 120;
        const previousRange = (previous?.location_range as LocationRange | null | undefined) ?? null;
        const requestedRange: unknown = body.locationRange === undefined ? previousRange : body.locationRange;
        let locationRange: LocationRange | null;
        if (requestedRange === null || isLocationRange(requestedRange)) locationRange = requestedRange;
        else fail(400, 'invalid_location_range');
        if (!Number.isInteger(min) || !Number.isInteger(max) || min < 18 || max > 120 || min > max) fail(400, 'invalid_preferences');
        if (locationRange === 'same_prefecture' || locationRange === 'same_region') {
            const profile = await c.env.DB.prepare('SELECT prefecture_code FROM profiles WHERE user_id=?').bind(me).first<Row>();
            if (!profile?.prefecture_code) fail(400, 'prefecture_required');
        }
        await c.env.DB.prepare(`INSERT INTO discovery_preferences(user_id,min_age,max_age,location_range) VALUES(?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET min_age=excluded.min_age,max_age=excluded.max_age,location_range=excluded.location_range`).bind(me, min, max, locationRange).run();
        return c.json({ ok: true });
    });
    app.get('/api/discover', async (c) => {
        await limited(c, 'discovery');
        const me = c.get('userId'), { limit } = page(c, 30), year = new Date().getUTCFullYear();
        const reuseUnswiped = c.req.query('reuseUnswiped') === 'true' ? 1 : 0;
        const candidateRegion = prefectureRegionSql('p'), ownRegion = prefectureRegionSql('own');
        await c.env.DB.prepare('INSERT OR IGNORE INTO discovery_preferences(user_id) VALUES(?)').bind(me).run();
        const rows = await c.env.DB.prepare(`SELECT p.user_id,p.display_name,p.birth_year,CASE WHEN p.location_scope='area' THEN p.area ELSE NULL END AS area,p.bio,p.purpose,p.conversation_pace,p.throat_class,
      (SELECT id FROM captures WHERE owner_id=p.user_id AND stage=0 AND (original_key IS NOT NULL OR object_key LIKE 'public/%') ORDER BY created_at DESC LIMIT 1) AS initial_capture_id,
      COALESCE((SELECT SUM(impressions) FROM discovery_impressions WHERE candidate_id=p.user_id),0) AS exposure
      FROM profiles p JOIN users u ON u.id=p.user_id JOIN profiles own ON own.user_id=?
      JOIN discovery_preferences mine ON mine.user_id=own.user_id LEFT JOIN discovery_preferences theirs ON theirs.user_id=p.user_id
      WHERE p.user_id<>own.user_id AND u.status='active' AND p.display_name<>'' AND p.birth_year IS NOT NULL AND own.birth_year IS NOT NULL
      AND (? - p.birth_year) BETWEEN mine.min_age AND mine.max_age
      AND (? - own.birth_year) BETWEEN COALESCE(theirs.min_age,18) AND COALESCE(theirs.max_age,120)
      AND (mine.location_range IS NULL OR mine.location_range='anywhere'
        OR (mine.location_range='same_prefecture' AND p.location_scope='area' AND p.prefecture_code=own.prefecture_code)
        OR (mine.location_range='same_region' AND p.location_scope='area' AND ${candidateRegion}=${ownRegion}))
      AND (theirs.location_range IS NULL OR theirs.location_range='anywhere'
        OR (theirs.location_range='same_prefecture' AND own.location_scope='area' AND own.prefecture_code=p.prefecture_code)
        OR (theirs.location_range='same_region' AND own.location_scope='area' AND ${ownRegion}=${candidateRegion}))
      AND NOT EXISTS(SELECT 1 FROM mobile_profile_passes WHERE user_id=own.user_id AND other_id=p.user_id)
      AND (mine.preferred_classification IS NULL OR mine.preferred_classification=p.throat_class)
      AND (theirs.preferred_classification IS NULL OR theirs.preferred_classification=own.throat_class)
      AND (json_array_length(mine.accepted_purposes)=0 OR p.purpose IN (SELECT value FROM json_each(mine.accepted_purposes)))
      AND (json_array_length(COALESCE(theirs.accepted_purposes,'[]'))=0 OR own.purpose IN (SELECT value FROM json_each(theirs.accepted_purposes)))
      AND (json_array_length(mine.accepted_paces)=0 OR p.conversation_pace IN (SELECT value FROM json_each(mine.accepted_paces)))
      AND (json_array_length(COALESCE(theirs.accepted_paces,'[]'))=0 OR own.conversation_pace IN (SELECT value FROM json_each(theirs.accepted_paces)))
      AND NOT EXISTS(SELECT 1 FROM blocks WHERE (blocker_id=own.user_id AND blocked_id=p.user_id) OR (blocker_id=p.user_id AND blocked_id=own.user_id))
      AND NOT EXISTS(SELECT 1 FROM user_limits WHERE user_id=p.user_id AND revoked_at IS NULL AND expires_at>? AND scope IN ('all','discovery'))
      AND NOT EXISTS(SELECT 1 FROM likes WHERE from_user=own.user_id AND to_user=p.user_id)
      AND (?=1 OR NOT EXISTS(SELECT 1 FROM discovery_impressions WHERE viewer_id=own.user_id AND candidate_id=p.user_id AND shown_at>?))
      AND NOT EXISTS(SELECT 1 FROM user_contact_identifiers ci JOIN contact_hides ch ON ch.contact_hash=ci.contact_hash AND ch.user_id=own.user_id WHERE ci.user_id=p.user_id)
      ORDER BY exposure,COALESCE((SELECT shown_at FROM discovery_impressions WHERE viewer_id=own.user_id AND candidate_id=p.user_id),'') LIMIT ?`).bind(me, year, year, now(), reuseUnswiped, new Date(Date.now() - 86400000).toISOString(), limit).all<Row>();
        if (rows.results.length)
            await c.env.DB.batch(rows.results.map(row => c.env.DB.prepare(`INSERT INTO discovery_impressions(viewer_id,candidate_id,shown_at,impressions) VALUES(?,?,?,1) ON CONFLICT(viewer_id,candidate_id) DO UPDATE SET shown_at=excluded.shown_at,impressions=discovery_impressions.impressions+1`).bind(me, row.user_id, now())));
        return c.json({ candidates: rows.results, candidateCount: rows.results.length, notice: rows.results.length < limit ? '候補が少なくなっています。条件を広げるか、後でもう一度お試しください。' : null, paidPriority: false });
    });
    app.post('/api/likes', async (c) => {
        await limited(c, 'discovery');
        const body = await input(c), me = c.get('userId'), other = text(body.toUserId, 100, true);
        await rate(c, 'likes', me, 60, 3600);
        if (me === other || await blocked(c.env, me, other))
            return fail(404, 'not_available');
        await publicProfile(c, other);
        const [low, high] = [me, other].sort(), matchId = id();
        const results = await c.env.DB.batch([
            c.env.DB.prepare('INSERT OR IGNORE INTO likes(from_user,to_user,created_at) VALUES(?,?,?)').bind(me, other, now()),
            c.env.DB.prepare('INSERT OR IGNORE INTO matches(id,user_low,user_high,created_at) SELECT ?,?,?,? WHERE EXISTS(SELECT 1 FROM likes WHERE from_user=? AND to_user=?)').bind(matchId, low, high, now(), other, me),
        ]);
        const match = await c.env.DB.prepare('SELECT id FROM matches WHERE user_low=? AND user_high=?').bind(low, high).first<Row>();
        if (results[1].meta.changes)
            await Promise.all([notify(c.env, me, 'match', { matchId }), notify(c.env, other, 'match', { matchId })]);
        else if (results[0].meta.changes && !match)
            await notify(c.env, other, 'like', { fromUserId: me });
        return c.json({ matched: !!match, matchId: match?.id ?? null });
    });
    app.get('/api/likes/received', async (c) => {
        const me = c.get('userId'), { limit, offset } = page(c), pendingOnly = c.req.query('pendingOnly') === 'true' ? 1 : 0;
        const rows = await c.env.DB.prepare(`SELECT p.user_id,p.display_name,p.birth_year,CASE WHEN p.location_scope='area' THEN p.area ELSE NULL END AS area,p.bio,p.purpose,p.conversation_pace,p.throat_class,l.created_at,
      (SELECT id FROM captures WHERE owner_id=p.user_id AND stage=0 AND (original_key IS NOT NULL OR object_key LIKE 'public/%') ORDER BY created_at DESC LIMIT 1) AS initial_capture_id
      FROM likes l JOIN profiles p ON p.user_id=l.from_user JOIN users u ON u.id=p.user_id WHERE l.to_user=? AND u.status='active'
      AND (?=0 OR NOT EXISTS(SELECT 1 FROM likes x WHERE x.from_user=l.to_user AND x.to_user=p.user_id))
      AND NOT EXISTS(SELECT 1 FROM mobile_profile_passes WHERE user_id=l.to_user AND other_id=p.user_id)
      AND NOT EXISTS(SELECT 1 FROM blocks WHERE (blocker_id=? AND blocked_id=p.user_id) OR (blocked_id=? AND blocker_id=p.user_id)) ORDER BY l.created_at DESC LIMIT ? OFFSET ?`).bind(me, pendingOnly, me, me, limit, offset).all();
        return c.json({ likes: rows.results, results: rows.results, nextOffset: rows.results.length === limit ? offset + limit : null });
    });
    app.post('/api/contacts/hide', async (c) => {
        const body = await input(c);
        if (!Array.isArray(body.contacts) || body.contacts.length > 1000)
            fail(400, 'invalid_contacts');
        await rate(c, 'contacts', c.get('userId'), 10, 3600);
        const statements = await Promise.all(body.contacts.map(async (value: unknown) => c.env.DB.prepare('INSERT OR IGNORE INTO contact_hides(user_id,contact_hash,created_at) VALUES(?,?,?)').bind(c.get('userId'), await contactHash(c.env, text(value, 200, true)), now())));
        for (let i = 0; i < statements.length; i += 50)
            await c.env.DB.batch(statements.slice(i, i + 50));
        return c.json({ hidden: statements.length });
    });
    app.get('/api/contacts/hide', async (c) => {
        const row = await c.env.DB.prepare('SELECT COUNT(*) AS count FROM contact_hides WHERE user_id=?').bind(c.get('userId')).first<Row>();
        return c.json({ count: Number(row?.count ?? 0) });
    });
    app.delete('/api/contacts/hide/entry', async (c) => {
        const body = await input(c), contact = text(body.contact, 200, true);
        const digest = await contactHash(c.env, contact);
        const result = await c.env.DB.prepare('DELETE FROM contact_hides WHERE user_id=? AND contact_hash=?').bind(c.get('userId'), digest).run();
        return c.json({ removed: result.meta.changes > 0 });
    });
    app.delete('/api/contacts/hide', async (c) => { await c.env.DB.prepare('DELETE FROM contact_hides WHERE user_id=?').bind(c.get('userId')).run(); return c.json({ cleared: true }); });
    app.delete('/api/account', async (c) => {
        const body = await input(c), me = c.get('userId');
        await rate(c, 'delete-account', me, 5);
        const credential = await c.env.DB.prepare('SELECT password_hash FROM password_credentials WHERE user_id=?').bind(me).first<Row>();
        if (!credential || !await verifyPassword(password(body.password), credential.password_hash))
            fail(401, 'reauthentication_failed');
        const captures = await c.env.DB.prepare('SELECT object_key,original_key FROM captures WHERE owner_id=?').bind(me).all<Row>();
        const keys = [...new Set(captures.results.flatMap(r => [r.object_key, r.original_key]).filter(Boolean))] as string[];
        for (let i = 0; i < keys.length; i += 100)
            await imageStore(c.env).delete(keys.slice(i, i + 100));
        await c.env.DB.batch([
            c.env.DB.prepare('DELETE FROM email_outbox WHERE recipient=(SELECT email FROM users WHERE id=?)').bind(me),
            c.env.DB.prepare('UPDATE audit_logs SET actor_id=NULL WHERE actor_id=?').bind(me),
            c.env.DB.prepare('UPDATE audit_logs SET subject_id=NULL WHERE subject_id=?').bind(me),
            c.env.DB.prepare('DELETE FROM users WHERE id=?').bind(me),
        ]);
        await audit(c.env, 'account_deleted', null, null, { deleted: true });
        return c.json({ deleted: true });
    });
    // Compatibility with the mobile client's existing account deletion route.
    app.post('/api/account/delete', async (c) => {
        return app.fetch(new Request(new URL('/api/account', c.req.url), { method: 'DELETE', headers: c.req.raw.headers, body: await c.req.text() }), c.env, c.executionCtx);
    });
}
