/**
 * orgMembership.js
 *
 * Helpers for the standalone `admins` collection.
 * Admins are self-contained auth entities — not linked to Staff.
 */

import Admin from '../models/Admin.js';
import Organisation from '../models/Organisation.js';

const normalizedEmail = (email = '') => String(email).toLowerCase().trim();

/**
 * Find an active Admin record by email within a given org.
 */
export const findAdminInOrg = (email, orgId) =>
  Admin.findOne({ email: normalizedEmail(email), organisation_id: orgId, status: 'active' }).lean();

/**
 * Find the first Organisation that the admin email belongs to.
 */
export const findOrgByAdmin = async (email) => {
  const admin = await Admin.findOne({ email: normalizedEmail(email), status: 'active' })
    .sort({ created_at: 1 })
    .lean();
  if (!admin) return null;
  return Organisation.findById(admin.organisation_id);
};

/**
 * Resolve { org, admin } for an admin email.
 * Fast-path uses knownOrgId when available.
 */
export const resolveAdminMembership = async (email, knownOrgId = null) => {
  const normalized = normalizedEmail(email);

  if (knownOrgId) {
    const admin = await Admin.findOne({ email: normalized, organisation_id: knownOrgId, status: 'active' }).lean();
    if (admin) {
      const org = await Organisation.findById(knownOrgId);
      if (org) return { org, admin };
    }
  }

  const admin = await Admin.findOne({ email: normalized, status: 'active' }).sort({ created_at: 1 }).lean();
  if (!admin) return null;
  const org = await Organisation.findById(admin.organisation_id);
  return org ? { org, admin } : null;
};

/**
 * Upsert an Admin record.
 * Matches on organisation_id + email (natural key).
 */
export const upsertAdmin = async (orgId, data) => {
  const email = normalizedEmail(data.email || '');

  return Admin.findOneAndUpdate(
    { organisation_id: orgId, email },
    {
      $set: {
        organisation_id:     orgId,
        email,
        name:                data.name                ?? null,
        role:                data.role                || 'admin',
        status:              data.status              || 'active',
        invited_by_admin_id: data.invited_by_admin_id ?? null,
        invited_at:          data.invited_at          ?? null,
        accepted_at:         data.accepted_at         ?? null,
        is_active:           data.is_active           ?? true,
      },
      $setOnInsert: {
        show_onboarding: true,
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
};

/**
 * Revoke an Admin by its _id.
 */
export const revokeAdmin = (adminId) =>
  Admin.findByIdAndUpdate(adminId, { $set: { status: 'revoked' } }, { new: true });

/**
 * Revoke an Admin by email within an org.
 */
export const revokeAdminByEmail = (orgId, email) =>
  Admin.findOneAndUpdate(
    { organisation_id: orgId, email: normalizedEmail(email) },
    { $set: { status: 'revoked' } },
    { new: true }
  );

// ── Aliases ──────────────────────────────────────────────────────────────────
export const resolveMembership = resolveAdminMembership;
export const revokeMemberById  = revokeAdmin;
