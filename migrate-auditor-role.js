/**
 * Migration: rename "Senior Auditor/Reviewer" → "Auditor" across all collections
 * Run once: node migrate-auditor-role.js
 */

import dotenv from 'dotenv';
import mongoose from 'mongoose';

dotenv.config();

const OLD = 'Senior Auditor/Reviewer';
const NEW = 'Auditor';

async function run() {
  await mongoose.connect(process.env.MONGO_URL);
  console.log('Connected to MongoDB');

  const db = mongoose.connection.db;

  // 1. JobType.work_components[].role
  const jtResult = await db.collection('jobtypes').updateMany(
    { 'work_components.role': OLD },
    { $set: { 'work_components.$[el].role': NEW } },
    { arrayFilters: [{ 'el.role': OLD }] },
  );
  console.log(`JobTypes updated: ${jtResult.modifiedCount}`);

  // 2. Staff.role
  const staffResult = await db.collection('staff').updateMany(
    { role: OLD },
    { $set: { role: NEW } },
  );
  console.log(`Staff updated: ${staffResult.modifiedCount}`);

  // 3. Allocation — staff_role is denormalised on some schemas; update if present
  const allocResult = await db.collection('allocations').updateMany(
    { staff_role: OLD },
    { $set: { staff_role: NEW } },
  );
  console.log(`Allocations updated: ${allocResult.modifiedCount}`);

  await mongoose.disconnect();
  console.log('Done.');
}

run().catch((err) => { console.error(err); process.exit(1); });
