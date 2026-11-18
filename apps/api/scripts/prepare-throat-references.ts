import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { parseArgs } from 'node:util';
import { normalizeReference } from '../src/cloudflare/classification-image.js';

const { values } = parseArgs({ options: { present: { type: 'string' }, absent: { type: 'string' } } });
if (!values.present || !values.absent) throw new Error('Specify --present <image path> --absent <image path>.');
const directory = new URL('../private/throat-references/', import.meta.url);
await mkdir(directory, { recursive: true });
const manifest: Record<string, unknown> = { version: 'v1', labelsSource: 'user-provided-examples', purpose: 'visual-reference-only-not-training' };
for (const label of ['present', 'absent'] as const) {
    const source = await readFile(values[label]!), normalized = normalizeReference(source);
    await writeFile(new URL(`${label}.jpg`, directory), normalized);
    manifest[label] = { sha256: createHash('sha256').update(normalized).digest('hex'), bytes: normalized.length };
}
await writeFile(new URL('manifest.json', directory), JSON.stringify(manifest, null, 2) + '\n');
console.log('Prepared two private visual references under apps/api/private/throat-references. No external API was called.');
