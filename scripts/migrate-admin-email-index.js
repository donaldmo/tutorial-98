import 'dotenv/config';
import mongoose from 'mongoose';

const MAIN = async () => {
  const mongoUrl = process.env.MONGO_URL;
  if (!mongoUrl) {
    throw new Error('MONGO_URL is required');
  }

  await mongoose.connect(mongoUrl);
  const collection = mongoose.connection.collection('admins');

  const indexes = await collection.indexes();
  const globalEmailUniqueIndex = indexes.find(
    (idx) => idx?.unique === true && idx?.key && Object.keys(idx.key).length === 1 && idx.key.email === 1,
  );

  if (globalEmailUniqueIndex) {
    await collection.dropIndex(globalEmailUniqueIndex.name);
    console.log(`Dropped global unique admin email index: ${globalEmailUniqueIndex.name}`);
  } else {
    console.log('Global unique admin email index was not found.');
  }

  const hasOrgEmailUnique = indexes.some((idx) => idx?.unique === true && idx?.key?.organisation_id === 1 && idx?.key?.email === 1);
  if (!hasOrgEmailUnique) {
    await collection.createIndex({ organisation_id: 1, email: 1 }, { unique: true, name: 'organisation_id_1_email_1' });
    console.log('Created unique compound index: organisation_id_1_email_1');
  } else {
    console.log('Unique compound index already exists: organisation_id + email');
  }

  await mongoose.connection.close();
};

MAIN().catch((error) => {
  console.error('[migrate-admin-email-index] failed:', error.message);
  process.exitCode = 1;
});
