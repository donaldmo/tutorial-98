import Department from '../models/Department.js';

export const DEFAULT_DEPARTMENTS = [
  { name: 'Payroll',             code: 'PAY', description: 'Payroll processing and compliance.',         color: '#3B82F6' },
  { name: 'Management Accounts', code: 'MA',  description: 'Monthly and quarterly management accounts.', color: '#8B5CF6' },
];

export const upsertOrgDefaultsForOrganisation = async (organisationId, adminId = null) => {
  let departmentsUpserted = 0;

  for (const department of DEFAULT_DEPARTMENTS) {
    await Department.findOneAndUpdate(
      { organisation_id: organisationId, code: department.code },
      {
        $setOnInsert: {
          ...department,
          organisation_id: organisationId,
          created_by: adminId,
          supervisor_id: null,
          is_active: true,
        },
      },
      { upsert: true, new: true, runValidators: true }
    );
    departmentsUpserted += 1;
  }

  return { departmentsUpserted };
};

/**
 * Seed default departments for a newly created organisation.
 * System job types are seeded separately via seedSystemJobTypes().
 * @param {import('mongoose').Types.ObjectId} organisationId
 * @param {import('mongoose').Types.ObjectId} adminId  - The owner admin's _id, used as created_by
 */
export const seedOrgDefaults = async (organisationId, adminId) => {
  const seedAdminOnStartup =
    typeof process.env.SEED_ADMIN_ON_STARTUP === 'string'
      ? process.env.SEED_ADMIN_ON_STARTUP === 'true'
      : process.env.NODE_ENV !== 'production';

  if (!seedAdminOnStartup) {
    console.log('[seedOrgDefaults] SEED_ADMIN_ON_STARTUP=false, skipping departments seeding.');
    return;
  }

  const result = await upsertOrgDefaultsForOrganisation(organisationId, adminId);
  console.log(
    `[seedOrgDefaults] ✅  Synced defaults for org ${organisationId} (departments=${result.departmentsUpserted})`
  );
};
