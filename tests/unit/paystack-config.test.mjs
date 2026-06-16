import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assertPaystackBillingConfigured,
  buildPaystackConfig,
  getPaystackPublicConfig,
} from '../../src/config/paystack.js';
import { readSaasPlans } from '../../src/utils/saasPlansFile.js';

const restoreEnvVar = (key, value) => {
  if (typeof value === 'undefined') {
    delete process.env[key];
    return;
  }
  process.env[key] = value;
};

test('buildPaystackConfig reports missing required billing fields', () => {
  const previous = {
    PAYSTACK_SECRET_KEY: process.env.PAYSTACK_SECRET_KEY,
    PAYSTACK_PUBLIC_KEY: process.env.PAYSTACK_PUBLIC_KEY,
    PAYSTACK_CALLBACK_URL: process.env.PAYSTACK_CALLBACK_URL,
    PAYSTACK_WEBHOOK_URL: process.env.PAYSTACK_WEBHOOK_URL,
  };

  delete process.env.PAYSTACK_SECRET_KEY;
  delete process.env.PAYSTACK_PUBLIC_KEY;
  delete process.env.PAYSTACK_CALLBACK_URL;
  delete process.env.PAYSTACK_WEBHOOK_URL;

  const config = buildPaystackConfig();

  assert.equal(config.provider, 'paystack');
  assert.equal(config.mode, 'test');
  assert.equal(config.configured, false);
  assert.deepEqual(config.missingFields, [
    'PAYSTACK_SECRET_KEY',
    'PAYSTACK_PUBLIC_KEY',
    'PAYSTACK_CALLBACK_URL',
    'PAYSTACK_WEBHOOK_URL',
  ]);

  Object.entries(previous).forEach(([key, value]) => restoreEnvVar(key, value));
});

test('assertPaystackBillingConfigured succeeds and public config excludes secret key', () => {
  const previous = {
    PAYSTACK_SECRET_KEY: process.env.PAYSTACK_SECRET_KEY,
    PAYSTACK_PUBLIC_KEY: process.env.PAYSTACK_PUBLIC_KEY,
    PAYSTACK_CALLBACK_URL: process.env.PAYSTACK_CALLBACK_URL,
    PAYSTACK_WEBHOOK_URL: process.env.PAYSTACK_WEBHOOK_URL,
  };

  process.env.PAYSTACK_SECRET_KEY = 'sk_test_123';
  process.env.PAYSTACK_PUBLIC_KEY = 'pk_test_123';
  process.env.PAYSTACK_CALLBACK_URL = 'https://app.example.com/billing/callback';
  process.env.PAYSTACK_WEBHOOK_URL = 'https://api.example.com/saas/paystack/webhook';

  const config = assertPaystackBillingConfigured();
  const publicConfig = getPaystackPublicConfig();

  assert.equal(config.configured, true);
  assert.equal(config.secretKey, 'sk_test_123');
  assert.equal(publicConfig.publicKey, 'pk_test_123');
  assert.equal(publicConfig.callbackUrl, 'https://app.example.com/billing/callback');
  assert.equal(publicConfig.webhookUrl, 'https://api.example.com/saas/paystack/webhook');
  assert.equal('secretKey' in publicConfig, false);

  Object.entries(previous).forEach(([key, value]) => restoreEnvVar(key, value));
});

test('canonical SaaS plans include paystack billing mapping for paid plans only', async () => {
  const plans = await readSaasPlans();
  const freePlan = plans.find((plan) => plan.id === 'free');
  const starterPlan = plans.find((plan) => plan.id === 'starter');

  assert.equal(freePlan?.billing?.provider, null);
  assert.equal(freePlan?.billing?.paystack?.monthly, null);
  assert.equal(starterPlan?.billing?.provider, 'paystack');
  assert.deepEqual(starterPlan?.billing?.paystack?.monthly, {
    local_plan_key: 'starter:monthly',
    interval: 'monthly',
    plan_code: null,
  });
  assert.deepEqual(starterPlan?.billing?.paystack?.annual, {
    local_plan_key: 'starter:annual',
    interval: 'annual',
    plan_code: null,
  });
});
