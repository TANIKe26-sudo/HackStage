import { id, now, type Env, type Row } from './core.js';

export const FIXED_DAILY_QUESTION = '趣味はなに？';
export const today = () => new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10);

// Keep daily completion separate while serving the same question every day.
export async function dailyTopic(env: Env, date = today()): Promise<Row> {
    const existing = await env.DB.prepare('SELECT * FROM daily_topics WHERE topic_date=?').bind(date).first<Row>();
    if (existing?.title === FIXED_DAILY_QUESTION && existing.prompt === FIXED_DAILY_QUESTION)
        return existing;
    // Preserve topic IDs and answers when replacing previously scheduled questions.
    await env.DB.prepare(`INSERT INTO daily_topics(id,topic_date,title,prompt,created_by,created_at)
        VALUES(?,?,?,?,?,?) ON CONFLICT(topic_date) DO UPDATE SET title=excluded.title,prompt=excluded.prompt`)
        .bind(id(), date, FIXED_DAILY_QUESTION, FIXED_DAILY_QUESTION, 'system:fixed-daily', now()).run();
    return (await env.DB.prepare('SELECT * FROM daily_topics WHERE topic_date=?').bind(date).first<Row>())!;
}
