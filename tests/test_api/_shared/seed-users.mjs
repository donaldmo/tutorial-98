#!/usr/bin/env node

import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

const mongoUrl = process.env.MONGO_URL;
if (!mongoUrl) {
  console.error('Missing MONGO_URL');
  process.exit(1);
}

const mode = process.argv[2];
const email = String(process.argv[3] || '').toLowerCase().trim();
const password = String(process.argv[4] || '');

if (!mode || !email || !password) {
  console.error('Usage: node seed-users.mjs <staff-admin|super-admin> <email> <password>');
  process.exit(1);
}

const upsertStaffAdmin = async () => {
  const collection = mongoose.connection.collection('staff');
  const passwordHash = await bcrypt.hash(password, 10);

  await collection.updateOne(
    { email },
    {
      $set: {
        name: 'Test Admin',
        email,
        passwordHash,
        role: 'Admin',
        access_level: 'Admin',
        is_active: true,
        is_archived: false,
        can_delete: true,
        updatedAt: new Date(),
      },
      $setOnInsert: {
        hourly_rate: 0,
        available_hours_per_month: 160,
        productivity_factor: 0.8,
        annual_fee_budget: 0,
        annual_budgeted_hours: 0,
        manager_id: null,
        supervisor_ids: [],
        department_ids: [],
        department_id: null,
        phone: null,
        createdAt: new Date(),
      },
      $unset: {
        password_hash: '',
      },
    },
    { upsert: true }
  );
};

const upsertSuperAdmin = async () => {
  const collection = mongoose.connection.collection('super_admins');
  const password_hash = await bcrypt.hash(password, 10);

  await collection.updateOne(
    { email },
    {
      $set: {
        email,
        name: 'Test Super Admin',
        password_hash,
        is_active: true,
      },
      $setOnInsert: {
        created_at: new Date(),
      },
    },
    { upsert: true }
  );
};

await mongoose.connect(mongoUrl);

try {
  if (mode === 'staff-admin') {
    await upsertStaffAdmin();
  } else if (mode === 'super-admin') {
    await upsertSuperAdmin();
  } else {
    console.error(`Unsupported mode: ${mode}`);
    process.exitCode = 1;
  }
} finally {
  await mongoose.disconnect();
}
