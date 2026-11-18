import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { encode } from 'fast-png';
import jpeg from 'jpeg-js';

// Deliberately restricted to local Wrangler. Temporary accounts and the owned topic are removed even on failure.
const base = process.env.TEST_API_URL ?? 'http://127.0.0.1:8787';
assert(['localhost', '127.0.0.1'].includes(new URL(base).hostname), 'Only a local test API is allowed');
const apiDirectory = fileURLToPath(new URL('../', import.meta.url));
const wrangler = fileURLToPath(new URL('../../../node_modules/wrangler/bin/wrangler.js', import.meta.url));
const run = promisify(execFile);
const sql = async command => run(process.execPath, [wrangler, 'd1', 'execute', 'nodobito-db', '--local', '--config', 'wrangler.jsonc', '--command', command], { cwd: apiDirectory, windowsHide: true, maxBuffer: 1024 * 1024 });
async function request(path, token, method = 'GET', body, status = 200) {
  const response = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(30000) });
  const data = await response.json();
  assert.equal(response.status, status, `${method} ${path}: ${JSON.stringify(data)}`);
  return data;
}
const accounts = [], password = randomUUID() + 'Test!';
let ownedTopic;
let checks = 0;
function checked(label) { console.log(`PASS ${++checks}: ${label}`); }
try {
  await request('/health/ready');
  for (let i = 0; i < 3; i++) {
    const email = `integration-${randomUUID()}@example.invalid`;
    const account = await request('/auth/signup', null, 'POST', { email, password }, 201);
    accounts.push({ ...account, email });
    await request('/api/profile', account.token, 'PATCH', { display_name: `接続テスト${i}`, birth_year: 2000, area: '接続テスト地域', purpose: 'test', conversation_pace: 'balanced', location_scope: i === 1 ? 'hidden' : 'area' });
  }
  const [a, b, outsider] = accounts;
  const login = await request('/auth/login', null, 'POST', { email: a.email, password });
  assert.equal((await request('/api/me', login.token)).profile.display_name, '接続テスト0');
  checked('signup/login/profile persist without identity approval');
  const discover = await request('/api/discover', a.token);
  assert.equal(discover.candidates.find(p => p.user_id === b.user.id).area, null);
  await request('/api/preferences/discovery', a.token, 'PATCH', { minAge: 18, maxAge: 120, area: '接続テスト地域' });
  assert(!(await request('/api/discover', a.token)).candidates.some(p => p.user_id === b.user.id));
  await request('/api/preferences/discovery', a.token, 'PATCH', { minAge: 18, maxAge: 120, area: '' });
  checked('discovery preferences and private location');
  await request('/api/preferences/discovery', a.token, 'PATCH', { minAge: 18, maxAge: 120, area: `no-candidates-${randomUUID()}` });
  const empty = await request('/api/discover', a.token);
  assert.deepEqual(empty.candidates, []);
  assert.equal(typeof empty.notice, 'string');
  await request('/api/preferences/discovery', a.token, 'PATCH', { minAge: 18, maxAge: 120, area: '' });
  checked('zero discovery candidates returns an empty list, not a D1 batch error');
  await request('/api/contacts/hide', a.token, 'POST', { contacts: [b.email] });
  assert(!(await request('/api/discover', a.token)).candidates.some(p => p.user_id === b.user.id));
  await request('/api/contacts/hide', a.token, 'DELETE');
  checked('hidden email contact is excluded');
  await request('/api/passes', a.token, 'POST', { toUserId: outsider.user.id });
  assert(!(await request('/api/discover', a.token)).candidates.some(p => p.user_id === outsider.user.id));
  checked('pass persists on refresh');
  const png = encode({ width: 40, height: 60, data: new Uint8Array(40 * 60 * 4).fill(200), channels: 4 });
  const capture = await request('/api/captures', b.token, 'POST', { dataUrl: `data:image/png;base64,${Buffer.from(png).toString('base64')}` }, 201);
  const first = await fetch(`${base}/api/captures/${capture.id}/image`, { headers: { Authorization: `Bearer ${a.token}` } });
  assert.equal(first.status, 200);
  const crop = jpeg.decode(new Uint8Array(await first.arrayBuffer()));
  assert.equal(crop.width, 20); assert.equal(crop.height, 12);
  checked('stage 0 delivers a real server crop');
  await request('/api/likes', a.token, 'POST', { toUserId: b.user.id });
  assert((await request('/api/likes/received', b.token)).likes.some(p => p.user_id === a.user.id));
  const match = await request('/api/likes', b.token, 'POST', { toUserId: a.user.id });
  assert(match.matched && match.matchId);
  assert.equal((await request('/api/likes', a.token, 'POST', { toUserId: b.user.id })).matchId, match.matchId);
  assert.equal((await request('/api/matches', a.token)).matches.filter(m => m.id === match.matchId).length, 1);
  checked('received likes and idempotent mutual matching');
  const path = `/api/matches/${match.matchId}`;
  await request(path, outsider.token, 'GET', undefined, 404);
  await request(`${path}/messages`, outsider.token, 'POST', { body: 'invalid' }, 404);
  checked('non-member cannot view or send chat');
  const sent = [];
  for (let i = 0; i < 3; i++) {
    for (const who of [a, b]) sent.push(await request(`${path}/messages`, who.token, 'POST', { body: `会話${i}はどうですか？` }, 201));
  }
  const page = await request(`${path}/messages?limit=2`, a.token);
  assert.equal(page.messages.length, 2); assert(page.nextBefore);
  const previous = await request(`${path}/messages?before=${page.nextBefore}`, a.token);
  assert(previous.messages.every(m => m.sequence < page.nextBefore));
  await request(`${path}/read`, a.token, 'POST', { sequence: page.messages.at(-1).sequence });
  assert.equal((await request('/api/matches', a.token)).matches.find(m => m.id === match.matchId).unread_count, 0);
  checked('messages, history paging and read position');
  assert.equal((await request(path, a.token)).progress.stage, 0);
  await request(`${path}/profile-stage`, b.token, 'POST', { stage: 1, consent: true }, 403);
  checked('repeated messages in one day do not unlock photos');
  let daily = await request('/api/daily', a.token);
  if (!daily.topic) {
    ownedTopic = randomUUID();
    const date = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tokyo' }).format(new Date());
    await sql(`INSERT INTO daily_topics(id,topic_date,title,prompt,created_by,created_at) VALUES('${ownedTopic}','${date}','接続テスト','今日はどんな日？','integration-test','${new Date().toISOString()}')`);
    daily = await request('/api/daily', a.token);
  }
  await request('/api/daily/answers', a.token, 'POST', { topicId: daily.topic.id, answer: 'テスト回答' });
  const tasks = await request(`${path}/daily`, a.token);
  assert(tasks.tasks['answer-topic'] && tasks.tasks['receive-reply'] && tasks.tasks['ask-question']);
  checked('daily answer and conversation tasks persist');
  for (let i = 0; i < sent.length; i++) {
    const date = new Date(Date.now() - (Math.floor(i / 2) + 1) * 86400000).toISOString();
    await sql(`UPDATE messages SET created_at='${date}' WHERE id='${sent[i].id}'`);
  }
  await request(`${path}/profile-stage`, b.token, 'POST', { stage: 1, consent: true });
  const detail = await request(path, a.token);
  assert.equal(detail.visibleStage, 1);
  const stage1 = detail.captures.find(c => c.stage === 1);
  assert(stage1);
  assert.equal((await fetch(`${base}/api/captures/${stage1.id}/image`, { headers: { Authorization: `Bearer ${a.token}` } })).status, 200);
  await request(`${path}/profile-stage`, b.token, 'POST', { stage: 1, consent: false });
  assert.equal((await fetch(`${base}/api/captures/${stage1.id}/image`, { headers: { Authorization: `Bearer ${a.token}` } })).status, 403);
  checked('mutual-day progress, photo consent and revocation');
  const plan = await request(`${path}/date-plans`, a.token, 'POST', { startsAt: new Date(Date.now() + 86400000).toISOString(), placeLabel: 'テスト駅', exactLocation: 'テスト改札', shareConsent: true }, 201);
  await request(`/api/date-plans/${plan.id}/confirm`, a.token, 'POST', { consentToLocation: true });
  assert.equal((await request(`/api/date-plans/${plan.id}`, a.token)).exactLocation, null);
  await request(`/api/date-plans/${plan.id}/confirm`, b.token, 'POST', { consentToLocation: true });
  assert.equal((await request(`/api/date-plans/${plan.id}`, a.token)).exactLocation, 'テスト改札');
  await request(`/api/date-plans/${plan.id}/arrive`, a.token, 'POST', {});
  await request(`/api/date-plans/${plan.id}/cancel`, b.token, 'POST', {});
  await request(`/api/date-plans/${plan.id}/confirm`, a.token, 'POST', { consentToLocation: true }, 404);
  checked('date requires both confirmations and cannot revive cancellation');
  await request('/api/blocks', a.token, 'POST', { userId: b.user.id });
  await request(`${path}/messages`, b.token, 'POST', { body: 'blocked' }, 404);
  assert.equal((await fetch(`${base}/api/captures/${capture.id}/image`, { headers: { Authorization: `Bearer ${a.token}` } })).status, 403);
  checked('block removes match and blocks image access');
  console.log(`All ${checks} mobile integration checks passed.`);
} finally {
  const errors = [];
  for (const account of accounts) {
    try { await request('/api/account/delete', account.token, 'POST', { password }); }
    catch (error) { errors.push(error); }
  }
  if (ownedTopic) try { await sql(`DELETE FROM daily_topics WHERE id='${ownedTopic}' AND created_by='integration-test'`); } catch (error) { errors.push(error); }
  if (errors.length) throw new AggregateError(errors, 'Temporary data cleanup failed');
  console.log('Temporary test accounts and owned topic removed.');
}
