import 'dotenv/config';
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';

const MONGO_URL       = process.env.MONGO_URL;
const ADMIN_NAME      = process.env.ADMIN_NAME;
const ADMIN_EMAIL     = process.env.ADMIN_EMAIL;
const ADMIN_PASSWORD  = process.env.ADMIN_PASSWORD;
const ADMIN_ORG_NAME  = process.env.ADMIN_ORG_NAME;
const ADMIN_SAAS_PLAN = (process.env.ADMIN_SAAS_PLAN || 'enterprise').toLowerCase();

async function seedAdmin() {
  await mongoose.connect(MONGO_URL);

  const Organisations = mongoose.connection.collection('organisations');
  const SaasPlans     = mongoose.connection.collection('saas_plans');
  const Admins        = mongoose.connection.collection('admins');

  console.log(`\nUsing ADMIN_SAAS_PLAN = "${ADMIN_SAAS_PLAN}"`);

  // ── 1. Seed SaaS Plans ────────────────────────────────────────────────────
  console.log('Seeding saas_plans...');
  await SaasPlans.deleteMany({});
  await SaasPlans.insertMany([
    { id: 'free',         name: 'Free',         max_users: 3,  max_clients: 20,  max_jobs: 50,   price_monthly: 0,    price_annual: 0,     created_at: new Date(), updated_at: new Date() },
    { id: 'starter',      name: 'Starter',      max_users: 10, max_clients: 100, max_jobs: 200,  price_monthly: 499,  price_annual: 4990,  created_at: new Date(), updated_at: new Date() },
    { id: 'professional', name: 'Professional', max_users: 30, max_clients: 500, max_jobs: 1000, price_monthly: 999,  price_annual: 9990,  created_at: new Date(), updated_at: new Date() },
    { id: 'enterprise',   name: 'Enterprise',   max_users: -1, max_clients: -1,  max_jobs: -1,   price_monthly: 2499, price_annual: 24990, created_at: new Date(), updated_at: new Date() },
  ]);
  console.log('Seeded saas_plans');

  // ── 2. Resolve SaasPlan ───────────────────────────────────────────────────
  const saasPlanDoc = await SaasPlans.findOne({ id: ADMIN_SAAS_PLAN });
  if (!saasPlanDoc) {
    console.warn(`⚠  No SaasPlan found with id="${ADMIN_SAAS_PLAN}". saas_plan_id will be null.`);
  } else {
    console.log(`SaasPlan resolved: ${saasPlanDoc.name} (${saasPlanDoc._id})`);
  }
  const saasPlanId = saasPlanDoc?._id || null;

  // ── 3. Upsert Organisation ────────────────────────────────────────────────
  const orgSubdomain = ADMIN_ORG_NAME.toLowerCase().replace(/\s+/g, '-');
  let org = await Organisations.findOne({ subdomain: orgSubdomain });

  if (org) {
    console.log(`Organisation "${ADMIN_ORG_NAME}" exists — updating plan to ${ADMIN_SAAS_PLAN}...`);
    await Organisations.updateOne(
      { _id: org._id },
      { $set: { plan: ADMIN_SAAS_PLAN, saas_plan_id: saasPlanId, subscription_status: 'active', status: 'active', updated_at: new Date() } }
    );
  } else {
    console.log(`Creating organisation "${ADMIN_ORG_NAME}" with plan ${ADMIN_SAAS_PLAN}...`);
    const result = await Organisations.insertOne({
      firm_name:            ADMIN_ORG_NAME,
      subdomain:            orgSubdomain,
      email:                ADMIN_EMAIL.toLowerCase().trim(),
      phone:                null,
      status:               'active',
      plan:                 ADMIN_SAAS_PLAN,
      saas_plan_id:         saasPlanId,
      subscription_status:  'active',
      trial_ends_at:        null,
      subscription_ends_at: null,
      currency_symbol:      'R',
      created_at:           new Date(),
      updated_at:           new Date(),
    });
    org = { _id: result.insertedId };
  }
  console.log(`Organisation id: ${org._id}`);

  // ── 4. Upsert Admin (owner) ───────────────────────────────────────────────
  const adminEmail = ADMIN_EMAIL.toLowerCase().trim();
  const hash = await bcrypt.hash(ADMIN_PASSWORD, 10);
  const existing = await Admins.findOne({ email: adminEmail });

  if (existing) {
    console.log('Admin exists — updating credentials and organisation...');
    await Admins.updateOne(
      { _id: existing._id },
      {
        $set: {
          passwordHash:                hash,
          organisation_id:             org._id,
          name:                        ADMIN_NAME,
          role:                        'owner',
          status:                      'active',
          is_active:                   true,
          email_verification_required: false,
          email_verified_at:           new Date(),
          mustChangePassword:          false,
          accepted_at:                 new Date(),
          updated_at:                  new Date(),
        },
      }
    );
    console.log('Admin (owner) updated');
  } else {
    console.log('Creating admin (owner)...');
    await Admins.insertOne({
      organisation_id:                 org._id,
      email:                           adminEmail,
      name:                            ADMIN_NAME,
      phone:                           null,
      passwordHash:                    hash,
      role:                            'owner',
      status:                          'active',
      is_active:                       true,
      mustChangePassword:              false,
      email_verified_at:               new Date(),
      email_verification_required:     false,
      email_verification_last_sent_at: null,
      email_verification_last_error:   null,
      email_verification_last_error_at: null,
      invited_by_admin_id:             null,
      invited_at:                      null,
      accepted_at:                     new Date(),
      created_at:                      new Date(),
      updated_at:                      new Date(),
    });
    console.log('Admin (owner) created');
  }

  // ── 5. Seed Job Types ─────────────────────────────────────────────────────
  console.log('\nDropping allocations and job_types...');
  await mongoose.connection.collection('allocations').deleteMany({});
  await mongoose.connection.collection('job_types').deleteMany({});

  const now = new Date();
  await mongoose.connection.collection('job_types').insertMany([
    {
      name: 'Payroll', description: 'Monthly payroll processing service.', is_active: true,
      work_components: [
        { name: 'P: Reviewer',   service: 'payroll', role: 'Reviewer',   percentage: 10, hours_multiplier: 1 },
        { name: 'P: Accountant', service: 'payroll', role: 'Accountant', percentage: 90, hours_multiplier: 1 },
      ],
      createdAt: now, updatedAt: now,
    },
    {
      name: 'Management Accounts', description: 'Monthly or quarterly management accounts preparation.', is_active: true,
      work_components: [
        { name: 'MA: Bookkeeper', service: 'ma', role: 'Bookkeeper', percentage: 50, hours_multiplier: 1 },
        { name: 'MA: Accountant', service: 'ma', role: 'Accountant', percentage: 40, hours_multiplier: 1 },
        { name: 'MA: Reviewer',   service: 'ma', role: 'Reviewer',   percentage: 10, hours_multiplier: 1 },
      ],
      createdAt: now, updatedAt: now,
    },
  ]);
  console.log('Seeded job types: Payroll, Management Accounts');

  // ── 6. Seed Departments ───────────────────────────────────────────────────
  console.log('Dropping departments...');
  await mongoose.connection.collection('departments').deleteMany({});
  await mongoose.connection.collection('departments').insertMany([
    { name: 'Payroll',             code: 'PAY', description: 'Payroll processing and compliance.',         color: '#3B82F6', supervisor_id: null, is_active: true, createdAt: now, updatedAt: now },
    { name: 'Management Accounts', code: 'MA',  description: 'Monthly and quarterly management accounts.', color: '#8B5CF6', supervisor_id: null, is_active: true, createdAt: now, updatedAt: now },
    { name: 'Tax',                 code: 'TAX', description: 'Tax compliance, returns and advisory.',      color: '#F59E0B', supervisor_id: null, is_active: true, createdAt: now, updatedAt: now },
    { name: 'Audit',               code: 'AUD', description: 'External and internal audit engagements.',   color: '#10B981', supervisor_id: null, is_active: true, createdAt: now, updatedAt: now },
    { name: 'Admin',               code: 'ADM', description: 'Office administration and firm operations.', color: '#6B7280', supervisor_id: null, is_active: true, createdAt: now, updatedAt: now },
  ]);
  console.log('Seeded departments: Payroll, Management Accounts, Tax, Audit, Admin');

  // ── 7. Upsert Settings (with explicit brand colors) ─────────────────────
  const Settings = mongoose.connection.collection('settings');
  const existingSettings = await Settings.findOne({ organisation_id: org._id });
  if (existingSettings) {
    console.log('Settings exist — skipping color seed (preserve user customisations)');
  } else {
    await Settings.insertOne({
      organisation_id: org._id,
      firm_name:              ADMIN_ORG_NAME,
      tagline:                'Workflow Planner',
      currency:               'ZAR',
      currency_symbol:        'R',
      default_working_hours:  160,
      logo_url:               null,
      primary_color:          '#3B82F6',
      secondary_color:        '#10B981',
      accent_color:           '#8B5CF6',
      company_address:        null,
      company_phone:          null,
      company_email:          null,
      company_website:        null,
      tax_registration_number: null,
      emailConfig:            { host: null, port: 587, secure: false, user: null, encryptedPassword: null, fromName: null, fromAddress: null, enabled: false },
      createdAt:              now,
      updatedAt:              now,
    });
    console.log('Seeded settings with brand colors');
  }

  await mongoose.disconnect();
  console.log('\n✅ Seed complete');
}

seedAdmin().catch((err) => {
  console.error(err);
  process.exit(1);
});
