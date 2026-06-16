import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import Organisation from '../../src/models/Organisation.js';
import { buildBillingAccessGate } from '../../src/services/billingAccessGateService.js';

const createOrganisation = (overrides = {}) =>
  new Organisation({
    firm_name: 'Billing Gate Org',
    subdomain: `billing-gate-${new mongoose.Types.ObjectId().toString().slice(-8)}`,
    email: 'gate@example.com',
    plan: 'starter',
    status: 'pending',
    subscription_status: 'trial',
    billing_provider: 'paystack',
    ...overrides,
  });

test('buildBillingAccessGate does not gate free-plan organisations', () => {
  const organisation = createOrganisation({
    plan: 'free',
    status: 'active',
    subscription_status: 'trial',
    billing_provider: null,
  });

  const gate = buildBillingAccessGate({ organisation });

  assert.equal(gate.requires_billing_completion, false);
  assert.equal(gate.reason, 'free_plan');
});

test('buildBillingAccessGate gates pending paid signups before initial payment completes', () => {
  const organisation = createOrganisation({
    plan: 'starter',
    status: 'pending',
    subscription_status: 'trial',
  });

  const gate = buildBillingAccessGate({
    organisation,
    latestCheckout: { status: 'pending' },
    payments: [],
  });

  assert.equal(gate.requires_billing_completion, true);
  assert.equal(gate.reason, 'checkout_pending');
  assert.equal(gate.target_url, '/app/settings?tab=subscription');
});

test('buildBillingAccessGate does not gate active paid organisations with completed billing', () => {
  const organisation = createOrganisation({
    plan: 'starter',
    status: 'active',
    subscription_status: 'active',
    paystack: {
      subscription: {
        subscription_code: 'SUB_123',
      },
    },
  });

  const gate = buildBillingAccessGate({
    organisation,
    payments: [{ payment_method: 'paystack', status: 'completed' }],
  });

  assert.equal(gate.requires_billing_completion, false);
  assert.equal(gate.reason, 'billing_complete');
  assert.equal(gate.has_completed_purchase, true);
});

test('buildBillingAccessGate keeps legacy active paid organisations accessible when they are not pending initial billing', () => {
  const organisation = createOrganisation({
    plan: 'starter',
    status: 'active',
    subscription_status: 'active',
    paystack: null,
  });

  const gate = buildBillingAccessGate({
    organisation,
    payments: [],
  });

  assert.equal(gate.requires_billing_completion, false);
  assert.equal(gate.reason, 'billing_complete');
});

test('buildBillingAccessGate blocks past-due paid organisations until billing is recovered', () => {
  const organisation = createOrganisation({
    plan: 'starter',
    status: 'active',
    subscription_status: 'past_due',
    paystack: {
      subscription: {
        subscription_code: 'SUB_PAST_DUE',
      },
      renewal: {
        status: 'past_due',
      },
    },
  });

  const gate = buildBillingAccessGate({
    organisation,
    payments: [{ payment_method: 'paystack', status: 'completed' }],
  });

  assert.equal(gate.requires_billing_completion, true);
  assert.equal(gate.reason, 'payment_failed');
  assert.equal(gate.has_completed_purchase, true);
});
