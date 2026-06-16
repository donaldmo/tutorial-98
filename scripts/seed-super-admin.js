/**
 * Seed a Super Admin account.
 *
 * Usage:
 *   node scripts/seed-super-admin.js
 *
 * Required env vars (or edit defaults below):
 *   SUPER_ADMIN_EMAIL
 *   SUPER_ADMIN_PASSWORD
 *   SUPER_ADMIN_NAME
 */
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import SuperAdmin from '../src/models/SuperAdmin.js';
import { hashPassword } from '../src/utils/password.js';

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || process.env.DATABASE_URL;
if (!MONGODB_URI) {
  console.error('MONGODB_URI or DATABASE_URL must be set in .env');
  process.exit(1);
}

const email    = process.env.SUPER_ADMIN_EMAIL    || 'superadmin@brendmo.com';
const password = process.env.SUPER_ADMIN_PASSWORD || 'SuperAdmin123!';
const name     = process.env.SUPER_ADMIN_NAME     || 'Super Admin';

async function seed() {
  await mongoose.connect(MONGODB_URI);
  console.log('Connected to MongoDB');

  const existing = await SuperAdmin.findOne({ email: email.toLowerCase().trim() });
  if (existing) {
    console.log(`Super Admin "${email}" already exists — updating password`);
    existing.password_hash = await hashPassword(password);
    existing.name = name;
    existing.is_active = true;
    await existing.save();
    console.log('Password updated');
  } else {
    await SuperAdmin.create({
      email: email.toLowerCase().trim(),
      name,
      password_hash: await hashPassword(password),
      is_active: true,
    });
    console.log(`Super Admin created: ${email}`);
  }

  console.log(`\nLogin at: /super-admin/login`);
  console.log(`Email: ${email}`);
  console.log(`Password: ${password}`);

  await mongoose.disconnect();
}

seed().catch((err) => {
  console.error('Failed:', err);
  process.exit(1);
});
