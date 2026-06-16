/**
 * backfill-organisation-ids.js
 *
 * One-shot migration script that stamps organisation_id (and optionally created_by)
 * onto every document that was created before organisational authorisation was
 * enforced.
 *
 * Usage:
 *   node scripts/backfill-tenant-ids.js
 *
 * Requirements:
 *   - MONGO_URL and MONGO_DB_NAME must be set in environment (or .env)
 *   - There must be at least one active OrganisationMembership in the DB.
 *   - For multi-organisation installs run with the target organisationId or edit
 *     this script to loop over all organisations.
 */

import 'dotenv/config';
import mongoose from 'mongoose';

// ── Minimal inline schemas (avoids circular imports from src/) ──────────────

const MembershipSchema = new mongoose.Schema(
  { organisation_id: mongoose.Schema.Types.ObjectId, staff_id: mongoose.Schema.Types.ObjectId, status: String },
  { collection: 'organisation_memberships' }
);

const patchSchema = (collection) =>
  new mongoose.Schema({ organisation_id: mongoose.Schema.Types.ObjectId }, { collection, strict: false });

const Membership = mongoose.model('BackfillMembership', MembershipSchema);
const Client     = mongoose.model('BackfillClient',     patchSchema('clients'));
const Job        = mongoose.model('BackfillJob',        patchSchema('jobs'));
const Department = mongoose.model('BackfillDepartment', patchSchema('departments'));
const JobType    = mongoose.model('BackfillJobType',    patchSchema('job_types'));
const Allocation = mongoose.model('BackfillAllocation', patchSchema('allocations'));
const TimeEntry  = mongoose.model('BackfillTimeEntry',  patchSchema('time_entries'));
const Staff      = mongoose.model('BackfillStaff',      new mongoose.Schema(
  { organisation_id: mongoose.Schema.Types.Mixed },
  { collection: 'staff', strict: false }
));

// ── helpers ──────────────────────────────────────────────────────────────────

async function patchCollection(Model, organisationObjectId, label) {
  const result = await Model.updateMany(
    { $or: [{ organisation_id: { $exists: false } }, { organisation_id: null }] },
    { $set: { organisation_id: organisationObjectId } },
  );
  console.log(`  ${label}: patched ${result.modifiedCount} / ${result.matchedCount} documents`);
}

// ── main ──────────────────────────────────────────────────────────────────────

(async () => {
  const mongoUrl = process.env.MONGO_URL;
  if (!mongoUrl) {
    console.error('ERROR: MONGO_URL environment variable is not set');
    process.exit(1);
  }

  console.log('Connecting to MongoDB…');
  await mongoose.connect(mongoUrl, { dbName: process.env.MONGO_DB_NAME });
  console.log('Connected.\n');

  // Resolve the target organisation
  const membership = await Membership.findOne({ status: 'active' }).sort({ createdAt: 1 });
  if (!membership) {
    console.error('ERROR: No active OrganisationMembership found. Cannot determine organisation_id.');
    await mongoose.disconnect();
    process.exit(1);
  }

  const organisationId = membership.organisation_id;
  console.log(`Using organisation_id: ${organisationId}\n`);

  // Fix Staff.organisation_id — convert any String values to ObjectId
  const staffWithStringOrg = await Staff.find({ organisation_id: { $type: 'string' } }).lean();
  let staffConverted = 0;
  for (const s of staffWithStringOrg) {
    try {
      await Staff.updateOne(
        { _id: s._id },
        { $set: { organisation_id: new mongoose.Types.ObjectId(s.organisation_id) } },
      );
      staffConverted++;
    } catch {
      console.warn(`  ⚠️  Could not convert staff ${s._id} organisation_id="${s.organisation_id}"`);
    }
  }
  console.log(`Staff: converted ${staffConverted} String organisation_ids to ObjectId`);

  // Patch all other models
  await patchCollection(Client,     organisationId, 'Client    ');
  await patchCollection(Job,        organisationId, 'Job       ');
  await patchCollection(Department, organisationId, 'Department');
  await patchCollection(JobType,    organisationId, 'JobType   ');
  await patchCollection(Allocation, organisationId, 'Allocation');
  await patchCollection(TimeEntry,  organisationId, 'TimeEntry ');

  // Patch Staff records that have no organisation_id at all
  const staffResult = await Staff.updateMany(
    { $or: [{ organisation_id: { $exists: false } }, { organisation_id: null }] },
    { $set: { organisation_id: organisationId } },
  );
  console.log(`  Staff    : patched ${staffResult.modifiedCount} / ${staffResult.matchedCount} documents with null organisation_id`);

  console.log('\n✅ Backfill complete.');
  console.log('\nIMPORTANT: The old global unique index on clients.name and job_types.name');
  console.log('must be dropped manually from MongoDB and replaced with the new compound index.');
  console.log('Run in mongo shell:');
  console.log('  db.clients.dropIndex("name_1")');
  console.log('  db.job_types.dropIndex("name_1")');
  console.log('Then restart the app to let Mongoose recreate the compound indexes automatically.\n');

  await mongoose.disconnect();
})();
