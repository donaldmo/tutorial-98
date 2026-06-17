import mongoose from 'mongoose';
import Staff from '../src/models/Staff.js';
import dotenv from 'dotenv'


dotenv.config()

const MONGODB_URI = process.env.MONGO_URL;

async function migrate() {
  if (!MONGODB_URI) {
    console.error('MONGODB_URI or DATABASE_URL must be set');
    process.exit(1);
  }

  await mongoose.connect(MONGODB_URI);
  const db = mongoose.connection.db;
  const collection = db.collection('staff');

  // 1. Audit for cross-org email collisions
  const dupes = await Staff.aggregate([
    { $group: { _id: '$email', ids: { $push: '$_id' }, orgs: { $addToSet: '$organisation_id' }, count: { $sum: 1 } } },
    { $match: { count: { $gt: 1 } } },
  ]);

  if (dupes.length > 0) {
    console.warn(`[migration] Found ${dupes.length} email(s) with cross-organisation collisions:`);
    for (const d of dupes) {
      console.warn(`  Email: "${d._id}" — ${d.count} records across orgs: ${d.orgs.map(o => String(o)).join(', ')}`);
    }
    console.warn('[migration] These must be resolved manually before the unique index can be created.');
    console.warn('[migration] Consider renaming duplicates (e.g. appending +org2@) or merging records.');
    console.warn('[migration] Continuing with index changes — the new index will fail to build if collisions remain.');
  } else {
    console.log('[migration] No cross-organisation email collisions found.');
  }

  // 2. Drop the old global unique index on email
  try {
    await collection.dropIndex('email_1');
    console.log('[migration] Dropped old global unique index: email_1');
  } catch (err) {
    if (err.code === 27) {
      console.log('[migration] Index email_1 already dropped or does not exist.');
    } else {
      console.error('[migration] Error dropping email_1 index:', err.message);
    }
  }

  // 3. Create the new compound unique index with partial filter
  try {
    await collection.createIndex(
      { organisation_id: 1, email: 1 },
      { unique: true, partialFilterExpression: { email: { $type: 'string' } } },
    );
    console.log('[migration] Created compound unique index: organisation_id_1_email_1');
  } catch (err) {
    if (err.code === 11000) {
      console.error('[migration] Duplicate key error creating compound index. Resolve collisions first.');
      console.error('[migration] Run the audit query above and fix duplicates.');
    } else {
      console.error('[migration] Error creating compound index:', err.message);
    }
    process.exit(1);
  }

  console.log('[migration] Staff email compound index migration complete.');
  await mongoose.disconnect();
}

migrate().catch((err) => {
  console.error('[migration] Fatal error:', err);
  process.exit(1);
});
