import { createRequire } from 'module';
import Organisation from '../models/Organisation.js';
import JobType from '../models/JobType.js';
import { nameToCode } from '../services/planningService.js';

const require = createRequire(import.meta.url);
const systemJobTypes = require('./systemJobTypes.json');

export const seedSystemJobTypesForOrganisation = async (organisationId) => {
  let jobTypesUpserted = 0;
  let errors = 0;

  for (const jobType of systemJobTypes) {
    try {
      const code = nameToCode(jobType.name);
      await JobType.findOneAndUpdate(
        { organisation_id: organisationId, code },
        {
          $set: {
            ...jobType,
            code,
            organisation_id: organisationId,
            is_system: true,
          },
        },
        { upsert: true, new: true, runValidators: true }
      );
      jobTypesUpserted += 1;
    } catch (err) {
      errors += 1;
      console.error(
        `[seedSystemJobTypes] Error upserting "${jobType.name}" for org ${organisationId}: ${err?.message || String(err)}`
      );
    }
  }

  return { jobTypesUpserted, errors };
};

export const seedSystemJobTypes = async () => {
  // Backfill code for existing records that are missing it
  const docsMissingCode = await JobType.find({ code: { $exists: false } }, { _id: 1, name: 1 }).lean();
  for (const doc of docsMissingCode) {
    await JobType.findByIdAndUpdate(doc._id, { code: nameToCode(doc.name) });
  }
  if (docsMissingCode.length > 0) {
    console.log(`[seedSystemJobTypes] Backfilled code for ${docsMissingCode.length} existing job types`);
  }

  const organisations = await Organisation.find({}, { _id: 1 }).lean();

  if (organisations.length === 0) {
    console.log('[seedSystemJobTypes] No organisations found, skipping.');
    return { organisationsProcessed: 0, jobTypesUpserted: 0, errors: 0 };
  }

  let totalJobTypesUpserted = 0;
  let totalErrors = 0;

  for (const org of organisations) {
    const result = await seedSystemJobTypesForOrganisation(org._id);
    totalJobTypesUpserted += result.jobTypesUpserted;
    totalErrors += result.errors;
  }

  console.log(
    `[seedSystemJobTypes] ✅  Completed: orgs=${organisations.length}, jobTypes=${totalJobTypesUpserted}, errors=${totalErrors}`
  );

  return { organisationsProcessed: organisations.length, jobTypesUpserted: totalJobTypesUpserted, errors: totalErrors };
};

export default seedSystemJobTypes;
