import { createCipheriv, createDecipheriv, createHmac, randomBytes } from 'node:crypto';

export function contactDigest(type: 'email' | 'phone', value: string): string {
  const key = process.env.CONTACT_HASH_KEY;
  if (!key) throw new Error('CONTACT_HASH_KEY is not configured');
  const normalized = type === 'email'
    ? value.trim().toLowerCase()
    : value.replace(/[^0-9]/g, '');
  return createHmac('sha256', key).update(`${type}:${normalized}`).digest('hex');
}

function dateKey(): Buffer {
  const key = process.env.DATE_LOCATION_KEY;
  if (!key) throw new Error('DATE_LOCATION_KEY is not configured');
  const decoded = Buffer.from(key, 'base64');
  if (decoded.length !== 32) throw new Error('DATE_LOCATION_KEY must be a base64 encoded 32-byte key');
  return decoded;
}

export function encryptLocation(value: string): string {
  const nonce = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', dateKey(), nonce);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return [nonce, cipher.getAuthTag(), encrypted].map(part => part.toString('base64url')).join('.');
}

export function decryptLocation(value: string): string {
  const [nonceText, tagText, encryptedText] = value.split('.');
  if (!nonceText || !tagText || !encryptedText) throw new Error('Invalid encrypted location');
  const decipher = createDecipheriv('aes-256-gcm', dateKey(), Buffer.from(nonceText, 'base64url'));
  decipher.setAuthTag(Buffer.from(tagText, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(encryptedText, 'base64url')), decipher.final()]).toString('utf8');
}
