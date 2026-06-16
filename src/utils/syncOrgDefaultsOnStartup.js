import Organisation from '../models/Organisation.js';
import { upsertOrgDefaultsForOrganisation } from './seedOrgDefaults.js';

const isEnabled = () => process.env.SYNC_ORG_DEFAULTS_ON_STARTUP === 'true';

export const syncOrgDefaultsOnStartup = async () => {
  if (!isEnabled()) {
    console.log('[syncOrgDefaultsOnStartup] SYNC_ORG_DEFAULTS_ON_STARTUP is not true, skipping.');
    return { organisationsProcessed: 0, errors: 0, skipped: true };
  }

  const organisations = await Organisation.find({}, { _id: 1 }).lean();
  let organisationsProcessed = 0;
  let errors = 0;

  for (const organisation of organisations) {
    try {
      await upsertOrgDefaultsForOrganisation(organisation._id, null);
      organisationsProcessed += 1;
    } catch (error) {
      errors += 1;
      console.error(
        `[syncOrgDefaultsOnStartup] Failed for org ${organisation._id}: ${error?.message || String(error)}`
      );
    }
  }

  console.log(
    `[syncOrgDefaultsOnStartup] Completed. processed=${organisationsProcessed}, errors=${errors}, total=${organisations.length}`
  );

  return { organisationsProcessed, errors, skipped: false };
};

export default syncOrgDefaultsOnStartup;
