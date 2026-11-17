import { randomUUID } from 'node:crypto';
import { createReadStream, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Router, type ErrorRequestHandler, type Request, type Response } from 'express';
import { db } from './db.js';
import { createSession, hashPassword, rateLimit, requireAdmin, requireAgeApproved, requireAuth, sha256, verifyPassword } from './security.js';

export const router = Router();
const now = () => new Date().toISOString();
const id = () => randomUUID();
const input = (value: unknown, max: number) => typeof value === 'string' ? value.trim().slice(0, max) : '';
const storage = resolve(process.env.CAPTURE_STORAGE_PATH ?? 'private/captures');
mkdirSync(storage, { recursive: true });
const self = (res: Response) => res.locals.userId as string;
const bad = (res: Response, status: number, error: string) => { res.status(status).json({ error }); };

function ageStatus(userId: string): string {
  return (db.prepare('SELECT status FROM age_verifications WHERE user_id=?').get(userId) as { status: string } | undefined)?.status ?? 'unsubmitted';
}

function profile(userId: string): Record<string, unknown> | undefined {
  return db.prepare(`SELECT p.user_id AS id,p.display_name AS displayName,p.age,p.area,p.bio,
      p.throat_classification AS throatClassification
    FROM profiles p JOIN users u ON u.id=p.user_id WHERE p.user_id=? AND u.status='active'`).get(userId) as Record<string, unknown> | undefined;
}

function blocked(a: string, b: string): boolean {
  return Boolean(db.prepare(`SELECT 1 FROM blocks WHERE (blocker_id=? AND blocked_id=?) OR (blocker_id=? AND blocked_id=?)`).get(a, b, b, a));
}

function matchBetween(a: string, b: string): { id: string } | undefined {
  const [left, right] = a < b ? [a, b] : [b, a];
  return db.prepare('SELECT id FROM matches WHERE user_a=? AND user_b=?').get(left, right) as { id: string } | undefined;
}

function matchMember(matchId: string, userId: string): boolean {
  return Boolean(db.prepare('SELECT 1 FROM matches WHERE id=? AND (user_a=? OR user_b=?)').get(matchId, userId, userId));
}

function visibleStage(matchId: string): number {
  const members = db.prepare('SELECT user_a AS a,user_b AS b FROM matches WHERE id=?').get(matchId) as { a: string; b: string } | undefined;
  if (!members) return 0;
  const mutualDays = (db.prepare(`SELECT COUNT(*) AS n FROM (
    SELECT substr(sent_at,1,10) AS d FROM messages WHERE match_id=?
    GROUP BY substr(sent_at,1,10) HAVING COUNT(DISTINCT sender_id)=2
  )`).get(matchId) as { n: number }).n;
  const sharedDaily = (db.prepare(`SELECT COUNT(*) AS n FROM (
    SELECT a.topic_id FROM daily_answers a JOIN daily_answers b ON a.topic_id=b.topic_id
    WHERE a.user_id=? AND b.user_id=? GROUP BY a.topic_id
  )`).get(members.a, members.b) as { n: number }).n;
  if (mutualDays >= 30 && sharedDaily >= 7) return 4;
  if (mutualDays >= 14 && sharedDaily >= 3) return 3;
  if (mutualDays >= 7 && sharedDaily >= 1) return 2;
  if (mutualDays >= 3) return 1;
  return 0;
}

router.get('/health', (_req, res) => res.json({ status: 'ok', service: 'nodobito-api' }));

router.post('/auth/signup', rateLimit('signup', 8, 900000), async (req, res, next) => {
  try {
    const email = input(req.body?.email, 254).toLowerCase();
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || password.length < 12 || password.length > 128) {
      bad(res, 400, '有効なメールアドレスと12〜128文字のパスワードを指定してください。'); return;
    }
    if (db.prepare('SELECT 1 FROM users WHERE email=?').get(email)) { bad(res, 409, 'このメールアドレスは登録済みです。'); return; }
    const userId = id();
    db.prepare('INSERT INTO users(id,email,password_hash,created_at) VALUES(?,?,?,?)').run(userId, email, await hashPassword(password), now());
    db.prepare('INSERT INTO age_verifications(user_id) VALUES(?)').run(userId);
    res.status(201).json({ user: { id: userId, email, status: 'active', ageVerification: 'unsubmitted' }, token: createSession(userId), tokenType: 'Bearer' });
  } catch (error) { next(error); }
});

router.post('/auth/login', rateLimit('login', 10, 900000), async (req, res, next) => {
  try {
    const email = input(req.body?.email, 254).toLowerCase();
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    const user = db.prepare('SELECT id,email,password_hash AS passwordHash,status FROM users WHERE email=?').get(email) as
      { id: string; email: string; passwordHash: string; status: string } | undefined;
    if (!user || user.status !== 'active' || !(await verifyPassword(password, user.passwordHash))) { bad(res, 401, 'メールアドレスまたはパスワードが正しくありません。'); return; }
    res.json({ user: { id: user.id, email: user.email, ageVerification: ageStatus(user.id) }, token: createSession(user.id), tokenType: 'Bearer' });
  } catch (error) { next(error); }
});

router.post('/auth/logout', requireAuth, (req, res) => {
  const token = req.header('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1] ?? '';
  db.prepare('DELETE FROM sessions WHERE token_hash=?').run(sha256(token));
  res.status(204).end();
});

router.get('/auth/me', requireAuth, (req, res) => {
  const userId = self(res);
  const user = db.prepare('SELECT id,email,status,created_at AS createdAt FROM users WHERE id=?').get(userId);
  res.json({ user, ageVerification: ageStatus(userId), profile: profile(userId) ?? null });
});

router.post('/auth/age-verification', requireAuth, rateLimit('age-verify', 5, 3600000), (req, res) => {
  if (req.body?.adultConfirmed !== true) { bad(res, 400, '18歳以上であることの確認が必要です。'); return; }
  db.prepare(`UPDATE age_verifications SET status='pending',adult_confirmed_at=?,reviewed_at=NULL,reviewed_by=NULL WHERE user_id=?`).run(now(), self(res));
  res.json({ status: 'pending' });
});

router.post('/profiles', requireAuth, (req, res) => {
  const userId = self(res);
  const displayName = input(req.body?.displayName, 40);
  const age = Number(req.body?.age);
  const area = input(req.body?.area, 80);
  const bio = input(req.body?.bio, 500);
  if (!displayName || !Number.isInteger(age) || age < 18 || age > 120 || !area) { bad(res, 400, '表示名、18歳以上の年齢、居住エリアを指定してください。'); return; }
  db.prepare(`INSERT INTO profiles(user_id,display_name,age,area,bio,updated_at) VALUES(?,?,?,?,?,?)
    ON CONFLICT(user_id) DO UPDATE SET display_name=excluded.display_name,age=excluded.age,area=excluded.area,bio=excluded.bio,updated_at=excluded.updated_at`)
    .run(userId, displayName, age, area, bio, now());
  res.status(201).json({ profile: profile(userId) });
});

router.get('/profiles/:id', requireAuth, requireAgeApproved, (req, res) => {
  const viewer = self(res);
  const target = String(req.params.id);
  const result = profile(target);
  if (!result || (viewer !== target && blocked(viewer, target))) { bad(res, 404, 'プロフィールが見つかりません。'); return; }
  const match = viewer === target ? undefined : matchBetween(viewer, target);
  res.json({ profile: result, visibleStage: viewer === target ? 4 : match ? visibleStage(match.id) : 0 });
});

router.post('/captures', requireAuth, requireAgeApproved, rateLimit('capture', 12, 3600000), (req, res, next) => {
  try {
    const owner = self(res);
    const source = req.body?.captureSource;
    const stage = Number(req.body?.stage ?? 0);
    const data = req.body?.imageData;
    if (source !== 'in_app_camera') { bad(res, 400, 'アプリ内カメラから撮影した画像のみ受け付けます。'); return; }
    if (!Number.isInteger(stage) || stage < 0 || stage > 4) { bad(res, 400, '公開段階は0〜4で指定してください。'); return; }
    if (typeof data !== 'string' || data.length > 14000000) { bad(res, 413, '画像がないか、上限サイズ（10MB）を超えています。'); return; }
    const parsed = data.match(/^data:(image\/(?:jpeg|png));base64,([A-Za-z0-9+/=]+)$/);
    if (!parsed) { bad(res, 400, 'JPEGまたはPNGのBase64画像を指定してください。'); return; }
    const mediaType = parsed[1] as 'image/jpeg' | 'image/png';
    const image = Buffer.from(parsed[2], 'base64');
    const validJpeg = mediaType !== 'image/jpeg' || (image[0] === 0xff && image[1] === 0xd8 && image.at(-2) === 0xff && image.at(-1) === 0xd9);
    const validPng = mediaType !== 'image/png' || image.subarray(0, 8).toString('hex') === '89504e470d0a1a0a';
    if (!image.length || image.length > 10 * 1024 * 1024 || !validJpeg || !validPng) { bad(res, 400, '画像データが壊れているか、形式と内容が一致しません。'); return; }
    const captureId = id();
    const storageKey = `${captureId}${mediaType === 'image/jpeg' ? '.jpg' : '.png'}`;
    writeFileSync(resolve(storage, storageKey), image, { flag: 'wx', mode: 0o600 });
    db.prepare(`INSERT INTO captures(id,owner_id,stage,storage_key,media_type,capture_source,created_at) VALUES(?,?,?,?,?,?,?)`)
      .run(captureId, owner, stage, storageKey, mediaType, source, now());
    res.status(201).json({ id: captureId, stage, imageUrl: `/captures/${captureId}/image` });
  } catch (error) { next(error); }
});

router.get('/captures/:id/image', requireAuth, requireAgeApproved, (req, res, next) => {
  const viewer = self(res);
  const capture = db.prepare(`SELECT id,owner_id AS ownerId,stage,storage_key AS storageKey,media_type AS mediaType FROM captures WHERE id=?`)
    .get(String(req.params.id)) as { id: string; ownerId: string; stage: number; storageKey: string; mediaType: string } | undefined;
  if (!capture) { bad(res, 404, '画像が見つかりません。'); return; }
  if (capture.ownerId !== viewer) {
    if (blocked(viewer, capture.ownerId)) { bad(res, 404, '画像が見つかりません。'); return; }
    const match = matchBetween(viewer, capture.ownerId);
    if (!match || capture.stage > visibleStage(match.id)) { bad(res, 403, 'この画像はまだ公開されていません。'); return; }
  }
  res.setHeader('Content-Type', capture.mediaType);
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  db.prepare('INSERT INTO image_access_logs(id,capture_id,viewer_id,accessed_at) VALUES(?,?,?,?)').run(id(), capture.id, viewer, now());
  createReadStream(resolve(storage, capture.storageKey)).on('error', next).pipe(res);
});

router.get('/discover', requireAuth, requireAgeApproved, (req, res) => {
  const viewer = self(res);
  const filter = typeof req.query.throatClassification === 'string' ? req.query.throatClassification : '';
  if (filter && !['present', 'absent'].includes(filter)) { bad(res, 400, 'throatClassificationはpresentまたはabsentを指定してください。'); return; }
  const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 50);
  const clause = filter ? 'AND p.throat_classification=?' : "AND p.throat_classification IN ('present','absent')";
  const params: (string | number)[] = [viewer, viewer, viewer, viewer, viewer, viewer];
  if (filter) params.push(filter);
  params.push(limit);
  const rows = db.prepare(`SELECT p.user_id AS id FROM profiles p JOIN users u ON u.id=p.user_id
    JOIN age_verifications v ON v.user_id=p.user_id AND v.status='approved'
    WHERE p.user_id<>? AND u.status='active'
    AND NOT EXISTS(SELECT 1 FROM likes l WHERE l.from_user_id=? AND l.to_user_id=p.user_id)
    AND NOT EXISTS(SELECT 1 FROM matches m WHERE (m.user_a=? AND m.user_b=p.user_id) OR (m.user_b=? AND m.user_a=p.user_id))
    AND NOT EXISTS(SELECT 1 FROM blocks b WHERE (b.blocker_id=? AND b.blocked_id=p.user_id) OR (b.blocker_id=p.user_id AND b.blocked_id=?))
    ${clause} ORDER BY p.updated_at DESC LIMIT ?`).all(...params) as { id: string }[];
  res.json({ profiles: rows.map(row => profile(row.id)).filter(Boolean), nextCursor: null });
});

router.post('/likes', requireAuth, requireAgeApproved, rateLimit('likes', 80, 3600000), (req, res) => {
  const from = self(res);
  const to = input(req.body?.toUserId, 64);
  if (!to || from === to || !profile(to) || ageStatus(to) !== 'approved' || blocked(from, to)) { bad(res, 404, '対象ユーザーが見つからないか、いいねできません。'); return; }
  db.prepare('INSERT OR IGNORE INTO likes(from_user_id,to_user_id,created_at) VALUES(?,?,?)').run(from, to, now());
  if (!db.prepare('SELECT 1 FROM likes WHERE from_user_id=? AND to_user_id=?').get(to, from)) { res.status(201).json({ matched: false }); return; }
  const [a, b] = from < to ? [from, to] : [to, from];
  db.prepare('INSERT OR IGNORE INTO matches(id,user_a,user_b,created_at) VALUES(?,?,?,?)').run(id(), a, b, now());
  res.status(201).json({ matched: true, matchId: matchBetween(from, to)?.id });
});

router.get('/likes/received', requireAuth, requireAgeApproved, (req, res) => {
  const user = self(res);
  const rows = db.prepare(`SELECT l.from_user_id AS userId,l.created_at AS createdAt FROM likes l
    WHERE l.to_user_id=? AND NOT EXISTS(SELECT 1 FROM likes x WHERE x.from_user_id=? AND x.to_user_id=l.from_user_id)
    ORDER BY l.created_at DESC LIMIT 100`).all(user, user) as { userId: string; createdAt: string }[];
  res.json({ likes: rows.map(row => ({ ...row, profile: profile(row.userId) })) });
});

router.get('/matches', requireAuth, requireAgeApproved, (req, res) => {
  const user = self(res);
  const rows = db.prepare('SELECT id,user_a AS a,user_b AS b,created_at AS createdAt FROM matches WHERE user_a=? OR user_b=? ORDER BY created_at DESC').all(user, user) as
    { id: string; a: string; b: string; createdAt: string }[];
  res.json({ matches: rows.filter(row => !blocked(row.a, row.b)).map(row => {
    const other = row.a === user ? row.b : row.a;
    return { id: row.id, createdAt: row.createdAt, profile: profile(other), visibleStage: visibleStage(row.id) };
  }) });
});

router.get('/matches/:id/messages', requireAuth, requireAgeApproved, (req, res) => {
  const user = self(res);
  const matchId = String(req.params.id);
  if (!matchMember(matchId, user)) { bad(res, 404, 'マッチが見つかりません。'); return; }
  const members = db.prepare('SELECT user_a AS a,user_b AS b FROM matches WHERE id=?').get(matchId) as { a: string; b: string };
  if (blocked(members.a, members.b)) { bad(res, 403, 'このトークは利用できません。'); return; }
  const before = input(req.query.before, 40);
  const rows = db.prepare(`SELECT id,sender_id AS senderId,body,sent_at AS sentAt FROM messages
    WHERE match_id=? AND (?='' OR sent_at<?) ORDER BY sent_at DESC LIMIT 50`).all(matchId, before, before) as object[];
  res.json({ messages: rows.reverse(), visibleStage: visibleStage(matchId) });
});

router.post('/matches/:id/messages', requireAuth, requireAgeApproved, rateLimit('messages', 30, 60000), (req, res) => {
  const sender = self(res);
  const matchId = String(req.params.id);
  const body = input(req.body?.body, 2000);
  if (!matchMember(matchId, sender)) { bad(res, 404, 'マッチが見つかりません。'); return; }
  const members = db.prepare('SELECT user_a AS a,user_b AS b FROM matches WHERE id=?').get(matchId) as { a: string; b: string };
  if (blocked(members.a, members.b)) { bad(res, 403, 'このトークは利用できません。'); return; }
  if (!body) { bad(res, 400, 'メッセージを入力してください。'); return; }
  const message = { id: id(), senderId: sender, body, sentAt: now() };
  db.prepare('INSERT INTO messages(id,match_id,sender_id,body,sent_at) VALUES(?,?,?,?,?)').run(message.id, matchId, sender, body, message.sentAt);
  res.status(201).json({ message, visibleStage: visibleStage(matchId) });
});

router.get('/daily', requireAuth, requireAgeApproved, (req, res) => {
  const user = self(res);
  const topic = db.prepare(`SELECT id,topic_date AS date,title,prompt FROM daily_topics WHERE active=1 AND topic_date<=?
    ORDER BY topic_date DESC LIMIT 1`).get(now().slice(0, 10)) as { id: string; date: string; title: string; prompt: string } | undefined;
  if (!topic) { res.json({ daily: null }); return; }
  const answer = db.prepare('SELECT id,answer,created_at AS createdAt FROM daily_answers WHERE topic_id=? AND user_id=?').get(topic.id, user);
  res.json({ daily: { ...topic, answer: answer ?? null, completed: Boolean(answer) } });
});

router.get('/daily/answers', requireAuth, requireAgeApproved, (req, res) => {
  const rows = db.prepare(`SELECT a.id,a.answer,a.created_at AS createdAt,d.id AS topicId,d.title,d.topic_date AS date
    FROM daily_answers a JOIN daily_topics d ON d.id=a.topic_id WHERE a.user_id=? ORDER BY d.topic_date DESC LIMIT 100`).all(self(res));
  res.json({ answers: rows });
});

router.post('/daily/answers', requireAuth, requireAgeApproved, rateLimit('daily-answers', 10, 3600000), (req, res) => {
  const topicId = input(req.body?.topicId, 64);
  const answer = input(req.body?.answer, 2000);
  if (!answer || !db.prepare('SELECT 1 FROM daily_topics WHERE id=? AND active=1 AND topic_date<=?').get(topicId, now().slice(0, 10))) {
    bad(res, 400, '有効な課題と回答を指定してください。'); return;
  }
  try {
    const answerId = id();
    db.prepare('INSERT INTO daily_answers(id,topic_id,user_id,answer,created_at) VALUES(?,?,?,?,?)').run(answerId, topicId, self(res), answer, now());
    res.status(201).json({ id: answerId, topicId, answer });
  } catch { bad(res, 409, 'この課題には回答済みです。'); }
});

router.post('/users/:id/block', requireAuth, requireAgeApproved, (req, res) => {
  const blocker = self(res);
  const blockedId = String(req.params.id);
  if (blocker === blockedId || !db.prepare('SELECT 1 FROM users WHERE id=?').get(blockedId)) { bad(res, 404, 'ユーザーが見つかりません。'); return; }
  db.prepare('INSERT OR IGNORE INTO blocks(blocker_id,blocked_id,created_at) VALUES(?,?,?)').run(blocker, blockedId, now());
  res.status(204).end();
});

router.delete('/users/:id/block', requireAuth, requireAgeApproved, (req, res) => {
  db.prepare('DELETE FROM blocks WHERE blocker_id=? AND blocked_id=?').run(self(res), String(req.params.id));
  res.status(204).end();
});

router.post('/users/:id/reports', requireAuth, requireAgeApproved, rateLimit('reports', 20, 86400000), (req, res) => {
  const reporter = self(res);
  const target = String(req.params.id);
  const reason = input(req.body?.reason, 80);
  if (reporter === target || !db.prepare('SELECT 1 FROM users WHERE id=?').get(target) || !reason) { bad(res, 400, '通報対象と理由を確認してください。'); return; }
  const reportId = id();
  db.prepare('INSERT INTO reports(id,reporter_id,reported_id,reason,details,created_at) VALUES(?,?,?,?,?,?)')
    .run(reportId, reporter, target, reason, input(req.body?.details, 1000), now());
  res.status(201).json({ id: reportId, status: 'open' });
});

router.get('/admin/users', requireAdmin, (req, res) => {
  const q = `%${input(req.query.q, 80)}%`;
  const users = db.prepare(`SELECT u.id,u.email,u.status,u.created_at AS createdAt,v.status AS ageVerification,
      p.display_name AS displayName,p.throat_classification AS throatClassification
    FROM users u JOIN age_verifications v ON v.user_id=u.id LEFT JOIN profiles p ON p.user_id=u.id
    WHERE u.email LIKE ? OR p.display_name LIKE ? ORDER BY u.created_at DESC LIMIT 100`).all(q, q);
  res.json({ users });
});

router.patch('/admin/users/:id/status', requireAdmin, (req, res) => {
  const status = req.body?.status;
  if (!['active', 'suspended'].includes(status)) { bad(res, 400, 'statusはactiveまたはsuspendedを指定してください。'); return; }
  const target = String(req.params.id);
  const result = db.prepare('UPDATE users SET status=? WHERE id=?').run(status, target);
  if (!Number(result.changes)) { bad(res, 404, 'ユーザーが見つかりません。'); return; }
  if (status === 'suspended') db.prepare('DELETE FROM sessions WHERE user_id=?').run(target);
  res.json({ userId: target, status });
});

router.get('/admin/verifications', requireAdmin, (req, res) => {
  const rows = db.prepare(`SELECT u.id AS userId,u.email,v.status,v.adult_confirmed_at AS adultConfirmedAt
    FROM age_verifications v JOIN users u ON u.id=v.user_id WHERE v.status='pending' ORDER BY v.adult_confirmed_at`).all();
  res.json({ verifications: rows });
});

router.patch('/admin/users/:id/verification', requireAdmin, (req, res) => {
  const status = req.body?.status;
  const target = String(req.params.id);
  if (!['approved', 'rejected'].includes(status) || !db.prepare('SELECT 1 FROM users WHERE id=?').get(target)) { bad(res, 400, '対象ユーザーまたは確認結果が不正です。'); return; }
  db.prepare('UPDATE age_verifications SET status=?,reviewed_at=?,reviewed_by=? WHERE user_id=?').run(status, now(), 'admin', target);
  res.json({ userId: target, status });
});

router.patch('/admin/users/:id/classification', requireAdmin, (req, res) => {
  const classification = req.body?.throatClassification;
  if (!['present', 'absent', 'pending'].includes(classification)) { bad(res, 400, '分類はpresent、absent、pendingです。'); return; }
  const result = db.prepare('UPDATE profiles SET throat_classification=?,updated_at=? WHERE user_id=?').run(classification, now(), String(req.params.id));
  if (!Number(result.changes)) { bad(res, 404, 'プロフィールが見つかりません。'); return; }
  res.json({ throatClassification: classification });
});

router.get('/admin/daily', requireAdmin, (req, res) => {
  res.json({ topics: db.prepare('SELECT id,topic_date AS date,title,prompt,active FROM daily_topics ORDER BY topic_date DESC LIMIT 180').all() });
});

router.post('/admin/daily', requireAdmin, (req, res) => {
  const date = input(req.body?.date, 10);
  const title = input(req.body?.title, 120);
  const prompt = input(req.body?.prompt, 1000);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !title || !prompt) { bad(res, 400, 'date、title、promptを指定してください。'); return; }
  const topicId = id();
  try {
    db.prepare('INSERT INTO daily_topics(id,topic_date,title,prompt,created_at,created_by) VALUES(?,?,?,?,?,?)').run(topicId, date, title, prompt, now(), 'admin');
    res.status(201).json({ id: topicId, date, title, prompt, active: true });
  } catch { bad(res, 409, 'この日付の課題は登録済みです。'); }
});

router.patch('/admin/daily/:id', requireAdmin, (req, res) => {
  if (typeof req.body?.active !== 'boolean') { bad(res, 400, 'activeにtrueまたはfalseを指定してください。'); return; }
  const result = db.prepare('UPDATE daily_topics SET active=? WHERE id=?').run(req.body.active ? 1 : 0, String(req.params.id));
  if (!Number(result.changes)) { bad(res, 404, '課題が見つかりません。'); return; }
  res.json({ id: req.params.id, active: req.body.active });
});

router.get('/admin/reports', requireAdmin, (req, res) => {
  const status = input(req.query.status, 20) || 'open';
  if (!['open', 'reviewing', 'resolved', 'dismissed'].includes(status)) { bad(res, 400, '不正なstatusです。'); return; }
  res.json({ reports: db.prepare(`SELECT id,reporter_id AS reporterId,reported_id AS reportedId,reason,details,status,created_at AS createdAt
    FROM reports WHERE status=? ORDER BY created_at LIMIT 200`).all(status) });
});

router.patch('/admin/reports/:id', requireAdmin, (req, res) => {
  const status = req.body?.status;
  if (!['reviewing', 'resolved', 'dismissed'].includes(status)) { bad(res, 400, '不正なstatusです。'); return; }
  const result = db.prepare('UPDATE reports SET status=?,reviewed_at=?,reviewed_by=? WHERE id=?').run(status, now(), 'admin', String(req.params.id));
  if (!Number(result.changes)) { bad(res, 404, '通報が見つかりません。'); return; }
  res.json({ id: req.params.id, status });
});

router.get('/admin/image-access', requireAdmin, (req, res) => {
  res.json({ logs: db.prepare(`SELECT l.capture_id AS captureId,c.owner_id AS ownerId,l.viewer_id AS viewerId,l.accessed_at AS accessedAt
    FROM image_access_logs l JOIN captures c ON c.id=l.capture_id ORDER BY l.accessed_at DESC LIMIT 500`).all() });
});

export const apiErrorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  console.error(error);
  if (!res.headersSent) res.status(500).json({ error: 'サーバー内部でエラーが発生しました。' });
};
