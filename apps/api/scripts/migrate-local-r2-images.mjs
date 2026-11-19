// One-time local migration only. Never delete the old R2 objects.
import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { imageSql } from './image-sql.mjs';

const directory = new URL('../', import.meta.url);
const temporary = new URL('private/r2-import/', directory);
const legacyConfig = new URL('.wrangler-r2-import.json', directory);
const cli = fileURLToPath(new URL('../../../node_modules/wrangler/bin/wrangler.js', import.meta.url));
const run = (args, config = 'wrangler.jsonc') => execFileSync(process.execPath, [cli, ...args, '--config', config], { cwd: fileURLToPath(directory), windowsHide: true, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
await mkdir(temporary, { recursive: true });
const config = JSON.parse(await readFile(new URL('wrangler.jsonc', directory), 'utf8'));
await writeFile(legacyConfig, JSON.stringify({ ...config, r2_buckets: [{ binding: 'CAPTURES', bucket_name: 'nodobito-private-captures' }] }));
try {
  const result = JSON.parse(run(['d1','execute','DB','--local','--json','--command',"SELECT object_key AS key FROM captures UNION SELECT original_key AS key FROM captures WHERE original_key IS NOT NULL"]));
  const keys = result.flatMap(row => row.results ?? []).map(row => row.key);
  let imported = 0;
  for (const [index,key] of keys.entries()) {
    const encoded = key.replaceAll("'", "''");
    const existing = JSON.parse(run(['d1','execute','DB','--local','--json','--command',`SELECT 1 FROM image_objects WHERE object_key='${encoded}'`]));
    if (existing.some(row => row.results?.length)) continue;
    const image = new URL(`${index}.bin`, temporary), sql = new URL(`${index}.sql`, temporary);
    run(['r2','object','get',`nodobito-private-captures/${key}`,'--local','--file',fileURLToPath(image)], fileURLToPath(legacyConfig));
    const bytes = await readFile(image);
    await writeFile(sql, imageSql(key, bytes, bytes[0] === 0x89 ? 'image/png' : 'image/jpeg'));
    run(['d1','execute','DB','--local','--file',fileURLToPath(sql),'--yes']);
    imported++;
  }
  console.log(`Imported ${imported} local image objects into D1. Existing R2 files were retained. Import references separately with references:local.`);
} finally {
  await rm(legacyConfig, { force: true });
  // These exact paths contain only files created by this script.
  await rm(temporary, { recursive: true, force: true });
}
