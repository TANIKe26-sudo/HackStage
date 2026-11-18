import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';

const base = process.env.TEST_API_URL ?? 'http://127.0.0.1:8788';
if (!['localhost', '127.0.0.1'].includes(new URL(base).hostname)) throw new Error('Only local test APIs are allowed.');
const password = randomUUID() + '-test';
const response = await fetch(base + '/auth/signup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: `ai-evaluation-${randomUUID()}@example.invalid`, password }) });
const account = await response.json();
if (!response.ok || !account.token) throw new Error(`Could not create temporary account: HTTP ${response.status}`);
try {
    // The references themselves are used only for an end-to-end smoke test, not an accuracy estimate.
    for (const label of ['present', 'absent']) {
        const bytes = await readFile(new URL(`../private/throat-references/${label}.jpg`, import.meta.url));
        const result = await fetch(base + '/api/classifications/throat', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${account.token}` }, body: JSON.stringify({ dataUrl: `data:image/jpeg;base64,${bytes.toString('base64')}`, consent: true }), signal: AbortSignal.timeout(30000) });
        console.log(JSON.stringify({ exampleLabel: label, status: result.status, result: await result.json() }));
        if (!result.ok) { process.exitCode = 1; break; }
    }
} finally {
    const deleted = await fetch(base + '/api/account/delete', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${account.token}` }, body: JSON.stringify({ password }) });
    if (!deleted.ok) throw new Error('Temporary account cleanup failed.');
    console.log('Temporary evaluation account removed.');
}
