import Organisation from '../models/Organisation.js';
import Admin from '../models/Admin.js';
import SuperAdmin from '../models/SuperAdmin.js';
import SaasPlan from '../models/SaasPlan.js';
import Setting from '../models/Setting.js';
import { getSaasPlans } from '../config/saasPlans.js';
import { hashPassword } from '../utils/password.js';
import { encrypt } from '../utils/encryption.js';
import { seedOrgDefaults } from './seedOrgDefaults.js';
import { enqueueAdminSeedWelcomeEmailJob } from '../jobs/emailQueue.js';
import dotenv from 'dotenv';

dotenv.config();

/**
 * Sync saas_plans collection from config, then return the plan doc
 * matching ADMIN_SAAS_PLAN env var.
 */
async function syncSaasPlans() {
  const plans = await getSaasPlans();
  for (const plan of plans) {
    await SaasPlan.updateOne({ id: plan.id }, { $set: plan }, { upsert: true });
  }
  console.log('[seedAdmin] ✅  SaaS plans synced to DB');
}

async function resolveSaasPlan() {
  const planKey = (process.env.ADMIN_SAAS_PLAN || 'free').toLowerCase().trim();
  const planDoc = await SaasPlan.findOne({ id: planKey });
  if (!planDoc) {
    console.warn(`[seedAdmin] ⚠️  SaaS plan "${planKey}" not found — defaulting to free`);
    return await SaasPlan.findOne({ id: 'free' });
  }
  return planDoc;
}

/**
 * Seed branding colors and/or SMTP email config into the org's Setting document.
 * Skips silently if a Setting already exists for this org.
 */
async function seedOrgSettings(orgId) {
  if (await Setting.exists({ organisation_id: orgId })) {
    console.log('[seedAdmin] ⏭️  Org settings already exist — skipping settings seed.');
    return;
  }

  const payload = {};

  // ── Branding ────────────────────────────────────────────────────────────────
  const toHexColor = (val) => {
    if (!val) return undefined;
    const s = String(val).trim();
    return s.startsWith('#') ? s : `#${s}`;
  };

  if (process.env.SEED_ADMIN_BRANDING === 'true') {
    const primary   = toHexColor(process.env.SEED_ADMIN_BRAND_PRIMARY_COLOR);
    const secondary = toHexColor(process.env.SEED_ADMIN_BRAND_SECONDARY_COLOR);
    const accent    = toHexColor(process.env.SEED_ADMIN_BRAND_ACCENT_COLOR);
    if (primary)   payload.primary_color   = primary;
    if (secondary) payload.secondary_color = secondary;
    if (accent)    payload.accent_color    = accent;
  }

  // ── Email config ────────────────────────────────────────────────────────────
  if (process.env.SEED_ADMIN_EMAIL_SETTINGS === 'true') {
    const rawPass = process.env.SEED_ADMIN_SMTP_PASS;
    payload.emailConfig = {
      host:              process.env.SEED_ADMIN_SMTP_HOST    || null,
      port:              Number(process.env.SEED_ADMIN_SMTP_PORT) || 587,
      secure:            process.env.SEED_ADMIN_SMTP_SECURE === 'true',
      user:              process.env.SEED_ADMIN_SMTP_USER    || null,
      encryptedPassword: rawPass ? encrypt(rawPass) : null,
      fromAddress:       process.env.SEED_ADMIN_SMTP_FROM_EMAIL || null,
      fromName:          process.env.SEED_ADMIN_SMTP_FROM_NAME  ||
                         process.env.ADMIN_NAME               || null,
      enabled:           true,
    };
  }

  if (Object.keys(payload).length === 0) {
    console.log('[seedAdmin] ⏭️  No branding/email seed flags set — skipping settings seed.');
    return;
  }

  await Setting.findOneAndUpdate(
    { organisation_id: orgId },
    { $set: payload },
    { upsert: true, new: true }
  );

  console.log('[seedAdmin] ✅  Org settings seeded (branding + email config).');
}

/**
 * Auto-seed the admin account + their organisation on first boot.
 * No-op if any Admin already exists in the database.
 */
export const autoSeedAdmin = async () => {
  const seedAdminOnStartup =
    typeof process.env.SEED_ADMIN_ON_STARTUP === 'string'
      ? process.env.SEED_ADMIN_ON_STARTUP === 'true'
      : process.env.NODE_ENV !== 'production';

  if (!seedAdminOnStartup) {
    console.log('[seedAdmin] SEED_ADMIN_ON_STARTUP=false, skipping admin/org defaults seeding.');
    return;
  }

  const { ADMIN_EMAIL, ADMIN_PASSWORD, ADMIN_NAME, ADMIN_ORG_NAME } = process.env;

  if (!ADMIN_EMAIL || !ADMIN_PASSWORD || !ADMIN_NAME) {
    console.error(
      '\n[seedAdmin] ❌  MISSING REQUIRED ENV VARS\n' +
      '  ADMIN_NAME, ADMIN_EMAIL and ADMIN_PASSWORD must all be set in .env\n' +
      '  Server boot aborted.\n'
    );
    process.exit(1);
  }

  // 1. Sync saas plans first so we can look them up
  await syncSaasPlans();

  const existingAdmin = await Admin.countDocuments({});
  if (existingAdmin > 0) {
    console.log('[seedAdmin] Admin already exists — skipping seed.');
    return;
  }

  const normalizedEmail = String(ADMIN_EMAIL).toLowerCase().trim();
  const adminName = String(ADMIN_NAME).trim();
  const orgName = String(ADMIN_ORG_NAME || ADMIN_NAME).trim();

  const subdomain = orgName
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 25) || 'admin-org';

  const passwordHash = await hashPassword(ADMIN_PASSWORD);

  // 2. Resolve the saas plan
  const saasPlanDoc = await resolveSaasPlan();

  // 3. Create the organisation with saas_plan_id
  const organisation = await Organisation.create({
    firm_name: orgName,
    subdomain,
    email: normalizedEmail,
    status: 'active',
    plan: saasPlanDoc?.id || 'free',
    saas_plan_id: saasPlanDoc?._id || null,
    subscription_status: 'active',
  });

  console.log(`[seedAdmin] 🏢  Organisation created: ${orgName} (${subdomain}) on plan: ${saasPlanDoc?.id}`);

  // 4. Create the Admin as owner
  const admin = await Admin.create({
    name: adminName,
    email: normalizedEmail,
    passwordHash,
    show_onboarding: true,
    role: 'owner',
    status: 'active',
    organisation_id: organisation._id,
    is_active: true,
    email_verified_at: new Date(),
    email_verification_required: false,
    mustChangePassword: false,
  });

  // 5. Back-link owner_admin_id on organisation
  organisation.owner_admin_id = admin._id;
  await organisation.save();

  // 6. Seed org settings (branding + email config)
  await seedOrgSettings(organisation._id);

  // 7. Seed default departments and job types for the new organisation
  await seedOrgDefaults(organisation._id, admin._id);

  console.log(`[seedAdmin] ✅  Admin seeded: ${ADMIN_EMAIL}`);

  // 8. Queue welcome email
  try {
    const queued = await enqueueAdminSeedWelcomeEmailJob({
      organisationId: organisation._id,
      email: normalizedEmail,
      name: adminName,
      password: ADMIN_PASSWORD,
      orgName,
    });
    console.log(`[seedAdmin] 📬  Welcome email queued: ${queued.id} to ${ADMIN_EMAIL}`);
  } catch (err) {
    console.warn(`[seedAdmin] ⚠️  Could not queue welcome email: ${err.message}`);
  }
};

/**
 * Auto-seed a Super Admin account on startup if none exist.
 * Checks SUPER_ADMIN_EMAIL, SUPER_ADMIN_PASSWORD, SUPER_ADMIN_NAME env vars.
 * No-op if any SuperAdmin already exists in the database.
 */
export const autoSeedSuperAdmin = async () => {
  const existing = await SuperAdmin.countDocuments({});
  if (existing > 0) {
    console.log('[seedAdmin] ⏭️  Super Admin already exists — skipping seed.');
    return;
  }

  const email    = process.env.SUPER_ADMIN_EMAIL;
  const password = process.env.SUPER_ADMIN_PASSWORD;
  const name     = process.env.SUPER_ADMIN_NAME;

  if (!email || !password || !name) {
    console.log(
      '[seedAdmin] SUPER_ADMIN_EMAIL, SUPER_ADMIN_PASSWORD and SUPER_ADMIN_NAME not all set — skipping super admin seed.'
    );
    return;
  }

  const normalizedEmail = String(email).toLowerCase().trim();

  const existingEmail = await SuperAdmin.findOne({ email: normalizedEmail });
  if (existingEmail) {
    console.log('[seedAdmin] ⏭️  Super Admin with that email already exists — skipping seed.');
    return;
  }

  await SuperAdmin.create({
    email: normalizedEmail,
    name: String(name).trim(),
    password_hash: await hashPassword(password),
    is_active: true,
  });

  console.log(`[seedAdmin] ✅  Super Admin seeded: ${normalizedEmail}`);
};
