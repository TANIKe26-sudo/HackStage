import { classifyNeck } from './classification.js';
import { imageStore } from './image-store.js';
import { Buffer } from 'node:buffer';
import * as jpeg from 'jpeg-js';
import { decode as decodePng, convertIndexedToRgb } from 'fast-png';
import { audit, blocked, fail, id, input, limited, member, now, page, rate, stageProgress, text, type App, type Ctx, type Row } from './core.js';
type Region = {
    x: number;
    y: number;
    width: number;
    height: number;
};
// These are framing guides, not anatomical detection. Clients can submit their
// own nested regions and should preview stage 0 before publishing a portrait.
export const defaultRegions: Region[] = [
    { x: .25, y: .8, width: .5, height: .2 }, { x: .2, y: .65, width: .6, height: .35 },
    { x: .15, y: .45, width: .7, height: .55 }, { x: .1, y: .15, width: .8, height: .85 },
    { x: 0, y: 0, width: 1, height: 1 },
];
function regions(value: unknown): Region[] {
    if (value === undefined)
        return defaultRegions;
    if (!Array.isArray(value) || value.length !== 5)
        fail(400, 'five_regions_required');
    const rows = value as Region[];
    for (let i = 0; i < 5; i++) {
        const r = rows[i];
        if (!r || [r.x, r.y, r.width, r.height].some(v => !Number.isFinite(v)) || r.x < 0 || r.y < 0 || r.width <= 0 || r.height <= 0 || r.x + r.width > 1.000001 || r.y + r.height > 1.000001)
            fail(400, 'invalid_crop_region');
        if (i) {
            const p = rows[i - 1];
            if (r.x > p.x || r.y > p.y || r.x + r.width + 1e-6 < p.x + p.width || r.y + r.height + 1e-6 < p.y + p.height)
                fail(400, 'crop_regions_must_be_nested');
        }
    }
    return rows;
}
function decode(dataUrl: unknown) {
    if (typeof dataUrl !== 'string' || dataUrl.length > 9000000)
        fail(413, 'capture_too_large');
    const match = (dataUrl as string).match(/^data:image\/(jpeg|png);base64,([A-Za-z0-9+/]+={0,2})$/);
    if (!match)
        return fail(400, 'invalid_capture');
    const bytes = Buffer.from(match[2], 'base64');
    try {
        let image: {
            width: number;
            height: number;
            data: Uint8Array;
        };
        if (match[1] === 'png') {
            if (bytes.length < 24 || bytes.readUInt32BE(0) !== 0x89504e47 || bytes.readUInt32BE(4) !== 0x0d0a1a0a)
                fail(400, 'invalid_image_signature');
            const width = bytes.readUInt32BE(16), height = bytes.readUInt32BE(20);
            if (width * height > 2500000)
                fail(413, 'resize_capture_before_upload');
            const decoded = decodePng(bytes, { checkCrc: true });
            const png = decoded.palette ? { ...decoded, data: convertIndexedToRgb(decoded), depth: 8, channels: decoded.palette[0].length } : decoded;
            if (png.depth !== 8)
                fail(400, 'unsupported_png_depth');
            const data = new Uint8Array(width * height * 4), channels = png.channels;
            for (let pixel = 0; pixel < width * height; pixel++) {
                const from = pixel * channels, to = pixel * 4;
                data[to] = png.data[from];
                data[to + 1] = png.data[from + (channels >= 3 ? 1 : 0)];
                data[to + 2] = png.data[from + (channels >= 3 ? 2 : 0)];
                data[to + 3] = channels === 2 ? png.data[from + 1] : channels === 4 ? png.data[from + 3] : 255;
            }
            image = { width, height, data };
        }
        else
            image = jpeg.decode(bytes, { useTArray: true, maxResolutionInMP: 2.5, maxMemoryUsageInMB: 64, tolerantDecoding: false });
        if (image.width < 64 || image.height < 64 || image.width * image.height > 2500000)
            fail(400, 'invalid_image_dimensions');
        return { image, bytes, type: `image/${match[1]}` };
    }
    catch (e) {
        if (e instanceof Error && e.name === 'HTTPException')
            throw e;
        console.error('capture_decode_failed', e instanceof Error ? e.message : 'unknown');
        return fail(400, 'invalid_or_oversized_image');
    }
}
function crop(image: {
    width: number;
    height: number;
    data: Uint8Array;
}, r: Region) {
    const x = Math.floor(r.x * image.width), y = Math.floor(r.y * image.height), width = Math.max(1, Math.min(image.width - x, Math.floor(r.width * image.width))), height = Math.max(1, Math.min(image.height - y, Math.floor(r.height * image.height)));
    const data = Buffer.alloc(width * height * 4);
    for (let row = 0; row < height; row++)
        data.set(image.data.subarray(((y + row) * image.width + x) * 4, ((y + row) * image.width + x + width) * 4), row * width * 4);
    return jpeg.encode({ width, height, data }, 85).data;
}
export async function mayView(c: Ctx, capture: Row) {
    const me = c.get('userId');
    if (capture.owner_id === me)
        return;
    if ((!capture.original_key && !String(capture.object_key).startsWith('public/')) || await blocked(c.env, me, capture.owner_id))
        fail(403, 'forbidden');
    const owner = await c.env.DB.prepare("SELECT 1 FROM users WHERE id=? AND status='active'").bind(capture.owner_id).first();
    if (!owner)
        fail(403, 'forbidden');
    if (capture.stage === 0) {
        if (await c.env.DB.prepare('SELECT 1 FROM discovery_impressions WHERE viewer_id=? AND candidate_id=? AND shown_at>?').bind(me, capture.owner_id, new Date(Date.now() - 30 * 86400000).toISOString()).first())
            return;
        if (await c.env.DB.prepare('SELECT 1 FROM likes WHERE from_user=? AND to_user=?').bind(capture.owner_id, me).first())
            return;
    }
    const match = await c.env.DB.prepare('SELECT id FROM matches WHERE (user_low=? AND user_high=?) OR (user_low=? AND user_high=?)').bind(me, capture.owner_id, capture.owner_id, me).first<Row>();
    if (!match)
        fail(403, 'forbidden');
    if (capture.stage === 0)
        return;
    const progress = await stageProgress(c.env, match!.id);
    if (capture.stage > progress.stage)
        fail(403, 'stage_locked');
    if (!await c.env.DB.prepare('SELECT 1 FROM stage_grants WHERE owner_id=? AND viewer_id=? AND stage=? AND revoked_at IS NULL AND expires_at>?').bind(capture.owner_id, me, capture.stage, now()).first())
        fail(403, 'consent_required');
}
export function mediaRoutes(app: App) {
    app.post('/api/captures', async (c) => {
        await limited(c, 'posting');
        await rate(c, 'capture', c.get('userId'), 12, 3600);
        const body = await input(c), decoded = decode(body.dataUrl), boxes = regions(body.regions), group = id(), original = `${c.get('userId')}/originals/${group}`, time = now(), created: {
            id: string;
            stage: number;
        }[] = [];
        const stored: string[] = [];
        try {
            await imageStore(c.env).put(original, crop(decoded.image, { x: 0, y: 0, width: 1, height: 1 }), { httpMetadata: { contentType: 'image/jpeg', cacheControl: 'private, no-store' } });
            stored.push(original);
            const statements: D1PreparedStatement[] = [];
            for (let stage = 0; stage < 5; stage++) {
                const captureId = id(), key = `${c.get('userId')}/variants/${group}/${stage}.jpg`, bytes = crop(decoded.image, boxes[stage]);
                await imageStore(c.env).put(key, bytes, { httpMetadata: { contentType: 'image/jpeg', cacheControl: 'private, no-store' } });
                stored.push(key);
                created.push({ id: captureId, stage });
                statements.push(c.env.DB.prepare('INSERT INTO captures(id,owner_id,stage,object_key,media_type,created_at,original_key,regions) VALUES(?,?,?,?,?,?,?,?)').bind(captureId, c.get('userId'), stage, key, 'image/jpeg', time, original, JSON.stringify(boxes)));
            }
            await c.env.DB.batch(statements);
        }
        catch (e) {
            await imageStore(c.env).delete(stored);
            throw e;
        }
        return c.json({ id: created[0].id, stage: 0, captures: created, regions: boxes, previewRequired: true }, 201);
    });
    app.get('/api/profiles/:id/captures', async (c) => {
        const owner = text(c.req.param('id'), 100, true), rows = await c.env.DB.prepare('SELECT * FROM captures WHERE owner_id=? ORDER BY created_at DESC,stage').bind(owner).all<Row>(), visible: Row[] = [];
        for (const row of rows.results) {
            try {
                await mayView(c, row);
                visible.push({ id: row.id, stage: row.stage, createdAt: row.created_at });
            }
            catch { }
        }
        return c.json({ captures: visible });
    });
    app.get('/api/captures/:id/image', async (c) => {
        const row = await c.env.DB.prepare('SELECT * FROM captures WHERE id=?').bind(c.req.param('id')).first<Row>();
        if (!row)
            return fail(404, 'not_found');
        await mayView(c, row);
        const object = await imageStore(c.env).get(row.object_key);
        if (!object)
            return fail(404, 'not_found');
        await c.env.DB.prepare('INSERT INTO image_access_logs(id,capture_id,viewer_id,accessed_at) VALUES(?,?,?,?)').bind(id(), row.id, c.get('userId'), now()).run();
        return new Response(object.body, { headers: { 'Content-Type': row.media_type, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' } });
    });
    app.get('/api/captures/:id/access-history', async (c) => {
        if (!await c.env.DB.prepare('SELECT 1 FROM captures WHERE id=? AND owner_id=?').bind(c.req.param('id'), c.get('userId')).first())
            fail(404, 'not_found');
        const { limit, offset } = page(c);
        return c.json(await c.env.DB.prepare('SELECT viewer_id,accessed_at FROM image_access_logs WHERE capture_id=? ORDER BY accessed_at DESC LIMIT ? OFFSET ?').bind(c.req.param('id'), limit, offset).all());
    });
    app.delete('/api/captures/:id', async (c) => {
        const row = await c.env.DB.prepare('SELECT * FROM captures WHERE id=? AND owner_id=?').bind(c.req.param('id'), c.get('userId')).first<Row>();
        if (!row)
            return fail(404, 'not_found');
        const siblings = row.original_key ? await c.env.DB.prepare('SELECT id,object_key FROM captures WHERE original_key=? AND owner_id=?').bind(row.original_key, c.get('userId')).all<Row>()
            : /^public\/[^/]+\/[^/]+\/[0-4]$/.test(row.object_key) ? await c.env.DB.prepare('SELECT id,object_key FROM captures WHERE owner_id=? AND object_key IN (?,?,?,?,?)').bind(c.get('userId'), ...Array.from({ length: 5 }, (_, stage) => row.object_key.replace(/\/[0-4]$/, `/${stage}`))).all<Row>() : { results: [row] };
        await imageStore(c.env).delete([...siblings.results.map(r => r.object_key), ...(row.original_key ? [row.original_key] : [])]);
        await c.env.DB.batch(siblings.results.map(r => c.env.DB.prepare('DELETE FROM captures WHERE id=?').bind(r.id)));
        await audit(c.env, 'capture_deleted', c.get('userId'), row.id);
        return c.json({ deleted: true });
    });
    app.get('/api/matches/:id/profile-stage', async (c) => {
        const match = await member(c, c.req.param('id')), progress = await stageProgress(c.env, match.id);
        const grants = await c.env.DB.prepare('SELECT owner_id,viewer_id,stage,consented_at,expires_at FROM stage_grants WHERE ((owner_id=? AND viewer_id=?) OR (owner_id=? AND viewer_id=?)) AND revoked_at IS NULL AND expires_at>?').bind(c.get('userId'), match.other, match.other, c.get('userId'), now()).all();
        return c.json({ ...progress, grants: grants.results });
    });
    app.post('/api/matches/:id/profile-stage', async (c) => {
        const match = await member(c, c.req.param('id')), body = await input(c), stage = body.stage, me = c.get('userId');
        if (!Number.isInteger(stage) || stage < 0 || stage > 4 || typeof body.consent !== 'boolean' || body.viewerId && body.viewerId !== match.other)
            fail(400, 'invalid_grant');
        if (!body.consent) {
            await c.env.DB.prepare('UPDATE stage_grants SET revoked_at=? WHERE owner_id=? AND viewer_id=? AND stage>=?').bind(now(), me, match.other, stage).run();
            await audit(c.env, 'profile_stage_revoked', me, match.other, { stage });
            return c.json({ revoked: true });
        }
        const progress = await stageProgress(c.env, match.id);
        if (stage > progress.stage)
            fail(403, 'stage_locked');
        const expiry = new Date(body.expiresAt ?? Date.now() + 30 * 86400000);
        if (!Number.isFinite(expiry.getTime()) || expiry.getTime() <= Date.now() || expiry.getTime() > Date.now() + 30 * 86400000 + 1000)
            fail(400, 'invalid_expiry');
        const statements = [];
        for (let s = 0; s <= stage; s++)
            statements.push(c.env.DB.prepare(`INSERT INTO stage_grants(owner_id,viewer_id,stage,consented_at,expires_at,revoked_at) VALUES(?,?,?,?,?,NULL) ON CONFLICT(owner_id,viewer_id,stage) DO UPDATE SET consented_at=excluded.consented_at,expires_at=excluded.expires_at,revoked_at=NULL`).bind(me, match.other, s, now(), expiry.toISOString()));
        await c.env.DB.batch(statements);
        await audit(c.env, 'profile_stage_consent', me, match.other, { stage });
        return c.json({ granted: true, stage, expiresAt: expiry.toISOString() });
    });
    app.post('/api/captures/:id/classification', async (c) => {
        const body = await input(c);
        if (body.consent !== true)
            fail(400, 'classification_consent_required');
        await rate(c, 'classify', c.get('userId'), 6, 3600);
        const row = await c.env.DB.prepare('SELECT * FROM captures WHERE id=? AND owner_id=? AND stage=0').bind(c.req.param('id'), c.get('userId')).first<Row>();
        if (!row)
            return fail(404, 'not_found');
        if (!row.original_key && !String(row.object_key).startsWith('public/')) fail(400, 'classification_requires_neck_crop');
        await limited(c, 'posting');
        const image = await imageStore(c.env).get(row.object_key);
        if (!image) return fail(404, 'not_found');
        return c.json(await classifyNeck(c, new Uint8Array(await image.arrayBuffer()), row.id));
    });
}
