import type { Hono } from 'hono';
import type { AppEnv } from '../cloudflare';

const now = () => new Date().toISOString();
const day = () => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tokyo' }).format(new Date());
const limit = (value: string | undefined, max = 100) => Math.min(max, Math.max(1, Number.parseInt(value ?? '30', 10) || 30));
type Match = { id: string; user_low: string; user_high: string };
type Db = D1Database;
async function member(db: Db, matchId: string, me: string) {
  return db.prepare(`SELECT m.* FROM matches m JOIN users a ON a.id=m.user_low JOIN users b ON b.id=m.user_high
    WHERE m.id=? AND (m.user_low=? OR m.user_high=?) AND a.status='active' AND b.status='active'
    AND NOT EXISTS(SELECT 1 FROM blocks WHERE (blocker_id=m.user_low AND blocked_id=m.user_high) OR (blocker_id=m.user_high AND blocked_id=m.user_low))`).bind(matchId, me, me).first<Match>();
}
async function progress(db: Db, match: Match) {
  const rows = await db.prepare(`SELECT date(created_at,'+9 hours') AS day FROM messages WHERE match_id=? AND deleted_at IS NULL
    GROUP BY date(created_at,'+9 hours') HAVING COUNT(DISTINCT sender_id)=2`).bind(match.id).all();
  const shared = await db.prepare(`SELECT COUNT(*) AS n FROM daily_answers a JOIN daily_answers b ON a.topic_id=b.topic_id
    WHERE a.user_id=? AND b.user_id=?`).bind(match.user_low, match.user_high).first<{ n: number }>();
  const days = rows.results.length, answers = shared?.n ?? 0;
  const stage = days >= 30 && answers >= 7 ? 4 : days >= 14 && answers >= 3 ? 3 : days >= 7 && answers >= 1 ? 2 : days >= 3 ? 1 : 0;
  return { stage, mutualDays: days, sharedAnswers: answers };
}
export async function visibleStage(db: Db, viewer: string, owner: string) {
  if (!await db.prepare("SELECT 1 FROM users WHERE id=? AND status='active'").bind(owner).first()) return -1;
  if (await db.prepare('SELECT 1 FROM blocks WHERE (blocker_id=? AND blocked_id=?) OR (blocker_id=? AND blocked_id=?)').bind(viewer, owner, owner, viewer).first()) return -1;
  const match = await db.prepare('SELECT * FROM matches WHERE (user_low=? AND user_high=?) OR (user_low=? AND user_high=?)').bind(viewer, owner, owner, viewer).first<Match>();
  if (match) {
    const grant = await db.prepare('SELECT MAX(stage) AS stage FROM stage_grants WHERE owner_id=? AND viewer_id=? AND revoked_at IS NULL AND expires_at>?').bind(owner, viewer, now()).first<{ stage: number | null }>();
    return Math.min((await progress(db, match)).stage, grant?.stage ?? 0);
  }
  const introduced = await db.prepare(`SELECT 1 FROM discovery_impressions WHERE viewer_id=? AND candidate_id=?
    UNION ALL SELECT 1 FROM likes WHERE (from_user=? AND to_user=?) OR (from_user=? AND to_user=?) LIMIT 1`).bind(viewer, owner, viewer, owner, owner, viewer).first();
  return introduced ? 0 : -1;
}
const publicFields = `p.user_id,p.display_name,p.birth_year,CASE WHEN p.location_scope='area' THEN p.area ELSE NULL END AS area,
  p.bio,p.purpose,p.conversation_pace,p.throat_class,
  (SELECT id FROM captures WHERE owner_id=p.user_id AND stage=0 AND object_key LIKE 'public/%' ORDER BY created_at DESC LIMIT 1) AS capture_id`;
async function notify(db: Db, user: string, kind: string, payload: object) {
  const created = now(), value = JSON.stringify(payload);
  await db.batch([
    db.prepare('INSERT INTO notifications(id,user_id,kind,payload,created_at) VALUES(?,?,?,?,?)').bind(crypto.randomUUID(), user, kind, value, created),
    db.prepare('INSERT INTO push_jobs(id,user_id,kind,payload,created_at) VALUES(?,?,?,?,?)').bind(crypto.randomUUID(), user, kind, value, created),
  ]);
}

export function registerMobileRoutes(app: Hono<AppEnv>) {
  app.get('/api/preferences/discovery', async c => {
    const preferences = await c.env.DB.prepare('SELECT min_age AS minAge,max_age AS maxAge,area FROM mobile_discovery_preferences WHERE user_id=?').bind(c.get('userId')).first();
    return c.json({ preferences: preferences ?? { minAge: 18, maxAge: 120, area: '' } });
  });
  app.patch('/api/preferences/discovery', async c => {
    const { minAge, maxAge, area } = await c.req.json<{ minAge: number; maxAge: number; area: string }>();
    if (!Number.isInteger(minAge) || !Number.isInteger(maxAge) || minAge < 18 || maxAge > 120 || minAge > maxAge || typeof area !== 'string' || area.length > 80) return c.json({ error: 'invalid_preferences' }, 400);
    await c.env.DB.prepare(`INSERT INTO mobile_discovery_preferences(user_id,min_age,max_age,area) VALUES(?,?,?,?)
      ON CONFLICT(user_id) DO UPDATE SET min_age=excluded.min_age,max_age=excluded.max_age,area=excluded.area`).bind(c.get('userId'), minAge, maxAge, area.trim()).run();
    return c.json({ ok: true });
  });
  app.get('/api/blocks', async c => {
    const rows = await c.env.DB.prepare(`SELECT b.blocked_id AS user_id,p.display_name FROM blocks b JOIN profiles p ON p.user_id=b.blocked_id WHERE b.blocker_id=?`).bind(c.get('userId')).all();
    return c.json({ blocks: rows.results });
  });
  app.delete('/api/blocks/:id', async c => {
    await c.env.DB.prepare('DELETE FROM blocks WHERE blocker_id=? AND blocked_id=?').bind(c.get('userId'), c.req.param('id')).run();
    return c.json({ ok: true });
  });
  app.delete('/api/contacts/hide', async c => {
    await c.env.DB.prepare('DELETE FROM contact_hides WHERE user_id=?').bind(c.get('userId')).run();
    return c.json({ ok: true });
  });
  app.get('/api/matches/:id/date-plans', async c => {
    const match = await member(c.env.DB, c.req.param('id'), c.get('userId'));
    if (!match) return c.json({ error: 'match_not_found' }, 404);
    const plans = await c.env.DB.prepare('SELECT id FROM date_plans WHERE match_id=? ORDER BY starts_at DESC LIMIT 30').bind(match.id).all();
    return c.json({ plans: plans.results });
  });
  app.get('/api/discover', async c => {
    const me = c.get('userId'), take = limit(c.req.query('limit'), 30);
    const prefs = await c.env.DB.prepare('SELECT min_age,max_age,area FROM mobile_discovery_preferences WHERE user_id=?').bind(me).first<{ min_age: number; max_age: number; area: string }>();
    const year = new Date().getUTCFullYear();
    const result = await c.env.DB.prepare(`SELECT ${publicFields},
      (SELECT COUNT(*) FROM discovery_impressions d WHERE d.candidate_id=p.user_id) AS exposure
      FROM profiles p JOIN users u ON u.id=p.user_id WHERE u.status='active' AND p.user_id<>?
      AND trim(p.display_name)<>'' AND p.birth_year IS NOT NULL
      AND p.birth_year BETWEEN ? AND ? AND (?='' OR (p.location_scope='area' AND p.area=?))
      AND NOT EXISTS(SELECT 1 FROM blocks WHERE (blocker_id=? AND blocked_id=p.user_id) OR (blocker_id=p.user_id AND blocked_id=?))
      AND NOT EXISTS(SELECT 1 FROM likes WHERE from_user=? AND to_user=p.user_id)
      AND NOT EXISTS(SELECT 1 FROM mobile_profile_passes WHERE user_id=? AND other_id=p.user_id)
      AND NOT EXISTS(SELECT 1 FROM user_contact_identifiers ci JOIN contact_hides ch ON ch.contact_hash=ci.contact_hash AND ch.user_id=? WHERE ci.user_id=p.user_id)
      ORDER BY exposure,p.user_id LIMIT ?`).bind(me, year - (prefs?.max_age ?? 120), year - (prefs?.min_age ?? 18), prefs?.area ?? '', prefs?.area ?? '', me, me, me, me, me, take).all();
    // Unswiped cards stay eligible when the screen is revisited; only explicit decisions consume them.
    if (result.results.length > 0) {
      await c.env.DB.batch(result.results.map((p: any) => c.env.DB.prepare(`INSERT INTO discovery_impressions(viewer_id,candidate_id,shown_at)
        VALUES(?,?,?) ON CONFLICT(viewer_id,candidate_id) DO UPDATE SET shown_at=excluded.shown_at`).bind(me, p.user_id, now())));
    }
    return c.json({ candidates: result.results, notice: result.results.length < take ? '候補が少なくなっています。後でもう一度確認してください。' : null });
  });
  app.post('/api/passes', async c => {
    const { toUserId } = await c.req.json<{ toUserId?: string }>();
    if (!toUserId || toUserId === c.get('userId')) return c.json({ error: 'invalid_target' }, 400);
    if (!await c.env.DB.prepare("SELECT 1 FROM users WHERE id=? AND status='active'").bind(toUserId).first()) return c.json({ error: 'not_available' }, 404);
    await c.env.DB.prepare('INSERT OR IGNORE INTO mobile_profile_passes(user_id,other_id,created_at) VALUES(?,?,?)').bind(c.get('userId'), toUserId, now()).run();
    return c.json({ ok: true });
  });
  app.get('/api/likes/received', async c => {
    const me = c.get('userId');
    const rows = await c.env.DB.prepare(`SELECT ${publicFields},l.created_at FROM likes l JOIN profiles p ON p.user_id=l.from_user
      JOIN users u ON u.id=p.user_id WHERE l.to_user=? AND u.status='active'
      AND NOT EXISTS(SELECT 1 FROM likes x WHERE x.from_user=? AND x.to_user=p.user_id)
      AND NOT EXISTS(SELECT 1 FROM mobile_profile_passes WHERE user_id=? AND other_id=p.user_id)
      AND NOT EXISTS(SELECT 1 FROM blocks WHERE (blocker_id=? AND blocked_id=p.user_id) OR (blocker_id=p.user_id AND blocked_id=?))
      ORDER BY l.created_at DESC LIMIT 100`).bind(me, me, me, me, me).all();
    return c.json({ likes: rows.results });
  });
  app.post('/api/likes', async c => {
    const me = c.get('userId'), { toUserId } = await c.req.json<{ toUserId?: string }>();
    if (!toUserId || toUserId === me) return c.json({ error: 'invalid_target' }, 400);
    if (!await c.env.DB.prepare(`SELECT 1 FROM users WHERE id=? AND status='active' AND NOT EXISTS(
      SELECT 1 FROM blocks WHERE (blocker_id=? AND blocked_id=?) OR (blocker_id=? AND blocked_id=?))`).bind(toUserId, me, toUserId, toUserId, me).first()) return c.json({ error: 'not_available' }, 404);
    const inserted = await c.env.DB.prepare('INSERT OR IGNORE INTO likes(from_user,to_user,created_at) VALUES(?,?,?)').bind(me, toUserId, now()).run();
    await c.env.DB.prepare('DELETE FROM mobile_profile_passes WHERE user_id=? AND other_id=?').bind(me, toUserId).run();
    if (!await c.env.DB.prepare('SELECT 1 FROM likes WHERE from_user=? AND to_user=?').bind(toUserId, me).first()) {
      if (inserted.meta.changes) await notify(c.env.DB, toUserId, 'like', { fromUserId: me });
      return c.json({ matched: false });
    }
    const [low, high] = [me, toUserId].sort();
    const result = await c.env.DB.prepare('INSERT OR IGNORE INTO matches(id,user_low,user_high,created_at) VALUES(?,?,?,?)').bind(crypto.randomUUID(), low, high, now()).run();
    const match = await c.env.DB.prepare('SELECT id FROM matches WHERE user_low=? AND user_high=?').bind(low, high).first<{ id: string }>();
    if (result.meta.changes) await Promise.all([notify(c.env.DB, me, 'match', { matchId: match!.id }), notify(c.env.DB, toUserId, 'match', { matchId: match!.id })]);
    return c.json({ matched: true, matchId: match!.id });
  });
  app.get('/api/matches', async c => {
    const me = c.get('userId');
    const rows = await c.env.DB.prepare(`SELECT m.id,m.created_at,${publicFields},
      (SELECT body FROM messages WHERE match_id=m.id AND deleted_at IS NULL ORDER BY rowid DESC LIMIT 1) AS last_message,
      COALESCE((SELECT created_at FROM messages WHERE match_id=m.id AND deleted_at IS NULL ORDER BY rowid DESC LIMIT 1),m.created_at) AS updated_at,
      (SELECT COUNT(*) FROM messages x WHERE x.match_id=m.id AND x.deleted_at IS NULL AND x.sender_id<>?
       AND x.rowid>COALESCE((SELECT last_sequence FROM mobile_message_reads WHERE user_id=? AND match_id=m.id),0)) AS unread_count
      FROM matches m JOIN profiles p ON p.user_id=CASE WHEN m.user_low=? THEN m.user_high ELSE m.user_low END
      JOIN users u ON u.id=p.user_id WHERE (m.user_low=? OR m.user_high=?) AND u.status='active'
      AND NOT EXISTS(SELECT 1 FROM blocks WHERE (blocker_id=? AND blocked_id=p.user_id) OR (blocker_id=p.user_id AND blocked_id=?))
      ORDER BY updated_at DESC LIMIT 100`).bind(me, me, me, me, me, me, me).all();
    return c.json({ matches: rows.results });
  });
  app.get('/api/matches/:id', async c => {
    const me = c.get('userId'), match = await member(c.env.DB, c.req.param('id'), me);
    if (!match) return c.json({ error: 'match_not_found' }, 404);
    const other = match.user_low === me ? match.user_high : match.user_low;
    const profile = await c.env.DB.prepare(`SELECT ${publicFields} FROM profiles p WHERE p.user_id=?`).bind(other).first();
    const p = await progress(c.env.DB, match);
    const grants = await c.env.DB.prepare(`SELECT owner_id,stage,expires_at FROM stage_grants WHERE ((owner_id=? AND viewer_id=?)
      OR (owner_id=? AND viewer_id=?)) AND revoked_at IS NULL AND expires_at>? ORDER BY stage DESC`).bind(me, other, other, me, now()).all<{ owner_id: string; stage: number; expires_at: string }>();
    const received = grants.results.find(g => g.owner_id === other)?.stage ?? 0;
    const given = grants.results.find(g => g.owner_id === me)?.stage ?? 0;
    // Old uploads are not known to be cropped; they are owner-only until retaken.
    const captures = await c.env.DB.prepare(`SELECT id,stage FROM captures WHERE owner_id=? AND object_key LIKE 'public/%' AND stage<=? ORDER BY created_at DESC`).bind(other, Math.min(p.stage, received)).all();
    return c.json({ id: match.id, me, profile, progress: p, visibleStage: Math.min(p.stage, received), grantedStage: given, captures: captures.results });
  });
  app.get('/api/matches/:id/messages', async c => {
    const me = c.get('userId'), match = await member(c.env.DB, c.req.param('id'), me);
    if (!match) return c.json({ error: 'match_not_found' }, 404);
    const before = Number(c.req.query('before') ?? Number.MAX_SAFE_INTEGER);
    if (!Number.isSafeInteger(before) || before < 1) return c.json({ error: 'invalid_cursor' }, 400);
    const take = limit(c.req.query('limit'));
    const rows = await c.env.DB.prepare(`SELECT rowid AS sequence,id,sender_id,body,warning,created_at FROM messages
      WHERE match_id=? AND deleted_at IS NULL AND rowid<? ORDER BY rowid DESC LIMIT ?`).bind(match.id, before, take + 1).all<any>();
    const more = rows.results.length > take, messages = rows.results.slice(0, take).reverse();
    return c.json({ me, messages, nextBefore: more ? messages[0]?.sequence : null });
  });
  app.post('/api/matches/:id/read', async c => {
    const me = c.get('userId'), match = await member(c.env.DB, c.req.param('id'), me);
    if (!match) return c.json({ error: 'match_not_found' }, 404);
    const { sequence } = await c.req.json<{ sequence: number }>();
    if (!Number.isSafeInteger(sequence) || sequence < 1 || !await c.env.DB.prepare('SELECT 1 FROM messages WHERE match_id=? AND rowid=?').bind(match.id, sequence).first()) return c.json({ error: 'invalid_cursor' }, 400);
    await c.env.DB.prepare(`INSERT INTO mobile_message_reads(user_id,match_id,last_sequence) VALUES(?,?,?)
      ON CONFLICT(user_id,match_id) DO UPDATE SET last_sequence=MAX(last_sequence,excluded.last_sequence)`).bind(me, match.id, sequence).run();
    return c.json({ ok: true });
  });
  app.post('/api/matches/:id/messages', async c => {
    const me = c.get('userId'), match = await member(c.env.DB, c.req.param('id'), me);
    if (!match) return c.json({ error: 'match_not_found' }, 404);
    const input = await c.req.json<{ body?: string }>(), body = typeof input.body === 'string' ? input.body.trim() : '';
    if (!body || body.length > 2000) return c.json({ error: 'invalid_message' }, 400);
    const warning = /(https?:\/\/|www\.|投資|暗号資産|仮想通貨|副業|必ず儲かる)/i.test(body) ? '外部リンクや勧誘に注意してください。' : null;
    const messageId = crypto.randomUUID();
    await c.env.DB.prepare('INSERT INTO messages(id,match_id,sender_id,body,warning,created_at) VALUES(?,?,?,?,?,?)').bind(messageId, match.id, me, body, warning, now()).run();
    if (warning) await c.env.DB.prepare('INSERT INTO safety_flags(id,user_id,message_id,reason,created_at) VALUES(?,?,?,?,?)').bind(crypto.randomUUID(), me, messageId, 'automated_link_or_solicitation_signal', now()).run();
    await notify(c.env.DB, match.user_low === me ? match.user_high : match.user_low, 'message', { matchId: match.id, messageId });
    return c.json({ id: messageId, warning }, 201);
  });
  app.get('/api/daily', async c => {
    const topic = await c.env.DB.prepare('SELECT * FROM daily_topics WHERE topic_date=?').bind(day()).first<any>();
    const answer = topic ? await c.env.DB.prepare('SELECT answer,created_at FROM daily_answers WHERE user_id=? AND topic_id=?').bind(c.get('userId'), topic.id).first() : null;
    return c.json({ topic, answer });
  });
  app.get('/api/matches/:id/daily', async c => {
    const me = c.get('userId'), match = await member(c.env.DB, c.req.param('id'), me);
    if (!match) return c.json({ error: 'match_not_found' }, 404);
    const topic = await c.env.DB.prepare('SELECT * FROM daily_topics WHERE topic_date=?').bind(day()).first<any>();
    const answer = topic ? await c.env.DB.prepare('SELECT answer FROM daily_answers WHERE user_id=? AND topic_id=?').bind(me, topic.id).first() : null;
    const otherAnswer = topic ? await c.env.DB.prepare('SELECT 1 FROM daily_answers WHERE user_id=? AND topic_id=?').bind(match.user_low === me ? match.user_high : match.user_low, topic.id).first() : null;
    const messages = await c.env.DB.prepare(`SELECT sender_id,body FROM messages WHERE match_id=? AND deleted_at IS NULL AND date(created_at,'+9 hours')=?`).bind(match.id, day()).all<{ sender_id: string; body: string }>();
    return c.json({ topic, answer, tasks: {
      'answer-topic': !!answer,
      'receive-reply': messages.results.some(m => m.sender_id !== me),
      'ask-question': messages.results.some(m => m.sender_id === me && /[?？]/.test(m.body)),
    }, otherAnswered: !!otherAnswer, progress: await progress(c.env.DB, match) });
  });
  app.post('/api/daily/answers', async c => {
    const { topicId, answer } = await c.req.json<{ topicId?: string; answer?: string }>();
    if (!topicId || typeof answer !== 'string' || !answer.trim() || answer.length > 2000) return c.json({ error: 'invalid_answer' }, 400);
    if (!await c.env.DB.prepare('SELECT 1 FROM daily_topics WHERE id=? AND topic_date=?').bind(topicId, day()).first()) return c.json({ error: 'topic_not_available' }, 404);
    await c.env.DB.prepare(`INSERT INTO daily_answers(user_id,topic_id,answer,created_at) VALUES(?,?,?,?)
      ON CONFLICT(user_id,topic_id) DO UPDATE SET answer=excluded.answer,created_at=excluded.created_at`).bind(c.get('userId'), topicId, answer.trim(), now()).run();
    return c.json({ ok: true });
  });
  app.post('/api/matches/:id/profile-stage', async c => {
    const me = c.get('userId'), match = await member(c.env.DB, c.req.param('id'), me);
    if (!match) return c.json({ error: 'match_not_found' }, 404);
    const other = match.user_low === me ? match.user_high : match.user_low;
    const { stage, consent } = await c.req.json<{ stage?: number; consent?: boolean }>();
    if (!Number.isInteger(stage) || stage! < 1 || stage! > 4 || typeof consent !== 'boolean') return c.json({ error: 'invalid_grant' }, 400);
    if (!consent) {
      await c.env.DB.prepare('UPDATE stage_grants SET revoked_at=? WHERE owner_id=? AND viewer_id=? AND stage>=?').bind(now(), me, other, stage).run();
      return c.json({ revoked: true });
    }
    if (stage! > (await progress(c.env.DB, match)).stage) return c.json({ error: 'stage_locked' }, 403);
    await c.env.DB.prepare(`INSERT INTO stage_grants(owner_id,viewer_id,stage,consented_at,expires_at,revoked_at) VALUES(?,?,?,?,?,NULL)
      ON CONFLICT(owner_id,viewer_id,stage) DO UPDATE SET consented_at=excluded.consented_at,expires_at=excluded.expires_at,revoked_at=NULL`).bind(me, other, stage, now(), new Date(Date.now() + 30 * 86400000).toISOString()).run();
    return c.json({ granted: true });
  });
}
