import OrganisationMembership from '../models/OrganisationMembership.js';

export const ensureStaffMembership = async ({ organisationId, staffId, role = 'member' }) => {
  const existing = await OrganisationMembership.findOne({
    organisation_id: organisationId,
    staff_id: staffId,
  });

  if (existing) {
    const wasActive = existing.status === 'active' && !existing.revoked_at;
    existing.status = 'active';
    existing.revoked_at = null;
    existing.accepted_at = existing.accepted_at || new Date();
    await existing.save();
    return {
      membership: existing,
      status: wasActive ? 'already_active' : 'reactivated',
    };
  }

  const created = await OrganisationMembership.create({
    organisation_id: organisationId,
    staff_id: staffId,
    role,
    status: 'active',
    accepted_at: new Date(),
  });

  return {
    membership: created,
    status: 'created',
  };
};