import crypto from 'node:crypto';
import 'dotenv/config';

const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32;

const getKey = () => {
  const raw = process.env.ENCRYPTION_KEY || '';
  if (!raw) throw new Error('ENCRYPTION_KEY is not set in .env');
  return crypto.createHash('sha256').update(raw).digest();
};

/**
 * Encrypt a plaintext string with AES-256-GCM.
 * Returns "iv_hex:tag_hex:encrypted_hex" or null if input is falsy.
 */
export const encrypt = (plaintext) => {
  if (!plaintext) return null;
  const key = getKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`;
};

/**
 * Decrypt a ciphertext string produced by encrypt().
 * Returns the original plaintext or null if input is falsy.
 */
export const decrypt = (ciphertext) => {
  if (!ciphertext) return null;
  const key = getKey();
  const parts = String(ciphertext).split(':');
  if (parts.length !== 3) throw new Error('Invalid ciphertext format');
  const [ivHex, tagHex, encryptedHex] = parts;
  const iv = Buffer.from(ivHex, 'hex');
  const tag = Buffer.from(tagHex, 'hex');
  const encrypted = Buffer.from(encryptedHex, 'hex');
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  return decipher.update(encrypted, undefined, 'utf8') + decipher.final('utf8');
};
