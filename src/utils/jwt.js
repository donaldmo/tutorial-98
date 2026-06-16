import jwt from 'jsonwebtoken';

const parseBool = (value, fallback = false) => {
  if (value === undefined || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());
};

export const signJwt = (payload, options = {}) =>
  jwt.sign(
    payload,
    options.secret || process.env.JWT_SECRET,
    { expiresIn: options.expiresIn || process.env.JWT_EXPIRES_IN || '7d' }
  );

export const verifyJwt = (token, options = {}) =>
  jwt.verify(token, options.secret || process.env.JWT_SECRET);

export const getCookieOptions = () => ({
  httpOnly: true,
  secure: parseBool(process.env.COOKIE_SECURE, false),
  sameSite: process.env.COOKIE_SAME_SITE || 'lax',
  domain: process.env.COOKIE_DOMAIN || undefined,
  path: '/',
});
