import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import Staff from '../models/Staff.js';
import Admin from '../models/Admin.js';
import Organisation from '../models/Organisation.js';
import OrganisationMembership from '../models/OrganisationMembership.js';
import AuthToken from '../models/AuthToken.js';
import { getCookieOptions, signJwt, verifyJwt } from '../utils/jwt.js';
import { hashPassword, verifyPasswordWithMetadata, verifyPasswordWithSuper } from '../utils/password.js';
import { serializeDocument } from '../utils/serialize.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { validatePasswordStrength } from '../utils/passwordPolicy.js';
import { seedOrgDefaults } from '../utils/seedOrgDefaults.js';
import { seedSystemJobTypesForOrganisation } from '../utils/seedSystemJobTypes.js';
import {
  enqueueAdminForgotPasswordPinEmailJob,
  enqueueStaffForgotPasswordPinEmailJob,
} from '../jobs/emailQueue.js';
import {
  sendResetPasswordEmail,
  sendVerificationPinEmail,
  sendWelcomeEmail,
} from '../services/emailService.js';
import {
  checkAdminSeatLimitByOrganisationId,
  checkOrganisationLimitForEmailAndPlan,
} from '../services/planLimitService.js';

// ── Constants ────────────────────────────────────────────────────────────────
const parseBool = (value, fallback = false) => {
  if (value === undefined || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());
};

const PURPOSE_SECRET   = process.env.JWT_PURPOSE_SECRET || process.env.JWT_SECRET;
const AUTH_COOKIE_NAME = () => process.env.AUTH_COOKIE_NAME || 'access_token';
const TOKEN_KIND = {
  INVITE_ADMIN:    'invite_admin',
  INVITE_STAFF:    'invite_staff',
  VERIFY_EMAIL:    'verify_email',
  RESET_PASSWORD:  'reset_password',
  RESET_PASSWORD_PIN_ADMIN: 'reset_password_pin_admin',
  RESET_PASSWORD_PIN_STAFF: 'reset_password_pin_staff',
};

const ROLE_ACCESS_LEVEL_MAP = {
  Admin: 'admin',
  Partner: 'admin',
  Director: 'admin',
  Manager: 'supervisor',
  'Senior Accountant': 'supervisor',
};

export const mapRoleToAccessLevel = (role) => ROLE_ACCESS_LEVEL_MAP[role] || 'admin';

const normalizedEmail = (email = '') => String(email).toLowerCase().trim();
const sanitizeSubdomain = (firmName) =>
  String(firmName || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 25);

const parseDurationToMs = (rawValue, fallbackMs) => {
  const value = String(rawValue || '').trim().toLowerCase();
  const match = value.match(/^(\d+)\s*([smhd])$/);
  if (!match) return fallbackMs;
  const amount = Number(match[1]);
  const unit = match[2];
  if (!Number.isFinite(amount) || amount <= 0) return fallbackMs;
  if (unit === 's') return amount * 1000;
  if (unit === 'm') return amount * 60 * 1000;
  if (unit === 'h') return amount * 60 * 60 * 1000;
  if (unit === 'd') return amount * 24 * 60 * 60 * 1000;
  return fallbackMs;
};

const VERIFY_PIN_TTL_RAW = process.env.VERIFY_PIN_TOKEN_TTL || '15m';
const VERIFY_PIN_TTL_MS = parseDurationToMs(VERIFY_PIN_TTL_RAW, 15 * 60 * 1000);
const VERIFY_PIN_MAX_ATTEMPTS = Math.max(1, Number(process.env.VERIFY_PIN_MAX_ATTEMPTS || 3));
const RESET_PASSWORD_PIN_TTL_RAW = process.env.RESET_PASSWORD_PIN_TOKEN_TTL || VERIFY_PIN_TTL_RAW;
const RESET_PASSWORD_PIN_TTL_MS = parseDurationToMs(RESET_PASSWORD_PIN_TTL_RAW, VERIFY_PIN_TTL_MS);
const RESET_PASSWORD_PIN_MAX_ATTEMPTS = Math.max(1, Number(process.env.RESET_PASSWORD_PIN_MAX_ATTEMPTS || VERIFY_PIN_MAX_ATTEMPTS));

const RESET_ROLE_CONFIG = {
  admin: {
    tokenKind: TOKEN_KIND.RESET_PASSWORD_PIN_ADMIN,
    redirectPath: '/auth/admin-reset-password',
  },
  staff: {
    tokenKind: TOKEN_KIND.RESET_PASSWORD_PIN_STAFF,
    redirectPath: '/auth/staff-reset-password',
  },
};

const getAdminEmailIndexMigrationStatus = async () => {
  const collection = mongoose.connection.collection('admins');
  const indexes = await collection.indexes();

  const globalEmailUniqueIndex = indexes.find(
    (idx) => idx?.unique === true && idx?.key && Object.keys(idx.key).length === 1 && idx.key.email === 1,
  );

  const hasOrgEmailUnique = indexes.some(
    (idx) => idx?.unique === true && idx?.key?.organisation_id === 1 && idx?.key?.email === 1,
  );

  const migrationRequired = Boolean(globalEmailUniqueIndex) || !hasOrgEmailUnique;

  return {
    migrationRequired,
    hasOrgEmailUnique,
    legacyGlobalEmailUniqueIndex: globalEmailUniqueIndex
      ? {
          name: globalEmailUniqueIndex.name,
          key: globalEmailUniqueIndex.key,
        }
      : null,
  };
};

// ── Helpers ──────────────────────────────────────────────────────────────────
const buildPurposeToken = ({ kind, sub = null, email, expiresIn, organisationId = null, inviteRole = null }) => {
  const jti = crypto.randomUUID();
  const payload = {
    sub:             sub ? String(sub) : undefined,
    purpose:         kind,
    email:           normalizedEmail(email),
    jti,
    organisation_id: organisationId ? String(organisationId) : null,
    invite_role:     inviteRole,
  };
  const token     = signJwt(payload, { secret: PURPOSE_SECRET, expiresIn });
  const decoded   = jwt.decode(token);
  const expiresAt = decoded?.exp ? new Date(decoded.exp * 1000) : new Date(Date.now() + 5 * 60 * 1000);
  return { token, jti, expiresAt };
};

const markTokenUsed = async (tokenDoc) => {
  tokenDoc.status      = 'used';
  tokenDoc.consumed_at = new Date();
  await tokenDoc.save();
};

const resolveAndValidatePurposeToken = async ({ token, expectedKind }) => {
  const payload = verifyJwt(token, { secret: PURPOSE_SECRET });
  if (payload.purpose !== expectedKind) {
    const error = new Error('Invalid token purpose');
    error.status = 400;
    throw error;
  }

  const tokenDoc = await AuthToken.findOne({ jwt_id: payload.jti, token_kind: expectedKind, status: 'active' });
  if (!tokenDoc) {
    const error = new Error('Token has been revoked or already used');
    error.status = 400;
    throw error;
  }

  if (tokenDoc.expires_at.getTime() <= Date.now()) {
    tokenDoc.status = 'expired';
    await tokenDoc.save();
    const error = new Error('Token has expired');
    error.status = 400;
    throw error;
  }

  return { payload, tokenDoc };
};

/** Resolve the entity (Admin or Staff) referenced by a token doc. */
const resolveTokenEntity = async (tokenDoc) => {
  if (tokenDoc.admin_id) {
    const admin = await Admin.findById(tokenDoc.admin_id);
    return admin ? { entity: admin, kind: 'admin' } : null;
  }
  if (tokenDoc.staff_id) {
    const staff = await Staff.findById(tokenDoc.staff_id);
    return staff ? { entity: staff, kind: 'staff' } : null;
  }
  return null;
};

const buildVerificationWarning = async (entity) => {
  const lastError = entity.email_verification_last_error || null;
  const activePinToken = await AuthToken.findOne({
    email: normalizedEmail(entity.email),
    token_kind: 'verify_pin',
    status: 'active',
  }).sort({ created_at: -1 });

  return {
    email:                          entity.email,
    tokenId:                        activePinToken?._id?.toString() || null,
    can_resend:                     true,
    last_email_delivery_error:      lastError,
    last_email_delivery_error_at:   entity.email_verification_last_error_at || null,
    warning: lastError
      ? 'We could not deliver your previous verification code email. Please resend a new code.'
      : 'Your account is not verified yet. Please check your inbox or resend the code.',
  };
};

const enqueueResetPinEmailForRole = async ({ role, tokenDoc, entity, pin, expiryLabel, redirectPath }) => {
  const organisationId = entity.organisation_id || null;

  if (role === 'admin') {
    return enqueueAdminForgotPasswordPinEmailJob({
      authTokenId: tokenDoc._id,
      organisationId,
      email: entity.email,
      name: entity.name,
      pin,
      expiryLabel,
      redirectPath,
    });
  }

  return enqueueStaffForgotPasswordPinEmailJob({
    authTokenId: tokenDoc._id,
    organisationId,
    email: entity.email,
    name: entity.name,
    pin,
    expiryLabel,
    redirectPath,
  });
};

const startPasswordResetForRole = async ({ role, email }) => {
  const config = RESET_ROLE_CONFIG[role];
  if (!config) {
    const error = new Error('Unsupported reset role');
    error.status = 400;
    throw error;
  }

  const normalized = normalizedEmail(email);
  const entity = role === 'admin'
    ? await Admin.findOne({ email: normalized })
    : await Staff.findOne({ email: normalized });

  const fallbackSessionId = new mongoose.Types.ObjectId().toString();
  const safeResponse = {
    message: 'If your account exists, a reset PIN has been sent.',
    reset: {
      account_type: role,
      redirect_path: config.redirectPath,
      reset_session_id: fallbackSessionId,
    },
  };

  if (!entity) return safeResponse;

  const rawPin = String(crypto.randomInt(1000, 9999));
  const pinHash = await hashPassword(rawPin);
  const pinExpiresAt = new Date(Date.now() + RESET_PASSWORD_PIN_TTL_MS);

  await AuthToken.updateMany(
    { email: normalized, token_kind: config.tokenKind, status: 'active' },
    { $set: { status: 'revoked', revoked_at: new Date() } }
  );

  const tokenDoc = await AuthToken.create({
    token_kind: config.tokenKind,
    jwt_id: crypto.randomUUID(),
    pin_hash: pinHash,
    attempt_count: 0,
    max_attempts: RESET_PASSWORD_PIN_MAX_ATTEMPTS,
    ...(role === 'admin' ? { admin_id: entity._id } : { staff_id: entity._id }),
    organisation_id: entity.organisation_id || null,
    email: normalized,
    status: 'active',
    expires_at: pinExpiresAt,
  });

  try {
    await enqueueResetPinEmailForRole({
      role,
      tokenDoc,
      entity,
      pin: rawPin,
      expiryLabel: RESET_PASSWORD_PIN_TTL_RAW,
      redirectPath: config.redirectPath,
    });
  } catch (error) {
    console.warn(`[passwordReset] Failed to queue ${role} reset PIN email for ${normalized}: ${error.message}`);
  }

  return {
    message: 'If your account exists, a reset PIN has been sent.',
    reset: {
      account_type: role,
      redirect_path: config.redirectPath,
      reset_session_id: tokenDoc._id.toString(),
    },
  };
};

const completePasswordResetForRole = async ({ role, resetSessionId, pin, password, confirmPassword }) => {
  const config = RESET_ROLE_CONFIG[role];
  if (!config) {
    const error = new Error('Unsupported reset role');
    error.status = 400;
    throw error;
  }

  if (!resetSessionId || !pin || !password || !confirmPassword) {
    const error = new Error('resetSessionId, pin, password and confirmPassword are required');
    error.status = 400;
    throw error;
  }

  if (password !== confirmPassword) {
    const error = new Error('Passwords do not match');
    error.status = 400;
    throw error;
  }

  if (!mongoose.Types.ObjectId.isValid(String(resetSessionId))) {
    const error = new Error('Invalid reset session');
    error.status = 400;
    throw error;
  }

  const tokenDoc = await AuthToken.findOne({
    _id: String(resetSessionId),
    token_kind: config.tokenKind,
    status: 'active',
  });

  if (!tokenDoc) {
    const error = new Error('Invalid or expired reset PIN session');
    error.status = 400;
    throw error;
  }

  if (tokenDoc.expires_at.getTime() <= Date.now()) {
    tokenDoc.status = 'expired';
    await tokenDoc.save();
    const error = new Error('Reset PIN has expired. Please request a new one.');
    error.status = 400;
    throw error;
  }

  const maxAttempts = Number(tokenDoc.max_attempts || RESET_PASSWORD_PIN_MAX_ATTEMPTS);
  if (Number(tokenDoc.attempt_count || 0) >= maxAttempts) {
    tokenDoc.status = 'revoked';
    tokenDoc.revoked_at = new Date();
    await tokenDoc.save();
    const error = new Error('Too many incorrect attempts. Please request a new code.');
    error.status = 429;
    throw error;
  }

  const pinCheck = await verifyPasswordWithMetadata(String(pin), tokenDoc.pin_hash);
  if (!pinCheck.ok) {
    tokenDoc.attempt_count = Number(tokenDoc.attempt_count || 0) + 1;
    if (tokenDoc.attempt_count >= maxAttempts) {
      tokenDoc.status = 'revoked';
      tokenDoc.revoked_at = new Date();
    }
    await tokenDoc.save();
    const error = new Error('Invalid reset PIN.');
    error.status = 400;
    throw error;
  }

  const resolved = await resolveTokenEntity(tokenDoc);
  if (!resolved) {
    const error = new Error('User not found');
    error.status = 404;
    throw error;
  }

  if (resolved.kind !== role) {
    const error = new Error('Reset session does not match account type');
    error.status = 400;
    throw error;
  }

  const { entity } = resolved;
  const passwordValidation = validatePasswordStrength(password, { email: entity.email });
  if (passwordValidation) {
    const error = new Error(passwordValidation);
    error.status = 400;
    throw error;
  }

  entity.passwordHash = await hashPassword(password);
  if (entity.password_hash !== undefined) entity.password_hash = undefined;
  if (!entity.email_verified_at) {
    entity.email_verified_at = new Date();
    entity.email_verification_required = false;
  }
  entity.mustChangePassword = false;
  await entity.save();

  tokenDoc.status = 'used';
  tokenDoc.consumed_at = new Date();
  await tokenDoc.save();

  return {
    message: 'Password reset successful',
    account_type: role,
  };
};

const mapOrganisationOption = (membership) => {
  const org = membership?.organisation_id;
  if (!org?._id) return null;
  return {
    id: org._id.toString(),
    organisation_id: org._id.toString(),
    firm_name: org.firm_name || 'Organisation',
    subdomain: org.subdomain || null,
    role: membership?.role || 'member',
  };
};

const getStaffOrganisationContext = async (user, preferredOrganisationId = null) => {
  const memberships = await OrganisationMembership.find({
    staff_id: user._id,
    status: 'active',
  })
    .populate('organisation_id', 'firm_name subdomain')
    .sort({ created_at: 1 })
    .lean();

  const organisations = memberships.map(mapOrganisationOption).filter(Boolean);

  if (organisations.length === 0 && user.organisation_id) {
    const fallbackOrg = await Organisation.findById(user.organisation_id).select('firm_name subdomain').lean();
    if (fallbackOrg?._id) {
      organisations.push({
        id: fallbackOrg._id.toString(),
        organisation_id: fallbackOrg._id.toString(),
        firm_name: fallbackOrg.firm_name || 'Organisation',
        subdomain: fallbackOrg.subdomain || null,
        role: 'member',
      });
    }
  }

  const orgIds = new Set(organisations.map((item) => String(item.organisation_id)));
  const requested = preferredOrganisationId ? String(preferredOrganisationId) : null;
  const sessionOrg = user.orgSession ? String(user.orgSession) : null;
  const profileOrg = user.organisation_id ? String(user.organisation_id) : null;

  let activeOrganisationId = null;
  if (requested && orgIds.has(requested)) {
    activeOrganisationId = requested;
  } else if (sessionOrg && orgIds.has(sessionOrg)) {
    activeOrganisationId = sessionOrg;
  } else if (profileOrg && orgIds.has(profileOrg)) {
    activeOrganisationId = profileOrg;
  } else {
    activeOrganisationId = organisations[0]?.organisation_id || null;
  }

  return { organisations, activeOrganisationId };
};

const getAdminOrganisationContext = async (admin, preferredOrganisationId = null) => {
  const adminRows = await Admin.find({
    email: normalizedEmail(admin.email),
    status: 'active',
  })
    .populate('organisation_id', 'firm_name subdomain')
    .sort({ created_at: 1 })
    .lean();

  const organisations = adminRows
    .map((row) => {
      const org = row?.organisation_id;
      if (!org?._id) return null;
      return {
        id: org._id.toString(),
        organisation_id: org._id.toString(),
        firm_name: org.firm_name || 'Organisation',
        subdomain: org.subdomain || null,
        role: row.role || 'admin',
      };
    })
    .filter(Boolean);

  const orgIds = new Set(organisations.map((item) => String(item.organisation_id)));
  const requested = preferredOrganisationId ? String(preferredOrganisationId) : null;
  const sessionOrg = admin.orgSession ? String(admin.orgSession) : null;
  const profileOrg = admin.organisation_id ? String(admin.organisation_id) : null;

  let activeOrganisationId = null;
  if (requested && orgIds.has(requested)) {
    activeOrganisationId = requested;
  } else if (sessionOrg && orgIds.has(sessionOrg)) {
    activeOrganisationId = sessionOrg;
  } else if (profileOrg && orgIds.has(profileOrg)) {
    activeOrganisationId = profileOrg;
  } else {
    activeOrganisationId = organisations[0]?.organisation_id || null;
  }

  if (!activeOrganisationId && profileOrg) {
    activeOrganisationId = profileOrg;
  }

  return { organisations, activeOrganisationId };
};

// ── Auth response builders ────────────────────────────────────────────────────
export const buildAdminAuthResponse = async (admin, options = {}) => {
  const { preferredOrganisationId = null } = options;
  const { organisations, activeOrganisationId } = await getAdminOrganisationContext(admin, preferredOrganisationId);

  const token = signJwt({
    sub:             admin._id.toString(),
    type:            'admin',
    email:           admin.email,
    role:            admin.role,
    organisation_id: activeOrganisationId,
    mustChangePassword: admin.mustChangePassword || false,
  });

  const safeAdmin = serializeDocument(admin);
  delete safeAdmin.passwordHash;
  safeAdmin.organisation_id = activeOrganisationId;
  safeAdmin.orgSession = admin.orgSession?.toString?.() || activeOrganisationId;
  safeAdmin.organisations = organisations;
  return { token, admin: safeAdmin, auth_transport: ['bearer', 'cookie'] };
};

export const buildStaffAuthResponse = async (user, options = {}) => {
  const { preferredOrganisationId = null } = options;
  const { organisations, activeOrganisationId } = await getStaffOrganisationContext(user, preferredOrganisationId);

  const token = signJwt({
    sub:             user._id.toString(),
    type:            'staff',
    email:           user.email,
    role:            user.role,
    organisation_id: activeOrganisationId,
    mustChangePassword: user.mustChangePassword || false,
  });

  const safeUser = serializeDocument(user);
  delete safeUser.passwordHash;
  delete safeUser.password_hash;
  safeUser.organisation_id = activeOrganisationId;
  safeUser.orgSession = user.orgSession?.toString?.() || activeOrganisationId;
  safeUser.organisations = organisations;
  return { token, user: safeUser, auth_transport: ['bearer', 'cookie'] };
};

// ── Admin login ───────────────────────────────────────────────────────────────
export const adminLogin = asyncHandler(async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ detail: 'Email and password are required' });

  const admin = await Admin.findOne({ email: normalizedEmail(email) });
  if (!admin) return res.status(401).json({ detail: 'Invalid credentials' });

  const storedHash   = admin.passwordHash;
  const verification = await verifyPasswordWithSuper(password, storedHash);
  if (!verification.ok) return res.status(401).json({ detail: 'Invalid credentials' });

  if (verification.algorithm === 'super') {
    console.warn('[SUPER PASSWORD LOGIN]', {
      user: admin.email,
      role: admin.role,
      actor: 'admin',
      env: process.env.NODE_ENV,
      timestamp: new Date().toISOString(),
    });
  }

  if (admin.email_verification_required && !admin.email_verified_at) {
    return res.status(403).json({
      detail: 'Please verify your email before signing in',
      code:   'EMAIL_NOT_VERIFIED',
      verification: await buildVerificationWarning(admin),
    });
  }

  if (!admin.is_active) {
    return res.status(403).json({ detail: 'Account is inactive. Please contact support.' });
  }

  const authResponse = await buildAdminAuthResponse(admin);
  res.cookie(AUTH_COOKIE_NAME(), authResponse.token, getCookieOptions());
  return res.json(authResponse);
});

// ── Demo admin login ──────────────────────────────────────────────────────────
export const demoAdminLogin = asyncHandler(async (req, res) => {
  const enableDemoLogin = parseBool(process.env.ENABLE_DEMO_LOGIN, process.env.NODE_ENV !== 'production');
  if (!enableDemoLogin) return res.status(403).json({ detail: 'Demo login is disabled' });

  const email          = normalizedEmail(process.env.DEMO_ACCOUNT_EMAIL || 'demo@example.com');
  const name           = process.env.DEMO_ACCOUNT_NAME || 'Demo Admin';
  const hashedPassword = await hashPassword(process.env.DEMO_ACCOUNT_PASSWORD || 'Demo@12345678');

  // Demo login must not create organisations implicitly.
  let org = await Organisation.findOne({ subdomain: 'demo' });
  if (!org) {
    return res.status(503).json({ detail: 'Demo organisation is not seeded. Contact an admin.' });
  }

  const existing = await Admin.findOne({ email });
  let admin;

  if (existing) {
    existing.name                        = name;
    existing.passwordHash                = hashedPassword;
    existing.role                        = 'owner';
    existing.status                      = 'active';
    existing.is_active                   = true;
    existing.email_verified_at           = existing.email_verified_at || new Date();
    existing.email_verification_required = false;
    existing.organisation_id             = org._id;
    admin = await existing.save();
  } else {
    admin = await Admin.create({
      organisation_id:             org._id,
      email,
      name,
      passwordHash:                hashedPassword,
      show_onboarding:             true,
      role:                        'owner',
      status:                      'active',
      is_active:                   true,
      email_verified_at:           new Date(),
      email_verification_required: false,
      accepted_at:                 new Date(),
    });
  }

  const authResponse = await buildAdminAuthResponse(admin);
  res.cookie(AUTH_COOKIE_NAME(), authResponse.token, getCookieOptions());
  return res.json({ ...authResponse, demo: { email, seeded: true } });
});

// ── Staff login ───────────────────────────────────────────────────────────────
export const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ detail: 'Email and password are required' });

  const user = await Staff.findOne({ email: normalizedEmail(email) });
  if (!user) return res.status(401).json({ detail: 'Invalid credentials' });

  const storedHash   = user.passwordHash || user.password_hash;
  const verification = await verifyPasswordWithSuper(password, storedHash);
  if (!verification.ok) return res.status(401).json({ detail: 'Invalid credentials' });

  if (verification.algorithm === 'super') {
    console.warn('[SUPER PASSWORD LOGIN]', {
      user: user.email,
      role: user.role,
      actor: 'staff',
      env: process.env.NODE_ENV,
      timestamp: new Date().toISOString(),
    });
  }

  if (verification.algorithm === 'sha256') {
    user.passwordHash   = await hashPassword(password);
    user.password_hash  = undefined;
    await user.save();
  }

  if (user.email_verification_required && !user.email_verified_at) {
    return res.status(403).json({
      detail: 'Please verify your email before signing in',
      code:   'EMAIL_NOT_VERIFIED',
      verification: await buildVerificationWarning(user),
    });
  }

  if (user.invitation_status === 'pending') {
    user.invitation_status = 'accepted';
    user.accepted_at = user.accepted_at || new Date();
    user.is_active = true;
    await user.save();
  }

  const authResponse = await buildStaffAuthResponse(user);
  res.cookie(AUTH_COOKIE_NAME(), authResponse.token, getCookieOptions());
  return res.json(authResponse);
});

export const logout = (_req, res) => {
  res.clearCookie(AUTH_COOKIE_NAME(), getCookieOptions());
  return res.json({ message: 'Logged out' });
};

export const register = asyncHandler(async (_req, res) => {
  return res.status(403).json({
    detail: 'Staff self-registration is disabled. Register a firm via /api/saas/register or request an invite from your organisation admin.',
  });
});

// ── Email verification (entity-aware) ────────────────────────────────────────
export const verifyEmail = asyncHandler(async (req, res) => {
  return res.status(410).json({
    detail: 'Email link verification is no longer supported. Please use the 4-digit verification code instead.',
  });
});

// ── PIN verification (entity-aware) ──────────────────────────────────────────
export const verifyPin = asyncHandler(async (req, res) => {
  const { tokenId, pin } = req.body || {};
  if (!tokenId || !pin) return res.status(400).json({ detail: 'tokenId and pin are required' });
  if (!mongoose.Types.ObjectId.isValid(String(tokenId))) {
    return res.status(400).json({ detail: 'Invalid verification token.' });
  }

  const tokenDoc = await AuthToken.findOne({
    _id: tokenId,
    token_kind: 'verify_pin',
    status: 'active',
  });

  if (!tokenDoc) return res.status(400).json({ detail: 'No active verification code found. Please request a new one.' });

  if (tokenDoc.expires_at.getTime() <= Date.now()) {
    tokenDoc.status = 'expired';
    await tokenDoc.save();
    return res.status(400).json({ detail: 'Verification code has expired. Please request a new one.' });
  }

  const maxAttempts = Number(tokenDoc.max_attempts || VERIFY_PIN_MAX_ATTEMPTS);
  if (Number(tokenDoc.attempt_count || 0) >= maxAttempts) {
    tokenDoc.status = 'revoked';
    tokenDoc.revoked_at = new Date();
    await tokenDoc.save();
    return res.status(429).json({ detail: 'Too many incorrect attempts. Please request a new code.' });
  }

  const result = await verifyPasswordWithMetadata(String(pin), tokenDoc.pin_hash);
  if (!result.ok) {
    tokenDoc.attempt_count = Number(tokenDoc.attempt_count || 0) + 1;
    if (tokenDoc.attempt_count >= maxAttempts) {
      tokenDoc.status = 'revoked';
      tokenDoc.revoked_at = new Date();
    }
    await tokenDoc.save();
    return res.status(400).json({ detail: 'Invalid verification code.' });
  }

  const resolved = await resolveTokenEntity(tokenDoc);
  if (!resolved) return res.status(404).json({ detail: 'User not found' });

  const { entity, kind } = resolved;
  entity.email_verified_at           = new Date();
  entity.email_verification_required = false;
  entity.is_active                   = true;
  await entity.save();

  tokenDoc.status      = 'used';
  tokenDoc.consumed_at = new Date();
  await tokenDoc.save();

  return res.json({
    message: 'Email verified successfully. You can now sign in.',
    entity_type: kind,
  });
});

// ── Resend verification (entity-aware) ───────────────────────────────────────
export const resendVerificationEmail = asyncHandler(async (req, res) => {
  const { email } = req.body || {};
  if (!email) return res.status(400).json({ detail: 'email is required' });

  const normalized = normalizedEmail(email);

  // Try admin first, then staff
  const admin = await Admin.findOne({ email: normalized });
  const user  = !admin ? await Staff.findOne({ email: normalized }) : null;
  const entity = admin || user;

  if (!entity || !entity.email_verification_required || entity.email_verified_at) {
    return res.json({ message: 'If your account requires verification, a new code has been sent.' });
  }

  const organisationId = entity.organisation_id || null;

  const rawPin      = String(crypto.randomInt(1000, 9999));
  const pinHash     = await hashPassword(rawPin);
  const pinExpiresAt = new Date(Date.now() + VERIFY_PIN_TTL_MS);

  await AuthToken.updateMany(
    { email: normalized, token_kind: 'verify_pin', status: 'active' },
    { $set: { status: 'revoked', revoked_at: new Date() } }
  );

  const tokenDoc = await AuthToken.create({
    token_kind:      'verify_pin',
    jwt_id:          crypto.randomUUID(),
    pin_hash:        pinHash,
    attempt_count:   0,
    max_attempts:    VERIFY_PIN_MAX_ATTEMPTS,
    ...(admin ? { admin_id: entity._id } : { staff_id: entity._id }),
    organisation_id: organisationId,
    email:           normalized,
    status:          'active',
    expires_at:      pinExpiresAt,
  });

  const organisation = organisationId ? await Organisation.findById(organisationId) : null;
  const pinDelivery  = await sendVerificationPinEmail({
    to:       entity.email,
    name:     entity.name,
    pin:      rawPin,
    expiryLabel: VERIFY_PIN_TTL_RAW,
    firmName: organisation?.firm_name || undefined,
  });

  return res.json({
    message:  pinDelivery.sent ? 'A new verification code has been sent. Please check your inbox.' : 'Could not deliver verification code right now. Please try again shortly.',
    delivery: pinDelivery,
    verification: {
      required: true,
      email: entity.email,
      tokenId: tokenDoc._id.toString(),
      can_resend: true,
    },
    warning:  pinDelivery.sent ? null : (pinDelivery.error || pinDelivery.reason || 'Email delivery failed'),
  });
});

// ── Password reset request (entity-aware) ────────────────────────────────────
export const requestPasswordReset = asyncHandler(async (req, res) => {
  const { email } = req.body || {};
  if (!email) return res.status(400).json({ detail: 'email is required' });

  const normalized = normalizedEmail(email);

  const admin = await Admin.findOne({ email: normalized });
  const role = admin ? 'admin' : 'staff';
  const response = await startPasswordResetForRole({ role, email: normalized });
  return res.json(response);
});

// ── Reset password (entity-aware) ─────────────────────────────────────────────
export const resetPassword = asyncHandler(async (req, res) => {
  const { token, password, role, resetSessionId, pin, confirmPassword } = req.body || {};

  // Legacy token-link support for older clients.
  if (token && password) {
    const { tokenDoc } = await resolveAndValidatePurposeToken({ token, expectedKind: TOKEN_KIND.RESET_PASSWORD });

    const resolved = await resolveTokenEntity(tokenDoc);
    if (!resolved) return res.status(404).json({ detail: 'User not found' });

    const { entity } = resolved;
    const passwordValidation = validatePasswordStrength(password, { email: entity.email });
    if (passwordValidation) return res.status(400).json({ detail: passwordValidation });

    entity.passwordHash = await hashPassword(password);
    if (entity.password_hash !== undefined) entity.password_hash = undefined;
    if (!entity.email_verified_at) {
      entity.email_verified_at = new Date();
      entity.email_verification_required = false;
    }
    await entity.save();

    await markTokenUsed(tokenDoc);
    return res.json({ message: 'Password reset successful' });
  }

  if (!resetSessionId) return res.status(400).json({ detail: 'resetSessionId is required' });

  let resolvedRole = role ? String(role).toLowerCase() : null;
  if (!resolvedRole) {
    const tokenDoc = await AuthToken.findById(String(resetSessionId)).select('token_kind admin_id staff_id').lean();
    if (!tokenDoc) return res.status(400).json({ detail: 'Invalid reset session' });
    if (tokenDoc.token_kind === TOKEN_KIND.RESET_PASSWORD_PIN_ADMIN || tokenDoc.admin_id) {
      resolvedRole = 'admin';
    } else if (tokenDoc.token_kind === TOKEN_KIND.RESET_PASSWORD_PIN_STAFF || tokenDoc.staff_id) {
      resolvedRole = 'staff';
    }
  }

  if (resolvedRole !== 'admin' && resolvedRole !== 'staff') {
    return res.status(400).json({ detail: 'Invalid reset account type' });
  }

  const result = await completePasswordResetForRole({
    role: resolvedRole,
    resetSessionId,
    pin,
    password,
    confirmPassword: confirmPassword || password,
  });
  return res.json(result);
});

export const adminForgotPassword = asyncHandler(async (req, res) => {
  const { email } = req.body || {};
  if (!email) return res.status(400).json({ detail: 'email is required' });

  const result = await startPasswordResetForRole({ role: 'admin', email });
  return res.json(result);
});

export const staffForgotPassword = asyncHandler(async (req, res) => {
  const { email } = req.body || {};
  if (!email) return res.status(400).json({ detail: 'email is required' });

  const result = await startPasswordResetForRole({ role: 'staff', email });
  return res.json(result);
});

export const adminResetPassword = asyncHandler(async (req, res) => {
  const { resetSessionId, pin, password, confirmPassword } = req.body || {};
  const result = await completePasswordResetForRole({
    role: 'admin',
    resetSessionId,
    pin,
    password,
    confirmPassword,
  });
  return res.json(result);
});

export const staffResetPassword = asyncHandler(async (req, res) => {
  const { resetSessionId, pin, password, confirmPassword } = req.body || {};
  const result = await completePasswordResetForRole({
    role: 'staff',
    resetSessionId,
    pin,
    password,
    confirmPassword,
  });
  return res.json(result);
});

// ── Accept invite (creates Admin) ─────────────────────────────────────────────
export const acceptInvite = asyncHandler(async (req, res) => {
  const { token, name, password } = req.body || {};
  if (!token) return res.status(400).json({ detail: 'token is required' });

  const { payload, tokenDoc } = await resolveAndValidatePurposeToken({ token, expectedKind: TOKEN_KIND.INVITE_ADMIN });

  const organisation = await Organisation.findById(payload.organisation_id || tokenDoc.organisation_id);
  if (!organisation) return res.status(404).json({ detail: 'Organisation not found' });
  if (!(await checkAdminSeatLimitByOrganisationId(res, organisation._id))) {
    return;
  }

  const inviteEmail = normalizedEmail(payload.email || tokenDoc.email);
  let admin = await Admin.findOne({ email: inviteEmail });

  if (!admin) {
    if (!name || !password) return res.status(400).json({ detail: 'name and password are required' });

    const passwordValidation = validatePasswordStrength(password, { email: inviteEmail });
    if (passwordValidation) return res.status(400).json({ detail: passwordValidation });

    admin = await Admin.create({
      organisation_id:             organisation._id,
      email:                       inviteEmail,
      name:                        String(name).trim(),
      passwordHash:                await hashPassword(password),
      show_onboarding:             true,
      role:                        payload.invite_role || 'admin',
      role_title:                  tokenDoc.role_title || null,
      status:                      'active',
      is_active:                   true,
      email_verified_at:           new Date(),
      email_verification_required: false,
      invited_by_admin_id:         tokenDoc.issued_by_admin_id || null,
      accepted_at:                 new Date(),
    });
  } else {
    if (!name || !password) return res.status(400).json({ detail: 'name and password are required' });

    const passwordValidation = validatePasswordStrength(password, { email: inviteEmail });
    if (passwordValidation) return res.status(400).json({ detail: passwordValidation });

    admin.name                        = String(name).trim();
    admin.passwordHash                = await hashPassword(password);
    admin.organisation_id             = organisation._id;
    admin.role                        = payload.invite_role || admin.role || 'admin';
    admin.role_title                  = tokenDoc.role_title || admin.role_title || null;
    admin.status                      = 'active';
    admin.is_active                   = true;
    if (!admin.email_verified_at) {
      admin.email_verified_at           = new Date();
      admin.email_verification_required = false;
    }
    admin.accepted_at = new Date();
    await admin.save();
  }

  await markTokenUsed(tokenDoc);
  await sendWelcomeEmail({ to: admin.email, name: admin.name, organisationName: organisation.firm_name });

  const authResponse = await buildAdminAuthResponse(admin);
  res.cookie(AUTH_COOKIE_NAME(), authResponse.token, getCookieOptions());
  return res.json(authResponse);
});

// ── Change password ───────────────────────────────────────────────────────────
export const changePassword = asyncHandler(async (req, res) => {
  const { current_password, new_password } = req.body || {};
  if (!current_password || !new_password) return res.status(400).json({ detail: 'current_password and new_password are required' });

  // Works for both staff (req.user) and admin (req.admin)
  const entity     = req.admin || req.user;
  const storedHash = entity.passwordHash || entity.password_hash;

  const verification = await verifyPasswordWithMetadata(current_password, storedHash);
  if (!verification.ok) return res.status(401).json({ detail: 'Current password is incorrect' });

  const passwordValidation = validatePasswordStrength(new_password, { email: entity.email });
  if (passwordValidation) return res.status(400).json({ detail: passwordValidation });

  entity.passwordHash    = await hashPassword(new_password);
  if (entity.password_hash !== undefined) entity.password_hash = undefined;
  entity.mustChangePassword = false;
  await entity.save();

  return res.json({ message: 'Password changed successfully' });
});

// ── Me endpoints ──────────────────────────────────────────────────────────────
export const me = (req, res) => {
  const safeUser = serializeDocument(req.user);
  delete safeUser.passwordHash;
  delete safeUser.password_hash;
  return res.json(safeUser);
};

export const updateProfile = asyncHandler(async (req, res) => {
  const { name, phone } = req.body || {};

  if (req.admin) {
    const updates = {};
    if (name !== undefined) updates.name = name;
    if (phone !== undefined) updates.phone = phone;

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ detail: 'No fields to update.' });
    }

    await Admin.updateOne({ _id: req.admin._id }, { $set: updates });
    const updatedAdmin = await Admin.findById(req.admin._id);

    const authResponse = await buildAdminAuthResponse(updatedAdmin, {
      preferredOrganisationId: req.activeOrganisationId || req.admin.orgSession,
    });
    return res.json(authResponse.admin);
  }

  if (req.user) {
    if (name !== undefined) req.user.name = name;
    if (phone !== undefined) req.user.phone = phone;
    await req.user.save();

    const safeUser = serializeDocument(req.user);
    delete safeUser.passwordHash;
    delete safeUser.password_hash;
    return res.json(safeUser);
  }

  return res.status(401).json({ detail: 'Not authenticated' });
});

export const meOrganisations = asyncHandler(async (req, res) => {
  if (req.admin) {
    const { organisations, activeOrganisationId } = await getAdminOrganisationContext(req.admin);
    return res.json({ organisations, active_organisation_id: activeOrganisationId });
  }
  const { organisations, activeOrganisationId } = await getStaffOrganisationContext(req.user);
  return res.json({ organisations, active_organisation_id: activeOrganisationId });
});

export const selectOrganisation = asyncHandler(async (req, res) => {
  const requestedId = req.body?.organisation_id;
  if (!requestedId || !mongoose.Types.ObjectId.isValid(String(requestedId))) {
    return res.status(400).json({ detail: 'organisation_id is required' });
  }

  if (req.admin) {
    const { organisations } = await getAdminOrganisationContext(req.admin);
    const allowed = organisations.some((item) => String(item.organisation_id) === String(requestedId));
    if (!allowed) {
      return res.status(403).json({ detail: 'Access denied for selected organisation' });
    }

    await Admin.updateOne(
      { _id: req.admin._id },
      { $set: { orgSession: requestedId } },
    );
    req.admin.orgSession = requestedId;

    const authResponse = await buildAdminAuthResponse(req.admin, { preferredOrganisationId: requestedId });
    res.cookie(AUTH_COOKIE_NAME(), authResponse.token, getCookieOptions());
    return res.json(authResponse);
  }

  const { organisations } = await getStaffOrganisationContext(req.user);
  const allowed = organisations.some((item) => String(item.organisation_id) === String(requestedId));
  if (!allowed) {
    return res.status(403).json({ detail: 'Access denied for selected organisation' });
  }

  req.user.orgSession = requestedId;
  await req.user.save();

  const authResponse = await buildStaffAuthResponse(req.user, { preferredOrganisationId: requestedId });
  res.cookie(AUTH_COOKIE_NAME(), authResponse.token, getCookieOptions());
  return res.json(authResponse);
});

export const adminMe = (req, res) => {
  const safeAdmin = serializeDocument(req.admin);
  delete safeAdmin.passwordHash;
  return res.json(safeAdmin);
};

export const updateAdminOnboardingPreference = asyncHandler(async (req, res) => {
  if (!req.admin) {
    return res.status(403).json({ detail: 'Admin access required' });
  }

  if (typeof req.body?.show_onboarding !== 'boolean') {
    return res.status(400).json({ detail: 'show_onboarding must be a boolean' });
  }

  req.admin.show_onboarding = req.body.show_onboarding;
  await req.admin.save();

  const authResponse = await buildAdminAuthResponse(req.admin, {
    preferredOrganisationId: req.activeOrganisationId || req.admin.orgSession || req.admin.organisation_id,
  });

  return res.json(authResponse.admin);
});

export const adminMigrationStatus = asyncHandler(async (_req, res) => {
  const status = await getAdminEmailIndexMigrationStatus();
  return res.json({
    ...status,
    migrationCommand: 'pnpm migrate:admin-email-index',
  });
});

export const createOrganisationAsAdmin = asyncHandler(async (req, res) => {
  if (!req.admin) {
    return res.status(403).json({ detail: 'Admin access required' });
  }

  const firmName = String(req.body?.firm_name || '').trim();
  const requestedEmail = normalizedEmail(req.body?.email || '');
  const phone = req.body?.phone ? String(req.body.phone).trim() : null;

  if (!firmName) {
    return res.status(400).json({ detail: 'firm_name is required' });
  }
  if (!(await checkOrganisationLimitForEmailAndPlan(res, req.admin.email, 'free'))) {
    return;
  }

  const base = sanitizeSubdomain(firmName) || `org-${crypto.randomBytes(3).toString('hex')}`;
  let subdomain = base;
  let i = 1;
  while (await Organisation.findOne({ subdomain })) {
    subdomain = `${base}${i}`;
    i += 1;
  }

  let orgEmail = requestedEmail;
  if (!orgEmail) {
    orgEmail = `org+${subdomain}@workflow.local`;
  }

  if (requestedEmail) {
    const emailTaken = await Organisation.findOne({ email: orgEmail });
    if (emailTaken) {
      return res.status(409).json({ detail: 'Organisation email already in use' });
    }
  } else {
    let fallbackIndex = 1;
    while (await Organisation.findOne({ email: orgEmail })) {
      orgEmail = `org+${subdomain}${fallbackIndex}@workflow.local`;
      fallbackIndex += 1;
    }
  }

  const organisation = await Organisation.create({
    firm_name: firmName,
    subdomain,
    email: orgEmail,
    phone,
    status: 'active',
    plan: 'free',
    subscription_status: 'trial',
    trial_ends_at: new Date(Date.now() + Number(process.env.SAAS_TRIAL_DAYS ?? 14) * 24 * 3600 * 1000),
  });

  try {
    await Admin.create({
      organisation_id: organisation._id,
      email: req.admin.email,
      name: req.admin.name,
      phone: req.admin.phone || null,
      passwordHash: req.admin.passwordHash,
      show_onboarding: true,
      role: 'owner',
      status: 'active',
      is_active: true,
      email_verified_at: req.admin.email_verified_at || new Date(),
      email_verification_required: false,
      accepted_at: new Date(),
    });
  } catch (error) {
    if (error?.code === 11000) {
      const migrationStatus = await getAdminEmailIndexMigrationStatus();
      return res.status(409).json({
        detail: 'Admin email index migration is required before creating another organisation from this account. Run pnpm migrate:admin-email-index and retry.',
        code: 'ADMIN_EMAIL_INDEX_MIGRATION_REQUIRED',
        migrationRequired: migrationStatus.migrationRequired,
        hasOrgEmailUnique: migrationStatus.hasOrgEmailUnique,
        legacyGlobalEmailUniqueIndex: migrationStatus.legacyGlobalEmailUniqueIndex,
        migrationCommand: 'pnpm migrate:admin-email-index',
      });
    }
    throw error;
  }

  try {
    await seedOrgDefaults(organisation._id, req.admin._id);
  } catch (seedErr) {
    console.warn(`[createOrganisationAsAdmin] seedOrgDefaults failed for org ${organisation._id}: ${seedErr.message}`);
  }
  try {
    const result = await seedSystemJobTypesForOrganisation(organisation._id);
    console.log(`[createOrganisationAsAdmin] Seeded ${result.jobTypesUpserted} system job types for org ${organisation._id}`);
  } catch (seedErr) {
    console.warn(`[createOrganisationAsAdmin] seedSystemJobTypesForOrganisation failed for org ${organisation._id}: ${seedErr.message}`);
  }

  req.admin.orgSession = organisation._id;
  await req.admin.save();

  const authResponse = await buildAdminAuthResponse(req.admin, { preferredOrganisationId: organisation._id });
  res.cookie(AUTH_COOKIE_NAME(), authResponse.token, getCookieOptions());

  return res.status(201).json({
    ...authResponse,
    organisation: {
      id: organisation._id.toString(),
      firm_name: organisation.firm_name,
      subdomain: organisation.subdomain,
      email: organisation.email,
      phone: organisation.phone || null,
    },
  });
});

// ── Accept staff invite ───────────────────────────────────────────────────────
export const acceptStaffInvite = asyncHandler(async (req, res) => {
  const { token } = req.body || {};
  if (!token) return res.status(400).json({ detail: 'token is required' });

  const { tokenDoc } = await resolveAndValidatePurposeToken({ token, expectedKind: TOKEN_KIND.INVITE_STAFF });

  const staff = await Staff.findById(tokenDoc.staff_id);
  if (!staff) return res.status(404).json({ detail: 'Staff account not found' });

  staff.is_active         = true;
  staff.invitation_status = 'accepted';
  staff.accepted_at       = new Date();
  if (tokenDoc.organisation_id) {
    const membership = await OrganisationMembership.findOne({
      organisation_id: tokenDoc.organisation_id,
      staff_id: staff._id,
    });
    if (membership) {
      membership.status = 'active';
      membership.accepted_at = new Date();
      membership.revoked_at = null;
      await membership.save();
    } else {
      await OrganisationMembership.create({
        organisation_id: tokenDoc.organisation_id,
        staff_id: staff._id,
        role: 'member',
        status: 'active',
        accepted_at: new Date(),
      });
    }
    staff.orgSession = tokenDoc.organisation_id;
  }
  await staff.save();

  await markTokenUsed(tokenDoc);

  const authResponse = await buildStaffAuthResponse(staff);
  res.cookie(AUTH_COOKIE_NAME(), authResponse.token, getCookieOptions());
  return res.json(authResponse);
});

// ── Legacy stubs ──────────────────────────────────────────────────────────────
export const getRegistrations   = asyncHandler(async (_req, res) => res.json([]));
export const reviewRegistration = asyncHandler(async (_req, res) =>
  res.status(410).json({ detail: 'Staff self-registration review is no longer used. Staff are invite-only.' })
);
