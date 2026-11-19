import { imageStore, maxImageBytes } from '../src/cloudflare/image-store.js';
import { parseClassification, referenceKeys } from '../src/cloudflare/classification.js';
import { comparisonImage } from '../src/cloudflare/classification-image.js';
import * as jpeg from 'jpeg-js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { encode as encodePng } from 'fast-png';
import { app, maintenance } from '../src/cloudflare.js';
import { dispatchPush } from '../src/cloudflare/communication.js';
import type { Env } from '../src/cloudflare/core.js';
function fixture() {
    const sqlite = new DatabaseSync(':memory:');
    sqlite.exec('PRAGMA foreign_keys=ON');
    for (const name of readdirSync(new URL('../migrations/', import.meta.url)).filter(n => n.endsWith('.sql')).sort())
        sqlite.exec(readFileSync(new URL(`../migrations/${name}`, import.meta.url), 'utf8'));
    const prepare = (sql: string) => { let bindings: unknown[] = []; const execute = () => { const result = sqlite.prepare(sql).run(...bindings as any[]); return { success: true, meta: { changes: Number(result.changes) } }; }; const stmt: any = { _run: execute, bind: (...values: unknown[]) => { bindings = values; return stmt; }, first: async () => sqlite.prepare(sql).get(...bindings as any[]) ?? null, all: async () => ({ results: sqlite.prepare(sql).all(...bindings as any[]), success: true }), run: async () => { const result = sqlite.prepare(sql).run(...bindings as any[]); return { success: true, meta: { changes: Number(result.changes) } }; } }; return stmt; };
    const objects = { get size() { return Number((sqlite.prepare('SELECT COUNT(*) AS n FROM image_objects').get() as any).n); } };
    const env = { DB: { prepare, batch: async (statements: any[]) => { sqlite.exec('BEGIN'); try {
                const results = [];
                for (const stmt of statements)
                    results.push(stmt._run());
                sqlite.exec('COMMIT');
                return results;
            }
            catch (e) {
                sqlite.exec('ROLLBACK');
                throw e;
            } } },
        SESSION_SECRET: 's'.repeat(40), CONTACT_HASH_KEY: 'c'.repeat(40), DATE_LOCATION_KEY: Buffer.alloc(32, 7).toString('base64'), ADMIN_AUDIT_KEY: 'a'.repeat(40), ADMIN_SAFETY_KEY: 'b'.repeat(40), ADMIN_CONTENT_KEY: 'd'.repeat(40), ADMIN_USERS_KEY: 'u'.repeat(40), MAIL_MODE: 'local' } as unknown as Env;
    const pending: Promise<unknown>[] = [];
    const ctx = { waitUntil: (p: Promise<unknown>) => pending.push(p), passThroughOnException: () => { } } as any;
    let counter = 0;
    const request = async (path: string, options: {
        method?: string;
        body?: unknown;
        token?: string;
        key?: string;
    } = {}) => {
        const response = await app.fetch(new Request(`http://127.0.0.1${path}`, { method: options.method ?? 'GET', headers: { 'Content-Type': 'application/json', ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}), ...(options.key ? { 'x-admin-key': options.key } : {}) }, ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}) }), env, ctx);
        return { status: response.status, body: response.headers.get('content-type')?.includes('application/json') ? await response.json() as any : await response.text(), headers: response.headers };
    };
    const account = async () => { const email = `user${counter++}@example.test`; const r = await request('/auth/signup', { method: 'POST', body: { email, password: 'a-valid-password' } }); assert.equal(r.status, 201); return { id: r.body.user.id, token: r.body.token, email }; };
    const pair = async () => { const a = await account(), b = await account(); for (const user of [a, b])
        await request('/api/profile', { method: 'PATCH', token: user.token, body: { display_name: user.id.slice(0, 5), birth_year: 1995, area: '東京', throat_class: 'present', purpose: 'serious', conversation_pace: 'balanced', location_scope: 'area' } }); await request('/api/likes', { method: 'POST', token: a.token, body: { toUserId: b.id } }); const match = await request('/api/likes', { method: 'POST', token: b.token, body: { toUserId: a.id } }); return { a, b, matchId: match.body.matchId }; };
    return { sqlite, env, objects, request, account, pair, pending, ctx };
}
const pngData = () => `data:image/png;base64,${Buffer.from(encodePng({ width: 100, height: 200, data: new Uint8Array(100 * 200 * 4).fill(200) })).toString('base64')}`;

test('D1 image chunks preserve bytes, overwrite atomically and cascade on deletion', async () => {
    const f = fixture(), store = imageStore(f.env);
    const bytes = Uint8Array.from({ length: 100000 }, (_, i) => i % 251);
    await store.put('private/test', bytes);
    assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM image_chunks').get()!.n, 4);
    assert.deepEqual(new Uint8Array(await (await store.get('private/test'))!.arrayBuffer()), bytes);
    await assert.rejects(() => store.put('private/test', new Uint8Array(maxImageBytes + 1)));
    assert.deepEqual(new Uint8Array(await (await store.get('private/test'))!.arrayBuffer()), bytes);
    await store.put('private/test', new Uint8Array([9, 8, 7]));
    assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM image_chunks').get()!.n, 1);
    await store.delete('private/test');
    assert.equal(await store.get('private/test'), null);
    assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM image_chunks').get()!.n, 0);
});

test('merge migration preserves existing preference filters and imports mobile settings and reads', () => {
    const db = new DatabaseSync(':memory:');
    try {
        const files = readdirSync(new URL('../migrations/', import.meta.url)).filter(n => n.endsWith('.sql')).sort();
        for (const file of files.filter(n => n !== '0005_mobile_compatibility.sql')) db.exec(readFileSync(new URL(`../migrations/${file}`, import.meta.url), 'utf8'));
        const time = new Date().toISOString();
        for (const user of ['a', 'b']) db.prepare('INSERT INTO users(id,google_sub,email,created_at,updated_at) VALUES(?,?,?,?,?)').run(user, user, `${user}@test.invalid`, time, time);
        db.exec(`INSERT INTO discovery_preferences(user_id) VALUES('a');
          INSERT INTO discovery_preferences(user_id,min_age,max_age,accepted_purposes) VALUES('b',26,45,'["serious"]');
          INSERT INTO mobile_discovery_preferences(user_id,min_age,max_age,area) VALUES('a',25,40,'大阪'),('b',20,60,'東京');
          INSERT INTO matches(id,user_low,user_high,created_at) VALUES('pair','a','b','${time}');
          INSERT INTO message_reads(match_id,user_id,sequence,read_at) VALUES('pair','a',2,'${time}');
          INSERT INTO mobile_message_reads(user_id,match_id,last_sequence) VALUES('a','pair',3);`);
        db.exec(readFileSync(new URL('../migrations/0005_mobile_compatibility.sql', import.meta.url), 'utf8'));
        const a = db.prepare("SELECT * FROM discovery_preferences WHERE user_id='a'").get()!;
        const b = db.prepare("SELECT * FROM discovery_preferences WHERE user_id='b'").get()!;
        assert.deepEqual([a.min_age, a.max_age, a.area], [25, 40, '大阪']);
        assert.deepEqual([b.min_age, b.max_age, b.area, b.accepted_purposes], [26, 45, '東京', '["serious"]']);
        assert.equal(db.prepare("SELECT sequence FROM message_reads WHERE user_id='a'").get()!.sequence, 3);
    } finally { db.close(); }
});

test('mobile views retain main permissions, message contracts and pending-like filtering', async () => {
    const f = fixture(), { a, b, matchId } = await f.pair(), outsider = await f.account();
    const capture = await f.request('/api/captures', { method: 'POST', token: a.token, body: { dataUrl: pngData() } });
    assert.equal(capture.status, 201);
    const detail = await f.request(`/api/matches/${matchId}`, { token: b.token });
    assert.equal(detail.status, 200);
    assert.equal(detail.body.profile.user_id, a.id);
    assert.equal(detail.body.progress.sharedAnswers, 0);
    assert.deepEqual(detail.body.captures.map((c: any) => c.stage), [0]);
    assert.equal((await f.request(`/api/matches/${matchId}`, { token: outsider.token })).status, 404);
    assert.equal((await f.request('/api/likes/received?pendingOnly=true', { token: a.token })).body.likes.length, 0);
    assert.equal((await f.request('/api/likes/received', { token: a.token })).body.likes.length, 1);
    await f.request(`/api/matches/${matchId}/messages`, { token: a.token, method: 'POST', body: { body: '質問ですか？' } });
    const page = await f.request(`/api/matches/${matchId}/messages`, { token: b.token });
    assert.equal(page.body.me, b.id);
    assert.deepEqual(page.body.messages, page.body.results);
    const matches = await f.request('/api/matches', { token: b.token });
    assert.equal(matches.body.matches[0].last_message, '質問ですか？');
    assert.equal(matches.body.matches[0].user_id, a.id);
    const limited = await f.request(`/admin/users/${a.id}/limits`, { key: f.env.ADMIN_SAFETY_KEY, method: 'POST', body: { scope: 'discovery', reason: 'test', expiresAt: new Date(Date.now() + 60000).toISOString() } });
    assert.equal(limited.status, 201);
    assert.equal((await f.request('/api/passes', { token: a.token, method: 'POST', body: { toUserId: outsider.id } })).status, 403);
});

test('mobile region PATCH preserves main preferences and reuse only shows undecided cards', async () => {
    const f = fixture(), a = await f.account(), b = await f.account();
    for (const user of [a, b]) await f.request('/api/profile', { token: user.token, method: 'PATCH', body: { display_name: 'test', birth_year: 1995, area: '東京', location_scope: 'area', purpose: 'serious' } });
    await f.request('/api/preferences/discovery', { token: a.token, method: 'PUT', body: { acceptedPurposes: ['serious'], acceptedPaces: ['balanced'] } });
    await f.request('/api/preferences/discovery', { token: a.token, method: 'PATCH', body: { minAge: 18, maxAge: 120, area: '東京' } });
    const prefs = (await f.request('/api/preferences/discovery', { token: a.token })).body.preferences;
    assert.deepEqual(prefs.acceptedPurposes, ['serious']);
    assert.deepEqual(prefs.acceptedPaces, ['balanced']);
    await f.request('/api/profile', { token: b.token, method: 'PATCH', body: { conversation_pace: 'balanced' } });
    const path = '/api/discover?reuseUnswiped=true';
    assert.equal((await f.request(path, { token: a.token })).body.candidates.length, 1);
    assert.equal((await f.request(path, { token: a.token })).body.candidates.length, 1);
    assert.equal((await f.request('/api/discover', { token: a.token })).body.candidates.length, 0);
    await f.request('/api/passes', { token: a.token, method: 'POST', body: { toUserId: b.id } });
    const empty = await f.request(path, { token: a.token });
    assert.equal(empty.status, 200);
    assert.deepEqual(empty.body.candidates, []);
});

test('cropped connect photos remain accessible with main permissions and delete as a group', async () => {
    const f = fixture(), { a, b, matchId } = await f.pair();
    for (let stage = 0; stage < 5; stage++) {
        const key = `public/${a.id}/connect-group/${stage}`;
        await imageStore(f.env).put(key, new Uint8Array([1, 2, 3]));
        f.sqlite.prepare('INSERT INTO captures(id,owner_id,stage,object_key,media_type,created_at) VALUES(?,?,?,?,?,?)').run(`connect-${stage}`, a.id, stage, key, 'image/jpeg', new Date().toISOString());
    }
    assert.equal((await f.request('/api/captures/connect-0/image', { token: b.token })).status, 200);
    assert.equal((await f.request('/api/captures/connect-1/image', { token: b.token })).status, 403);
    const detail = await f.request(`/api/matches/${matchId}`, { token: b.token });
    assert.equal(detail.body.captures.length, 1);
    assert.equal(detail.body.profile.capture_id, 'connect-0');
    assert.equal((await f.request('/api/captures/connect-0', { token: a.token, method: 'DELETE' })).status, 200);
    assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM captures WHERE owner_id=?').get(a.id)!.n, 0);
    assert.equal(f.objects.size, 0);
});
test('registration has no verification gate and profile is compatible with mobile', async () => {
    const f = fixture(), a = await f.account();
    assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM age_verifications').get()!.n, 0);
    const me = await f.request('/api/me', { token: a.token });
    assert.equal(me.status, 200);
    assert.equal(me.body.profile.email, a.email);
    assert.equal('age_verification' in me.body.profile, false);
    assert.equal((await f.request('/api/discover', { token: a.token })).status, 200);
});
test('mutual preferences, hidden locations, received likes and idempotent matching', async () => {
    const f = fixture(), { a, b, matchId } = await f.pair();
    assert.ok(matchId);
    const before = f.sqlite.prepare('SELECT COUNT(*) AS n FROM notifications').get()!.n;
    await f.request('/api/likes', { method: 'POST', token: a.token, body: { toUserId: b.id } });
    assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM notifications').get()!.n, before);
    assert.equal((await f.request('/api/likes/received', { token: a.token })).body.likes.length, 1);
    await f.request('/api/profile', { method: 'PATCH', token: b.token, body: { location_scope: 'hidden' } });
    assert.equal((await f.request(`/api/profiles/${b.id}`, { token: a.token })).body.profile.area, null);
    const c = await f.account();
    await f.request('/api/profile', { method: 'PATCH', token: c.token, body: { display_name: 'C', birth_year: 1995, purpose: 'friendship', conversation_pace: 'slow' } });
    await f.request('/api/preferences/discovery', { method: 'PUT', token: c.token, body: { acceptedPurposes: ['friendship'] } });
    assert.equal((await f.request('/api/discover', { token: a.token })).body.candidates.some((v: any) => v.user_id === c.id), false);
});
test('message history returns newest page, older cursor and monotonic read position', async () => {
    const f = fixture(), { a, b, matchId } = await f.pair();
    for (let n = 0; n < 4; n++)
        assert.equal((await f.request(`/api/matches/${matchId}/messages`, { method: 'POST', token: a.token, body: { body: `message ${n}` } })).status, 201);
    const latest = await f.request(`/api/matches/${matchId}/messages?limit=2`, { token: b.token });
    assert.deepEqual(latest.body.results.map((v: any) => v.body), ['message 2', 'message 3']);
    const older = await f.request(`/api/matches/${matchId}/messages?limit=2&before=${latest.body.nextBefore}`, { token: b.token });
    assert.deepEqual(older.body.results.map((v: any) => v.body), ['message 0', 'message 1']);
    const last = latest.body.results[1].sequence;
    await f.request(`/api/matches/${matchId}/read`, { method: 'POST', token: b.token, body: { sequence: last } });
    await f.request(`/api/matches/${matchId}/read`, { method: 'POST', token: b.token, body: { sequence: 1 } });
    assert.equal((await f.request(`/api/matches/${matchId}/messages`, { token: a.token })).body.otherReadSequence, last);
});
test('server crops variants, blocks original leakage and requires progress plus consent', async () => {
    const f = fixture(), { a, b, matchId } = await f.pair();
    const capture = await f.request('/api/captures', { method: 'POST', token: a.token, body: { dataUrl: pngData() } });
    assert.equal(capture.status, 201);
    assert.equal(capture.body.captures.length, 5);
    const stage1 = capture.body.captures[1].id;
    assert.equal((await f.request(`/api/captures/${stage1}/image`, { token: b.token })).status, 403);
    assert.equal((await f.request(`/api/matches/${matchId}/profile-stage`, { method: 'POST', token: a.token, body: { viewerId: b.id, stage: 1, consent: true } })).status, 403);
    for (let d = 1; d <= 3; d++)
        for (const user of [a, b])
            f.sqlite.prepare('INSERT INTO messages(id,match_id,sender_id,body,created_at) VALUES(?,?,?,?,?)').run(crypto.randomUUID(), matchId, user.id, 'conversation', `2026-01-0${d}T00:00:00.000Z`);
    assert.equal((await f.request(`/api/matches/${matchId}/progress`, { token: a.token })).body.stage, 1);
    assert.equal((await f.request(`/api/matches/${matchId}/profile-stage`, { method: 'POST', token: a.token, body: { viewerId: b.id, stage: 1, consent: true } })).status, 200);
    assert.equal((await f.request(`/api/captures/${stage1}/image`, { token: b.token })).status, 200);
    await f.request(`/api/matches/${matchId}/profile-stage`, { method: 'POST', token: a.token, body: { stage: 1, consent: false } });
    assert.equal((await f.request(`/api/captures/${stage1}/image`, { token: b.token })).status, 403);
    await f.request('/api/blocks', { method: 'POST', token: b.token, body: { userId: a.id } });
    assert.equal((await f.request(`/api/captures/${capture.body.id}/image`, { token: b.token })).status, 403);
});
test('legacy full portraits are never shared as stage zero', async () => {
    const f = fixture(), { a, b } = await f.pair();
    f.sqlite.prepare('INSERT INTO captures(id,owner_id,stage,object_key,media_type,created_at) VALUES(?,?,0,?,?,?)').run('legacy', a.id, 'old', 'image/jpeg', new Date().toISOString());
    assert.equal((await f.request('/api/captures/legacy/image', { token: b.token })).status, 403);
});
test('date plans require both confirmations, revoke consent and reset on reschedule', async () => {
    const f = fixture(), { a, b, matchId } = await f.pair(), starts = new Date(Date.now() + 86400000).toISOString();
    const created = await f.request(`/api/matches/${matchId}/date-plans`, { method: 'POST', token: a.token, body: { startsAt: starts, placeLabel: '駅', exactLocation: '改札前', shareConsent: true } });
    assert.equal(created.status, 201);
    const path = `/api/date-plans/${created.body.id}`;
    assert.equal((await f.request(path + '/confirm', { method: 'POST', token: a.token, body: { consentToLocation: true } })).body.bothConfirmed, false);
    assert.equal((await f.request(path, { token: b.token })).body.exactLocation, null);
    assert.equal((await f.request(path + '/confirm', { method: 'POST', token: b.token, body: { consentToLocation: true } })).body.bothConfirmed, true);
    assert.equal((await f.request(path, { token: b.token })).body.exactLocation, '改札前');
    await f.request(path + '/consent', { method: 'DELETE', token: a.token });
    assert.equal((await f.request(path, { token: b.token })).body.exactLocation, null);
    const changed = await f.request(path + '/reschedule', { method: 'POST', token: b.token, body: { startsAt: new Date(Date.now() + 2 * 86400000).toISOString() } });
    assert.equal(changed.status, 200);
    assert.equal((await f.request(path, { token: a.token })).body.confirmed.other, false);
});
test('suspended accounts can log in for appeals but cannot use normal functions', async () => {
    const f = fixture(), a = await f.account();
    await f.request(`/admin/users/${a.id}/status`, { method: 'PATCH', key: f.env.ADMIN_USERS_KEY, body: { status: 'suspended' } });
    assert.equal((await f.request('/api/discover', { token: a.token })).status, 403);
    assert.equal((await f.request('/api/appeals', { method: 'POST', token: a.token, body: { reason: '再確認をお願いします' } })).status, 201);
    assert.equal((await f.request('/api/appeals', { token: a.token })).body.results.length, 1);
    assert.equal((await f.request('/auth/login', { method: 'POST', body: { email: a.email, password: 'a-valid-password' } })).status, 200);
});
test('staff roles are separated and audited by individual actor', async () => {
    const f = fixture();
    const created = await f.request('/admin/staff', { method: 'POST', key: f.env.ADMIN_AUDIT_KEY, body: { email: 'content@example.test', password: 'staff-password-123', roles: ['content'] } });
    assert.equal(created.status, 201);
    const login = await f.request('/admin/login', { method: 'POST', body: { email: 'content@example.test', password: 'staff-password-123' } });
    assert.equal(login.status, 200);
    assert.equal((await f.request('/admin/users', { token: login.body.token })).status, 403);
    assert.equal((await f.request('/admin/daily-topics', { token: login.body.token })).status, 200);
    assert.equal(f.sqlite.prepare("SELECT actor_id FROM audit_logs WHERE action='staff_login'").get()!.actor_id, created.body.id);
});
test('password reset is single use and revokes all sessions', async () => {
    const f = fixture(), a = await f.account();
    const reset = await f.request('/auth/password/forgot', { method: 'POST', body: { email: a.email } });
    assert.equal(reset.status, 200);
    assert.equal(reset.body.delivery, 'local');
    const body = { email: a.email, code: reset.body.code, password: 'new-password-123' };
    assert.equal((await f.request('/auth/password/reset', { method: 'POST', body })).status, 200);
    assert.equal((await f.request('/api/me', { token: a.token })).status, 401);
    assert.equal((await f.request('/auth/password/reset', { method: 'POST', body })).status, 400);
    assert.equal((await f.request('/auth/login', { method: 'POST', body: { email: a.email, password: 'new-password-123' } })).status, 200);
});
test('email verification and production mail fails closed without provider settings', async () => {
    const f = fixture(), a = await f.account();
    const result = await f.request('/api/email/verification', { method: 'POST', token: a.token, body: {} });
    assert.equal((await f.request('/api/email/confirm', { method: 'POST', token: a.token, body: { code: result.body.code } })).status, 200);
    assert.equal((await f.request('/api/me', { token: a.token })).body.profile.email_verified, 1);
    delete f.env.MAIL_MODE;
    assert.equal((await f.request('/auth/password/forgot', { method: 'POST', body: { email: a.email } })).status, 503);
});
test('notification read and contact-hide reset, account removal deletes stored images', async () => {
    const f = fixture(), { a, b } = await f.pair();
    const notification = f.sqlite.prepare('SELECT id FROM notifications WHERE user_id=? LIMIT 1').get(a.id) as any;
    assert.equal((await f.request(`/api/notifications/${notification.id}/read`, { method: 'PATCH', token: a.token, body: {} })).status, 200);
    await f.request('/api/contacts/hide', { method: 'POST', token: a.token, body: { contacts: [b.email] } });
    assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM contact_hides WHERE user_id=?').get(a.id)!.n, 1);
    await f.request('/api/contacts/hide', { method: 'DELETE', token: a.token });
    assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM contact_hides WHERE user_id=?').get(a.id)!.n, 0);
    await f.request('/api/captures', { method: 'POST', token: a.token, body: { dataUrl: pngData() } });
    assert.equal(f.objects.size, 6);
    assert.equal((await f.request('/api/account/delete', { method: 'POST', token: a.token, body: { password: 'a-valid-password' } })).status, 200);
    assert.equal(f.objects.size, 0);
    assert.equal(f.sqlite.prepare('SELECT 1 FROM users WHERE id=?').get(a.id), undefined);
});
test('rate limiting uses atomic increments and blocks one-sided spam', async () => {
    const f = fixture(), { a, matchId } = await f.pair();
    let final = 0;
    for (let n = 0; n < 31; n++)
        final = (await f.request(`/api/matches/${matchId}/messages`, { method: 'POST', token: a.token, body: { body: 'one-sided' } })).status;
    assert.equal(final, 429);
    assert.equal((await f.request(`/api/matches/${matchId}/progress`, { token: a.token })).body.stage, 0);
});
test('single-use reset code also rejects a concurrent second reset', async () => {
    const f = fixture(), a = await f.account();
    const issued = await f.request('/auth/password/forgot', { method: 'POST', body: { email: a.email } });
    const options = { method: 'POST', body: { email: a.email, code: issued.body.code, password: 'new-password-123' } };
    const results = await Promise.all([f.request('/auth/password/reset', options), f.request('/auth/password/reset', options)]);
    assert.deepEqual(results.map(r => r.status).sort(), [200, 400]);
});
test('production never exposes development email codes, including a misleading hostname', async () => {
    const f = fixture(), a = await f.account();
    f.env.APP_ENV = 'production';
    assert.equal((await f.request('/auth/password/forgot', { method: 'POST', body: { email: a.email } })).status, 503);
    delete f.env.APP_ENV;
    const response = await app.fetch(new Request('https://localhost.attacker.test/auth/password/forgot', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: a.email }) }), f.env, f.ctx);
    assert.equal(response.status, 503);
});
test('expiring restrictions, notification fan-out, daily deduplication and retention', async () => {
    const f = fixture(), { a, b, matchId } = await f.pair();
    for (const token of ['ExpoPushToken[device1]', 'ExpoPushToken[device2]'])
        await f.request('/api/push-devices', { method: 'POST', token: b.token, body: { expoPushToken: token } });
    await f.request(`/api/matches/${matchId}/messages`, { method: 'POST', token: a.token, body: { body: 'hello' } });
    assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM push_jobs WHERE user_id=?').get(b.id)!.n, 2);
    const restriction = await f.request(`/admin/users/${a.id}/limits`, { method: 'POST', key: f.env.ADMIN_SAFETY_KEY, body: { scope: 'messaging', reason: 'test', expiresAt: new Date(Date.now() + 3600000).toISOString() } });
    assert.equal(restriction.status, 201);
    assert.equal((await f.request(`/api/matches/${matchId}/messages`, { method: 'POST', token: a.token, body: { body: 'blocked' } })).status, 403);
    f.sqlite.prepare('UPDATE user_limits SET expires_at=? WHERE id=?').run('2000-01-01T00:00:00.000Z', restriction.body.id);
    assert.equal((await f.request(`/api/matches/${matchId}/messages`, { method: 'POST', token: a.token, body: { body: 'allowed' } })).status, 201);
    // No external push requests are made by this test.
    f.sqlite.prepare('DELETE FROM push_devices').run();
    f.sqlite.prepare('DELETE FROM push_jobs').run();
    const date = new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10);
    await f.request('/admin/daily-topics', { method: 'POST', key: f.env.ADMIN_CONTENT_KEY, body: { date, title: '今日の話題', prompt: '好きな食べ物は？' } });
    await Promise.all(f.pending);
    await maintenance(f.env);
    await maintenance(f.env);
    assert.equal(f.sqlite.prepare("SELECT COUNT(*) AS n FROM notifications WHERE kind='daily'").get()!.n, 2);
});
test('backup maintenance blocks writes and automatically expires', async () => {
    const f = fixture(), a = await f.account();
    assert.equal((await f.request('/admin/operations/maintenance', { method: 'POST', key: f.env.ADMIN_AUDIT_KEY, body: { enabled: true } })).status, 200);
    assert.equal((await f.request('/api/me', { token: a.token })).status, 503);
    assert.equal((await f.request('/auth/login', { method: 'POST', body: { email: a.email, password: 'a-valid-password' } })).status, 503);
    assert.equal((await f.request('/health/live')).status, 200);
    f.sqlite.prepare("UPDATE service_state SET value='2000-01-01T00:00:00.000Z'").run();
    assert.equal((await f.request('/api/me', { token: a.token })).status, 200);
});
test('SSE emits authenticated change hints and supports cancellation', async () => {
    const f = fixture(), { a, matchId } = await f.pair();
    const response = await app.fetch(new Request(`http://127.0.0.1/api/matches/${matchId}/events`, { headers: { Authorization: `Bearer ${a.token}` } }), f.env, f.ctx);
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type') ?? '', /text\/event-stream/);
    const reader = response.body!.getReader(), first = await reader.read();
    assert.match(new TextDecoder().decode(first.value), /event: changed/);
    await reader.cancel();
});
test('push tickets and receipts are tracked per device', async (t) => {
    const f = fixture(), { a, b, matchId } = await f.pair();
    await f.request('/api/push-devices', { method: 'POST', token: b.token, body: { expoPushToken: 'ExpoPushToken[receipt-test]' } });
    await f.request(`/api/matches/${matchId}/messages`, { method: 'POST', token: a.token, body: { body: 'notification' } });
    const original = globalThis.fetch;
    t.after(() => { globalThis.fetch = original; });
    globalThis.fetch = async () => Response.json({ data: { status: 'ok', id: 'ticket-123' } });
    await dispatchPush(f.env);
    assert.equal(f.sqlite.prepare('SELECT status FROM push_jobs').get()!.status, 'accepted');
    f.sqlite.prepare("UPDATE push_jobs SET sent_at='2000-01-01T00:00:00.000Z'").run();
    globalThis.fetch = async () => Response.json({ data: { 'ticket-123': { status: 'ok' } } });
    await dispatchPush(f.env);
    assert.equal(f.sqlite.prepare('SELECT status FROM push_jobs').get()!.status, 'delivered');
});
test('classification needs consent and only returns a suggestion', async () => {
    const f = fixture(), a = await f.account();
    const uploaded = await f.request('/api/captures', { method: 'POST', token: a.token, body: { dataUrl: pngData() } });
    assert.equal((await f.request(`/api/captures/${uploaded.body.id}/classification`, { method: 'POST', token: a.token, body: { consent: false } })).status, 400);
    for (const key of Object.values(referenceKeys)) await imageStore(f.env).put(key, Buffer.from(pngData().split(',')[1], 'base64'));
    let sentImage: unknown;
    f.env.AI = { run: async (_model, body) => { sentImage = body.image; return { response: '{"classification":"present","visibility":"clear","reason":"visible_prominence"}' }; } };
    const result = await f.request(`/api/captures/${uploaded.body.id}/classification`, { method: 'POST', token: a.token, body: { consent: true } });
    assert.equal(result.status, 200);
    assert.equal(result.body.classification, 'present');
    assert.ok(Array.isArray(sentImage));
    assert.equal((await f.request('/api/me', { token: a.token })).body.profile.throat_class, 'pending');
});


test('reference comparison orders panels and rejects unsafe model output', () => {
    const png = (r: number, g: number, b: number) => {
        const data = new Uint8Array(100 * 100 * 4);
        for (let i = 0; i < data.length; i += 4) data.set([r, g, b, 255], i);
        return encodePng({ width: 100, height: 100, data });
    };
    const sheet = jpeg.decode(comparisonImage(png(255, 0, 0), png(0, 255, 0), png(0, 0, 255)));
    assert.equal(sheet.width, 1184);
    const color = (x: number, channel: number) => sheet.data[(256 * sheet.width + x) * 4 + channel];
    assert(color(192, 0) > 240 && color(592, 1) > 240 && color(992, 2) > 240);
    assert.equal(parseClassification('{"classification":"absent","visibility":"clear","reason":"no_distinct_prominence"}').classification, 'absent');
    for (const value of ['{"classification":"present"}', '{"classification":"present","visibility":"unclear","reason":"visible_prominence"}', 'present', '{"classification":"male"}', '[]']) {
        assert.equal(parseClassification(value).classification, 'pending');
    }
});

test('vision Markdown response is parsed without accepting incomplete or contradictory output', () => {
    const response = '**Classification:** present\n\n**Visibility:** clear\n\n**Reason:** visible_prominence';
    assert.deepEqual(parseClassification(response), { classification: 'present', reason: 'visible_prominence' });
    assert.deepEqual(parseClassification(response.replace('present', 'absent').replace('visible_prominence', 'no_distinct_prominence')), { classification: 'absent', reason: 'no_distinct_prominence' });
    assert.equal(parseClassification(response.replace('clear', 'unclear')).classification, 'pending');
    for (const invalid of [response + '\nClassification: absent', response.replace('**Visibility:** clear', ''), response.replace('present', 'male')]) {
        assert.equal(parseClassification(invalid).reason, 'invalid_model_response');
    }
});

test('direct classification requires consent, configuration and references, and never saves a target', async () => {
    const f = fixture(), user = await f.account(), path = '/api/classifications/throat';
    assert.equal((await f.request(path, { method: 'POST', token: user.token, body: { dataUrl: pngData() } })).status, 400);
    assert.equal((await f.request(path, { method: 'POST', token: user.token, body: { consent: true, dataUrl: pngData() } })).body.error, 'classification_service_not_configured');
    let input: Record<string, unknown> | undefined;
    f.env.AI = { run: async (_model, value) => { input = value; return { response: '{"classification":"absent","visibility":"clear","reason":"no_distinct_prominence"}' }; } };
    assert.equal((await f.request(path, { method: 'POST', token: user.token, body: { consent: true, dataUrl: pngData() } })).body.error, 'classification_references_not_configured');
    for (const key of Object.values(referenceKeys)) await imageStore(f.env).put(key, Buffer.from(pngData().split(',')[1], 'base64'));
    const result = await f.request(path, { method: 'POST', token: user.token, body: { consent: true, dataUrl: pngData() } });
    assert.equal(result.status, 200);
    assert.equal(result.body.classification, 'absent');
    assert.equal(result.body.requiresUserConfirmation, true);
    assert.match(String(input!.prompt), /C \(right\): the ONLY target/);
    assert.equal(jpeg.decode(Uint8Array.from(input!.image as number[])).width, 1184);
    assert.equal(f.objects.size, 2);
    assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM captures').get()!.n, 0);
    assert.equal((await f.request('/api/me', { token: user.token })).body.profile.throat_class, 'pending');
});

test('classification provider failure is explicit and owner-only capture classification cannot be bypassed', async () => {
    const f = fixture(), a = await f.account(), b = await f.account();
    for (const key of Object.values(referenceKeys)) await imageStore(f.env).put(key, Buffer.from(pngData().split(',')[1], 'base64'));
    f.env.AI = { run: async () => { throw new Error('upstream failure'); } };
    assert.equal((await f.request('/api/classifications/throat', { token: a.token, method: 'POST', body: { consent: true, dataUrl: pngData() } })).body.error, 'classification_service_unavailable');
    const uploaded = await f.request('/api/captures', { token: a.token, method: 'POST', body: { dataUrl: pngData() } });
    assert.equal((await f.request(`/api/captures/${uploaded.body.id}/classification`, { token: b.token, method: 'POST', body: { consent: true } })).status, 404);
    assert.equal((await f.request('/api/classifications/throat', { token: a.token, method: 'POST', body: { consent: true, dataUrl: 'not-an-image' } })).status, 400);
});
