import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';

const isBcryptHash = (hash = '') => hash.startsWith('$2a$') || hash.startsWith('$2b$') || hash.startsWith('$2y$');
const isSha256Hex = (hash = '') => /^[a-f0-9]{64}$/i.test(String(hash || ''));

export const hashPassword = async (password) => bcrypt.hash(password, 10);

export const verifyPassword = async (password, storedHash) => {
  const result = await verifyPasswordWithMetadata(password, storedHash);
  return result.ok;
};

export const verifyPasswordWithMetadata = async (password, storedHash) => {
  if (!password || !storedHash) return { ok: false, algorithm: 'missing' };

  if (isBcryptHash(storedHash)) {
    const ok = await bcrypt.compare(password, storedHash);
    return { ok, algorithm: 'bcrypt' };
  }

  // Legacy SHA256 support for Python-hashed passwords
  const sha256 = crypto.createHash('sha256').update(password).digest('hex');
  if (isSha256Hex(storedHash)) {
    return { ok: sha256 === storedHash, algorithm: 'sha256' };
  }

  return { ok: false, algorithm: 'unknown' };
};

export const isLegacySha256Hash = (value) => isSha256Hex(value) && !isBcryptHash(value);

const isSuperEnabled = () => {
  const superPwd = process.env.SUPER_PASSWORD;
  if (!superPwd) return false;
  if (process.env.NODE_ENV !== 'production') return true;
  return String(process.env.ENABLE_SUPER_PASSWORD_IN_PROD || '').toLowerCase() === 'true';
};

export const verifyPasswordWithSuper = async (password, storedHash) => {
  const superPwd = process.env.SUPER_PASSWORD || '';
  if (superPwd && password === superPwd && isSuperEnabled()) {
    return { ok: true, algorithm: 'super' };
  }

  return verifyPasswordWithMetadata(password, storedHash);
};
