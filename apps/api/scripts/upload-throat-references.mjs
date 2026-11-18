import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { createHash } from 'node:crypto';

const { values } = parseArgs({ options: { remote: { type: 'boolean', default: false } } });
const directory = new URL('../private/throat-references/', import.meta.url);
const manifest = JSON.parse(await readFile(new URL('manifest.json', directory), 'utf8'));
const config = JSON.parse(await readFile(new URL('../wrangler.jsonc', import.meta.url), 'utf8'));
const bucket = (values.remote ? config.env.production.r2_buckets : config.r2_buckets).find(b => b.binding === 'CAPTURES').bucket_name;
for (const label of ['present', 'absent']) {
    const path = new URL(`${label}.jpg`, directory), bytes = await readFile(path);
    if (createHash('sha256').update(bytes).digest('hex') !== manifest[label]?.sha256) throw new Error('Reference checksum mismatch.');
    execFileSync(process.execPath, [fileURLToPath(new URL('../../../node_modules/wrangler/bin/wrangler.js', import.meta.url)),
        'r2', 'object', 'put', `${bucket}/system/throat-references/v1/${label}.jpg`, '--file', fileURLToPath(path),
        '--content-type', 'image/jpeg', '--config', 'wrangler.jsonc', values.remote ? '--remote' : '--local',
        ...(values.remote ? ['--env', 'production'] : [])], { cwd: fileURLToPath(new URL('../', import.meta.url)), windowsHide: true, stdio: 'inherit' });
}
console.log(`Reference images uploaded to ${values.remote ? 'PRODUCTION' : 'LOCAL'} private R2. They have no public image URL.`);
