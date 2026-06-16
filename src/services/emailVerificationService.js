import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import AuthToken from '../models/AuthToken.js';
import { signJwt } from '../utils/jwt.js';
import { sendVerificationEmail } from './emailService.js';

const PURPOSE_SECRET = process.env.JWT_PURPOSE_SECRET || process.env.JWT_SECRET;
const VERIFY_EMAIL_KIND = 'verify_email';

const normalizedEmail = (email = '') => String(email).toLowerCase().trim();

const buildVerificationToken = ({ sub, email, organisationId = null }) => {
  const jti = crypto.randomUUID();
  const payload = {
    sub: String(sub),
    purpose: VERIFY_EMAIL_KIND,
    email: normalizedEmail(email),
    jti,
    organisation_id: organisationId ? String(organisationId) : null,
  };

  const token = signJwt(payload, { secret: PURPOSE_SECRET, expiresIn: process.env.VERIFY_EMAIL_TOKEN_TTL || '24h' });
  const decoded = jwt.decode(token);
  const expiresAt = decoded?.exp ? new Date(decoded.exp * 1000) : new Date(Date.now() + 24 * 3600 * 1000);

  return { token, jti, expiresAt };
};

/**
 * Issue an email verification token for either a Staff or Admin entity.
 * Pass `{ user }` for Staff, `{ admin }` for Admin. Do not pass both.
 */
export const issueEmailVerification = async ({ user = null, admin = null, organisationId = null, source = 'unknown' }) => {
  const entity = admin || user;
  const isAdmin = Boolean(admin);

  const revokeFilter = {
    token_kind: VERIFY_EMAIL_KIND,
    status: 'active',
    ...(isAdmin ? { admin_id: entity._id } : { staff_id: entity._id }),
  };

  await AuthToken.updateMany(revokeFilter, { $set: { status: 'revoked', revoked_at: new Date() } });

  const verification = buildVerificationToken({
    sub: entity._id,
    email: entity.email,
    organisationId,
  });

  const tokenDoc = await AuthToken.create({
    token_kind: VERIFY_EMAIL_KIND,
    jwt_id: verification.jti,
    ...(isAdmin ? { admin_id: entity._id } : { staff_id: entity._id }),
    organisation_id: organisationId || null,
    email: entity.email,
    status: 'active',
    expires_at: verification.expiresAt,
    metadata: { source },
  });

  let delivery = { sent: false, reason: 'unknown', error: null };
  try {
    const result = await sendVerificationEmail({
      to: entity.email,
      token: verification.token,
      name: entity.name,
    });

    delivery = {
      sent: Boolean(result?.sent),
      reason: result?.reason || (result?.sent ? null : 'delivery_failed'),
      error: result?.error || null,
    };
  } catch (error) {
    delivery = {
      sent: false,
      reason: 'provider_error',
      error: error?.message || 'Email provider failed',
    };
  }

  tokenDoc.metadata = {
    ...(tokenDoc.metadata || {}),
    delivery: {
      ...delivery,
      attempted_at: new Date().toISOString(),
    },
  };
  await tokenDoc.save();

  if (delivery.sent) {
    entity.email_verification_last_sent_at = new Date();
    entity.email_verification_last_error = null;
    entity.email_verification_last_error_at = null;
  } else {
    entity.email_verification_last_error = delivery.error || delivery.reason || 'delivery_failed';
    entity.email_verification_last_error_at = new Date();
  }
  await entity.save();

  return {
    token: verification.token,
    expiresAt: verification.expiresAt,
    delivery,
  };
};
