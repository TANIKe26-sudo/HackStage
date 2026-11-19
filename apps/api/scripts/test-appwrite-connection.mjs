// Explicit opt-in smoke test: disposable remote account, no email sent.
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
process.loadEnvFile(fileURLToPath(new URL('../.dev.vars', import.meta.url)));
const config = JSON.parse(readFileSync(new URL('../wrangler.jsonc', import.meta.url), 'utf8'));
const vars = config.vars;
const root = process.env.APPWRITE_ENDPOINT ?? vars.APPWRITE_ENDPOINT;
const project = process.env.APPWRITE_PROJECT_ID ?? vars.APPWRITE_PROJECT_ID;
const key = process.env.APPWRITE_API_KEY;
const base = process.env.TEST_API_URL ?? 'http://127.0.0.1:8788';
if (!['127.0.0.1', 'localhost'].includes(new URL(base).hostname)) throw new Error('Only local APIs may be tested.');
if (!key) throw new Error('APPWRITE_API_KEY is required.');
const uid = randomUUID(), email = `api-check-${randomUUID()}@example.invalid`, password = randomUUID();
let token, created = false;
const upstream = (path, method, body) => fetch(root + path, { method, headers: { 'Content-Type': 'application/json', 'X-Appwrite-Project': project, 'X-Appwrite-Key': key }, ...(body ? { body: JSON.stringify(body) } : {}) });
try {
  const create = await upstream('/account', 'POST', { userId: uid, email, password });
  if (!create.ok) throw new Error(`Remote creation failed: ${create.status}`);
  created = true;
  const login = await fetch(base + '/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
  const auth = await login.json();
  if (!login.ok || !auth.token) throw new Error(`API login failed: ${login.status} ${auth.error}`);
  token = auth.token;
  const headers = { Authorization: `Bearer ${token}` };
  const me = await fetch(base + '/api/me', { headers }), profile = await me.json();
  const denied = await fetch(base + '/api/discover', { headers }), blocked = await denied.json();
  console.log(JSON.stringify({ login: login.status, me: me.status, verificationRequired: profile.profile?.email_verification_required, emailVerified: profile.profile?.email_verified, discover: denied.status, error: blocked.error }));
  if (me.status !== 200 || denied.status !== 403 || blocked.error !== 'email_verification_required') throw new Error('Verification guard check failed');
} finally {
  let cleanupError;
  if (token) {
    const r = await fetch(base + '/api/account/delete', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ password }) });
    if (!r.ok) cleanupError = new Error(`Local temporary account cleanup failed: ${r.status}`);
    else console.log('Temporary D1 account removed.');
  }
  if (created) {
    const r = await upstream('/users/' + uid, 'DELETE');
    if (!r.ok && r.status !== 404) cleanupError = new Error('Remote temporary account cleanup failed');
    else console.log('Temporary Appwrite account removed. No email was sent.');
  }
  if (cleanupError) throw cleanupError;
}
