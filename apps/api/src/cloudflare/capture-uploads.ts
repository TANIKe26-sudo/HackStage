import { imageStore } from './image-store.js';
import { preparedJpeg } from './prepared-images.js';
import { fail, id, input, limited, now, rate, type App, type Ctx, type Env, type Row } from './core.js';

type Region = { x: number; y: number; width: number; height: number };
const keys = (owner: string, upload: string) => Array.from({ length: 5 }, (_, stage) => `${owner}/variants/${upload}/${stage}.jpg`);
async function ownedUpload(c: Ctx) {
    const row = await c.env.DB.prepare('SELECT * FROM capture_uploads WHERE id=? AND owner_id=? AND expires_at>?')
        .bind(c.req.param('uploadId'), c.get('userId'), now()).first<Row>();
    if (!row) return fail(404, 'capture_upload_not_found');
    return row;
}
export async function cleanupCaptureUploads(env: Env) {
    const rows = await env.DB.prepare('SELECT id,owner_id FROM capture_uploads WHERE expires_at<=? LIMIT 10').bind(now()).all<Row>();
    for (const row of rows.results) {
        await imageStore(env).delete(keys(row.owner_id, row.id));
        await env.DB.prepare('DELETE FROM capture_uploads WHERE id=?').bind(row.id).run();
    }
}
export function preparedCaptureRoutes(app: App, validateRegions: (value: unknown) => Region[]) {
    app.post('/api/capture-uploads', async c => {
        await limited(c, 'posting');
        await rate(c, 'capture', c.get('userId'), 12, 3600);
        const body = await input(c), { width, height } = body;
        if (!Number.isInteger(width) || !Number.isInteger(height) || width < 320 || height < 320 || width > 1280 || height > 1280) fail(400, 'invalid_image_dimensions');
        const boxes = validateRegions(body.regions), uploadId = id();
        await c.env.DB.prepare('INSERT INTO capture_uploads(id,owner_id,width,height,regions,created_at,expires_at) VALUES(?,?,?,?,?,?,?)')
            .bind(uploadId, c.get('userId'), width, height, JSON.stringify(boxes), now(), new Date(Date.now() + 30 * 60000).toISOString()).run();
        return c.json({ uploadId }, 201);
    });
    app.put('/api/capture-uploads/:uploadId/stages/:stage', async c => {
        await limited(c, 'posting');
        const upload = await ownedUpload(c), stage = Number(c.req.param('stage'));
        if (!Number.isInteger(stage) || stage < 0 || stage > 4) fail(400, 'invalid_capture_stage');
        const body = await input(c), image = preparedJpeg(body.dataUrl), box: Region = JSON.parse(upload.regions)[stage];
        if (image.width !== Math.max(1, Math.floor(upload.width * box.width)) || image.height !== Math.max(1, Math.floor(upload.height * box.height))) fail(400, 'invalid_image_dimensions');
        await rate(c, 'capture-part', c.get('userId'), 120, 3600);
        // Draft objects have no captures row and cannot be read by any image API.
        await imageStore(c.env).put(keys(upload.owner_id, upload.id)[stage], image.bytes, { httpMetadata: { contentType: 'image/jpeg' } });
        return c.json({ ok: true, stage });
    });
    app.post('/api/capture-uploads/:uploadId/complete', async c => {
        await limited(c, 'posting');
        const upload = await ownedUpload(c), paths = keys(upload.owner_id, upload.id);
        const rows = await c.env.DB.prepare('SELECT object_key FROM image_objects WHERE object_key IN (?,?,?,?,?)').bind(...paths).all<Row>();
        if (rows.results.length !== 5) fail(400, 'capture_upload_incomplete');
        const captures = paths.map((_, stage) => ({ id: id(), stage })), time = now();
        // All five variants become visible together. The full portrait (stage 4)
        // remains subject to mayView(); no original is delivered to other users.
        await c.env.DB.batch([
            ...captures.map(row => c.env.DB.prepare('INSERT INTO captures(id,owner_id,stage,object_key,media_type,created_at,original_key,regions) VALUES(?,?,?,?,?,?,?,?)')
                .bind(row.id, upload.owner_id, row.stage, paths[row.stage], 'image/jpeg', time, paths[4], upload.regions)),
            c.env.DB.prepare('DELETE FROM capture_uploads WHERE id=?').bind(upload.id),
        ]);
        return c.json({ id: captures[0].id, stage: 0, captures, regions: JSON.parse(upload.regions), previewRequired: true }, 201);
    });
    app.delete('/api/capture-uploads/:uploadId', async c => {
        const upload = await ownedUpload(c);
        await imageStore(c.env).delete(keys(upload.owner_id, upload.id));
        await c.env.DB.prepare('DELETE FROM capture_uploads WHERE id=?').bind(upload.id).run();
        return c.json({ deleted: true });
    });
}
