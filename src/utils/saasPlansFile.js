import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SAAS_PLANS_FILE = path.resolve(__dirname, './saasPlans.json');

const NUMERIC_FIELDS = [
  'price_monthly',
  'price_annual',
  'max_users',
  'max_clients',
  'max_jobs',
  'max_admins_per_organisation',
  'max_organisations_per_owner_email',
];

const VALID_BILLING_PROVIDERS = new Set(['paystack']);
const VALID_BILLING_INTERVALS = new Set(['monthly', 'annual']);

const validateBillingEntry = (plan, billing, cycle) => {
  if (billing == null) return;
  if (!billing || typeof billing !== 'object' || Array.isArray(billing)) {
    throw new Error(`Invalid SaaS plan "${plan.id}": billing.paystack.${cycle} must be an object or null`);
  }
  if (!billing.local_plan_key || typeof billing.local_plan_key !== 'string') {
    throw new Error(`Invalid SaaS plan "${plan.id}": billing.paystack.${cycle}.local_plan_key must be a string`);
  }
  if (!billing.interval || !VALID_BILLING_INTERVALS.has(billing.interval)) {
    throw new Error(`Invalid SaaS plan "${plan.id}": billing.paystack.${cycle}.interval must be "monthly" or "annual"`);
  }
  if (billing.plan_code != null && typeof billing.plan_code !== 'string') {
    throw new Error(`Invalid SaaS plan "${plan.id}": billing.paystack.${cycle}.plan_code must be a string or null`);
  }
};

const validatePlan = (plan, index) => {
  if (!plan || typeof plan !== 'object' || Array.isArray(plan)) {
    throw new Error(`Invalid SaaS plan at index ${index}: expected an object`);
  }

  if (!plan.id || typeof plan.id !== 'string') {
    throw new Error(`Invalid SaaS plan at index ${index}: missing string "id"`);
  }

  if (!plan.name || typeof plan.name !== 'string') {
    throw new Error(`Invalid SaaS plan "${plan.id}": missing string "name"`);
  }

  for (const field of NUMERIC_FIELDS) {
    if (typeof plan[field] !== 'number' || Number.isNaN(plan[field])) {
      throw new Error(`Invalid SaaS plan "${plan.id}": "${field}" must be a number`);
    }
  }

  if (!Array.isArray(plan.features) || plan.features.some((feature) => typeof feature !== 'string')) {
    throw new Error(`Invalid SaaS plan "${plan.id}": "features" must be an array of strings`);
  }

  if (typeof plan.recommended !== 'boolean') {
    throw new Error(`Invalid SaaS plan "${plan.id}": "recommended" must be a boolean`);
  }

  if (typeof plan.billing === 'undefined') {
    return;
  }

  if (!plan.billing || typeof plan.billing !== 'object' || Array.isArray(plan.billing)) {
    throw new Error(`Invalid SaaS plan "${plan.id}": "billing" must be an object`);
  }

  if (plan.billing.provider != null && !VALID_BILLING_PROVIDERS.has(plan.billing.provider)) {
    throw new Error(`Invalid SaaS plan "${plan.id}": billing.provider must be "paystack" or null`);
  }

  if (typeof plan.billing.paystack === 'undefined') {
    return;
  }

  if (!plan.billing.paystack || typeof plan.billing.paystack !== 'object' || Array.isArray(plan.billing.paystack)) {
    throw new Error(`Invalid SaaS plan "${plan.id}": billing.paystack must be an object`);
  }

  validateBillingEntry(plan, plan.billing.paystack.monthly, 'monthly');
  validateBillingEntry(plan, plan.billing.paystack.annual, 'annual');
};

export async function readSaasPlans() {
  let raw;
  try {
    raw = await readFile(SAAS_PLANS_FILE, 'utf8');
  } catch (error) {
    error.message = `Failed to read SaaS plans file: ${error.message}`;
    throw error;
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    error.message = `Failed to parse SaaS plans JSON: ${error.message}`;
    throw error;
  }

  if (!Array.isArray(parsed)) {
    throw new Error('Invalid SaaS plans JSON: top-level value must be an array');
  }

  const seenIds = new Set();
  parsed.forEach((plan, index) => {
    validatePlan(plan, index);
    if (seenIds.has(plan.id)) {
      throw new Error(`Invalid SaaS plans JSON: duplicate plan id "${plan.id}"`);
    }
    seenIds.add(plan.id);
  });

  return parsed;
}

export async function readSaasPlansMap() {
  const plans = await readSaasPlans();
  return Object.fromEntries(plans.map((plan) => [plan.id, plan]));
}

export { SAAS_PLANS_FILE };
