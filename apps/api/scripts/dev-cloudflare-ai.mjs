import { readFile, writeFile, unlink } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

// Opt-in only: AI runs on Cloudflare even when D1/R2 are local. Never accept a model license automatically.
const directory = new URL('../', import.meta.url), generated = new URL('.wrangler-ai.generated.json', directory);
const { values } = parseArgs({ options: { port: { type: 'string', default: '8787' } } });
if (!/^\d+$/.test(values.port) || Number(values.port) < 1 || Number(values.port) > 65535) throw new Error('Invalid port');
const config = JSON.parse(await readFile(new URL('wrangler.jsonc', directory), 'utf8'));
await writeFile(generated, JSON.stringify({ ...config, account_id: config.env.production.account_id, d1_databases: config.d1_databases.map(b => ({ ...b, remote: false })), r2_buckets: config.r2_buckets.map(b => ({ ...b, remote: false })), ai: { binding: 'AI', remote: true } }, null, 2));
console.log('Starting local D1/R2 with REMOTE Workers AI. Model license agreement and Cloudflare login must already be complete.');
try {
    const code = await new Promise(resolve => {
        const child = spawn(process.execPath, [fileURLToPath(new URL('../../../node_modules/wrangler/bin/wrangler.js', import.meta.url)),
            'dev', '--ip', '0.0.0.0', '--port', values.port, '--config', fileURLToPath(generated)], { cwd: fileURLToPath(directory), windowsHide: true, stdio: 'inherit' });
        const stop = () => child.kill();
        process.once('SIGINT', stop); process.once('SIGTERM', stop);
        child.once('error', error => { console.error(error.message); resolve(1); });
        child.once('exit', status => { process.removeListener('SIGINT', stop); process.removeListener('SIGTERM', stop); resolve(status ?? 0); });
    });
    process.exitCode = Number(code);
} finally { await unlink(generated).catch(() => {}); }
