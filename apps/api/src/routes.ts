import { randomUUID } from 'node:crypto';
import { createReadStream, existsSync, mkdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Router, type ErrorRequestHandler, type Request, type Response } from 'express';
import { db } from './db.js';
import { createSession, hashPassword, rateLimit, requireAdmin, requireAppealAuth, requireAuth, requireNotLimited, sha256, verifyPassword } from './security.js';
import { audit } from './audit.js';
import { notify } from './notifications.js';
import { contactDigest, decryptLocation, encryptLocation } from './privacy.js';

export const router = Router();
const now = () => new Date().toISOString();
const id = () => randomUUID();
const input = (value: unknown, max: number) => typeof value === 'string' ? value.trim().slice(0, max) : '';
const storage = resolve(process.env.CAPTURE_STORAGE_PATH ?? 'private/captures');
mkdirSync(storage, { recursive: true });
const self = (res: Response) => res.locals.userId as string;
const bad = (res: Response, status: number, error: string) => { res.status(status).json({ error }); };


function profile(userId: string, viewerId = userId): Record<string, unknown> | undefined {
  return db.prepare(`SELECT p.user_id AS id,p.display_name AS displayName,p.age,
      CASE WHEN p.user_id=? OR COALESCE(mp.location_visibility,'area')='area' THEN p.area ELSE NULL END AS area,p.bio,
      p.throat_classification AS throatClassification
    FROM profiles p JOIN users u ON u.id=p.user_id LEFT JOIN matching_preferences mp ON mp.user_id=p.user_id
    WHERE p.user_id=? AND u.status='active'`).get(viewerId, userId) as Record<string, unknown> | undefined;
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

function grantedStage(matchId: string, owner: string, viewer: string): number | null {
  const grant = db.prepare(`SELECT stage FROM stage_grants WHERE match_id=? AND grantor_id=? AND grantee_id=?
    AND revoked_at IS NULL AND expires_at>?`).get(matchId, owner, viewer, now()) as { stage: number } | undefined;
  return grant ? Math.min(grant.stage, visibleStage(matchId)) : null;
}

function otherMember(matchId: string, userId: string): string | null {
  const member = db.prepare('SELECT user_a AS a,user_b AS b FROM matches WHERE id=?').get(matchId) as { a: string; b: string } | undefined;
  return !member || (member.a !== userId && member.b !== userId) ? null : member.a === userId ? member.b : member.a;
}

export function expirePrivacyShares(): void {
  const timestamp = now();
  db.prepare('UPDATE stage_grants SET revoked_at=? WHERE revoked_at IS NULL AND expires_at<=?').run(timestamp, timestamp);
  db.prepare(`UPDATE date_plans SET status='expired',location_ciphertext=NULL,area='',scope_a='{}',scope_b='{}',updated_at=?
    WHERE status IN ('proposed','confirmed') AND ((expires_a IS NOT NULL AND expires_a<=?) OR (expires_b IS NOT NULL AND expires_b<=?))`)
    .run(timestamp, timestamp, timestamp);
  db.prepare('DELETE FROM sessions WHERE expires_at<=?').run(timestamp);
  db.prepare('DELETE FROM auth_attempts WHERE attempted_at<?').run(new Date(Date.now() - 30 * 86400000).toISOString());
}

type DatePlanRow = {
  id: string; matchId: string; createdBy: string; scheduledAt: string; area: string; locationCiphertext: string | null;
  scopeA: string; scopeB: string; expiresA: string | null; expiresB: string | null; consentA: string | null; consentB: string | null;
  confirmA: string | null; confirmB: string | null; arriveA: string | null; arriveB: string | null; status: string;
};

function serializeDatePlan(row: DatePlanRow, viewer: string, memberA: string): Record<string, unknown> {
  const side = viewer === memberA ? 'A' : 'B';
  const otherSide = side === 'A' ? 'B' : 'A';
  const scopeOwn = JSON.parse(side === 'A' ? row.scopeA : row.scopeB) as Record<string, boolean>;
  const scopeOther = JSON.parse(otherSide === 'A' ? row.scopeA : row.scopeB) as Record<string, boolean>;
  const ownExpiry = side === 'A' ? row.expiresA : row.expiresB;
  const otherExpiry = otherSide === 'A' ? row.expiresA : row.expiresB;
  const ownConsent = side === 'A' ? row.consentA : row.consentB;
  const otherConsent = otherSide === 'A' ? row.consentA : row.consentB;
  const ownActive = Boolean(ownConsent && ownExpiry && Date.parse(ownExpiry) > Date.now());
  const otherActive = Boolean(otherConsent && otherExpiry && Date.parse(otherExpiry) > Date.now());
  const proposalScope = row.createdBy === memberA ? JSON.parse(row.scopeA) as Record<string, boolean> : JSON.parse(row.scopeB) as Record<string, boolean>;
  const proposerExpiry = row.createdBy === memberA ? row.expiresA : row.expiresB;
  const proposalActive = Boolean(proposerExpiry && Date.parse(proposerExpiry) > Date.now());
  const mutual = ownActive && otherActive && row.status === 'confirmed';
  const sharedScope = (key: string) => mutual && scopeOwn[key] === true && scopeOther[key] === true;
  const scheduleVisible = (ownActive && scopeOwn.scheduledAt === true) ||
    (viewer !== row.createdBy && proposalActive && proposalScope.scheduledAt === true);
  const areaVisible = (ownActive && scopeOwn.area === true) ||
    (viewer !== row.createdBy && proposalActive && proposalScope.area === true);
  let preciseLocation: string | null = null;
  if (sharedScope('exactLocation') && row.locationCiphertext) {
    try { preciseLocation = decryptLocation(row.locationCiphertext); } catch { preciseLocation = null; }
  }
  return {
    id: row.id, status: row.status,
    scheduledAt: scheduleVisible ? row.scheduledAt : null,
    area: areaVisible ? row.area : null,
    preciseLocation,
    myConsent: ownConsent ? { scope: scopeOwn, expiresAt: ownExpiry } : null,
    theirConsent: otherConsent ? { scope: scopeOther, expiresAt: otherExpiry } : null,
    myConfirmedAt: side === 'A' ? row.confirmA : row.confirmB,
    theirConfirmedAt: side === 'A' ? row.confirmB : row.confirmA,
    myArrivedAt: side === 'A' ? row.arriveA : row.arriveB,
    theirArrivedAt: side === 'A' ? row.arriveB : row.arriveA,
  };
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
    db.prepare('INSERT INTO matching_preferences(user_id,updated_at) VALUES(?,?)').run(userId, now());
    if (process.env.CONTACT_HASH_KEY) {
      db.prepare('INSERT INTO user_contact_identifiers(user_id,kind,contact_digest,created_at) VALUES(?,?,?,?)')
        .run(userId, 'email', contactDigest('email', email), now());
    }
    res.status(201).json({ user: { id: userId, email, status: 'active' }, token: createSession(userId, input(req.body?.deviceName, 80)), tokenType: 'Bearer' });
  } catch (error) { next(error); }
});

router.post('/auth/login', rateLimit('login', 10, 900000), async (req, res, next) => {
  try {
    const email = input(req.body?.email, 254).toLowerCase();
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    const emailDigest = sha256(email);
    const ipDigest = sha256(req.ip ?? 'unknown');
    const recentFailures = (db.prepare(`SELECT COUNT(*) AS n FROM auth_attempts WHERE email_digest=? AND ip_digest=?
      AND successful=0 AND attempted_at>?`).get(emailDigest, ipDigest, new Date(Date.now() - 15 * 60000).toISOString()) as { n: number }).n;
    if (recentFailures >= 5) { bad(res, 429, 'ログイン試行が多すぎます。15分後に再度お試しください。'); return; }
    const user = db.prepare('SELECT id,email,password_hash AS passwordHash,status FROM users WHERE email=?').get(email) as
      { id: string; email: string; passwordHash: string; status: string } | undefined;
    const valid = Boolean(user && await verifyPassword(password, user.passwordHash));
    db.prepare('INSERT INTO auth_attempts(id,email_digest,ip_digest,successful,attempted_at) VALUES(?,?,?,?,?)')
      .run(id(), emailDigest, ipDigest, valid ? 1 : 0, now());
    if (!valid || !user) { bad(res, 401, 'メールアドレスまたはパスワードが正しくありません。'); return; }
    res.json({ user: { id: user.id, email: user.email, status: user.status }, token: createSession(user.id, input(req.body?.deviceName, 80)), tokenType: 'Bearer' });
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
  const restrictions = db.prepare(`SELECT id,scope,reason,expires_at AS expiresAt FROM user_limits
    WHERE user_id=? AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at>?)`).all(userId, now());
  res.json({ user, profile: profile(userId, userId) ?? null, restrictions });
});

router.get('/auth/sessions', requireAuth, (req, res) => {
  const sessions = db.prepare(`SELECT token_hash AS id,device_name AS deviceName,created_at AS createdAt,expires_at AS expiresAt
    FROM sessions WHERE user_id=? AND expires_at>? ORDER BY created_at DESC`).all(self(res), now());
  res.json({ sessions });
});

router.delete('/auth/sessions/:id', requireAuth, (req, res) => {
  db.prepare('DELETE FROM sessions WHERE token_hash=? AND user_id=?').run(String(req.params.id), self(res));
  res.status(204).end();
});

router.delete('/auth/sessions', requireAuth, (req, res) => {
  db.prepare('DELETE FROM sessions WHERE user_id=?').run(self(res));
  res.status(204).end();
});

router.put('/privacy/contacts', requireAuth, rateLimit('contacts', 5, 3600000), (req, res) => {
  const user = self(res);
  if (req.body?.consent !== true) { bad(res, 400, '連絡先の非表示を使うには同意が必要です。'); return; }
  if (!process.env.CONTACT_HASH_KEY) { bad(res, 503, 'CONTACT_HASH_KEYが未設定です。'); return; }
  const contacts = req.body?.contacts;
  if (!Array.isArray(contacts) || contacts.length > 1000) { bad(res, 400, '連絡先は1000件以内で指定してください。'); return; }
  const digests = new Set<string>();
  try {
    for (const contact of contacts) {
      const type = contact?.type;
      const value = typeof contact?.value === 'string' ? contact.value : '';
      if (type === 'email' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())) digests.add(contactDigest('email', value));
      else if (type === 'phone' && value.replace(/\D/g, '').length >= 8 && value.replace(/\D/g, '').length <= 15) digests.add(contactDigest('phone', value));
      else { bad(res, 400, '連絡先の形式を確認してください。'); return; }
    }
  } catch { bad(res, 503, '連絡先保護キーを利用できません。'); return; }
  if (digests.size > 1000) { bad(res, 400, '重複を除いて1000件以内で指定してください。'); return; }
  try {
    db.exec('BEGIN IMMEDIATE');
    db.prepare('DELETE FROM contact_hides WHERE user_id=?').run(user);
    const insert = db.prepare('INSERT INTO contact_hides(user_id,contact_digest,created_at) VALUES(?,?,?)');
    for (const digest of digests) insert.run(user, digest, now());
    db.exec('COMMIT');
  } catch (error) { db.exec('ROLLBACK'); throw error; }
  audit(user, 'user', 'privacy.contacts.updated', 'user', user, { count: digests.size, consent: true });
  res.json({ saved: digests.size, rawContactsStored: false });
});

router.delete('/privacy/contacts', requireAuth, (req, res) => {
  const user = self(res);
  db.prepare('DELETE FROM contact_hides WHERE user_id=?').run(user);
  audit(user, 'user', 'privacy.contacts.deleted', 'user', user);
  res.status(204).end();
});

router.delete('/captures/:id', requireAuth, (req, res) => {
  const user = self(res);
  const captureId = String(req.params.id);
  const capture = db.prepare('SELECT storage_key AS key FROM captures WHERE id=? AND owner_id=?').get(captureId, user) as { key: string } | undefined;
  if (!capture) { bad(res, 404, '削除できる画像が見つかりません。'); return; }
  const file = resolve(storage, capture.key);
  if (existsSync(file)) unlinkSync(file);
  db.prepare('DELETE FROM captures WHERE id=? AND owner_id=?').run(captureId, user);
  audit(user, 'user', 'capture.deleted', 'capture', captureId);
  res.status(204).end();
});

router.delete('/account', requireAuth, async (req, res, next) => {
  try {
    const user = self(res);
    const account = db.prepare('SELECT password_hash AS passwordHash FROM users WHERE id=?').get(user) as { passwordHash: string } | undefined;
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    if (!account || !(await verifyPassword(password, account.passwordHash))) { bad(res, 401, 'アカウント削除のためパスワードを確認してください。'); return; }
    const captures = db.prepare('SELECT storage_key AS key FROM captures WHERE owner_id=?').all(user) as { key: string }[];
    for (const capture of captures) {
      const file = resolve(storage, capture.key);
      if (existsSync(file)) unlinkSync(file);
    }
    audit(user, 'user', 'account.deleted', 'user', user);
    db.prepare('DELETE FROM users WHERE id=?').run(user);
    res.status(204).end();
  } catch (error) { next(error); }
});

router.put('/notifications/push-token', requireAuth, (req, res) => {
  const token = input(req.body?.expoPushToken, 200);
  if (!/^(Expo|Exponent)PushToken\[[A-Za-z0-9-]+\]$/.test(token)) { bad(res, 400, '有効なExpo Push Tokenを指定してください。'); return; }
  const user = self(res);
  const timestamp = now();
  db.prepare(`INSERT INTO push_devices(expo_push_token,user_id,device_name,created_at,last_seen_at) VALUES(?,?,?,?,?)
    ON CONFLICT(expo_push_token) DO UPDATE SET user_id=excluded.user_id,device_name=excluded.device_name,last_seen_at=excluded.last_seen_at`)
    .run(token, user, input(req.body?.deviceName, 80), timestamp, timestamp);
  audit(user, 'user', 'push_device.registered', 'push_device', sha256(token));
  res.status(204).end();
});

router.delete('/notifications/push-token', requireAuth, (req, res) => {
  const token = input(req.body?.expoPushToken, 200);
  db.prepare('DELETE FROM push_devices WHERE expo_push_token=? AND user_id=?').run(token, self(res));
  res.status(204).end();
});

router.get('/notifications', requireAuth, (req, res) => {
  const limit = Math.min(Math.max(Number(req.query.limit) || 30, 1), 100);
  const before = input(req.query.before, 40);
  const unreadOnly = req.query.unreadOnly === 'true';
  const rows = db.prepare(`SELECT id,type,title,body,data_json AS data,created_at AS createdAt,read_at AS readAt
    FROM notifications WHERE user_id=? AND (?=0 OR read_at IS NULL) AND (?='' OR created_at<?)
    ORDER BY created_at DESC LIMIT ?`).all(self(res), unreadOnly ? 1 : 0, before, before, limit) as
    { id: string; type: string; title: string; body: string; data: string; createdAt: string; readAt: string | null }[];
  res.json({ notifications: rows.map(row => ({ ...row, data: JSON.parse(row.data) })) });
});

router.patch('/notifications/:id/read', requireAuth, (req, res) => {
  const result = db.prepare('UPDATE notifications SET read_at=? WHERE id=? AND user_id=?').run(now(), String(req.params.id), self(res));
  if (!Number(result.changes)) { bad(res, 404, '通知が見つかりません。'); return; }
  res.status(204).end();
});

router.patch('/notifications/read-all', requireAuth, (req, res) => {
  db.prepare('UPDATE notifications SET read_at=? WHERE user_id=? AND read_at IS NULL').run(now(), self(res));
  res.status(204).end();
});


const goalOptions = ['serious', 'casual', 'friendship', 'undecided'];
const paceOptions = ['slow', 'balanced', 'frequent'];
function choices(value: unknown, allowed: string[], fallback: string[]): string[] | null {
  if (!Array.isArray(value)) return fallback;
  const result = [...new Set(value.filter((item): item is string => typeof item === 'string' && allowed.includes(item)))];
  return result.length > 0 && result.length === value.length ? result : null;
}

router.get('/preferences/discovery', requireAuth, (req, res) => {
  const user = db.prepare(`SELECT relationship_goal AS relationshipGoal,conversation_pace AS conversationPace,
      preferred_classification AS preferredThroatClassification,accepted_goals AS acceptedGoals,
      accepted_paces AS acceptedPaces,location_visibility AS locationVisibility
    FROM matching_preferences WHERE user_id=?`).get(self(res)) as Record<string, unknown> | undefined;
  if (!user) { res.json({ preferences: null }); return; }
  res.json({ preferences: { ...user, acceptedGoals: JSON.parse(String(user.acceptedGoals)), acceptedPaces: JSON.parse(String(user.acceptedPaces)) } });
});

router.put('/preferences/discovery', requireAuth, (req, res) => {
  const user = self(res);
  const goal = req.body?.relationshipGoal;
  const pace = req.body?.conversationPace;
  const classification = req.body?.preferredThroatClassification ?? null;
  const visibility = req.body?.locationVisibility ?? 'area';
  const acceptedGoals = choices(req.body?.acceptedGoals, goalOptions, goalOptions);
  const acceptedPaces = choices(req.body?.acceptedPaces, paceOptions, paceOptions);
  if (!goalOptions.includes(goal) || !paceOptions.includes(pace) ||
      (classification !== null && !['present', 'absent'].includes(classification)) ||
      !['hidden', 'area'].includes(visibility) || !acceptedGoals || !acceptedPaces) {
    bad(res, 400, '紹介条件の値を確認してください。'); return;
  }
  db.prepare(`INSERT INTO matching_preferences(user_id,relationship_goal,conversation_pace,preferred_classification,
      accepted_goals,accepted_paces,location_visibility,updated_at) VALUES(?,?,?,?,?,?,?,?)
    ON CONFLICT(user_id) DO UPDATE SET relationship_goal=excluded.relationship_goal,conversation_pace=excluded.conversation_pace,
      preferred_classification=excluded.preferred_classification,accepted_goals=excluded.accepted_goals,
      accepted_paces=excluded.accepted_paces,location_visibility=excluded.location_visibility,updated_at=excluded.updated_at`)
    .run(user, goal, pace, classification, JSON.stringify(acceptedGoals), JSON.stringify(acceptedPaces), visibility, now());
  audit(user, 'user', 'discovery_preferences.updated', 'user', user, { goal, pace, classification, visibility });
  res.json({ saved: true });
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
  res.status(201).json({ profile: profile(userId, userId) });
});

router.get('/profiles/:id', requireAuth, (req, res) => {
  const viewer = self(res);
  const target = String(req.params.id);
  const result = profile(target, viewer);
  if (!result || (viewer !== target && blocked(viewer, target))) { bad(res, 404, 'プロフィールが見つかりません。'); return; }
  const match = viewer === target ? undefined : matchBetween(viewer, target);
  res.json({ profile: result, visibleStage: viewer === target ? 4 : match ? grantedStage(match.id, target, viewer) : null });
});

router.get('/matches/:id/stage-consent', requireAuth, (req, res) => {
  const user = self(res);
  const matchId = String(req.params.id);
  if (!matchMember(matchId, user)) { bad(res, 404, 'マッチが見つかりません。'); return; }
  const other = (db.prepare('SELECT CASE WHEN user_a=? THEN user_b ELSE user_a END AS id FROM matches WHERE id=?').get(user, matchId) as { id: string }).id;
  const myGrant = db.prepare(`SELECT stage,expires_at AS expiresAt,created_at AS consentedAt FROM stage_grants
    WHERE match_id=? AND grantor_id=? AND grantee_id=? AND revoked_at IS NULL`).get(matchId, user, other);
  const theirGrant = db.prepare(`SELECT stage,expires_at AS expiresAt FROM stage_grants
    WHERE match_id=? AND grantor_id=? AND grantee_id=? AND revoked_at IS NULL`).get(matchId, other, user);
  res.json({ myGrant: myGrant ?? null, theirGrant: theirGrant ?? null, relationshipStage: visibleStage(matchId) });
});

router.put('/matches/:id/stage-consent', requireAuth, (req, res) => {
  const owner = self(res);
  const matchId = String(req.params.id);
  const stage = Number(req.body?.stage);
  const expiresAt = typeof req.body?.expiresAt === 'string' ? new Date(req.body.expiresAt) : new Date(NaN);
  if (!matchMember(matchId, owner) || !Number.isInteger(stage) || stage < 0 || stage > 4 ||
      Number.isNaN(expiresAt.getTime()) || expiresAt.getTime() <= Date.now() || expiresAt.getTime() > Date.now() + 30 * 86400000) {
    bad(res, 400, 'マッチ、公開段階、30日以内の有効期限を確認してください。'); return;
  }
  const other = (db.prepare('SELECT CASE WHEN user_a=? THEN user_b ELSE user_a END AS id FROM matches WHERE id=?').get(owner, matchId) as { id: string }).id;
  if (blocked(owner, other)) { bad(res, 403, 'ブロック中の相手には公開できません。'); return; }
  db.prepare(`INSERT INTO stage_grants(id,match_id,grantor_id,grantee_id,stage,expires_at,created_at,revoked_at)
    VALUES(?,?,?,?,?,?,?,NULL) ON CONFLICT(match_id,grantor_id,grantee_id) DO UPDATE SET stage=excluded.stage,
    expires_at=excluded.expires_at,created_at=excluded.created_at,revoked_at=NULL`)
    .run(id(), matchId, owner, other, stage, expiresAt.toISOString(), now());
  audit(owner, 'user', 'stage.consent.granted', 'match', matchId, { granteeId: other, stage, expiresAt: expiresAt.toISOString() });
  notify(other, 'stage_consent', 'プロフィール公開範囲が更新されました', 'マッチ相手が写真の公開範囲を更新しました。', { matchId });
  res.json({ grantedStage: stage, expiresAt: expiresAt.toISOString() });
});

router.delete('/matches/:id/stage-consent', requireAuth, (req, res) => {
  const owner = self(res);
  const matchId = String(req.params.id);
  if (!matchMember(matchId, owner)) { bad(res, 404, 'マッチが見つかりません。'); return; }
  const other = (db.prepare('SELECT CASE WHEN user_a=? THEN user_b ELSE user_a END AS id FROM matches WHERE id=?').get(owner, matchId) as { id: string }).id;
  db.prepare(`UPDATE stage_grants SET revoked_at=? WHERE match_id=? AND grantor_id=? AND grantee_id=? AND revoked_at IS NULL`)
    .run(now(), matchId, owner, other);
  audit(owner, 'user', 'stage.consent.revoked', 'match', matchId, { granteeId: other });
  notify(other, 'stage_consent_revoked', 'プロフィール公開が取り消されました', 'この相手の写真は表示されなくなりました。', { matchId });
  res.status(204).end();
});

router.post('/captures', requireAuth, requireNotLimited('posting'), rateLimit('capture', 12, 3600000), (req, res, next) => {
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

router.get('/captures/:id/image', requireAuth, (req, res, next) => {
  const viewer = self(res);
  const capture = db.prepare(`SELECT id,owner_id AS ownerId,stage,storage_key AS storageKey,media_type AS mediaType FROM captures WHERE id=?`)
    .get(String(req.params.id)) as { id: string; ownerId: string; stage: number; storageKey: string; mediaType: string } | undefined;
  if (!capture) { bad(res, 404, '画像が見つかりません。'); return; }
  if (capture.ownerId !== viewer) {
    if (blocked(viewer, capture.ownerId)) { bad(res, 404, '画像が見つかりません。'); return; }
    const match = matchBetween(viewer, capture.ownerId);
    const stage = match ? grantedStage(match.id, capture.ownerId, viewer) : null;
    if (stage === null || capture.stage > stage) { bad(res, 403, 'この画像はまだ公開されていないか、公開同意が期限切れです。'); return; }
  }
  res.setHeader('Content-Type', capture.mediaType);
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  db.prepare('INSERT INTO image_access_logs(id,capture_id,viewer_id,accessed_at) VALUES(?,?,?,?)').run(id(), capture.id, viewer, now());
  createReadStream(resolve(storage, capture.storageKey)).on('error', next).pipe(res);
});

router.get('/captures/:id/access-history', requireAuth, (req, res) => {
  const captureId = String(req.params.id);
  if (!db.prepare('SELECT 1 FROM captures WHERE id=? AND owner_id=?').get(captureId, self(res))) { bad(res, 404, '画像が見つかりません。'); return; }
  const history = db.prepare(`SELECT viewer_id AS viewerId,accessed_at AS accessedAt FROM image_access_logs
    WHERE capture_id=? ORDER BY accessed_at DESC LIMIT 200`).all(captureId);
  res.json({ history });
});

router.get('/discover', requireAuth, requireNotLimited('discovery'), (req, res) => {
  const viewer = self(res);
  const preferences = db.prepare(`SELECT relationship_goal AS goal,conversation_pace AS pace,
      preferred_classification AS classification,accepted_goals AS goals,accepted_paces AS paces
    FROM matching_preferences WHERE user_id=?`).get(viewer) as
    { goal: string; pace: string; classification: string | null; goals: string; paces: string } | undefined;
  const viewerGoal = preferences?.goal ?? 'undecided';
  const viewerPace = preferences?.pace ?? 'balanced';
  const acceptedGoals = new Set(JSON.parse(preferences?.goals ?? JSON.stringify(goalOptions)) as string[]);
  const acceptedPaces = new Set(JSON.parse(preferences?.paces ?? JSON.stringify(paceOptions)) as string[]);
  const filter = preferences?.classification;
  const viewerClassification = (db.prepare('SELECT throat_classification AS classification FROM profiles WHERE user_id=?').get(viewer) as { classification: string } | undefined)?.classification;
  const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 50);
  const rows = db.prepare(`SELECT p.user_id AS id,p.throat_classification AS classification,
      mp.relationship_goal AS goal,mp.conversation_pace AS pace,mp.accepted_goals AS goals,mp.accepted_paces AS paces,
      mp.preferred_classification AS preferredClassification,u.email,
      COALESCE(i.impressions,0) AS impressions,i.last_shown_at AS lastShown,
      COALESCE((SELECT SUM(global_i.impressions) FROM discovery_impressions global_i WHERE global_i.candidate_id=p.user_id),0) AS totalExposure
    FROM profiles p JOIN users u ON u.id=p.user_id
    LEFT JOIN matching_preferences mp ON mp.user_id=p.user_id
    LEFT JOIN discovery_impressions i ON i.viewer_id=? AND i.candidate_id=p.user_id
    WHERE p.user_id<>? AND u.status='active' AND p.throat_classification IN ('present','absent')
      AND NOT EXISTS(SELECT 1 FROM likes l WHERE l.from_user_id=? AND l.to_user_id=p.user_id)
      AND NOT EXISTS(SELECT 1 FROM matches m WHERE (m.user_a=? AND m.user_b=p.user_id) OR (m.user_b=? AND m.user_a=p.user_id))
      AND NOT EXISTS(SELECT 1 FROM blocks b WHERE (b.blocker_id=? AND b.blocked_id=p.user_id) OR (b.blocker_id=p.user_id AND b.blocked_id=?))
    ORDER BY totalExposure ASC,COALESCE(i.impressions,0) ASC,i.last_shown_at ASC,random()`).all(viewer, viewer, viewer, viewer, viewer, viewer, viewer) as
    { id: string; classification: string; goal: string | null; pace: string | null; goals: string | null; paces: string | null;
      preferredClassification: string | null; email: string; impressions: number; lastShown: string | null; totalExposure: number }[];
  const viewerEmail = (db.prepare('SELECT email FROM users WHERE id=?').get(viewer) as { email: string }).email;
  const viewerIdentifiers = new Set((db.prepare('SELECT contact_digest AS digest FROM user_contact_identifiers WHERE user_id=?').all(viewer) as { digest: string }[]).map(row => row.digest));
  if (process.env.CONTACT_HASH_KEY) viewerIdentifiers.add(contactDigest('email', viewerEmail));
  const viewerHiddenDigests = new Set((db.prepare('SELECT contact_digest AS digest FROM contact_hides WHERE user_id=?').all(viewer) as { digest: string }[]).map(row => row.digest));
  const eligible = rows.filter(candidate => {
    if (filter && candidate.classification !== filter) return false;
    if (candidate.preferredClassification && candidate.preferredClassification !== viewerClassification) return false;
    const candidateGoals = new Set(JSON.parse(candidate.goals ?? JSON.stringify(goalOptions)) as string[]);
    const candidatePaces = new Set(JSON.parse(candidate.paces ?? JSON.stringify(paceOptions)) as string[]);
    if (!acceptedGoals.has(candidate.goal ?? 'undecided') || !candidateGoals.has(viewerGoal)) return false;
    if (!acceptedPaces.has(candidate.pace ?? 'balanced') || !candidatePaces.has(viewerPace)) return false;
    if (process.env.CONTACT_HASH_KEY) {
      const candidateIdentifiers = new Set((db.prepare('SELECT contact_digest AS digest FROM user_contact_identifiers WHERE user_id=?').all(candidate.id) as { digest: string }[]).map(row => row.digest));
      candidateIdentifiers.add(contactDigest('email', candidate.email));
      if ([...candidateIdentifiers].some(digest => viewerHiddenDigests.has(digest))) return false;
      if ([...viewerIdentifiers].some(digest => db.prepare('SELECT 1 FROM contact_hides WHERE user_id=? AND contact_digest=?').get(candidate.id, digest))) return false;
    }
    return true;
  });
  const selected = eligible.slice(0, limit);
  const updateExposure = db.prepare(`INSERT INTO discovery_impressions(viewer_id,candidate_id,impressions,last_shown_at) VALUES(?,?,1,?)
    ON CONFLICT(viewer_id,candidate_id) DO UPDATE SET impressions=impressions+1,last_shown_at=excluded.last_shown_at`);
  for (const candidate of selected) updateExposure.run(viewer, candidate.id, now());
  const notice = eligible.length === 0 ? '条件に合う候補がいません。紹介条件を広げると候補が増える場合があります。'
    : eligible.length < 5 ? '現在の候補は少なめです。条件を広げると候補が増える場合があります。' : null;
  res.json({ profiles: selected.map(row => profile(row.id, viewer)).filter(Boolean), candidateCount: eligible.length, notice, paidPriority: false });
});

router.post('/likes', requireAuth, requireNotLimited('discovery'), rateLimit('likes', 80, 3600000), (req, res) => {
  const from = self(res);
  const to = input(req.body?.toUserId, 64);
  if (!to || from === to || !profile(to) || blocked(from, to)) { bad(res, 404, '対象ユーザーが見つからないか、いいねできません。'); return; }
  const inserted = db.prepare('INSERT OR IGNORE INTO likes(from_user_id,to_user_id,created_at) VALUES(?,?,?)').run(from, to, now());
  const reciprocal = db.prepare('SELECT 1 FROM likes WHERE from_user_id=? AND to_user_id=?').get(to, from);
  if (!reciprocal) {
    if (Number(inserted.changes)) notify(to, 'like', '新しいいいねがあります', 'プロフィールをチェックしてみましょう。', { userId: from });
    res.status(201).json({ matched: false }); return;
  }
  const [a, b] = from < to ? [from, to] : [to, from];
  const created = db.prepare('INSERT OR IGNORE INTO matches(id,user_a,user_b,created_at) VALUES(?,?,?,?)').run(id(), a, b, now());
  const matchId = matchBetween(from, to)?.id;
  if (Number(created.changes) && matchId) {
    notify(from, 'match', 'マッチしました', '新しいマッチが成立しました。', { matchId });
    notify(to, 'match', 'マッチしました', '新しいマッチが成立しました。', { matchId });
    audit(from, 'user', 'match.created', 'match', matchId, { otherUserId: to });
  }
  res.status(201).json({ matched: true, matchId });
});

router.get('/likes/received', requireAuth, (req, res) => {
  const user = self(res);
  const rows = db.prepare(`SELECT l.from_user_id AS userId,l.created_at AS createdAt FROM likes l
    WHERE l.to_user_id=? AND NOT EXISTS(SELECT 1 FROM likes x WHERE x.from_user_id=? AND x.to_user_id=l.from_user_id)
    ORDER BY l.created_at DESC LIMIT 100`).all(user, user) as { userId: string; createdAt: string }[];
  res.json({ likes: rows.map(row => ({ ...row, profile: profile(row.userId, user) })) });
});

router.get('/matches', requireAuth, (req, res) => {
  const user = self(res);
  const rows = db.prepare('SELECT id,user_a AS a,user_b AS b,created_at AS createdAt FROM matches WHERE user_a=? OR user_b=? ORDER BY created_at DESC').all(user, user) as
    { id: string; a: string; b: string; createdAt: string }[];
  res.json({ matches: rows.filter(row => !blocked(row.a, row.b)).map(row => {
    const other = row.a === user ? row.b : row.a;
    return { id: row.id, createdAt: row.createdAt, profile: profile(other, user), visibleStage: grantedStage(row.id, other, user) };
  }) });
});

router.get('/matches/:id/date-plans', requireAuth, (req, res) => {
  expirePrivacyShares();
  const user = self(res);
  const matchId = String(req.params.id);
  const other = otherMember(matchId, user);
  if (!other) { bad(res, 404, 'マッチが見つかりません。'); return; }
  if (blocked(user, other)) { bad(res, 403, 'ブロック中の相手とは予定を共有できません。'); return; }
  const members = db.prepare('SELECT user_a AS a FROM matches WHERE id=?').get(matchId) as { a: string };
  const plans = db.prepare(`SELECT id,match_id AS matchId,created_by AS createdBy,scheduled_at AS scheduledAt,
      area,location_ciphertext AS locationCiphertext,scope_a AS scopeA,scope_b AS scopeB,
      expires_a AS expiresA,expires_b AS expiresB,consented_a_at AS consentA,consented_b_at AS consentB,
      confirmed_a_at AS confirmA,confirmed_b_at AS confirmB,arrived_a_at AS arriveA,arrived_b_at AS arriveB,status
    FROM date_plans WHERE match_id=? ORDER BY created_at DESC LIMIT 30`).all(matchId) as DatePlanRow[];
  res.json({ plans: plans.map(plan => serializeDatePlan(plan, user, members.a)) });
});

const dateShareKeys = ['scheduledAt', 'area', 'exactLocation', 'arrival'];
function dateScope(value: unknown): Record<string, boolean> | null {
  if (!Array.isArray(value) || value.some(item => typeof item !== 'string' || !dateShareKeys.includes(item))) return null;
  const scope: Record<string, boolean> = {};
  for (const key of value as string[]) scope[key] = true;
  return scope;
}

function validDateExpiry(value: unknown, scheduledAt: Date): Date | null {
  if (typeof value !== 'string') return null;
  const expiry = new Date(value);
  if (Number.isNaN(expiry.getTime()) || expiry.getTime() <= Date.now() ||
      expiry.getTime() < scheduledAt.getTime() + 12 * 3600000 || expiry.getTime() > scheduledAt.getTime() + 24 * 3600000) return null;
  return expiry;
}

router.post('/matches/:id/date-plans', requireAuth, (req, res) => {
  const creator = self(res);
  const matchId = String(req.params.id);
  const other = otherMember(matchId, creator);
  const scheduledAt = typeof req.body?.scheduledAt === 'string' ? new Date(req.body.scheduledAt) : new Date(NaN);
  const area = input(req.body?.area, 120);
  const scope = dateScope(req.body?.shareScope);
  const expiry = validDateExpiry(req.body?.expiresAt, scheduledAt);
  const preciseLocation = input(req.body?.preciseLocation, 250);
  if (!other || blocked(creator, other)) { bad(res, 404, '有効なマッチが見つかりません。'); return; }
  if (Number.isNaN(scheduledAt.getTime()) || scheduledAt.getTime() <= Date.now() || scheduledAt.getTime() > Date.now() + 90 * 86400000 ||
      !area || !scope?.scheduledAt || !scope.area || !expiry) {
    bad(res, 400, '90日以内の予定、エリア、共有項目、共有期限を確認してください。'); return;
  }
  if (scope.exactLocation && !preciseLocation) { bad(res, 400, '正確な待ち合わせ場所の共有にはpreciseLocationが必要です。'); return; }
  let encrypted: string | null = null;
  if (preciseLocation) {
    try { encrypted = encryptLocation(preciseLocation); }
    catch { bad(res, 503, 'DATE_LOCATION_KEYが未設定または不正です。'); return; }
  }
  const members = db.prepare('SELECT user_a AS a FROM matches WHERE id=?').get(matchId) as { a: string };
  const side = creator === members.a ? 'a' : 'b';
  const planId = id();
  const timestamp = now();
  db.prepare(`INSERT INTO date_plans(id,match_id,created_by,scheduled_at,area,location_ciphertext,
    scope_${side},expires_${side},consented_${side}_at,confirmed_${side}_at,status,created_at,updated_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,'proposed',?,?)`)
    .run(planId, matchId, creator, scheduledAt.toISOString(), area, encrypted, JSON.stringify(scope), expiry.toISOString(), timestamp, timestamp, timestamp, timestamp);
  audit(creator, 'user', 'date_plan.created', 'date_plan', planId, { matchId, scheduledAt: scheduledAt.toISOString(), sharedKeys: Object.keys(scope) });
  notify(other, 'date_plan', '初回デートの予定案が届きました', '予定と共有内容を確認して、同意または再調整してください。', { matchId, planId });
  res.status(201).json({ id: planId, status: 'proposed', scheduledAt: scheduledAt.toISOString(), area, expiresAt: expiry.toISOString() });
});

router.patch('/matches/:id/date-plans/:planId/consent', requireAuth, (req, res) => {
  const user = self(res);
  const matchId = String(req.params.id);
  const planId = String(req.params.planId);
  const other = otherMember(matchId, user);
  if (!other || blocked(user, other)) { bad(res, 404, '予定が見つかりません。'); return; }
  const plan = db.prepare(`SELECT scheduled_at AS scheduledAt,location_ciphertext AS locationCiphertext,status FROM date_plans WHERE id=? AND match_id=?`)
    .get(planId, matchId) as { scheduledAt: string; locationCiphertext: string | null; status: string } | undefined;
  if (!plan || plan.status !== 'proposed') { bad(res, 404, '確認可能な予定案が見つかりません。'); return; }
  const scope = dateScope(req.body?.shareScope);
  const expiry = validDateExpiry(req.body?.expiresAt, new Date(plan.scheduledAt));
  const confirm = req.body?.confirm === true;
  if (!scope || (confirm && (!scope.scheduledAt || !scope.area)) || !expiry || (scope.exactLocation && !plan.locationCiphertext)) {
    bad(res, 400, '共有範囲・期限を確認してください。確定には日程とエリアの共有同意が必要です。'); return;
  }
  const members = db.prepare('SELECT user_a AS a,user_b AS b FROM matches WHERE id=?').get(matchId) as { a: string; b: string };
  const side = user === members.a ? 'a' : 'b';
  const timestamp = now();
  db.prepare(`UPDATE date_plans SET scope_${side}=?,expires_${side}=?,consented_${side}_at=?,confirmed_${side}_at=?,updated_at=? WHERE id=?`)
    .run(JSON.stringify(scope), expiry.toISOString(), timestamp, confirm ? timestamp : null, timestamp, planId);
  const refreshed = db.prepare('SELECT confirmed_a_at AS a,confirmed_b_at AS b,expires_a AS ea,expires_b AS eb FROM date_plans WHERE id=?')
    .get(planId) as { a: string | null; b: string | null; ea: string | null; eb: string | null };
  const mutuallyConfirmed = Boolean(refreshed.a && refreshed.b && refreshed.ea && refreshed.eb && Date.parse(refreshed.ea) > Date.now() && Date.parse(refreshed.eb) > Date.now());
  db.prepare('UPDATE date_plans SET status=?,updated_at=? WHERE id=?').run(mutuallyConfirmed ? 'confirmed' : 'proposed', timestamp, planId);
  audit(user, 'user', 'date_plan.consent.updated', 'date_plan', planId, { scope, expiresAt: expiry.toISOString(), confirm });
  notify(other, mutuallyConfirmed ? 'date_plan_confirmed' : 'date_plan_consent', mutuallyConfirmed ? '待ち合わせ予定が確定しました' : '共有同意が更新されました', mutuallyConfirmed ? '双方の予定が確認されました。' : '相手が共有範囲または予定の確認を更新しました。', { matchId, planId });
  res.json({ status: mutuallyConfirmed ? 'confirmed' : 'proposed', expiresAt: expiry.toISOString() });
});

router.post('/matches/:id/date-plans/:planId/reschedule', requireAuth, (req, res) => {
  const user = self(res);
  const matchId = String(req.params.id);
  const planId = String(req.params.planId);
  const other = otherMember(matchId, user);
  const scheduledAt = typeof req.body?.scheduledAt === 'string' ? new Date(req.body.scheduledAt) : new Date(NaN);
  const area = input(req.body?.area, 120);
  const scope = dateScope(req.body?.shareScope);
  const expiry = validDateExpiry(req.body?.expiresAt, scheduledAt);
  const preciseLocation = input(req.body?.preciseLocation, 250);
  const existing = db.prepare('SELECT status FROM date_plans WHERE id=? AND match_id=?').get(planId, matchId) as { status: string } | undefined;
  if (!other || blocked(user, other) || !existing || !['proposed', 'confirmed'].includes(existing.status)) { bad(res, 404, '再調整できる予定が見つかりません。'); return; }
  if (Number.isNaN(scheduledAt.getTime()) || scheduledAt.getTime() <= Date.now() || scheduledAt.getTime() > Date.now() + 90 * 86400000 ||
      !area || !scope?.scheduledAt || !scope.area || !expiry || (scope.exactLocation && !preciseLocation)) {
    bad(res, 400, '新しい予定、エリア、共有範囲、期限を確認してください。'); return;
  }
  let encrypted: string | null = null;
  if (preciseLocation) {
    try { encrypted = encryptLocation(preciseLocation); } catch { bad(res, 503, 'DATE_LOCATION_KEYが未設定または不正です。'); return; }
  }
  const members = db.prepare('SELECT user_a AS a,user_b AS b FROM matches WHERE id=?').get(matchId) as { a: string; b: string };
  const side = user === members.a ? 'a' : 'b';
  const otherSide = side === 'a' ? 'b' : 'a';
  const timestamp = now();
  db.prepare(`UPDATE date_plans SET created_by=?,scheduled_at=?,area=?,location_ciphertext=?,status='proposed',
      scope_${side}=?,expires_${side}=?,consented_${side}_at=?,confirmed_${side}_at=?,
      scope_${otherSide}='{}',expires_${otherSide}=NULL,consented_${otherSide}_at=NULL,confirmed_${otherSide}_at=NULL,
      arrived_a_at=NULL,arrived_b_at=NULL,updated_at=? WHERE id=?`)
    .run(user, scheduledAt.toISOString(), area, encrypted, JSON.stringify(scope), expiry.toISOString(), timestamp, timestamp, timestamp, planId);
  audit(user, 'user', 'date_plan.rescheduled', 'date_plan', planId, { scheduledAt: scheduledAt.toISOString() });
  notify(other, 'date_plan_rescheduled', '待ち合わせ予定が再調整されました', '新しい日程と共有内容を確認してください。', { matchId, planId });
  res.json({ id: planId, status: 'proposed', scheduledAt: scheduledAt.toISOString() });
});

router.post('/matches/:id/date-plans/:planId/cancel', requireAuth, (req, res) => {
  const user = self(res);
  const matchId = String(req.params.id);
  const planId = String(req.params.planId);
  const other = otherMember(matchId, user);
  if (!other || blocked(user, other)) { bad(res, 404, '予定が見つかりません。'); return; }
  const result = db.prepare(`UPDATE date_plans SET status='cancelled',location_ciphertext=NULL,area='',scope_a='{}',scope_b='{}',updated_at=?
    WHERE id=? AND match_id=? AND status IN ('proposed','confirmed')`).run(now(), planId, matchId);
  if (!Number(result.changes)) { bad(res, 404, '取り消し可能な予定が見つかりません。'); return; }
  audit(user, 'user', 'date_plan.cancelled', 'date_plan', planId, { matchId });
  notify(other, 'date_plan_cancelled', '待ち合わせ予定が取り消されました', 'マッチ相手が予定を取り消しました。', { matchId, planId });
  res.status(204).end();
});

router.post('/matches/:id/date-plans/:planId/arrival', requireAuth, (req, res) => {
  const user = self(res);
  const matchId = String(req.params.id);
  const planId = String(req.params.planId);
  const other = otherMember(matchId, user);
  const plan = db.prepare(`SELECT scheduled_at AS scheduledAt,scope_a AS scopeA,scope_b AS scopeB,
      expires_a AS expiresA,expires_b AS expiresB,confirmed_a_at AS confirmA,confirmed_b_at AS confirmB,status
    FROM date_plans WHERE id=? AND match_id=?`).get(planId, matchId) as
    { scheduledAt: string; scopeA: string; scopeB: string; expiresA: string | null; expiresB: string | null; confirmA: string | null; confirmB: string | null; status: string } | undefined;
  if (!other || blocked(user, other) || !plan || plan.status !== 'confirmed') { bad(res, 404, '確定済みの予定が見つかりません。'); return; }
  const timestamp = Date.now();
  const scheduled = Date.parse(plan.scheduledAt);
  if (timestamp < scheduled - 4 * 3600000 || timestamp > scheduled + 12 * 3600000) { bad(res, 409, '到着確認は予定時刻の4時間前から12時間後まで利用できます。'); return; }
  const scopes = [JSON.parse(plan.scopeA) as Record<string, boolean>, JSON.parse(plan.scopeB) as Record<string, boolean>];
  if (!plan.confirmA || !plan.confirmB || !plan.expiresA || !plan.expiresB || Date.parse(plan.expiresA) <= timestamp || Date.parse(plan.expiresB) <= timestamp || scopes.some(scope => scope.arrival !== true)) {
    bad(res, 403, '到着状況を共有する双方の同意が必要です。'); return;
  }
  const members = db.prepare('SELECT user_a AS a,user_b AS b FROM matches WHERE id=?').get(matchId) as { a: string; b: string };
  const side = user === members.a ? 'a' : 'b';
  const arrivalAt = now();
  db.prepare(`UPDATE date_plans SET arrived_${side}_at=?,updated_at=? WHERE id=?`).run(arrivalAt, arrivalAt, planId);
  audit(user, 'user', 'date_plan.arrived', 'date_plan', planId, { matchId });
  notify(other, 'date_arrival', '待ち合わせの到着確認', 'マッチ相手が到着を知らせました。', { matchId, planId });
  res.json({ arrivedAt: arrivalAt });
});

router.get('/matches/:id/messages', requireAuth, (req, res) => {
  const user = self(res);
  const matchId = String(req.params.id);
  const other = otherMember(matchId, user);
  if (!other) { bad(res, 404, 'マッチが見つかりません。'); return; }
  const members = db.prepare('SELECT user_a AS a,user_b AS b FROM matches WHERE id=?').get(matchId) as { a: string; b: string };
  if (blocked(members.a, members.b)) { bad(res, 403, 'このトークは利用できません。'); return; }
  const before = input(req.query.before, 40);
  const clear = db.prepare('SELECT cleared_at AS clearedAt FROM chat_clears WHERE match_id=? AND user_id=?').get(matchId, user) as { clearedAt: string } | undefined;
  const rows = db.prepare(`SELECT id,sender_id AS senderId,body,sent_at AS sentAt FROM messages
    WHERE match_id=? AND sent_at>? AND (?='' OR sent_at<?) ORDER BY sent_at DESC LIMIT 50`)
    .all(matchId, clear?.clearedAt ?? '', before, before) as object[];
  res.json({ messages: rows.reverse(), visibleStage: grantedStage(matchId, other, user), myGrantedStage: grantedStage(matchId, user, other), relationshipStage: visibleStage(matchId) });
});

router.delete('/matches/:id/messages', requireAuth, (req, res) => {
  const user = self(res);
  const matchId = String(req.params.id);
  if (!matchMember(matchId, user)) { bad(res, 404, 'マッチが見つかりません。'); return; }
  const clearedAt = new Date(Date.now() - 1).toISOString();
  db.prepare(`INSERT INTO chat_clears(match_id,user_id,cleared_at) VALUES(?,?,?)
    ON CONFLICT(match_id,user_id) DO UPDATE SET cleared_at=excluded.cleared_at`).run(matchId, user, clearedAt);
  audit(user, 'user', 'conversation.cleared', 'match', matchId);
  res.status(204).end();
});

router.post('/matches/:id/messages', requireAuth, requireNotLimited('messaging'), rateLimit('messages', 30, 60000), (req, res) => {
  const sender = self(res);
  const matchId = String(req.params.id);
  const body = input(req.body?.body, 2000);
  if (!matchMember(matchId, sender)) { bad(res, 404, 'マッチが見つかりません。'); return; }
  const members = db.prepare('SELECT user_a AS a,user_b AS b FROM matches WHERE id=?').get(matchId) as { a: string; b: string };
  if (blocked(members.a, members.b)) { bad(res, 403, 'このトークは利用できません。'); return; }
  if (!body) { bad(res, 400, 'メッセージを入力してください。'); return; }
  const message = { id: id(), senderId: sender, body, sentAt: now() };
  db.prepare('INSERT INTO messages(id,match_id,sender_id,body,sent_at) VALUES(?,?,?,?,?)').run(message.id, matchId, sender, body, message.sentAt);
  const recipient = members.a === sender ? members.b : members.a;
  const categories: string[] = [];
  if (/(https?:\/\/|www\.|[\w.-]+\.(com|net|org|jp)\b)/i.test(body)) categories.push('external_link');
  if (/(投資|暗号資産|仮想通貨|元本保証|絶対(に)?儲かる|副業|FX|出資|未公開株)/i.test(body)) categories.push('investment_solicitation');
  if (/(LINE|telegram|テレグラム|DMで|個人LINE)/i.test(body) && categories.length) categories.push('off_platform_contact');
  let safetyWarning: string | null = null;
  if (categories.length) {
    const flagId = id();
    db.prepare('INSERT INTO safety_flags(id,message_id,match_id,sender_id,categories_json,created_at) VALUES(?,?,?,?,?,?)')
      .run(flagId, message.id, matchId, sender, JSON.stringify(categories), now());
    notify(recipient, 'safety_warning', '注意が必要な可能性のあるメッセージ', '外部リンクや勧誘の可能性があります。個人情報や送金には注意してください。', { matchId });
    notify(sender, 'safety_review', 'メッセージを確認しています', '安全のため、メッセージが運営の確認対象になりました。', { matchId });
    safetyWarning = 'このメッセージには外部リンクまたは勧誘に関連する語句が含まれます。リンクを開いたり送金したりする前に相手を確認してください。';
    audit(sender, 'system', 'message.flagged', 'message', message.id, { categories });
  } else {
    notify(recipient, 'message', '新しいメッセージ', 'マッチ相手からメッセージが届きました。', { matchId });
  }
  res.status(201).json({ message, visibleStage: grantedStage(matchId, recipient, sender), myGrantedStage: grantedStage(matchId, sender, recipient), relationshipStage: visibleStage(matchId), safetyWarning });
});

router.get('/daily', requireAuth, (req, res) => {
  const user = self(res);
  const topic = db.prepare(`SELECT id,topic_date AS date,title,prompt FROM daily_topics WHERE active=1 AND topic_date<=?
    ORDER BY topic_date DESC LIMIT 1`).get(now().slice(0, 10)) as { id: string; date: string; title: string; prompt: string } | undefined;
  if (!topic) { res.json({ daily: null }); return; }
  const answer = db.prepare('SELECT id,answer,created_at AS createdAt FROM daily_answers WHERE topic_id=? AND user_id=?').get(topic.id, user);
  res.json({ daily: { ...topic, answer: answer ?? null, completed: Boolean(answer) } });
});

router.get('/daily/answers', requireAuth, (req, res) => {
  const rows = db.prepare(`SELECT a.id,a.answer,a.created_at AS createdAt,d.id AS topicId,d.title,d.topic_date AS date
    FROM daily_answers a JOIN daily_topics d ON d.id=a.topic_id WHERE a.user_id=? ORDER BY d.topic_date DESC LIMIT 100`).all(self(res));
  res.json({ answers: rows });
});

router.post('/daily/answers', requireAuth, requireNotLimited('posting'), rateLimit('daily-answers', 10, 3600000), (req, res) => {
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

router.post('/users/:id/block', requireAuth, (req, res) => {
  const blocker = self(res);
  const blockedId = String(req.params.id);
  if (blocker === blockedId || !db.prepare('SELECT 1 FROM users WHERE id=?').get(blockedId)) { bad(res, 404, 'ユーザーが見つかりません。'); return; }
  db.prepare('INSERT OR IGNORE INTO blocks(blocker_id,blocked_id,created_at) VALUES(?,?,?)').run(blocker, blockedId, now());
  audit(blocker, 'user', 'user.blocked', 'user', blockedId);
  res.status(204).end();
});

router.delete('/users/:id/block', requireAuth, (req, res) => {
  db.prepare('DELETE FROM blocks WHERE blocker_id=? AND blocked_id=?').run(self(res), String(req.params.id));
  res.status(204).end();
});

router.post('/users/:id/reports', requireAuth, rateLimit('reports', 20, 86400000), (req, res) => {
  const reporter = self(res);
  const target = String(req.params.id);
  const reason = input(req.body?.reason, 80);
  if (reporter === target || !db.prepare('SELECT 1 FROM users WHERE id=?').get(target) || !reason) { bad(res, 400, '通報対象と理由を確認してください。'); return; }
  const reportId = id();
  db.prepare('INSERT INTO reports(id,reporter_id,reported_id,reason,details,created_at) VALUES(?,?,?,?,?,?)')
    .run(reportId, reporter, target, reason, input(req.body?.details, 1000), now());
  audit(reporter, 'user', 'report.created', 'report', reportId, { reportedUserId: target, reason });
  res.status(201).json({ id: reportId, status: 'open' });
});

router.get('/admin/users', requireAdmin('users'), (req, res) => {
  const q = `%${input(req.query.q, 80)}%`;
  const users = db.prepare(`SELECT u.id,u.email,u.status,u.created_at AS createdAt,
      p.display_name AS displayName,p.throat_classification AS throatClassification
    FROM users u LEFT JOIN profiles p ON p.user_id=u.id
    WHERE u.email LIKE ? OR p.display_name LIKE ? ORDER BY u.created_at DESC LIMIT 100`).all(q, q);
  res.json({ users });
});

router.patch('/admin/users/:id/status', requireAdmin('users'), (req, res) => {
  const status = req.body?.status;
  if (!['active', 'suspended'].includes(status)) { bad(res, 400, 'statusはactiveまたはsuspendedを指定してください。'); return; }
  const target = String(req.params.id);
  const prior = db.prepare('SELECT status FROM users WHERE id=?').get(target) as { status: string } | undefined;
  const result = db.prepare('UPDATE users SET status=? WHERE id=?').run(status, target);
  if (!Number(result.changes)) { bad(res, 404, 'ユーザーが見つかりません。'); return; }
  if (status === 'suspended') {
    db.prepare('DELETE FROM sessions WHERE user_id=?').run(target);
    db.prepare('DELETE FROM push_devices WHERE user_id=?').run(target);
    if (prior?.status !== 'suspended') {
      db.prepare(`INSERT INTO user_limits(id,user_id,scope,reason,created_by,created_at,expires_at)
        VALUES(?,?,'all',?,?,?,NULL)`).run(id(), target, input(req.body?.reason, 300) || '運営によるアカウント一時停止', 'users_admin', now());
    }
  } else {
    db.prepare(`UPDATE user_limits SET revoked_at=? WHERE user_id=? AND scope='all' AND created_by='users_admin' AND revoked_at IS NULL`).run(now(), target);
  }
  audit(null, 'users_admin', 'user.status.changed', 'user', target, { status });
  notify(target, 'account_status', status === 'suspended' ? 'アカウントが一時停止されました' : 'アカウントの利用が再開されました',
    status === 'suspended' ? '運営にお問い合わせください。異議申し立ても利用できます。' : '再度ログインできます。');
  res.json({ userId: target, status });
});

router.patch('/admin/users/:id/classification', requireAdmin('users'), (req, res) => {
  const classification = req.body?.throatClassification;
  if (!['present', 'absent', 'pending'].includes(classification)) { bad(res, 400, '分類はpresent、absent、pendingです。'); return; }
  const result = db.prepare('UPDATE profiles SET throat_classification=?,updated_at=? WHERE user_id=?').run(classification, now(), String(req.params.id));
  if (!Number(result.changes)) { bad(res, 404, 'プロフィールが見つかりません。'); return; }
  audit(null, 'users_admin', 'profile.classified', 'user', String(req.params.id), { classification });
  res.json({ throatClassification: classification });
});

router.put('/admin/users/:id/contact-identifiers', requireAdmin('users'), (req, res) => {
  const userId = String(req.params.id);
  const kind = req.body?.type;
  const value = input(req.body?.value, 254);
  if (!process.env.CONTACT_HASH_KEY) { bad(res, 503, 'CONTACT_HASH_KEYが未設定です。'); return; }
  if (!db.prepare('SELECT 1 FROM users WHERE id=?').get(userId) || !['email', 'phone'].includes(kind) || !value || req.body?.verified !== true) {
    bad(res, 400, '確認済みのemailまたはphone識別子を指定してください。'); return;
  }
  if (kind === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) { bad(res, 400, 'メールアドレスを確認してください。'); return; }
  if (kind === 'phone' && (value.replace(/\D/g, '').length < 8 || value.replace(/\D/g, '').length > 15)) { bad(res, 400, '電話番号を確認してください。'); return; }
  const digest = contactDigest(kind, value);
  db.prepare(`INSERT INTO user_contact_identifiers(user_id,kind,contact_digest,verified_at,created_at) VALUES(?,?,?,?,?)
    ON CONFLICT(user_id,kind,contact_digest) DO UPDATE SET verified_at=excluded.verified_at`)
    .run(userId, kind, digest, now(), now());
  audit(null, 'users_admin', 'contact_identifier.verified', 'user', userId, { type: kind, digest });
  res.status(201).json({ userId, type: kind, storedAsDigest: true });
});

router.delete('/admin/users/:id/contact-identifiers', requireAdmin('users'), (req, res) => {
  const userId = String(req.params.id);
  const kind = req.body?.type;
  const value = input(req.body?.value, 254);
  if (!process.env.CONTACT_HASH_KEY || !['email', 'phone'].includes(kind) || !value) { bad(res, 400, '連絡先の種類と値を指定してください。'); return; }
  const digest = contactDigest(kind, value);
  db.prepare('DELETE FROM user_contact_identifiers WHERE user_id=? AND kind=? AND contact_digest=?').run(userId, kind, digest);
  audit(null, 'users_admin', 'contact_identifier.deleted', 'user', userId, { type: kind, digest });
  res.status(204).end();
});

router.get('/admin/daily', requireAdmin('content'), (req, res) => {
  res.json({ topics: db.prepare('SELECT id,topic_date AS date,title,prompt,active FROM daily_topics ORDER BY topic_date DESC LIMIT 180').all() });
});

router.post('/admin/daily', requireAdmin('content'), (req, res) => {
  const date = input(req.body?.date, 10);
  const title = input(req.body?.title, 120);
  const prompt = input(req.body?.prompt, 1000);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !title || !prompt) { bad(res, 400, 'date、title、promptを指定してください。'); return; }
  const topicId = id();
  try {
    db.prepare('INSERT INTO daily_topics(id,topic_date,title,prompt,created_at,created_by) VALUES(?,?,?,?,?,?)').run(topicId, date, title, prompt, now(), 'admin');
    audit(null, 'content_admin', 'daily.created', 'daily_topic', topicId, { date });
    const eligible = db.prepare(`SELECT id FROM users WHERE status='active'`).all() as { id: string }[];
    for (const user of eligible) notify(user.id, 'daily', '今日のデイリー課題', '新しい話題が追加されました。', { topicId });
    res.status(201).json({ id: topicId, date, title, prompt, active: true });
  } catch { bad(res, 409, 'この日付の課題は登録済みです。'); }
});

router.patch('/admin/daily/:id', requireAdmin('content'), (req, res) => {
  if (typeof req.body?.active !== 'boolean') { bad(res, 400, 'activeにtrueまたはfalseを指定してください。'); return; }
  const result = db.prepare('UPDATE daily_topics SET active=? WHERE id=?').run(req.body.active ? 1 : 0, String(req.params.id));
  if (!Number(result.changes)) { bad(res, 404, '課題が見つかりません。'); return; }
  audit(null, 'content_admin', 'daily.active.changed', 'daily_topic', String(req.params.id), { active: req.body.active });
  res.json({ id: req.params.id, active: req.body.active });
});

router.get('/admin/reports', requireAdmin('safety'), (req, res) => {
  const status = input(req.query.status, 20) || 'open';
  if (!['open', 'reviewing', 'resolved', 'dismissed'].includes(status)) { bad(res, 400, '不正なstatusです。'); return; }
  res.json({ reports: db.prepare(`SELECT id,reporter_id AS reporterId,reported_id AS reportedId,reason,details,status,created_at AS createdAt
    FROM reports WHERE status=? ORDER BY created_at LIMIT 200`).all(status) });
});

router.patch('/admin/reports/:id', requireAdmin('safety'), (req, res) => {
  const status = req.body?.status;
  if (!['reviewing', 'resolved', 'dismissed'].includes(status)) { bad(res, 400, '不正なstatusです。'); return; }
  const report = db.prepare('SELECT reporter_id AS reporterId FROM reports WHERE id=?').get(String(req.params.id)) as { reporterId: string } | undefined;
  const result = db.prepare('UPDATE reports SET status=?,reviewed_at=?,reviewed_by=? WHERE id=?').run(status, now(), 'admin', String(req.params.id));
  if (!Number(result.changes)) { bad(res, 404, '通報が見つかりません。'); return; }
  audit(null, 'safety_admin', 'report.reviewed', 'report', String(req.params.id), { status });
  if (report) notify(report.reporterId, 'report_update', '通報の対応状況が更新されました', `現在の状態: ${status}`);
  res.json({ id: req.params.id, status });
});

router.get('/admin/safety-flags', requireAdmin('safety'), (req, res) => {
  const status = input(req.query.status, 20) || 'open';
  if (!['open', 'reviewing', 'resolved', 'dismissed'].includes(status)) { bad(res, 400, '不正なstatusです。'); return; }
  const flags = db.prepare(`SELECT f.id,f.message_id AS messageId,f.match_id AS matchId,f.sender_id AS senderId,
      f.categories_json AS categories,f.status,f.created_at AS createdAt,m.body
    FROM safety_flags f LEFT JOIN messages m ON m.id=f.message_id
    WHERE f.status=? ORDER BY f.created_at DESC LIMIT 200`).all(status) as
    { id: string; messageId: string; matchId: string; senderId: string; categories: string; status: string; createdAt: string; body: string | null }[];
  res.json({ flags: flags.map(flag => ({ ...flag, categories: JSON.parse(flag.categories) })) });
});

router.patch('/admin/safety-flags/:id', requireAdmin('safety'), (req, res) => {
  const decision = req.body?.decision;
  const status = decision === 'dismiss' ? 'dismissed' : 'resolved';
  if (!['warn', 'remove', 'restrict', 'dismiss'].includes(decision)) { bad(res, 400, 'decisionはwarn、remove、restrict、dismissです。'); return; }
  const flag = db.prepare('SELECT sender_id AS senderId,message_id AS messageId,status FROM safety_flags WHERE id=?').get(String(req.params.id)) as
    { senderId: string; messageId: string; status: string } | undefined;
  if (!flag) { bad(res, 404, '安全確認記録が見つかりません。'); return; }
  if (!['open', 'reviewing'].includes(flag.status)) { bad(res, 409, 'この安全確認はすでに対応済みです。'); return; }
  let limitId: string | null = null;
  if (decision === 'restrict') {
    const scope = req.body?.scope;
    if (!['messaging', 'discovery', 'posting', 'all'].includes(scope)) { bad(res, 400, '利用制限のscopeを指定してください。'); return; }
    const expiresAt = typeof req.body?.expiresAt === 'string' ? new Date(req.body.expiresAt) : null;
    if (!expiresAt || Number.isNaN(expiresAt.getTime()) || expiresAt.getTime() <= Date.now() || expiresAt.getTime() > Date.now() + 30 * 86400000) {
      bad(res, 400, '30日以内の利用制限期限を指定してください。'); return;
    }
    limitId = id();
    db.prepare('INSERT INTO user_limits(id,user_id,scope,reason,created_by,created_at,expires_at) VALUES(?,?,?,?,?,?,?)')
      .run(limitId, flag.senderId, scope, input(req.body?.reason, 300) || 'メッセージの安全確認', 'safety_admin', now(), expiresAt.toISOString());
    notify(flag.senderId, 'account_restriction', '一部機能が一時制限されました', '理由と期限を確認し、必要であれば異議申し立てを行ってください。');
  }
  if (decision === 'remove') db.prepare('DELETE FROM messages WHERE id=?').run(flag.messageId);
  db.prepare(`UPDATE safety_flags SET status=?,reviewed_at=?,reviewed_by=?,decision=? WHERE id=?`)
    .run(status, now(), 'safety_admin', decision, String(req.params.id));
  audit(null, 'safety_admin', 'safety_flag.reviewed', 'safety_flag', String(req.params.id), { decision, limitId });
  if (decision !== 'restrict') notify(flag.senderId, 'safety_review', 'メッセージの安全確認が完了しました', decision === 'dismiss' ? '確認の結果、対応は不要と判断されました。' : '運営による確認が完了しました。');
  res.json({ id: req.params.id, status, decision, limitId });
});

router.post('/appeals', requireAppealAuth, rateLimit('appeals', 5, 3600000), (req, res) => {
  const user = self(res);
  const reason = input(req.body?.reason, 1000);
  let limitId = input(req.body?.limitId, 64) || null;
  if (!reason) { bad(res, 400, '異議申し立ての理由を入力してください。'); return; }
  if (!limitId) {
    const accountLimit = db.prepare(`SELECT id FROM user_limits WHERE user_id=? AND scope='all' AND revoked_at IS NULL
      AND (expires_at IS NULL OR expires_at>?) ORDER BY created_at DESC LIMIT 1`).get(user, now()) as { id: string } | undefined;
    limitId = accountLimit?.id ?? null;
  }
  if (limitId && !db.prepare(`SELECT 1 FROM user_limits WHERE id=? AND user_id=? AND revoked_at IS NULL`).get(limitId, user)) {
    bad(res, 404, '対象の利用制限が見つかりません。'); return;
  }
  if (limitId && db.prepare(`SELECT 1 FROM appeals WHERE limit_id=? AND user_id=? AND status='pending'`).get(limitId, user)) {
    bad(res, 409, 'この利用制限への申し立ては受付済みです。'); return;
  }
  const appealId = id();
  db.prepare('INSERT INTO appeals(id,user_id,limit_id,reason,created_at) VALUES(?,?,?,?,?)').run(appealId, user, limitId, reason, now());
  audit(user, 'user', 'appeal.created', 'appeal', appealId, { limitId });
  res.status(201).json({ id: appealId, status: 'pending' });
});

router.get('/appeals', requireAppealAuth, (req, res) => {
  const appeals = db.prepare(`SELECT id,limit_id AS limitId,reason,status,created_at AS createdAt,
      reviewed_at AS reviewedAt,review_note AS reviewNote FROM appeals WHERE user_id=? ORDER BY created_at DESC LIMIT 50`).all(self(res));
  res.json({ appeals });
});

router.get('/admin/appeals', requireAdmin('safety'), (req, res) => {
  const appeals = db.prepare(`SELECT a.id,a.user_id AS userId,u.email,a.limit_id AS limitId,a.reason,a.status,a.created_at AS createdAt
    FROM appeals a JOIN users u ON u.id=a.user_id WHERE a.status='pending' ORDER BY a.created_at LIMIT 200`).all();
  res.json({ appeals });
});

router.patch('/admin/appeals/:id', requireAdmin('safety'), (req, res) => {
  const status = req.body?.status;
  if (!['approved', 'rejected'].includes(status)) { bad(res, 400, 'statusはapprovedまたはrejectedです。'); return; }
  const appeal = db.prepare('SELECT user_id AS userId,limit_id AS limitId FROM appeals WHERE id=? AND status=?').get(String(req.params.id), 'pending') as
    { userId: string; limitId: string | null } | undefined;
  if (!appeal) { bad(res, 404, '確認待ちの申し立てが見つかりません。'); return; }
  const timestamp = now();
  db.prepare('UPDATE appeals SET status=?,reviewed_at=?,reviewed_by=?,review_note=? WHERE id=?')
    .run(status, timestamp, 'safety_admin', input(req.body?.reviewNote, 500), String(req.params.id));
  if (status === 'approved' && appeal.limitId) {
    const limit = db.prepare('SELECT scope,created_by FROM user_limits WHERE id=?').get(appeal.limitId) as { scope: string; created_by: string } | undefined;
    db.prepare('UPDATE user_limits SET revoked_at=? WHERE id=?').run(timestamp, appeal.limitId);
    if (limit?.scope === 'all' && limit.created_by === 'users_admin') db.prepare("UPDATE users SET status='active' WHERE id=?").run(appeal.userId);
  }
  audit(null, 'safety_admin', 'appeal.reviewed', 'appeal', String(req.params.id), { status, limitId: appeal.limitId });
  notify(appeal.userId, 'appeal_result', '異議申し立ての結果', status === 'approved' ? '申し立てが認められました。' : '申し立ての確認が完了しました。');
  res.json({ id: req.params.id, status });
});

router.post('/admin/users/:id/limits', requireAdmin('safety'), (req, res) => {
  const target = String(req.params.id);
  const scope = req.body?.scope;
  const reason = input(req.body?.reason, 300);
  const expiry = typeof req.body?.expiresAt === 'string' ? new Date(req.body.expiresAt) : null;
  if (!db.prepare('SELECT 1 FROM users WHERE id=?').get(target) || !['messaging', 'discovery', 'posting', 'all'].includes(scope) || !reason ||
      (expiry && (Number.isNaN(expiry.getTime()) || expiry.getTime() <= Date.now() || expiry.getTime() > Date.now() + 30 * 86400000))) {
    bad(res, 400, '対象ユーザー、scope、理由、30日以内の期限を確認してください。'); return;
  }
  const limitId = id();
  db.prepare('INSERT INTO user_limits(id,user_id,scope,reason,created_by,created_at,expires_at) VALUES(?,?,?,?,?,?,?)')
    .run(limitId, target, scope, reason, 'safety_admin', now(), expiry?.toISOString() ?? null);
  audit(null, 'safety_admin', 'user.limit.created', 'user_limit', limitId, { userId: target, scope, expiresAt: expiry?.toISOString() ?? null });
  notify(target, 'account_restriction', '一部機能が制限されました', '理由と期限を確認し、必要であれば異議申し立てを行ってください。');
  res.status(201).json({ id: limitId, userId: target, scope, expiresAt: expiry?.toISOString() ?? null });
});

router.delete('/admin/users/:id/limits/:limitId', requireAdmin('safety'), (req, res) => {
  const result = db.prepare('UPDATE user_limits SET revoked_at=? WHERE id=? AND user_id=? AND revoked_at IS NULL')
    .run(now(), String(req.params.limitId), String(req.params.id));
  if (!Number(result.changes)) { bad(res, 404, '有効な利用制限が見つかりません。'); return; }
  audit(null, 'safety_admin', 'user.limit.revoked', 'user_limit', String(req.params.limitId), { userId: String(req.params.id) });
  notify(String(req.params.id), 'account_restriction', '利用制限が解除されました', '制限が解除されました。');
  res.status(204).end();
});

router.get('/admin/image-access', requireAdmin('audit'), (req, res) => {
  res.json({ logs: db.prepare(`SELECT l.capture_id AS captureId,c.owner_id AS ownerId,l.viewer_id AS viewerId,l.accessed_at AS accessedAt
    FROM image_access_logs l JOIN captures c ON c.id=l.capture_id ORDER BY l.accessed_at DESC LIMIT 500`).all() });
});

router.get('/admin/audit', requireAdmin('audit'), (req, res) => {
  const targetId = input(req.query.targetId, 80);
  const entries = targetId
    ? db.prepare(`SELECT id,actor_id AS actorId,actor_role AS actorRole,action,target_type AS targetType,target_id AS targetId,
        metadata_json AS metadata,created_at AS createdAt FROM audit_logs WHERE target_id=? ORDER BY created_at DESC LIMIT 200`).all(targetId)
    : db.prepare(`SELECT id,actor_id AS actorId,actor_role AS actorRole,action,target_type AS targetType,target_id AS targetId,
        metadata_json AS metadata,created_at AS createdAt FROM audit_logs ORDER BY created_at DESC LIMIT 200`).all();
  res.json({ entries });
});

router.get('/admin/operations/summary', requireAdmin('audit'), (req, res) => {
  const count = (sql: string) => Number((db.prepare(sql).get() as { count: number }).count);
  res.json({
    openReports: count("SELECT COUNT(*) AS count FROM reports WHERE status IN ('open','reviewing')"),
    openSafetyFlags: count("SELECT COUNT(*) AS count FROM safety_flags WHERE status IN ('open','reviewing')"),
    pendingAppeals: count("SELECT COUNT(*) AS count FROM appeals WHERE status='pending'"),
    queuedPushNotifications: count("SELECT COUNT(*) AS count FROM push_jobs WHERE status='queued'"),
    failedPushNotifications: count("SELECT COUNT(*) AS count FROM push_jobs WHERE status='failed'"),
  });
});

export const apiErrorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  console.error(error);
  if (!res.headersSent) res.status(500).json({ error: 'サーバー内部でエラーが発生しました。' });
};
