import { randomUUID } from 'node:crypto';
import { db } from './db.js';

const now = () => new Date().toISOString();

export function notify(userId: string, type: string, title: string, body: string, data: Record<string, string> = {}): void {
  const notificationId = randomUUID();
  const createdAt = now();
  db.prepare(`INSERT INTO notifications(id,user_id,type,title,body,data_json,created_at)
    VALUES(?,?,?,?,?,?,?)`).run(notificationId, userId, type, title, body, JSON.stringify(data), createdAt);
  const devices = db.prepare('SELECT expo_push_token AS token FROM push_devices WHERE user_id=?').all(userId) as { token: string }[];
  const queue = db.prepare(`INSERT OR IGNORE INTO push_jobs(id,notification_id,expo_push_token,available_at,created_at)
    VALUES(?,?,?,?,?)`);
  for (const device of devices) queue.run(randomUUID(), notificationId, device.token, createdAt, createdAt);
}

type PushJob = { id: string; token: string; title: string; body: string; dataJson: string; attempts: number };
let dispatching = false;

export async function dispatchPushQueue(): Promise<void> {
  if (dispatching) return;
  dispatching = true;
  try {
  const jobs = db.prepare(`SELECT j.id,j.expo_push_token AS token,n.title,n.body,n.data_json AS dataJson,j.attempts
    FROM push_jobs j JOIN notifications n ON n.id=j.notification_id
    WHERE j.status='queued' AND j.available_at<=? ORDER BY j.created_at LIMIT 100`).all(now()) as PushJob[];
  if (!jobs.length) return;
  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json', Accept: 'application/json' };
    if (process.env.EXPO_ACCESS_TOKEN) headers.Authorization = `Bearer ${process.env.EXPO_ACCESS_TOKEN}`;
    const response = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST', headers,
      body: JSON.stringify(jobs.map(job => ({
        to: job.token, title: job.title, body: job.body,
        data: JSON.parse(job.dataJson) as Record<string, string>, sound: 'default',
      }))),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error(`Expo push service returned ${response.status}`);
    const payload = await response.json() as { data?: { status?: string; id?: string; message?: string; details?: { error?: string } }[] };
    const tickets = payload.data ?? [];
    const update = db.prepare(`UPDATE push_jobs SET status=?,ticket_id=?,last_error=? WHERE id=?`);
    const removeDevice = db.prepare('DELETE FROM push_devices WHERE expo_push_token=?');
    jobs.forEach((job, index) => {
      const ticket = tickets[index];
      if (ticket?.status === 'ok') update.run('sent', ticket.id ?? null, null, job.id);
      else {
        const error = ticket?.details?.error ?? ticket?.message ?? 'Expo push delivery was rejected';
        update.run('failed', null, error.slice(0, 300), job.id);
        if (ticket?.details?.error === 'DeviceNotRegistered') removeDevice.run(job.token);
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 300) : 'Push delivery failed';
    const retry = db.prepare(`UPDATE push_jobs SET attempts=attempts+1,
      status=CASE WHEN attempts>=5 THEN 'failed' ELSE 'queued' END,
      available_at=?,last_error=? WHERE id=?`);
    for (const job of jobs) {
      const backoffSeconds = Math.min(3600, 30 * (2 ** job.attempts));
      retry.run(new Date(Date.now() + backoffSeconds * 1000).toISOString(), message, job.id);
    }
    console.error('Push queue delivery failed:', message);
  }
  } finally {
    dispatching = false;
  }
}
