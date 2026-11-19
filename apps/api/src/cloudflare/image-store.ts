import { fail, type Env } from './core.js';

export const maxImageBytes = 1_800_000;
const chunkSize = 32768;

// Objects are never public: API callers must authorize access before get().
export function imageStore(env: Env) {
    return {
        async put(key: string, bytes: Uint8Array, options?: { httpMetadata?: { contentType?: string; cacheControl?: string } }) {
            if (!bytes.byteLength || bytes.byteLength > maxImageBytes) fail(413, 'capture_too_large');
            const statements = [
                env.DB.prepare('INSERT INTO image_objects(object_key,content_type,byte_length,updated_at) VALUES(?,?,?,?) ON CONFLICT(object_key) DO UPDATE SET content_type=excluded.content_type,byte_length=excluded.byte_length,updated_at=excluded.updated_at')
                    .bind(key, options?.httpMetadata?.contentType ?? 'image/jpeg', bytes.byteLength, new Date().toISOString()),
                env.DB.prepare('DELETE FROM image_chunks WHERE object_key=?').bind(key),
            ];
            for (let offset = 0; offset < bytes.byteLength; offset += chunkSize) {
                statements.push(env.DB.prepare('INSERT INTO image_chunks(object_key,chunk_index,data) VALUES(?,?,?)').bind(key, offset / chunkSize, bytes.slice(offset, offset + chunkSize)));
            }
            await env.DB.batch(statements);
        },
        async get(key: string) {
            const rows = await env.DB.prepare('SELECT c.data,o.content_type,o.byte_length FROM image_objects o JOIN image_chunks c ON c.object_key=o.object_key WHERE o.object_key=? ORDER BY c.chunk_index').bind(key).all<{ data: number[] | Uint8Array; content_type: string; byte_length: number }>();
            if (!rows.results.length) return null;
            const bytes = new Uint8Array(rows.results[0].byte_length);
            let offset = 0;
            for (const row of rows.results) { bytes.set(row.data, offset); offset += row.data.length; }
            if (offset !== bytes.length) throw new Error('Incomplete image object');
            return { body: bytes, arrayBuffer: async () => bytes.buffer as ArrayBuffer };
        },
        async delete(keys: string | string[]) {
            const values = Array.isArray(keys) ? keys : [keys];
            if (values.length) await env.DB.batch(values.map(key => env.DB.prepare('DELETE FROM image_objects WHERE object_key=?').bind(key)));
        },
    };
}
