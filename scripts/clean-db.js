/**
 * Database cleanup utility — clears ALL collections in the database.
 *
 * Usage:
 *   node scripts/clean-db.js --yes
 *   node scripts/clean-db.js --dry-run
 *   node scripts/clean-db.js --yes --force   (skip production / dangerous-db guard)
 */

import dotenv from 'dotenv';
import mongoose from 'mongoose';

dotenv.config();

const args = process.argv.slice(2);
const yes = args.includes('--yes');
const dryRun = args.includes('--dry-run');
const force = args.includes('--force');

if (!yes && !dryRun) {
  console.error('Destructive operation — pass --yes to confirm, or --dry-run to preview.');
  process.exit(1);
}

const { MONGO_URL, MONGO_DB_NAME } = process.env;

if (!MONGO_URL) {
  console.error('Missing MONGO_URL in .env');
  process.exit(1);
}

if (!MONGO_DB_NAME) {
  console.error('Missing MONGO_DB_NAME in .env');
  process.exit(1);
}

const nodeEnv = process.env.NODE_ENV || 'development';
if (nodeEnv === 'production' && !force) {
  console.error('Refusing to clean database in production without --force');
  process.exit(1);
}

const looksDangerous = !/dev|test|local/i.test(MONGO_URL);
if (looksDangerous && !force) {
  console.error('MONGO_URL does not look like a dev/test database. Use --force to override.');
  process.exit(1);
}

async function cleanDatabase() {
  await mongoose.connect(MONGO_URL, { dbName: MONGO_DB_NAME });
  console.log(`Connected to MongoDB — database: ${MONGO_DB_NAME}`);

  try {
    const db = mongoose.connection.db;
    const collections = await db.listCollections({}, { nameOnly: true }).toArray();
    const names = collections.map((c) => c.name).sort();

    if (names.length === 0) {
      console.log('No collections found in the database.');
      return;
    }

    console.log(`\nCollections found (${names.length}): ${names.join(', ')}\n`);

    let totalDocs = 0;
    let totalDeleted = 0;

    for (const name of names) {
      const col = db.collection(name);
      const count = await col.countDocuments({});
      totalDocs += count;

      if (dryRun) {
        console.log(`[dry-run] ${name}: ${count} docs`);
      } else {
        const { deletedCount } = await col.deleteMany({});
        totalDeleted += deletedCount;
        console.log(`${name}: deleted ${deletedCount} / ${count} docs`);
      }
    }

    if (dryRun) {
      console.log(`\nDry-run complete. ${totalDocs} docs exist across ${names.length} collections.`);
    } else {
      console.log(`\nCleanup complete. Deleted ${totalDeleted} docs across ${names.length} collections.`);
    }
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
  }
}

cleanDatabase().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
