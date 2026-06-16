import crypto from 'node:crypto';
import Payment from '../models/Payment.js';
import Organisation from '../models/Organisation.js';
import SaasPlan from '../models/SaasPlan.js';
import Admin from '../models/Admin.js';
import Staff from '../models/Staff.js';
import SuperAdmin from '../models/SuperAdmin.js';
import {
  getSaasPlans as getConfiguredSaasPlans,
  getSaasPlansMap as getConfiguredSaasPlansMap,
} from '../config/saasPlans.js';
import { assertPaystackBillingConfigured, getPaystackPublicConfig } from '../config/paystack.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { hashPassword, verifyPasswordWithMetadata } from '../utils/password.js';
import { getCookieOptions, signJwt } from '../utils/jwt.js';
import { serializeDocument, serializeList } from '../utils/serialize.js';
import { toObjectId } from '../utils/objectId.js';
import { checkOrganisationLimitForEmailAndPlan } from '../services/planLimitService.js';
import { buildSubscriptionUsageSnapshot } from '../services/subscriptionUsageService.js';
import {
  enqueueAdminSeedWelcomeEmailJob,
  enqueueOrgVerificationPinEmailJob,
} from '../jobs/emailQueue.js';
import ActivityLog from '../models/ActivityLog.js';
import AuthToken from '../models/AuthToken.js';
import Client from '../models/Client.js';
import Job from '../models/Job.js';
import { sendEmailMessage } from '../services/emailService.js';
import { seedOrgDefaults } from '../utils/seedOrgDefaults.js';
import { seedSystemJobTypesForOrganisation } from '../utils/seedSystemJobTypes.js';
import {
  handlePaystackWebhookEvent,
  initializePaystackCheckout,
  syncBillingStateFromVerifiedTransaction,
  verifyPaystackTransaction,
  verifyPaystackWebhookSignature,
} from '../services/paystackBillingService.js';

const parseDurationToMs = (rawValue, fallbackMs) => {
  const value = String(rawValue || '').trim().toLowerCase();
  const match = value.match(/^(\d+)\s*([smhd])$/);
  if (!match) return fallbackMs;
  const amount = Number(match[1]);
  const unit = match[2];
  if (!Number.isFinite(amount) || amount <= 0) return fallbackMs;
  if (unit === 's') return amount * 1000;
  if (unit === 'm') return amount * 60 * 1000;
  if (unit === 'h') return amount * 60 * 60 * 1000;
  if (unit === 'd') return amount * 24 * 60 * 60 * 1000;
  return fallbackMs;
};

const VERIFY_PIN_TTL_RAW = process.env.VERIFY_PIN_TOKEN_TTL || '15m';
const VERIFY_PIN_TTL_MS = parseDurationToMs(VERIFY_PIN_TTL_RAW, 15 * 60 * 1000);
const VERIFY_PIN_MAX_ATTEMPTS = Math.max(1, Number(process.env.VERIFY_PIN_MAX_ATTEMPTS || 3));

const sanitizeSubdomain = (firmName) =>
  String(firmName || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 25);

export const buildFrontendBillingRedirectUrl = ({ status = 'success', reference = null, reason = null } = {}) => {
  const base = String(process.env.APP_BASE_URL || process.env.BASE_URL || '').replace(/\/$/, '');
  const query = new URLSearchParams({ tab: 'subscription', paystack: status });
  if (reference) query.set('reference', String(reference));
  if (reason) query.set('reason', String(reason));
  const relativePath = `/app/settings?${query.toString()}`;
  return base ? `${base}${relativePath}` : relativePath;
};

const issueSaasToken = (res, payload) => {
  const token = signJwt(payload);
  res.cookie(process.env.AUTH_COOKIE_NAME || 'access_token', token, getCookieOptions());
  return token;
};

const sanitizeOrganisation = (org) => {
  const safe = serializeDocument(org);
  delete safe.password_hash;
  delete safe.owner_password_hash;
  return safe;
};

const sanitizeAdmin = (admin) => {
  const safe = serializeDocument(admin);
  delete safe.passwordHash;
  delete safe.password_hash;
  return safe;
};

const loadPlans = async () => {
  try {
    return await getConfiguredSaasPlans();
  } catch (error) {
    error.status = 500;
    error.message = `Unable to load SaaS plans: ${error.message}`;
    throw error;
  }
};

const loadPlansMap = async () => {
  try {
    return await getConfiguredSaasPlansMap();
  } catch (error) {
    error.status = 500;
    error.message = `Unable to load SaaS plans: ${error.message}`;
    throw error;
  }
};

const normalizePaystackPlanMapping = (mapping) => {
  if (!mapping) return null;
  return {
    local_plan_key: mapping.local_plan_key || null,
    interval: mapping.interval || null,
    plan_code: mapping.plan_code || null,
  };
};

const getPaystackPlanMapping = (plan, billingCycle) => {
  const normalizedCycle = billingCycle === 'annual' ? 'annual' : 'monthly';
  return plan?.billing?.paystack?.[normalizedCycle] || null;
};

const normalizePlan = (plan) => ({
  id: plan.id,
  name: plan.name,
  price_monthly: plan.price_monthly,
  price_annual: plan.price_annual,
  max_users: plan.max_users,
  max_clients: plan.max_clients,
  max_jobs: plan.max_jobs,
  max_admins_per_organisation: plan.max_admins_per_organisation,
  max_organisations_per_owner_email: plan.max_organisations_per_owner_email,
  recommended: Boolean(plan.recommended),
  features: Array.isArray(plan.features) ? plan.features : [],
  billing: {
    provider: plan.billing?.provider || null,
    paystack: {
      monthly: normalizePaystackPlanMapping(plan.billing?.paystack?.monthly),
      annual: normalizePaystackPlanMapping(plan.billing?.paystack?.annual),
    },
  },
});

const buildCheckoutSummary = (payment) => {
  if (!payment) return null;
  return {
    payment_id: payment._id.toString(),
    status: payment.status,
    plan: payment.plan,
    billing_cycle: payment.billing_cycle,
    amount: payment.amount,
    reference: payment.paystack?.reference || null,
    access_code: payment.paystack?.access_code || null,
    authorization_url: payment.paystack?.metadata?.authorization_url || null,
  };
};

const getLatestRetryableCheckout = async (organisationId) => {
  if (!organisationId) return null;
  return Payment.findOne({
    organisation_id: organisationId,
    payment_method: 'paystack',
    status: { $in: ['pending', 'failed'] },
  })
    .sort({ created_at: -1 });
};

const getLatestVerificationTokenId = async (email, organisationId) => {
  const tokenDoc = await AuthToken.findOne({
    email,
    organisation_id: organisationId,
    token_kind: 'verify_pin',
    status: 'active',
  })
    .sort({ created_at: -1 })
    .select('_id')
    .lean();
  return tokenDoc?._id?.toString() || null;
};

const buildPaidSignupBillingPayload = async ({ organisation, ownerAdmin, verificationTokenId = null }) => {
  const retryableCheckout = await getLatestRetryableCheckout(organisation._id);
  const authToken = signJwt({
    sub: ownerAdmin._id.toString(),
    type: 'admin',
    email: ownerAdmin.email,
    role: ownerAdmin.role,
    organisation_id: organisation._id.toString(),
    mustChangePassword: ownerAdmin.mustChangePassword || false,
  });
  const safeAdmin = sanitizeAdmin(ownerAdmin);
  safeAdmin.organisation_id = organisation._id.toString();
  safeAdmin.orgSession = organisation._id.toString();
  safeAdmin.organisations = [
    {
      id: organisation._id.toString(),
      organisation_id: organisation._id.toString(),
      firm_name: organisation.firm_name,
      subdomain: organisation.subdomain || null,
      role: ownerAdmin.role || 'owner',
    },
  ];

  return {
    required: true,
    resumable: true,
    status: organisation.status,
    plan: organisation.plan,
    billing_cycle:
      retryableCheckout?.billing_cycle ||
      organisation.paystack?.subscription?.billing_cycle ||
      'monthly',
    checkout: buildCheckoutSummary(retryableCheckout),
    session: {
      token: authToken,
      admin: safeAdmin,
    },
    verification: {
      email: ownerAdmin.email,
      tokenId: verificationTokenId,
    },
  };
};

const findResumablePaidSignup = async ({ email, plan }) => {
  const organisation = await Organisation.findOne({
    email,
    plan,
    status: 'pending',
    billing_provider: 'paystack',
  }).sort({ created_at: -1 });
  if (!organisation) return null;

  const ownerAdmin = await Admin.findOne({
    organisation_id: organisation._id,
    email,
    role: 'owner',
    status: 'active',
  }).sort({ created_at: -1 });
  if (!ownerAdmin) return null;

  return { organisation, ownerAdmin };
};

export const getAllSaasPlans = asyncHandler(async (_req, res) => {
  const plans = await loadPlans();
  return res.json(plans.map(normalizePlan));
});

export const getPlans = asyncHandler(async (_req, res) => {
  const plans = await loadPlans();
  return res.json(plans.map(normalizePlan));
});

export const getUsage = asyncHandler(async (req, res) => {
  const snapshot = await buildSubscriptionUsageSnapshot(req.user?.organisation_id, {
    fallbackEmail: req.user?.email || null,
  });
  return res.json(snapshot);
});

export const registerOrganisation = asyncHandler(async (req, res) => {
  const PLAN_LIMITS = await loadPlansMap();
  const { firm_name, owner_name, email, password, phone, plan = 'free' } = req.body || {};
  if (!firm_name || !owner_name || !email || !password) {
    return res.status(400).json({ detail: 'firm_name, owner_name, email and password are required' });
  }

  if (String(password).length < 6) {
    return res.status(400).json({ detail: 'Password must be at least 6 characters long' });
  }

  if (!PLAN_LIMITS[plan]) return res.status(400).json({ detail: 'Invalid plan' });

  const normalizedEmail = String(email).toLowerCase().trim();
  const isFree = plan === 'free';

  if (!isFree) {
    const resumableSignup = await findResumablePaidSignup({ email: normalizedEmail, plan });
    if (resumableSignup) {
      const passwordCheck = await verifyPasswordWithMetadata(password, resumableSignup.ownerAdmin.passwordHash);
      if (!passwordCheck.ok) {
        return res.status(409).json({
          detail: 'A pending paid signup already exists for this email. Use the original password or sign in to resume checkout.',
        });
      }

      if (resumableSignup.ownerAdmin.is_active === false) {
        resumableSignup.ownerAdmin.is_active = true;
        await resumableSignup.ownerAdmin.save();
      }

      const verificationTokenId = await getLatestVerificationTokenId(normalizedEmail, resumableSignup.organisation._id);
      return res.json({
        message: 'Registration already exists for this paid plan. Verify your email and sign in to finish checkout.',
        resumed_purchase: true,
        organisation: sanitizeOrganisation(resumableSignup.organisation),
        owner: sanitizeAdmin(resumableSignup.ownerAdmin),
        verification: {
          required: true,
          can_resend: true,
          email: resumableSignup.ownerAdmin.email,
          tokenId: verificationTokenId,
          delivery: null,
          welcome_delivery: null,
          warning: null,
        },
        billing: await buildPaidSignupBillingPayload({
          organisation: resumableSignup.organisation,
          ownerAdmin: resumableSignup.ownerAdmin,
          verificationTokenId,
        }),
      });
    }
  }

  if (!(await checkOrganisationLimitForEmailAndPlan(res, normalizedEmail, plan))) {
    return;
  }
  const existingEmail = await Organisation.findOne({ email: normalizedEmail });
  if (existingEmail) return res.status(409).json({ detail: 'Email already registered' });

  const existingAdmin = await Admin.findOne({ email: normalizedEmail });
  if (existingAdmin) return res.status(409).json({ detail: 'Email already in use by another admin' });

  const base = sanitizeSubdomain(firm_name) || `org-${crypto.randomBytes(3).toString('hex')}`;
  let subdomain = base;
  let i = 1;
  while (await Organisation.findOne({ subdomain })) {
    subdomain = `${base}${i}`;
    i += 1;
  }

  const ownerPasswordHash = await hashPassword(password);

  // Resolve the SaasPlan document so we can store saas_plan_id on the org
  const saasPlanDoc = await SaasPlan.findOne({ id: plan }).lean();

  const created = await Organisation.create({
    firm_name,
    subdomain,
    email: normalizedEmail,
    phone: phone || null,
    status: isFree ? 'active' : 'pending',
    plan,
    saas_plan_id: saasPlanDoc?._id || null,
    subscription_status: 'trial',
    trial_ends_at: new Date(Date.now() + Number(process.env.SAAS_TRIAL_DAYS ?? 14) * 24 * 3600 * 1000),
    billing_provider: isFree ? null : 'paystack',
  });

  const ownerAdmin = await Admin.create({
    organisation_id: created._id,
    name: String(owner_name).trim(),
    email: normalizedEmail,
    phone: phone || null,
    passwordHash: ownerPasswordHash,
    show_onboarding: true,
    role: 'owner',
    status: 'active',
    is_active: isFree ? false : true,
    email_verified_at: null,
    email_verification_required: true,
    accepted_at: new Date(),
  });

  // Seed default departments and job types — non-blocking so it never fails registration
  try {
    await seedOrgDefaults(created._id, ownerAdmin._id);
  } catch (seedErr) {
    console.error(`[registerOrganisation] ⚠️  seedOrgDefaults failed for org ${created._id}: ${seedErr.message}`);
  }
  try {
    const result = await seedSystemJobTypesForOrganisation(created._id);
    console.log(`[registerOrganisation] Seeded ${result.jobTypesUpserted} system job types for org ${created._id}`);
  } catch (seedErr) {
    console.error(`[registerOrganisation] ⚠️  seedSystemJobTypesForOrganisation failed for org ${created._id}: ${seedErr.message}`);
  }

  // Generate 4-digit PIN for email verification
  const rawPin = String(crypto.randomInt(1000, 9999));
  const pinHash = await hashPassword(rawPin);
  const pinExpiresAt = new Date(Date.now() + VERIFY_PIN_TTL_MS);

  // Revoke any existing verify_pin tokens for this email
  await AuthToken.updateMany(
    { email: normalizedEmail, token_kind: 'verify_pin', status: 'active' },
    { $set: { status: 'revoked', revoked_at: new Date() } }
  );

  const tokenDoc = await AuthToken.create({
    token_kind: 'verify_pin',
    jwt_id: crypto.randomUUID(),
    pin_hash: pinHash,
    attempt_count: 0,
    max_attempts: VERIFY_PIN_MAX_ATTEMPTS,
    admin_id: ownerAdmin._id,
    organisation_id: created._id,
    email: normalizedEmail,
    status: 'active',
    expires_at: pinExpiresAt,
  });

  let emailQueued = false;
  let emailJobId = null;
  let emailError = null;

  let welcomeEmailQueued = false;
  let welcomeEmailJobId = null;
  let welcomeEmailError = null;

  try {
    const job = await enqueueOrgVerificationPinEmailJob({
      authTokenId: tokenDoc._id,
      organisationId: created._id,
      email: normalizedEmail,
      name: ownerAdmin.name,
      pin: rawPin,
      expiryLabel: VERIFY_PIN_TTL_RAW,
      firmName: firm_name,
    });
    emailQueued = true;
    emailJobId = String(job.id || '');
  } catch (error) {
    emailError = error.message || 'Failed to queue verification email';
    console.warn(`[registerOrganisation] Failed to queue verification email for ${normalizedEmail}: ${emailError}`);
  }

  try {
    const welcomeJob = await enqueueAdminSeedWelcomeEmailJob({
      organisationId: created._id,
      email: normalizedEmail,
      name: ownerAdmin.name,
      password,
      orgName: firm_name,
    });
    welcomeEmailQueued = true;
    welcomeEmailJobId = String(welcomeJob.id || '');
  } catch (error) {
    welcomeEmailError = error.message || 'Failed to queue welcome email';
    console.warn(`[registerOrganisation] Failed to queue welcome email for ${normalizedEmail}: ${welcomeEmailError}`);
  }

  const safeAdmin = sanitizeAdmin(ownerAdmin);

  // Non-blocking activity log entry
  ActivityLog.create({
    action: 'organisation_registered',
    organisation_id: created._id,
    firm_name: firm_name,
    performed_by: ownerAdmin.email,
    metadata: { plan, is_free: isFree },
  }).catch(() => {});

  return res.status(201).json({
    message: isFree
      ? 'Registration successful. Please verify your email before signing in.'
      : 'Registration started successfully. Please verify your email, then sign in to complete payment.',
    organisation: sanitizeOrganisation(created),
    owner: safeAdmin,
    verification: {
      required: true,
      can_resend: true,
      email: ownerAdmin.email,
      tokenId: tokenDoc._id.toString(),
      delivery: {
        queued: emailQueued,
        sent: false,
        error: emailError,
        job_id: emailJobId,
      },
      welcome_delivery: {
        queued: welcomeEmailQueued,
        sent: false,
        error: welcomeEmailError,
        job_id: welcomeEmailJobId,
      },
      warning: emailQueued
        ? null
        : `Registration was successful, but verification email was not queued${emailError ? `: ${emailError}` : ''}. Please use the verify page to resend.`,
    },
    billing: isFree
      ? null
      : await buildPaidSignupBillingPayload({
          organisation: created,
          ownerAdmin,
          verificationTokenId: tokenDoc._id.toString(),
        }),
  });
});

export const createSubscription = asyncHandler(async (req, res) => {
  const { organisation_id, plan, billing_cycle = 'monthly' } = req.body || {};
  const authOrgId = req.organisation?._id?.toString();
  const requestedOrgId = organisation_id ? toObjectId(organisation_id, 'organisation_id').toString() : null;
  if (requestedOrgId && requestedOrgId !== authOrgId) {
    return res.status(403).json({ detail: 'Cannot create subscription for another organisation' });
  }

  const organisation = await Organisation.findById(authOrgId);
  if (!organisation) return res.status(404).json({ detail: 'Organisation not found' });
  const checkoutSession = await initializePaystackCheckout({
    organisation,
    planId: plan,
    billingCycle: billing_cycle,
  });

  if (checkoutSession.mode === 'free') {
    return res.json({
      message: checkoutSession.message,
      plan: 'free',
    });
  }

  return res.json({
    payment_id: checkoutSession.payment._id.toString(),
    amount: checkoutSession.payment.amount,
    plan,
    billing_cycle,
    checkout: checkoutSession.checkout,
  });
});

export const paystackCallback = asyncHandler(async (req, res) => {
  const reference = String(req.query.reference || req.query.trxref || '').trim();
  if (!reference) {
    return res.redirect(buildFrontendBillingRedirectUrl({
      status: 'failed',
      reason: 'missing_reference',
    }));
  }

  try {
    const transaction = await verifyPaystackTransaction(reference);
    await syncBillingStateFromVerifiedTransaction(transaction, {
      eventType: 'callback',
    });

    if (transaction.status === 'success') {
      return res.redirect(buildFrontendBillingRedirectUrl({
        status: 'success',
        reference,
      }));
    }

    return res.redirect(buildFrontendBillingRedirectUrl({
      status: 'failed',
      reference,
      reason: transaction.status || 'verification_failed',
    }));
  } catch (error) {
    return res.redirect(buildFrontendBillingRedirectUrl({
      status: 'failed',
      reference,
      reason: error?.message || 'callback_verification_failed',
    }));
  }
});

export const paystackWebhook = asyncHandler(async (req, res) => {
  const signature = req.headers['x-paystack-signature'];
  const rawBody = req.rawBody || JSON.stringify(req.body || {});
  const validSignature = verifyPaystackWebhookSignature(rawBody, signature);

  if (!validSignature) {
    return res.status(401).json({ detail: 'Invalid Paystack webhook signature' });
  }

  await handlePaystackWebhookEvent(req.body || {});
  return res.json({ status: 'ok' });
});

export const payfastItnWebhook = asyncHandler(async (req, res) => {
  const { payment_id, status = 'COMPLETE', pf_payment_id = null, amount_gross = 0, amount_fee = 0, amount_net = 0, token = null } = req.body || {};
  const pid = toObjectId(payment_id, 'payment_id');

  const payment = await Payment.findById(pid);
  if (!payment) return res.status(404).json({ detail: 'Payment not found' });

  const completed = String(status).toUpperCase() === 'COMPLETE';
  payment.status = completed ? 'completed' : 'failed';
  payment.payfast_payment_id = pf_payment_id;
  payment.amount_gross = Number(amount_gross || 0);
  payment.amount_fee = Number(amount_fee || 0);
  payment.amount_net = Number(amount_net || 0);
  payment.completed_at = new Date();
  await payment.save();

  if (completed) {
    const organisation = await Organisation.findById(payment.organisation_id);
    if (organisation) {
      const newPlan = payment.plan || organisation.plan;
      const saasPlanDoc = await SaasPlan.findOne({ id: newPlan }).lean();
      organisation.plan = newPlan;
      organisation.saas_plan_id = saasPlanDoc?._id || organisation.saas_plan_id;
      organisation.subscription_status = 'active';
      organisation.status = 'active';
      organisation.billing_provider = organisation.billing_provider || 'payfast';
      organisation.payfast_token = token;
      const days = payment.billing_cycle === 'annual' ? 365 : 30;
      organisation.subscription_ends_at = new Date(Date.now() + days * 24 * 3600 * 1000);
      await organisation.save();
    }
  }

  return res.json({ status: 'ok' });
});

export const superAdminLogin = asyncHandler(async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ detail: 'Email and password are required' });

  const admin = await SuperAdmin.findOne({ email: String(email).toLowerCase().trim(), is_active: true });
  if (!admin) return res.status(401).json({ detail: 'Invalid credentials' });

  const verification = await verifyPasswordWithMetadata(password, admin.password_hash);
  if (!verification.ok) return res.status(401).json({ detail: 'Invalid credentials' });

  if (verification.algorithm === 'sha256') {
    admin.password_hash = await hashPassword(password);
    await admin.save();
  }

  const token = issueSaasToken(res, { sub: admin._id.toString(), type: 'super_admin', email: admin.email });
  return res.json({ token, admin: serializeDocument(admin) });
});

export const adminDashboard = asyncHandler(async (_req, res) => {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const [total, active, pending, suspended, newRegistrations, payments] = await Promise.all([
    Organisation.countDocuments({}),
    Organisation.countDocuments({ status: 'active' }),
    Organisation.countDocuments({ status: 'pending' }),
    Organisation.countDocuments({ status: 'suspended' }),
    Organisation.countDocuments({ created_at: { $gte: thirtyDaysAgo } }),
    Payment.find({ status: 'completed' }),
  ]);

  const nowMonth = new Date().toISOString().slice(0, 7);
  const totalRevenue = payments.reduce((acc, p) => acc + Number(p.amount_net || p.amount || 0), 0);
  const monthlyRevenue = payments
    .filter((p) => p.completed_at && new Date(p.completed_at).toISOString().slice(0, 7) === nowMonth)
    .reduce((acc, p) => acc + Number(p.amount_net || p.amount || 0), 0);

  return res.json({
    organisations: { total, active, pending, suspended },
    new_registrations: newRegistrations,
    revenue: { total: totalRevenue, monthly: monthlyRevenue, currency: 'ZAR' },
  });
});

export const listOrganisations = asyncHandler(async (req, res) => {
  const query = {};

  if (req.query.status) {
    query.status = String(req.query.status);
  }

  if (req.query.plan) {
    query.plan = String(req.query.plan);
  }

  if (req.query.search) {
    const s = String(req.query.search).trim();
    if (s) {
      query.$or = [
        { firm_name: { $regex: s, $options: 'i' } },
        { email: { $regex: s, $options: 'i' } },
        { subdomain: { $regex: s, $options: 'i' } },
      ];
    }
  }

  const rows = await Organisation.find(query).sort({ created_at: -1 });
  return res.json(serializeList(rows));
});

export const exportOrganisations = asyncHandler(async (req, res) => {
  const query = {};

  if (req.query.status) query.status = String(req.query.status);
  if (req.query.plan) query.plan = String(req.query.plan);
  if (req.query.search) {
    const s = String(req.query.search).trim();
    if (s) {
      query.$or = [
        { firm_name: { $regex: s, $options: 'i' } },
        { email: { $regex: s, $options: 'i' } },
        { subdomain: { $regex: s, $options: 'i' } },
      ];
    }
  }

  const rows = await Organisation.find(query).sort({ created_at: -1 }).lean();

  const escapeCsv = (val) => `"${String(val || '').replace(/"/g, '""')}"`;

  const header = ['Firm Name', 'Email', 'Plan', 'Status', 'Subdomain', 'Phone', 'Registered At'].join(',');
  const csvRows = rows.map((o) =>
    [
      escapeCsv(o.firm_name),
      escapeCsv(o.email),
      escapeCsv(o.plan),
      escapeCsv(o.status),
      escapeCsv(o.subdomain),
      escapeCsv(o.phone),
      escapeCsv(o.created_at ? new Date(o.created_at).toISOString() : ''),
    ].join(',')
  );

  const csv = [header, ...csvRows].join('\n');

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="firms-${new Date().toISOString().slice(0, 10)}.csv"`);
  return res.send(csv);
});

export const getBillingConfig = asyncHandler(async (_req, res) => {
  return res.json(getPaystackPublicConfig());
});

export const getOrganisationDetail = asyncHandler(async (req, res) => {
  const org = await Organisation.findById(req.params.id);
  if (!org) return res.status(404).json({ detail: 'Organisation not found' });

  const [adminCount, staffCount, payments] = await Promise.all([
    Admin.countDocuments({ organisation_id: org._id }),
    Staff.countDocuments({ organisation_id: org._id }),
    Payment.find({ organisation_id: org._id }).sort({ created_at: -1 }).limit(50).lean(),
  ]);

  const lastAdminLogin = await Admin.findOne({ organisation_id: org._id })
    .sort({ last_login_at: -1 })
    .select('last_login_at email')
    .lean();

  return res.json({
    ...serializeDocument(org),
    stats: {
      admin_count: adminCount,
      staff_count: staffCount,
      payment_count: payments.length,
    },
    recent_payments: serializeList(payments),
    last_login: lastAdminLogin?.last_login_at || null,
    last_login_email: lastAdminLogin?.email || null,
  });
});

export const updateOrganisationStatus = asyncHandler(async (req, res) => {
  const { status } = req.body;
  if (!['active', 'suspended'].includes(status)) {
    return res.status(400).json({ detail: 'Status must be "active" or "suspended"' });
  }

  const org = await Organisation.findById(req.params.id);
  if (!org) return res.status(404).json({ detail: 'Organisation not found' });

  org.status = status;
  org.updated_at = new Date();
  await org.save();

  await ActivityLog.create({
    action: status === 'suspended' ? 'organisation_suspended' : 'organisation_activated',
    organisation_id: org._id,
    firm_name: org.firm_name,
    performed_by: req.user?.email || 'super_admin',
  });

  return res.json(serializeDocument(org));
});

export const updateOrganisationPlan = asyncHandler(async (req, res) => {
  const { plan } = req.body;
  const validPlans = ['free', 'starter', 'professional', 'enterprise'];
  if (!validPlans.includes(plan)) {
    return res.status(400).json({ detail: `Plan must be one of: ${validPlans.join(', ')}` });
  }

  const org = await Organisation.findById(req.params.id);
  if (!org) return res.status(404).json({ detail: 'Organisation not found' });

  const saasPlanDoc = await SaasPlan.findOne({ id: plan }).lean();

  const previousPlan = org.plan;
  org.plan = plan;
  org.saas_plan_id = saasPlanDoc?._id || null;
  org.updated_at = new Date();
  await org.save();

  await ActivityLog.create({
    action: 'plan_changed',
    organisation_id: org._id,
    firm_name: org.firm_name,
    performed_by: req.user?.email || 'super_admin',
    metadata: { previous_plan: previousPlan, new_plan: plan },
  });

  return res.json(serializeDocument(org));
});

export const listAllPayments = asyncHandler(async (req, res) => {
  const query = {};

  if (req.query.status) query.status = String(req.query.status);
  if (req.query.organisation_id) query.organisation_id = toObjectId(req.query.organisation_id);
  if (req.query.from || req.query.to) {
    query.created_at = {};
    if (req.query.from) query.created_at.$gte = new Date(req.query.from);
    if (req.query.to) query.created_at.$lte = new Date(req.query.to);
  }

  const payments = await Payment.find(query)
    .sort({ created_at: -1 })
    .populate('organisation_id', 'firm_name email');

  return res.json(serializeList(payments));
});

export const revenueOverTime = asyncHandler(async (req, res) => {
  const months = Number(req.query.months) || 12;
  const since = new Date();
  since.setMonth(since.getMonth() - months);
  since.setDate(1);

  const payments = await Payment.find({
    status: 'completed',
    completed_at: { $gte: since },
  }).lean();

  const byMonth = {};
  for (const p of payments) {
    if (!p.completed_at) continue;
    const key = new Date(p.completed_at).toISOString().slice(0, 7);
    byMonth[key] = (byMonth[key] || 0) + Number(p.amount_net || p.amount || 0);
  }

  const result = [];
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(since.getFullYear(), since.getMonth() + i, 1);
    const key = d.toISOString().slice(0, 7);
    result.push({ month: key, revenue: byMonth[key] || 0 });
  }

  return res.json({ data: result, currency: 'ZAR' });
});

export const usageStatistics = asyncHandler(async (_req, res) => {
  const [totalStaff, totalJobs, totalClients, activeOrgs] = await Promise.all([
    Staff.countDocuments({}),
    Job.countDocuments({}),
    Client.countDocuments({}),
    Organisation.countDocuments({ status: 'active' }),
  ]);

  return res.json({
    total_staff: totalStaff,
    total_jobs: totalJobs,
    total_clients: totalClients,
    active_organisations: activeOrgs,
    avg_staff_per_org: activeOrgs > 0 ? Number((totalStaff / activeOrgs).toFixed(1)) : 0,
    avg_jobs_per_org: activeOrgs > 0 ? Number((totalJobs / activeOrgs).toFixed(1)) : 0,
    avg_clients_per_org: activeOrgs > 0 ? Number((totalClients / activeOrgs).toFixed(1)) : 0,
  });
});

export const subscriptionMetrics = asyncHandler(async (_req, res) => {
  const total = await Organisation.countDocuments({});

  const [trial, active, pastDue, cancelled, expired] = await Promise.all([
    Organisation.countDocuments({ subscription_status: 'trial' }),
    Organisation.countDocuments({ subscription_status: 'active' }),
    Organisation.countDocuments({ subscription_status: 'past_due' }),
    Organisation.countDocuments({ subscription_status: 'cancelled' }),
    Organisation.countDocuments({ subscription_status: 'expired' }),
  ]);

  const convertible = total - cancelled - expired;
  const conversionRate = convertible > 0 ? Number(((active / convertible) * 100).toFixed(1)) : 0;
  const churnRate = total > 0 ? Number(((cancelled / total) * 100).toFixed(1)) : 0;

  const [free, starter, professional, enterprise] = await Promise.all([
    Organisation.countDocuments({ plan: 'free' }),
    Organisation.countDocuments({ plan: 'starter' }),
    Organisation.countDocuments({ plan: 'professional' }),
    Organisation.countDocuments({ plan: 'enterprise' }),
  ]);

  const monthlyBilling = await Organisation.countDocuments({
    subscription_status: 'active',
    'paystack.subscription.billing_cycle': { $in: ['monthly', null] },
  });

  return res.json({
    total_organisations: total,
    by_subscription_status: { trial, active, past_due: pastDue, cancelled, expired },
    by_plan: { free, starter, professional, enterprise },
    trial_conversion_rate: `${conversionRate}%`,
    churn_rate: `${churnRate}%`,
    billing_cycle_split: { monthly: monthlyBilling, annual: active - monthlyBilling },
  });
});

export const listActivity = asyncHandler(async (req, res) => {
  const query = {};

  if (req.query.action) query.action = String(req.query.action);
  if (req.query.organisation_id) query.organisation_id = toObjectId(req.query.organisation_id);
  if (req.query.from || req.query.to) {
    query.created_at = {};
    if (req.query.from) query.created_at.$gte = new Date(req.query.from);
    if (req.query.to) query.created_at.$lte = new Date(req.query.to);
  }

  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));
  const skip = (page - 1) * limit;

  const [rows, total] = await Promise.all([
    ActivityLog.find(query).sort({ created_at: -1 }).skip(skip).limit(limit).lean(),
    ActivityLog.countDocuments(query),
  ]);

  return res.json({
    data: rows,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  });
});

export const sendAnnouncement = asyncHandler(async (req, res) => {
  const { subject, body, segment } = req.body;
  if (!subject || !body) {
    return res.status(400).json({ detail: 'subject and body are required' });
  }

  const orgQuery = {};
  if (segment?.status) orgQuery.status = segment.status;
  if (segment?.plan) orgQuery.plan = segment.plan;

  const orgs = await Organisation.find(orgQuery).select('email firm_name').lean();

  let queued = 0;
  for (const org of orgs) {
    if (!org.email) continue;
    try {
      const result = sendEmailMessage({
        to: org.email,
        subject,
        html: body,
      });
      if (result?.sent) queued++;
    } catch (err) {
      console.error(`[sendAnnouncement] Failed to email ${org.email}: ${err.message}`);
    }
  }

  await ActivityLog.create({
    action: 'announcement_sent',
    performed_by: req.user?.email || 'super_admin',
    metadata: { subject, segment, recipient_count: queued },
  });

  return res.json({ message: 'Announcement processed', recipients: queued });
});
