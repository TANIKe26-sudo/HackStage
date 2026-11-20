import { streamSSE } from 'hono/streaming';
import { authenticate, audit, fail, id, input, limited, member, now, notify, page, rate, text, stageProgress, type App, type Env, type Row } from './core.js';
import { dailyTopic, today } from './daily-topic.js';
export { today } from './daily-topic.js';
const messageWarning = (body: string) => /(https?:\/\/|www\.|投資|暗号資産|仮想通貨|副業|必ず儲かる)/i.test(body) ? '外部リンクや勧誘に注意してください。' : null;
export async function dispatchDaily(env: Env) {
    const topic = await dailyTopic(env);
    let offset = 0;
    while (true) {
        const users = await env.DB.prepare("SELECT id FROM users WHERE status='active' ORDER BY id LIMIT 100 OFFSET ?").bind(offset).all<Row>();
        for (const user of users.results) {
            const fresh = await env.DB.prepare('INSERT OR IGNORE INTO daily_deliveries(user_id,topic_id) VALUES(?,?) RETURNING user_id').bind(user.id, topic.id).first();
            if (fresh)
                await notify(env, user.id, 'daily', { topicId: topic.id, title: topic.title });
        }
        if (users.results.length < 100)
            break;
        offset += 100;
    }
}
export async function dispatchPush(env: Env) {
    await env.DB.prepare("UPDATE push_jobs SET status='queued' WHERE status='sending' AND available_at<=?").bind(now()).run();
    const jobs = await env.DB.prepare("SELECT * FROM push_jobs WHERE status='queued' AND attempts<5 AND COALESCE(available_at,created_at)<=? ORDER BY created_at LIMIT 50").bind(now()).all<Row>();
    for (const job of jobs.results) {
        const claim = await env.DB.prepare("UPDATE push_jobs SET status='sending',attempts=attempts+1,available_at=? WHERE id=? AND status='queued' RETURNING id").bind(new Date(Date.now() + 5 * 60000).toISOString(), job.id).first();
        if (!claim)
            continue;
        const token = job.expo_token;
        if (!token || !await env.DB.prepare('SELECT 1 FROM push_devices WHERE expo_token=? AND user_id=?').bind(token, job.user_id).first()) {
            await env.DB.prepare("UPDATE push_jobs SET status='failed',last_error='device_unregistered' WHERE id=?").bind(job.id).run();
            continue;
        }
        try {
            const response = await fetch('https://exp.host/--/api/v2/push/send', { method: 'POST', headers: { 'Content-Type': 'application/json', ...(env.EXPO_ACCESS_TOKEN ? { Authorization: `Bearer ${env.EXPO_ACCESS_TOKEN}` } : {}) }, body: JSON.stringify({ to: token, title: 'NODOBITO', body: job.kind === 'daily' ? '今日の話題が届きました。' : '新しいお知らせがあります。', data: { kind: job.kind, ...JSON.parse(job.payload) } }), signal: AbortSignal.timeout(10000) });
            if (!response.ok)
                throw new Error(`expo_http_${response.status}`);
            const payload = await response.json() as Row, ticket = Array.isArray(payload.data) ? payload.data[0] : payload.data;
            if (ticket?.status !== 'ok') {
                if (ticket?.details?.error === 'DeviceNotRegistered')
                    await env.DB.prepare('DELETE FROM push_devices WHERE expo_token=?').bind(token).run();
                throw new Error(ticket?.details?.error ?? 'expo_rejected');
            }
            await env.DB.prepare("UPDATE push_jobs SET status='accepted',ticket_id=?,sent_at=?,last_error=NULL WHERE id=?").bind(ticket.id ?? null, now(), job.id).run();
        }
        catch (e) {
            await env.DB.prepare("UPDATE push_jobs SET status=?,available_at=?,last_error=? WHERE id=?").bind(job.attempts >= 4 ? 'failed' : 'queued', new Date(Date.now() + 30000 * 2 ** job.attempts).toISOString(), e instanceof Error ? e.message.slice(0, 200) : 'push_failed', job.id).run();
        }
    }
    const receipts = await env.DB.prepare("SELECT id,ticket_id,expo_token FROM push_jobs WHERE status='accepted' AND ticket_id IS NOT NULL AND sent_at<? LIMIT 100").bind(new Date(Date.now() - 15 * 60000).toISOString()).all<Row>();
    if (!receipts.results.length)
        return;
    const response = await fetch('https://exp.host/--/api/v2/push/getReceipts', { method: 'POST', headers: { 'Content-Type': 'application/json', ...(env.EXPO_ACCESS_TOKEN ? { Authorization: `Bearer ${env.EXPO_ACCESS_TOKEN}` } : {}) }, body: JSON.stringify({ ids: receipts.results.map(r => r.ticket_id) }), signal: AbortSignal.timeout(10000) });
    if (!response.ok)
        throw new Error(`receipts_http_${response.status}`);
    const payload = await response.json() as Row;
    for (const row of receipts.results) {
        const receipt = payload.data?.[row.ticket_id];
        if (!receipt)
            continue;
        await env.DB.prepare('UPDATE push_jobs SET status=?,last_error=? WHERE id=?').bind(receipt.status === 'ok' ? 'delivered' : 'failed', receipt.status === 'ok' ? null : String(receipt.details?.error ?? 'receipt_error'), row.id).run();
        if (receipt.details?.error === 'DeviceNotRegistered')
            await env.DB.prepare('DELETE FROM push_devices WHERE expo_token=?').bind(row.expo_token).run();
    }
}
export function communicationRoutes(app: App) {
    app.get('/api/matches', async (c) => {
        const me = c.get('userId'), { limit, offset } = page(c);
        const rows = await c.env.DB.prepare(`SELECT m.id,m.created_at,p.user_id AS other_user_id,p.user_id,p.display_name,p.birth_year,p.purpose,
      CASE WHEN p.location_scope='area' THEN p.area ELSE NULL END AS area,p.bio,p.conversation_pace,p.throat_class,
      (SELECT id FROM captures WHERE owner_id=p.user_id AND stage=0 AND (original_key IS NOT NULL OR object_key LIKE 'public/%') ORDER BY created_at DESC LIMIT 1) AS capture_id,
      (SELECT body FROM messages WHERE match_id=m.id AND deleted_at IS NULL ORDER BY sequence DESC LIMIT 1) AS last_message,
      COALESCE((SELECT created_at FROM messages WHERE match_id=m.id AND deleted_at IS NULL ORDER BY sequence DESC LIMIT 1),m.created_at) AS updated_at,
      (SELECT COUNT(*) FROM messages x WHERE x.match_id=m.id AND x.sender_id<>? AND x.deleted_at IS NULL AND x.sequence>COALESCE((SELECT sequence FROM message_reads WHERE match_id=m.id AND user_id=?),0)) AS unread_count
      FROM matches m JOIN profiles p ON p.user_id=CASE WHEN m.user_low=? THEN m.user_high ELSE m.user_low END WHERE (m.user_low=? OR m.user_high=?)
      AND NOT EXISTS(SELECT 1 FROM blocks WHERE (blocker_id=? AND blocked_id=p.user_id) OR (blocker_id=p.user_id AND blocked_id=?))
      ORDER BY updated_at DESC LIMIT ? OFFSET ?`).bind(me, me, me, me, me, me, me, limit, offset).all();
        return c.json({ ...rows, matches: rows.results, nextOffset: rows.results.length === limit ? offset + limit : null });
    });
    app.get('/api/matches/:id/progress', async (c) => { await member(c, c.req.param('id')); return c.json(await stageProgress(c.env, c.req.param('id'))); });
    app.get('/api/matches/:id/messages', async (c) => {
        const match = await member(c, c.req.param('id')), { limit } = page(c), before = Number(c.req.query('before') ?? Number.MAX_SAFE_INTEGER), after = Number(c.req.query('after') ?? 0);
        if (!Number.isSafeInteger(before) || !Number.isSafeInteger(after) || before < 1 || after < 0)
            fail(400, 'invalid_cursor');
        const rows = await c.env.DB.prepare(`SELECT id,sender_id,body,warning,created_at,sequence FROM messages WHERE match_id=? AND deleted_at IS NULL AND sequence<? AND sequence>? ORDER BY sequence ${after > 0 ? 'ASC' : 'DESC'} LIMIT ?`).bind(match.id, before, after, limit).all<Row>();
        const read = await c.env.DB.prepare('SELECT sequence,read_at FROM message_reads WHERE match_id=? AND user_id=?').bind(match.id, match.other).first<Row>();
        const messages = after > 0 ? rows.results : rows.results.reverse();
        return c.json({ results: messages, messages, me: c.get('userId'), nextBefore: after === 0 && messages.length === limit ? messages[0].sequence : null, nextAfter: messages.length ? messages[messages.length - 1].sequence : after, otherReadSequence: read?.sequence ?? 0, otherReadAt: read?.read_at ?? null });
    });
    app.post('/api/matches/:id/messages', async (c) => {
        await limited(c, 'messaging');
        const match = await member(c, c.req.param('id')), body = text((await input(c)).body, 2000, true), me = c.get('userId');
        await rate(c, 'messages', me, 30, 60);
        const warning = messageWarning(body), messageId = id();
        await c.env.DB.prepare('INSERT INTO messages(id,match_id,sender_id,body,warning,created_at) VALUES(?,?,?,?,?,?)').bind(messageId, match.id, me, body, warning, now()).run();
        if (warning)
            await c.env.DB.prepare('INSERT INTO safety_flags(id,user_id,message_id,reason,created_at) VALUES(?,?,?,?,?)').bind(id(), me, messageId, 'link_or_solicitation', now()).run();
        await notify(c.env, match.other, 'message', { matchId: match.id, messageId });
        return c.json({ id: messageId, warning }, 201);
    });
    app.post('/api/matches/:id/read', async (c) => {
        const match = await member(c, c.req.param('id')), value = (await input(c)).sequence;
        const latest = await c.env.DB.prepare('SELECT COALESCE(MAX(sequence),0) AS n FROM messages WHERE match_id=?').bind(match.id).first<{
            n: number;
        }>();
        if (!Number.isSafeInteger(value) || value < 0 || value > (latest?.n ?? 0))
            fail(400, 'invalid_cursor');
        await c.env.DB.prepare(`INSERT INTO message_reads(match_id,user_id,sequence,read_at) VALUES(?,?,?,?) ON CONFLICT(match_id,user_id) DO UPDATE SET sequence=MAX(message_reads.sequence,excluded.sequence),read_at=excluded.read_at`).bind(match.id, c.get('userId'), value, now()).run();
        return c.json({ ok: true });
    });
    app.get('/api/matches/:id/events', async (c) => {
        await member(c, c.req.param('id'));
        await rate(c, 'streams', c.get('userId'), 10, 60);
        c.header('Cache-Control', 'no-store');
        return streamSSE(c, async (stream) => {
            let previous = '', active = true;
            stream.onAbort(() => { active = false; });
            for (let count = 0; active && count < 30; count++) {
                try {
                    await authenticate(c);
                    await member(c, c.req.param('id'));
                    await limited(c, 'messaging');
                }
                catch {
                    await stream.writeSSE({ event: 'closed', data: '{}' });
                    break;
                }
                const row = await c.env.DB.prepare('SELECT COALESCE(MAX(sequence),0) AS sequence,COUNT(*) AS count FROM messages WHERE match_id=? AND deleted_at IS NULL').bind(c.req.param('id')).first();
                const reads = await c.env.DB.prepare('SELECT user_id,sequence FROM message_reads WHERE match_id=? ORDER BY user_id').bind(c.req.param('id')).all();
                const snapshot = JSON.stringify({ messages: row, reads: reads.results });
                if (snapshot !== previous) {
                    await stream.writeSSE({ event: 'changed', data: snapshot });
                    previous = snapshot;
                }
                else
                    await stream.writeSSE({ event: 'heartbeat', data: '{}' });
                await stream.sleep(2000);
            }
        });
    });
    app.delete('/api/matches/:id/messages', async (c) => {
        const match = await member(c, c.req.param('id'));
        await c.env.DB.prepare('UPDATE messages SET deleted_at=? WHERE match_id=?').bind(now(), match.id).run();
        await audit(c.env, 'conversation_cleared', c.get('userId'), match.id);
        return c.json({ cleared: true });
    });
    app.get('/api/daily', async (c) => {
        const topic = await dailyTopic(c.env);
        const answer = topic ? await c.env.DB.prepare('SELECT answer,created_at FROM daily_answers WHERE user_id=? AND topic_id=?').bind(c.get('userId'), topic.id).first() : null;
        return c.json({ topic, answer, date: today() });
    });
    app.get('/api/daily/answers', async (c) => {
        const { limit, offset } = page(c);
        return c.json(await c.env.DB.prepare('SELECT a.*,t.title,t.topic_date FROM daily_answers a JOIN daily_topics t ON t.id=a.topic_id WHERE user_id=? ORDER BY t.topic_date DESC LIMIT ? OFFSET ?').bind(c.get('userId'), limit, offset).all());
    });
    app.post('/api/daily/answers', async (c) => {
        const body = await input(c), topicId = text(body.topicId, 100, true), answer = text(body.answer, 2000, true);
        await limited(c, 'posting');
        await rate(c, 'daily-answer', c.get('userId'), 10, 3600);
        const topic = await c.env.DB.prepare('SELECT prompt FROM daily_topics WHERE id=? AND topic_date=?').bind(topicId, today()).first<Row>();
        if (!topic)
            fail(400, 'topic_not_today');
        const me = c.get('userId'), time = now();
        const saveAnswer = c.env.DB.prepare(`INSERT INTO daily_answers(user_id,topic_id,answer,created_at) VALUES(?,?,?,?) ON CONFLICT(user_id,topic_id) DO UPDATE SET answer=excluded.answer`).bind(me, topicId, answer, time);
        // Preserve the personal-answer API for older clients. New clients always name the open conversation.
        if (body.matchId === undefined) {
            await saveAnswer.run();
            return c.json({ ok: true, sent: false });
        }
        await limited(c, 'messaging');
        const match = await member(c, text(body.matchId, 100, true));
        await rate(c, 'messages', me, 30, 60);
        const messageId = id(), message = `【今日のお題】${topic!.prompt}\n${answer}`, warning = messageWarning(answer);
        const payload = JSON.stringify({ matchId: match.id, messageId });
        // D1 serializes the whole batch: concurrent retries insert only one message, and
        // the answer, delivery marker, safety flag and notifications commit together.
        const statements = [
            c.env.DB.prepare(`INSERT INTO messages(id,match_id,sender_id,body,warning,created_at,daily_topic_id)
                SELECT ?,?,?,?,?,?,? WHERE NOT EXISTS (
                  SELECT 1 FROM daily_answer_deliveries WHERE user_id=? AND topic_id=? AND match_id=? AND answer=?)`)
                .bind(messageId, match.id, me, message, warning, time, topicId, me, topicId, match.id, answer),
            saveAnswer,
            c.env.DB.prepare(`INSERT INTO daily_answer_deliveries(user_id,topic_id,match_id,answer,message_id)
                SELECT ?,?,?,?,? WHERE EXISTS(SELECT 1 FROM messages WHERE id=?)
                ON CONFLICT(user_id,topic_id,match_id) DO UPDATE SET answer=excluded.answer,message_id=excluded.message_id`)
                .bind(me, topicId, match.id, answer, messageId, messageId),
            c.env.DB.prepare(`INSERT INTO notifications(id,user_id,kind,payload,created_at)
                SELECT ?,?,'message',?,? WHERE EXISTS(SELECT 1 FROM messages WHERE id=?)`)
                .bind(id(), match.other, payload, time, messageId),
            c.env.DB.prepare(`INSERT INTO push_jobs(id,user_id,kind,payload,created_at,available_at,expo_token)
                SELECT lower(hex(randomblob(16))),?,'message',?,?,?,expo_token FROM push_devices
                WHERE user_id=? AND EXISTS(SELECT 1 FROM messages WHERE id=?)`)
                .bind(match.other, payload, time, time, match.other, messageId),
        ];
        if (warning) statements.push(c.env.DB.prepare(`INSERT INTO safety_flags(id,user_id,message_id,reason,created_at)
            SELECT ?,?,?,'link_or_solicitation',? WHERE EXISTS(SELECT 1 FROM messages WHERE id=?)`)
            .bind(id(), me, messageId, time, messageId));
        const results = await c.env.DB.batch(statements);
        const sent = results[0].meta.changes > 0;
        return c.json({ ok: true, sent, messageId: sent ? messageId : null, warning });
    });
    app.post('/api/push-devices', async (c) => {
        const token = text((await input(c)).expoPushToken, 300, true);
        if (!/^(ExponentPushToken|ExpoPushToken)\[[^\]]+\]$/.test(token))
            fail(400, 'invalid_push_token');
        await c.env.DB.prepare('INSERT INTO push_devices(expo_token,user_id,created_at) VALUES(?,?,?) ON CONFLICT(expo_token) DO UPDATE SET user_id=excluded.user_id').bind(token, c.get('userId'), now()).run();
        return c.json({ ok: true });
    });
    app.delete('/api/push-devices', async (c) => { const token = text((await input(c)).expoPushToken, 300, true); await c.env.DB.prepare('DELETE FROM push_devices WHERE user_id=? AND expo_token=?').bind(c.get('userId'), token).run(); return c.json({ removed: true }); });
    app.get('/api/notifications', async (c) => { const { limit, offset } = page(c); return c.json(await c.env.DB.prepare('SELECT * FROM notifications WHERE user_id=? ORDER BY created_at DESC LIMIT ? OFFSET ?').bind(c.get('userId'), limit, offset).all()); });
    app.patch('/api/notifications/read-all', async (c) => { await c.env.DB.prepare('UPDATE notifications SET read_at=? WHERE user_id=? AND read_at IS NULL').bind(now(), c.get('userId')).run(); return c.json({ ok: true }); });
    app.patch('/api/notifications/:id/read', async (c) => { await c.env.DB.prepare('UPDATE notifications SET read_at=? WHERE id=? AND user_id=?').bind(now(), c.req.param('id'), c.get('userId')).run(); return c.json({ ok: true }); });
}
