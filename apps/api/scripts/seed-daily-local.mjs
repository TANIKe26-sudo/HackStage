import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

const day = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tokyo' }).format(new Date());
const command = `INSERT INTO daily_topics(id,topic_date,title,prompt,created_by,created_at)
VALUES('${randomUUID()}','${day}','趣味はなに？','趣味はなに？','local-development','${new Date().toISOString()}')
ON CONFLICT(topic_date) DO UPDATE SET title=excluded.title,prompt=excluded.prompt`;
execFileSync(process.execPath, [fileURLToPath(new URL('../../../node_modules/wrangler/bin/wrangler.js', import.meta.url)),
  'd1', 'execute', 'nodobito-db', '--local', '--config', 'wrangler.jsonc', '--command', command],
  { cwd: fileURLToPath(new URL('../', import.meta.url)), windowsHide: true, stdio: 'inherit' });
console.log(`${day}のローカルお題を「趣味はなに？」に固定しました。`);
