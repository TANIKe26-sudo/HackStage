import { imageSql } from './image-sql.mjs';
import { readFile, writeFile, unlink } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { createHash } from 'node:crypto';

const { values } = parseArgs({ options: { remote: { type: 'boolean', default: false } } });
const directory = new URL('../private/throat-references/', import.meta.url);
const manifest = JSON.parse(await readFile(new URL('manifest.json', directory), 'utf8'));
for (const label of ['present', 'absent']) {
    const path = new URL(`${label}.jpg`, directory), bytes = await readFile(path);
    if (createHash('sha256').update(bytes).digest('hex') !== manifest[label]?.sha256) throw new Error('Reference checksum mismatch.');
    const sqlFile = new URL(`${label}.import.sql`, directory);
    await writeFile(sqlFile, imageSql(`system/throat-references/v1/${label}.jpg`, bytes));
    try {
        execFileSync(process.execPath, [fileURLToPath(new URL('../../../node_modules/wrangler/bin/wrangler.js', import.meta.url)),
            'd1', 'execute', 'DB', '--file', fileURLToPath(sqlFile), '--config', 'wrangler.jsonc',
            values.remote ? '--remote' : '--local', ...(values.remote ? ['--env', 'production'] : []), '--yes'],
            { cwd: fileURLToPath(new URL('../', import.meta.url)), windowsHide: true, stdio: 'inherit' });
    } finally { await unlink(sqlFile); }
}
console.log(`Reference images imported into ${values.remote ? 'PRODUCTION' : 'LOCAL'} D1. No public image URL exists.`);
