import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import type { NextFunction, Request, Response } from 'express';
import { db } from './db.js';

const scrypt = promisify(scryptCallback);
export const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString('hex');
  const key = await scrypt(password, salt, 64) as Buffer;
  return `scrypt$${salt}$${key.toString('hex')}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, salt, hash] = stored.split('$');
  if (scheme !== 'scrypt' || !salt || !hash) return false;
  const actual = await scrypt(password, salt, 64) as Buffer;
  const expected = Buffer.from(hash, 'hex');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function createSession(userId: string): string {
  const token = randomBytes(32).toString('base64url');
  const created = new Date();
  db.prepare('INSERT INTO sessions(token_hash,user_id,expires_at,created_at) VALUES(?,?,?,?)')
    .run(sha256(token), userId, new Date(created.getTime() + 30 * 86400000).toISOString(), created.toISOString());
  return token;
}

export function requireAuth(_request: Request, response: Response, next: NextFunction): void {
  const token = _request.header('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) { response.status(401).json({ error: '認証が必要です。' }); return; }
  const session = db.prepare(`SELECT s.user_id AS userId,u.status FROM sessions s
    JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>?`)
    .get(sha256(token), new Date().toISOString()) as { userId: string; status: string } | undefined;
  if (!session || session.status !== 'active') { response.status(401).json({ error: 'セッションが無効か期限切れです。' }); return; }
  response.locals.userId = session.userId;
  next();
}

export function requireAgeApproved(_request: Request, response: Response, next: NextFunction): void {
  const row = db.prepare('SELECT status FROM age_verifications WHERE user_id=?').get(response.locals.userId) as { status: string } | undefined;
  if (row?.status !== 'approved') {
    response.status(403).json({ error: '年齢確認の承認後に利用できます。', ageVerification: row?.status ?? 'unsubmitted' });
    return;
  }
  next();
}

const limits = new Map<string, { count: number; resetAt: number }>();
export function rateLimit(scope: string, max: number, intervalMs: number) {
  return (request: Request, response: Response, next: NextFunction): void => {
    const key = `${scope}:${request.ip ?? 'unknown'}`;
    const now = Date.now();
    const current = limits.get(key);
    if (!current || current.resetAt <= now) limits.set(key, { count: 1, resetAt: now + intervalMs });
    else if (current.count >= max) { response.status(429).json({ error: 'リクエスト上限に達しました。時間をおいてお試しください。' }); return; }
    else current.count += 1;
    next();
  };
}

export function requireAdmin(request: Request, response: Response, next: NextFunction): void {
  const expected = process.env.ADMIN_API_KEY ?? '';
  const supplied = request.header('x-admin-key') ?? '';
  if (!expected) { response.status(503).json({ error: 'ADMIN_API_KEYが未設定のため運営APIは無効です。' }); return; }
  const a = Buffer.from(expected);
  const b = Buffer.from(supplied);
  if (a.length !== b.length || !timingSafeEqual(a, b)) { response.status(401).json({ error: '運営認証に失敗しました。' }); return; }
  next();
}
