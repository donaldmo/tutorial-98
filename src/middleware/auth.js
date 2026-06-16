import Staff from '../models/Staff.js';
import Admin from '../models/Admin.js';
import SuperAdmin from '../models/SuperAdmin.js';
import Organisation from '../models/Organisation.js';
import OrganisationMembership from '../models/OrganisationMembership.js';
import { verifyJwt } from '../utils/jwt.js';

const buildAdminRequestUser = (admin, activeOrganisationId) => {
  const adminView = admin.toObject();
  adminView.organisation_id = activeOrganisationId;
  adminView.orgSession = admin.orgSession || null;
  return adminView;
};

const parseBearer = (authHeader = '') => {
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  return authHeader.slice(7).trim() || null;
};

export const extractJwtFromRequest = (req) => {
  const bearerToken = parseBearer(req.headers.authorization);
  if (bearerToken) return bearerToken;
  const cookieToken =
    req.cookies?.[process.env.AUTH_COOKIE_NAME || 'access_token'] ||
    req.cookies?.access_token ||
    req.cookies?.jwt ||
    req.cookies?.token;
  return cookieToken || null;
};

const hasStaffOrgMembership = async (staffId, organisationId) => {
  if (!staffId || !organisationId) return false;
  const membership = await OrganisationMembership.findOne({
    staff_id: staffId,
    organisation_id: organisationId,
    status: 'active',
  })
    .select('_id')
    .lean();
  return Boolean(membership);
};

const isStaffActiveInOrganisation = async ({ staffDoc = null, staffId = null, organisationId = null }) => {
  if (!organisationId) return false;
  const resolvedStaffId = staffDoc?._id || staffId;
  if (!resolvedStaffId) return false;

  const activeFlag = staffDoc ? staffDoc.is_active !== false && staffDoc.is_archived !== true : true;
  if (!activeFlag) return false;

  if (String(staffDoc?.organisation_id || '') === String(organisationId || '')) {
    return true;
  }

  return hasStaffOrgMembership(resolvedStaffId, organisationId);
};

const resolveStaffOrganisationContext = async (user, payloadOrgId = null) => {
  const candidates = [user.orgSession, payloadOrgId, user.organisation_id]
    .filter(Boolean)
    .map((value) => String(value));

  for (const organisationId of candidates) {
    if (String(user.organisation_id || '') === organisationId) {
      return organisationId;
    }

    const isMember = await hasStaffOrgMembership(user._id, organisationId);
    if (isMember) {
      return organisationId;
    }
  }

  const firstMembership = await OrganisationMembership.findOne({
    staff_id: user._id,
    status: 'active',
  })
    .sort({ created_at: 1 })
    .select('organisation_id')
    .lean();

  if (firstMembership?.organisation_id) {
    return String(firstMembership.organisation_id);
  }

  return user.organisation_id ? String(user.organisation_id) : null;
};

const resolveAdminOrganisationContext = async (admin, payloadOrgId = null) => {
  const adminRows = await Admin.find({
    email: String(admin.email || '').toLowerCase().trim(),
    status: 'active',
  })
    .select('organisation_id')
    .lean();

  const availableOrgIds = new Set(adminRows.map((row) => String(row.organisation_id || '')).filter(Boolean));
  const candidates = [admin.orgSession, payloadOrgId, admin.organisation_id]
    .filter(Boolean)
    .map((value) => String(value));

  for (const organisationId of candidates) {
    if (availableOrgIds.has(organisationId)) {
      return organisationId;
    }
  }

  if (availableOrgIds.size > 0) {
    return Array.from(availableOrgIds)[0];
  }

  return admin.organisation_id ? String(admin.organisation_id) : null;
};

// ── Staff auth (also accepts admin tokens so the admin shell can reach all data routes) ──
export const requireAuth = async (req, res, next) => {
  try {
    const token = extractJwtFromRequest(req);
    if (!token) return res.status(401).json({ detail: 'Missing authentication token' });

    const payload = verifyJwt(token);

    // Admin tokens are accepted — admins need access to all data routes
    if (payload.type === 'admin') {
      const admin = await Admin.findById(payload.sub);
      if (!admin || admin.is_active === false || admin.status === 'revoked') {
        return res.status(401).json({ detail: 'Invalid or inactive admin' });
      }

      const activeOrganisationId = await resolveAdminOrganisationContext(admin, payload.organisation_id);
      if (!activeOrganisationId) {
        return res.status(401).json({ detail: 'No organisation context. Please log in again.' });
      }

      req.admin = admin;
      req.activeOrganisationId = activeOrganisationId;
      // Expose an org-scoped admin view without mutating the persistent Admin document.
      req.user = buildAdminRequestUser(admin, activeOrganisationId);
      return next();
    }

    // Staff token path — unchanged
    const user = await Staff.findById(payload.sub);
    if (!user || user.is_active === false || user.is_archived === true) {
      return res.status(401).json({ detail: 'Invalid or inactive user' });
    }

    const activeOrganisationId = await resolveStaffOrganisationContext(user, payload.organisation_id);
    if (!activeOrganisationId) {
      return res.status(401).json({ detail: 'No organisation context. Please log in again.' });
    }

    user.organisation_id = activeOrganisationId;

    req.user = user;
    return next();
  } catch (_error) {
    return res.status(401).json({ detail: 'Invalid authentication token' });
  }
};

// ── Admin auth ───────────────────────────────────────────────────────────────
export const requireAdminAuth = async (req, res, next) => {
  try {
    const token = extractJwtFromRequest(req);
    if (!token) return res.status(401).json({ detail: 'Missing authentication token' });

    const payload = verifyJwt(token);

    if (payload.type !== 'admin') {
      return res.status(403).json({ detail: 'Admin access required' });
    }

    const admin = await Admin.findById(payload.sub);
    if (!admin || admin.is_active === false || admin.status === 'revoked') {
      return res.status(401).json({ detail: 'Invalid or inactive admin' });
    }

    const activeOrganisationId = await resolveAdminOrganisationContext(admin, payload.organisation_id);
    if (!activeOrganisationId) {
      return res.status(401).json({ detail: 'No organisation context. Please log in again.' });
    }

    req.admin = admin;
    req.activeOrganisationId = activeOrganisationId;
    req.user = buildAdminRequestUser(admin, activeOrganisationId);
    return next();
  } catch (_error) {
    return res.status(401).json({ detail: 'Invalid authentication token' });
  }
};

// ── Admin role guard (owner vs admin) ────────────────────────────────────────
/**
 * Use after requireAdminAuth. Restricts to specific admin roles.
 * e.g. requireAdminRole(['owner']) — owner only
 *      requireAdminRole(['owner', 'admin']) — any admin
 */
export const requireAdminRole = (roles = []) => (req, res, next) => {
  const role = String(req.admin?.role || '').toLowerCase();
  if (roles.map((r) => r.toLowerCase()).includes(role)) return next();
  return res.status(403).json({ detail: `Access restricted to: ${roles.join(', ')}` });
};

// ── Organisation auth ─────────────────────────────────────────────────────────
export const requireOrganisationAuth = async (req, res, next) => {
  try {
    const token = extractJwtFromRequest(req);
    if (!token) return res.status(401).json({ detail: 'Missing authentication token' });

    const payload = verifyJwt(token);
    if (payload.type !== 'organisation') {
      return res.status(403).json({ detail: 'Organisation access required' });
    }

    const organisation = await Organisation.findById(payload.sub);
    if (!organisation || ['suspended', 'cancelled'].includes(String(organisation.status || '').toLowerCase())) {
      return res.status(401).json({ detail: 'Invalid or inactive organisation' });
    }

    req.auth = payload;
    req.organisation = organisation;
    return next();
  } catch (_error) {
    return res.status(401).json({ detail: 'Invalid authentication token' });
  }
};

// ── Super admin auth ─────────────────────────────────────────────────────────
export const requireSuperAdminAuth = async (req, res, next) => {
  try {
    const token = extractJwtFromRequest(req);
    if (!token) return res.status(401).json({ detail: 'Missing authentication token' });

    const payload = verifyJwt(token);
    if (payload.type !== 'super_admin') {
      return res.status(403).json({ detail: 'Super-admin access required' });
    }

    const admin = await SuperAdmin.findById(payload.sub);
    if (!admin || admin.is_active === false) {
      return res.status(401).json({ detail: 'Invalid or inactive admin user' });
    }

    req.auth = payload;
    req.superAdmin = admin;
    return next();
  } catch (_error) {
    return res.status(401).json({ detail: 'Invalid authentication token' });
  }
};

// ── requireRole (Staff-scoped, legacy — no admin fallback) ────────────────────
/**
 * Restricts staff routes by organisation role stored in the admins collection.
 * Must be used after requireAuth. Roles: 'owner', 'admin', 'member'.
 * NOTE: This no longer falls back to staff.access_level. Admins use requireAdminAuth.
 */
export const requireRole = (roles = []) => async (req, res, next) => {
  try {
    const orgId = req.user?.organisation_id;
    if (!orgId) return res.status(403).json({ detail: 'No organisation context' });

    const allowed = roles.map((r) => r.toLowerCase());

    const adminDoc = await Admin.findOne({
      email:           req.user.email,
      organisation_id: orgId,
      status:          'active',
    }).lean();

    if (adminDoc && allowed.includes(String(adminDoc.role || '').toLowerCase())) {
      req.adminDoc = adminDoc;
      return next();
    }

    return res.status(403).json({ detail: `Access restricted to: ${roles.join(', ')}` });
  } catch (_error) {
    return res.status(403).json({ detail: 'Could not verify organisation role' });
  }
};

// ── requireAdminAccess (Staff) — kept for backward compat, prefer requireAdminAuth
export const requireAdminAccess = (req, res, next) => {
  return res.status(403).json({ detail: 'This route requires admin authentication. Use /api/auth/admin-login.' });
};

// ── canActOnStaff ─────────────────────────────────────────────────────────────
export const canActOnStaff = async (actor, targetStaffId) => {
  if (!actor || !targetStaffId) return false;
  const actorOrganisationId = actor.organisation_id ? String(actor.organisation_id) : null;
  if (!actorOrganisationId) return false;

  // Admins (owner/admin role) can act on any staff member
  const role = String(actor.role || '').toLowerCase();
  if (role === 'owner' || role === 'admin') {
    return isStaffActiveInOrganisation({ staffId: targetStaffId, organisationId: actorOrganisationId });
  }

  const actorId  = actor._id?.toString?.() || actor.id?.toString?.() || '';
  const targetId = targetStaffId?.toString?.() || String(targetStaffId || '');
  if (!actorId || !targetId) return false;
  if (actorId === targetId) {
    return isStaffActiveInOrganisation({ staffDoc: actor, organisationId: actorOrganisationId });
  }

  const level = String(actor.access_level || '').toLowerCase();
  if (level === 'supervisor') {
    const actorInOrg = await isStaffActiveInOrganisation({ staffDoc: actor, organisationId: actorOrganisationId });
    if (!actorInOrg) return false;

    const target = await Staff.findById(targetId).lean();
    const targetInOrg = await isStaffActiveInOrganisation({
      staffDoc: target,
      staffId: targetId,
      organisationId: actorOrganisationId,
    });
    if (!targetInOrg) return false;
    if (String(target.manager_id || '') === actorId) return true;
    if (Array.isArray(target.supervisor_ids) && target.supervisor_ids.map(String).includes(actorId)) return true;
  }

  return false;
};
