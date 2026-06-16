import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import mongoose from 'mongoose';
import Organisation from '../../src/models/Organisation.js';
import Payment from '../../src/models/Payment.js';
import SaasPlan from '../../src/models/SaasPlan.js';
import {
  cancelPaystackRenewal,
  fetchAndSyncPaystackSubscription,
  generatePaystackManagementLink,
  handlePaystackWebhookEvent,
  initializePaystackCheckout,
  isKnownPaystackIp,
  resumePaystackRenewal,
  sendPaystackManagementLinkEmail,
  syncBillingStateFromVerifiedTransaction,
  toPaystackSubunit,
  verifyPaystackWebhookSignature,
} from '../../src/services/paystackBillingService.js';

const makeQuery = (value) => ({
  lean: async () => value,
  sort: () => makeQuery(value),
  select: () => makeQuery(value),
  then: (resolve, reject) => Promise.resolve(value).then(resolve, reject),
  catch: (reject) => Promise.resolve(value).catch(reject),
});

const stubMethod = (target, property, implementation) => {
  const original = target[property];
  target[property] = implementation;
  return () => {
    target[property] = original;
  };
};

const restoreMethods = (restores) => {
  while (restores.length > 0) {
    const restore = restores.pop();
    restore();
  }
};

const withPaystackEnv = async (callback) => {
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

  try {
    await callback();
  } finally {
    Object.entries(previous).forEach(([key, value]) => {
      if (typeof value === 'undefined') {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    });
  }
};

const buildPlans = () => {
  const starterId = new mongoose.Types.ObjectId();
  const professionalId = new mongoose.Types.ObjectId();
  return [
    {
      _id: starterId,
      id: 'starter',
      name: 'Starter',
      price_monthly: 499,
      price_annual: 4990,
      billing: {
        provider: 'paystack',
        paystack: {
          monthly: {
            local_plan_key: 'starter:monthly',
            interval: 'monthly',
            plan_code: null,
          },
          annual: {
            local_plan_key: 'starter:annual',
            interval: 'annual',
            plan_code: null,
          },
        },
      },
    },
    {
      _id: professionalId,
      id: 'professional',
      name: 'Professional',
      price_monthly: 999,
      price_annual: 9990,
      billing: {
        provider: 'paystack',
        paystack: {
          monthly: {
            local_plan_key: 'professional:monthly',
            interval: 'monthly',
            plan_code: null,
          },
          annual: {
            local_plan_key: 'professional:annual',
            interval: 'annual',
            plan_code: null,
          },
        },
      },
    },
  ];
};

const stubPlanQueries = (restores, plans = buildPlans()) => {
  restores.push(
    stubMethod(SaasPlan, 'findOne', (query = {}) => {
      const plan = plans.find((entry) => entry.id === query.id) || null;
      return makeQuery(plan);
    })
  );
  restores.push(
    stubMethod(SaasPlan, 'find', () => makeQuery(plans))
  );
  restores.push(
    stubMethod(SaasPlan, 'updateOne', async (query = {}, update = {}) => {
      const plan = plans.find((entry) => entry.id === query.id);
      const monthlyCode = update?.$set?.['billing.paystack.monthly.plan_code'];
      const annualCode = update?.$set?.['billing.paystack.annual.plan_code'];
      if (plan && monthlyCode) {
        plan.billing.paystack.monthly.plan_code = monthlyCode;
      }
      if (plan && annualCode) {
        plan.billing.paystack.annual.plan_code = annualCode;
      }
      return { acknowledged: true };
    })
  );
  return plans;
};

const createOrganisationDoc = (overrides = {}) => {
  const organisation = new Organisation({
    firm_name: 'Example Firm',
    subdomain: `firm-${crypto.randomUUID().slice(0, 8)}`,
    email: 'billing@example.com',
    plan: 'starter',
    status: 'pending',
    subscription_status: 'trial',
    billing_provider: 'paystack',
    ...overrides,
  });
  organisation.save = async function saveOrganisation() {
    return this;
  };
  return organisation;
};

const createPaymentDoc = (organisationId, overrides = {}) => {
  const payment = new Payment({
    organisation_id: organisationId,
    amount: 499,
    currency: 'ZAR',
    status: 'pending',
    payment_method: 'paystack',
    description: 'starter plan - monthly',
    plan: 'starter',
    billing_cycle: 'monthly',
    paystack: {
      reference: 'ref_pending',
      metadata: null,
    },
    ...overrides,
  });
  payment.save = async function savePayment() {
    return this;
  };
  return payment;
};

test('toPaystackSubunit converts ZAR amounts to subunits', () => {
  assert.equal(toPaystackSubunit(499), 49900);
  assert.equal(toPaystackSubunit(49.99), 4999);
  assert.equal(toPaystackSubunit(0), 0);
});

test('toPaystackSubunit rejects invalid negative amounts', () => {
  assert.throws(() => toPaystackSubunit(-1), /Invalid billing amount/);
});

test('verifyPaystackWebhookSignature validates HMAC SHA512 signatures', () => {
  const payload = JSON.stringify({
    event: 'charge.success',
    data: {
      reference: 'ref_123',
      amount: 49900,
    },
  });
  const secret = 'sk_test_signature_secret';
  const signature = crypto.createHmac('sha512', secret).update(payload).digest('hex');

  assert.equal(verifyPaystackWebhookSignature(payload, signature, secret), true);
  assert.equal(verifyPaystackWebhookSignature(payload, 'bad-signature', secret), false);
});

test('isKnownPaystackIp recognizes documented webhook sender IPs', () => {
  assert.equal(isKnownPaystackIp('52.31.139.75'), true);
  assert.equal(isKnownPaystackIp('52.49.173.169'), true);
  assert.equal(isKnownPaystackIp('52.214.14.220'), true);
  assert.equal(isKnownPaystackIp('127.0.0.1'), false);
});

test('initializePaystackCheckout returns a Paystack checkout session for paid plans', async () => {
  await withPaystackEnv(async () => {
    const restores = [];
    const plans = stubPlanQueries(restores);
    const organisation = createOrganisationDoc({
      email: 'paid-signup@example.com',
      plan: 'starter',
    });
    let savedPayment = null;
    const originalFetch = global.fetch;

    restores.push(
      stubMethod(Payment.prototype, 'save', async function savePayment() {
        savedPayment = this;
        return this;
      })
    );

    global.fetch = async (url, options = {}) => {
      if (url === 'https://api.paystack.co/plan') {
        assert.equal(options.method, 'GET');
        return {
          ok: true,
          json: async () => ({
            status: true,
            data: [
              {
                plan_code: 'PLN_starter_monthly',
                name: 'Brendmo Starter Monthly',
                amount: 49900,
                interval: 'monthly',
                description: 'brendmo:starter:monthly',
              },
            ],
          }),
        };
      }

      if (url === 'https://api.paystack.co/transaction/initialize') {
        assert.equal(options.method, 'POST');
        const body = JSON.parse(options.body);
        assert.equal(body.email, 'paid-signup@example.com');
        assert.equal(body.plan, 'PLN_starter_monthly');
        return {
          ok: true,
          json: async () => ({
            status: true,
            data: {
              reference: 'ref_init_123',
              access_code: 'acs_123',
              authorization_url: 'https://checkout.paystack.test/redirect',
            },
          }),
        };
      }

      throw new Error(`Unexpected fetch URL: ${url}`);
    };

    try {
      const session = await initializePaystackCheckout({
        organisation,
        planId: 'starter',
        billingCycle: 'monthly',
      });

      assert.equal(session.mode, 'paystack');
      assert.equal(session.checkout.authorization_url, 'https://checkout.paystack.test/redirect');
      assert.equal(session.checkout.plan_code, 'PLN_starter_monthly');
      assert.equal(session.checkout.mapping_status, 'synced');
      assert.equal(savedPayment?.status, 'pending');
      assert.equal(savedPayment?.paystack?.reference, 'ref_init_123');
      assert.equal(savedPayment?.paystack?.access_code, 'acs_123');
      assert.equal(plans[0].billing.paystack.monthly.plan_code, 'PLN_starter_monthly');
      assert.equal(organisation.billing_provider, 'paystack');
      assert.equal(organisation.paystack.subscription.plan_code, 'PLN_starter_monthly');
      assert.equal(organisation.paystack.renewal.status, 'pending');
    } finally {
      global.fetch = originalFetch;
      restoreMethods(restores);
    }
  });
});

test('initializePaystackCheckout marks replacement metadata for immediate plan changes', async () => {
  await withPaystackEnv(async () => {
    const restores = [];
    stubPlanQueries(restores);
    const organisation = createOrganisationDoc({
      email: 'replace@example.com',
      plan: 'starter',
      status: 'active',
      subscription_status: 'active',
      paystack: {
        subscription: {
          subscription_code: 'SUB_OLD_PLAN',
          email_token: 'TOKEN_OLD_PLAN',
          billing_cycle: 'monthly',
        },
      },
    });
    let savedPayment = null;
    const originalFetch = global.fetch;

    restores.push(
      stubMethod(Payment.prototype, 'save', async function savePayment() {
        savedPayment = this;
        return this;
      })
    );

    global.fetch = async (url, options = {}) => {
      if (url === 'https://api.paystack.co/plan') {
        return {
          ok: true,
          json: async () => ({
            status: true,
            data: [
              {
                plan_code: 'PLN_professional_annual',
                name: 'Brendmo Professional Annual',
                amount: 999000,
                interval: 'annually',
                description: 'brendmo:professional:annual',
              },
            ],
          }),
        };
      }

      if (url === 'https://api.paystack.co/transaction/initialize') {
        const body = JSON.parse(options.body);
        assert.equal(body.plan, 'PLN_professional_annual');
        assert.equal(body.metadata.intent, 'plan_change');
        assert.equal(body.metadata.previous_subscription_code, 'SUB_OLD_PLAN');
        assert.equal(body.metadata.previous_subscription_email_token, 'TOKEN_OLD_PLAN');
        assert.equal(body.metadata.previous_plan, 'starter');
        return {
          ok: true,
          json: async () => ({
            status: true,
            data: {
              reference: 'ref_plan_change_123',
              access_code: 'acs_plan_change_123',
              authorization_url: 'https://checkout.paystack.test/plan-change',
            },
          }),
        };
      }

      throw new Error(`Unexpected fetch URL: ${url}`);
    };

    try {
      const session = await initializePaystackCheckout({
        organisation,
        planId: 'professional',
        billingCycle: 'annual',
        intent: 'plan_change',
      });

      assert.equal(session.checkout.intent, 'plan_change');
      assert.equal(savedPayment?.description, 'professional plan - annual plan change');
      assert.equal(savedPayment?.paystack?.metadata?.intent, 'plan_change');
      assert.equal(savedPayment?.paystack?.metadata?.previous_subscription_code, 'SUB_OLD_PLAN');
    } finally {
      global.fetch = originalFetch;
      restoreMethods(restores);
    }
  });
});

test('syncBillingStateFromVerifiedTransaction activates the organisation after a successful callback verification', async () => {
  const restores = [];
  stubPlanQueries(restores);
  const organisation = createOrganisationDoc({
    _id: new mongoose.Types.ObjectId(),
    email: 'success@example.com',
    plan: 'starter',
  });
  const payment = createPaymentDoc(organisation._id, {
    _id: new mongoose.Types.ObjectId(),
    paystack: {
      reference: 'ref_pending',
      plan_code: 'PLN_starter_monthly',
      metadata: null,
    },
  });

  restores.push(stubMethod(Payment, 'findById', () => makeQuery(payment)));
  restores.push(stubMethod(Payment, 'findOne', () => makeQuery(null)));
  restores.push(stubMethod(Organisation, 'findById', () => makeQuery(organisation)));
  restores.push(stubMethod(Organisation, 'findOne', () => makeQuery(null)));

  try {
    const transaction = {
      id: 4040,
      status: 'success',
      amount: 49900,
      currency: 'ZAR',
      reference: 'ref_success_123',
      gateway_response: 'Approved',
      channel: 'card',
      fees: 250,
      paid_at: '2026-05-13T10:00:00.000Z',
      metadata: {
        payment_id: payment._id.toString(),
        organisation_id: organisation._id.toString(),
        plan: 'starter',
        billing_cycle: 'monthly',
        local_plan_key: 'starter:monthly',
      },
      customer: {
        customer_code: 'CUS_123',
        email: 'success@example.com',
        integration: 42,
        id: 777,
      },
      authorization: {
        authorization_code: 'AUTH_123',
        signature: 'SIG_123',
        last4: '4242',
        exp_month: '12',
        exp_year: '2030',
        card_type: 'visa',
        bank: 'Test Bank',
      },
      subscription: {
        subscription_code: 'SUB_123',
        email_token: 'EMAIL_TOKEN_123',
      },
      plan: {
        plan_code: 'PLN_starter_monthly',
      },
    };

    const result = await syncBillingStateFromVerifiedTransaction(transaction, {
      eventType: 'callback',
    });

    assert.equal(result.organisation.subscription_status, 'active');
    assert.equal(result.organisation.status, 'active');
    assert.equal(result.organisation.billing_provider, 'paystack');
    assert.equal(result.organisation.paystack.customer.customer_code, 'CUS_123');
    assert.equal(result.organisation.paystack.subscription.subscription_code, 'SUB_123');
    assert.equal(result.organisation.paystack.subscription.email_token, 'EMAIL_TOKEN_123');
    assert.equal(result.organisation.paystack.subscription.authorization_last4, '4242');
    assert.equal(result.organisation.paystack.transaction.reference, 'ref_success_123');
    assert.equal(result.organisation.paystack.renewal.status, 'active');
    assert.equal(result.payment.status, 'completed');
    assert.equal(result.payment.amount_gross, 499);
    assert.equal(result.payment.amount_fee, 2.5);
    assert.equal(result.payment.paystack.plan_code, 'PLN_starter_monthly');
    assert.equal(result.payment.paystack.webhook_event, 'callback');
  } finally {
    restoreMethods(restores);
  }
});

test('syncBillingStateFromVerifiedTransaction retires the previous subscription after a successful plan change', async () => {
  const restores = [];
  stubPlanQueries(restores);
  const organisation = createOrganisationDoc({
    _id: new mongoose.Types.ObjectId(),
    email: 'plan-change@example.com',
    plan: 'starter',
    status: 'active',
    subscription_status: 'active',
    paystack: {
      subscription: {
        subscription_code: 'SUB_OLD_PLAN',
        email_token: 'TOKEN_OLD_PLAN',
        billing_cycle: 'monthly',
        plan_code: 'PLN_starter_monthly',
      },
    },
  });
  const payment = createPaymentDoc(organisation._id, {
    _id: new mongoose.Types.ObjectId(),
    plan: 'professional',
    billing_cycle: 'annual',
    paystack: {
      reference: 'ref_plan_change_pending',
      plan_code: 'PLN_professional_annual',
      metadata: {
        intent: 'plan_change',
        previous_subscription_code: 'SUB_OLD_PLAN',
        previous_subscription_email_token: 'TOKEN_OLD_PLAN',
        previous_plan: 'starter',
        previous_billing_cycle: 'monthly',
      },
    },
  });
  const originalFetch = global.fetch;
  const disabledSubscriptions = [];

  restores.push(stubMethod(Payment, 'findById', () => makeQuery(payment)));
  restores.push(stubMethod(Payment, 'findOne', () => makeQuery(null)));
  restores.push(stubMethod(Organisation, 'findById', () => makeQuery(organisation)));
  restores.push(stubMethod(Organisation, 'findOne', () => makeQuery(null)));

  global.fetch = async (url, options = {}) => {
    if (url === 'https://api.paystack.co/subscription/disable') {
      const body = JSON.parse(options.body);
      disabledSubscriptions.push(body);
      return {
        ok: true,
        json: async () => ({
          status: true,
          message: 'Subscription disabled successfully',
          data: {},
        }),
      };
    }

    throw new Error(`Unexpected fetch URL: ${url}`);
  };

  try {
    const transaction = {
      id: 8080,
      status: 'success',
      amount: 999000,
      currency: 'ZAR',
      reference: 'ref_plan_change_success',
      gateway_response: 'Approved',
      channel: 'card',
      fees: 250,
      paid_at: '2026-05-13T12:00:00.000Z',
      metadata: {
        payment_id: payment._id.toString(),
        organisation_id: organisation._id.toString(),
        plan: 'professional',
        billing_cycle: 'annual',
        local_plan_key: 'professional:annual',
        intent: 'plan_change',
        previous_subscription_code: 'SUB_OLD_PLAN',
        previous_subscription_email_token: 'TOKEN_OLD_PLAN',
      },
      customer: {
        customer_code: 'CUS_PLAN_CHANGE',
        email: 'plan-change@example.com',
        integration: 42,
        id: 9090,
      },
      authorization: {
        authorization_code: 'AUTH_PLAN_CHANGE',
        signature: 'SIG_PLAN_CHANGE',
        last4: '4242',
        exp_month: '12',
        exp_year: '2030',
        card_type: 'visa',
        bank: 'Test Bank',
      },
      subscription: {
        subscription_code: 'SUB_NEW_PLAN',
        email_token: 'TOKEN_NEW_PLAN',
      },
      plan: {
        plan_code: 'PLN_professional_annual',
      },
    };

    await syncBillingStateFromVerifiedTransaction(transaction, { eventType: 'callback' });

    assert.equal(organisation.plan, 'professional');
    assert.equal(organisation.paystack.subscription.subscription_code, 'SUB_NEW_PLAN');
    assert.equal(disabledSubscriptions.length, 1);
    assert.equal(disabledSubscriptions[0].code, 'SUB_OLD_PLAN');
    assert.equal(disabledSubscriptions[0].token, 'TOKEN_OLD_PLAN');
    assert.equal(payment.paystack.metadata.previous_subscription_retired, true);
  } finally {
    global.fetch = originalFetch;
    restoreMethods(restores);
  }
});

test('syncBillingStateFromVerifiedTransaction appends a new renewal payment for recurring charges with a new reference', async () => {
  const restores = [];
  stubPlanQueries(restores);
  const organisation = createOrganisationDoc({
    _id: new mongoose.Types.ObjectId(),
    email: 'renewed@example.com',
    status: 'active',
    subscription_status: 'active',
    paystack: {
      customer: {
        customer_code: 'CUS_RENEW_123',
      },
      subscription: {
        subscription_code: 'SUB_RENEW_123',
        email_token: 'EMAIL_TOKEN_RENEW_123',
        plan_code: 'PLN_starter_monthly',
        billing_cycle: 'monthly',
      },
      renewal: {
        status: 'active',
      },
    },
  });
  const previousPayment = createPaymentDoc(organisation._id, {
    _id: new mongoose.Types.ObjectId(),
    status: 'completed',
    paystack: {
      reference: 'ref_previous_cycle',
      plan_code: 'PLN_starter_monthly',
      subscription_code: 'SUB_RENEW_123',
      email_token: 'EMAIL_TOKEN_RENEW_123',
    },
  });
  let createdPayment = null;

  restores.push(stubMethod(Payment, 'findById', () => makeQuery(null)));
  restores.push(stubMethod(Payment, 'findOne', () => makeQuery(null)));
  restores.push(
    stubMethod(Payment, 'create', async (payload) => {
      createdPayment = new Payment(payload);
      createdPayment.save = async function savePayment() {
        return this;
      };
      return createdPayment;
    })
  );
  restores.push(stubMethod(Organisation, 'findById', () => makeQuery(null)));
  restores.push(
    stubMethod(Organisation, 'findOne', (query = {}) => {
      const matched =
        query['paystack.subscription.subscription_code'] === 'SUB_RENEW_123' ||
        query['paystack.customer.customer_code'] === 'CUS_RENEW_123' ||
        query.email === 'renewed@example.com';
      return makeQuery(matched ? organisation : null);
    })
  );

  try {
    const result = await syncBillingStateFromVerifiedTransaction(
      {
        id: 5151,
        status: 'success',
        amount: 49900,
        currency: 'ZAR',
        reference: 'ref_renewal_2026_06',
        gateway_response: 'Approved',
        channel: 'card',
        fees: 250,
        paid_at: '2026-06-13T10:00:00.000Z',
        customer: {
          customer_code: 'CUS_RENEW_123',
          email: 'renewed@example.com',
        },
        subscription: {
          subscription_code: 'SUB_RENEW_123',
          email_token: 'EMAIL_TOKEN_RENEW_123',
        },
        plan: {
          plan_code: 'PLN_starter_monthly',
        },
      },
      { eventType: 'charge.success' }
    );

    assert.equal(previousPayment.paystack.reference, 'ref_previous_cycle');
    assert.ok(createdPayment);
    assert.notEqual(createdPayment._id?.toString(), previousPayment._id?.toString());
    assert.equal(createdPayment.status, 'completed');
    assert.equal(createdPayment.plan, 'starter');
    assert.equal(createdPayment.amount_gross, 499);
    assert.equal(createdPayment.paystack.reference, 'ref_renewal_2026_06');
    assert.equal(result.payment, createdPayment);
    assert.equal(result.organisation.subscription_status, 'active');
    assert.equal(result.organisation.paystack.renewal.status, 'active');
  } finally {
    restoreMethods(restores);
  }
});

test('handlePaystackWebhookEvent marks renewal failures as past due and records a failed payment', async () => {
  const restores = [];
  stubPlanQueries(restores);
  const organisation = createOrganisationDoc({
    _id: new mongoose.Types.ObjectId(),
    email: 'renewal@example.com',
    status: 'active',
    subscription_status: 'active',
    paystack: {
      customer: {
        customer_code: 'CUS_789',
      },
    },
  });
  let createdPayment = null;

  restores.push(stubMethod(Payment, 'findById', () => makeQuery(null)));
  restores.push(stubMethod(Payment, 'findOne', () => makeQuery(null)));
  restores.push(
    stubMethod(Payment, 'create', async (payload) => {
      createdPayment = new Payment(payload);
      createdPayment.save = async function savePayment() {
        return this;
      };
      return createdPayment;
    })
  );
  restores.push(stubMethod(Organisation, 'findById', () => makeQuery(null)));
  restores.push(
    stubMethod(Organisation, 'findOne', (query = {}) => {
      const matched =
        query['paystack.customer.customer_code'] === 'CUS_789' ||
        query.email === 'renewal@example.com';
      return makeQuery(matched ? organisation : null);
    })
  );

  try {
    await handlePaystackWebhookEvent({
      event: 'invoice.payment_failed',
      data: {
        amount: 49900,
        currency: 'ZAR',
        status: 'failed',
        description: 'Card was declined',
        due_date: '2026-06-01T00:00:00.000Z',
        customer: {
          customer_code: 'CUS_789',
          email: 'renewal@example.com',
        },
        subscription: {
          subscription_code: 'SUB_789',
        },
        transaction: {
          reference: 'ref_failed_123',
        },
      },
    });

    assert.equal(organisation.subscription_status, 'past_due');
    assert.equal(organisation.billing_provider, 'paystack');
    assert.equal(organisation.paystack.renewal.status, 'past_due');
    assert.equal(organisation.paystack.renewal.warning, 'Card was declined');
    assert.equal(organisation.paystack.renewal.failure_code, 'failed');
    assert.equal(createdPayment?.status, 'failed');
    assert.equal(createdPayment?.plan, 'starter');
    assert.equal(createdPayment?.paystack?.reference, 'ref_failed_123');
    assert.equal(createdPayment?.paystack?.webhook_event, 'invoice.payment_failed');
  } finally {
    restoreMethods(restores);
  }
});

test('handlePaystackWebhookEvent cancels the subscription when Paystack disables it', async () => {
  const restores = [];
  stubPlanQueries(restores);
  const organisation = createOrganisationDoc({
    _id: new mongoose.Types.ObjectId(),
    status: 'active',
    subscription_status: 'active',
    paystack: {
      subscription: {
        subscription_code: 'SUB_DISABLED',
      },
    },
  });

  restores.push(stubMethod(Payment, 'findById', () => makeQuery(null)));
  restores.push(stubMethod(Payment, 'findOne', () => makeQuery(null)));
  restores.push(stubMethod(Organisation, 'findById', () => makeQuery(null)));
  restores.push(
    stubMethod(Organisation, 'findOne', (query = {}) => {
      const matched = query['paystack.subscription.subscription_code'] === 'SUB_DISABLED';
      return makeQuery(matched ? organisation : null);
    })
  );

  try {
    await handlePaystackWebhookEvent({
      event: 'subscription.disable',
      data: {
        subscription_code: 'SUB_DISABLED',
        updatedAt: '2026-05-13T12:00:00.000Z',
      },
    });

    assert.equal(organisation.subscription_status, 'cancelled');
    assert.equal(organisation.paystack.subscription.status, 'disabled');
    assert.equal(organisation.paystack.renewal.status, 'cancelled');
    assert.equal(organisation.paystack.renewal.cancel_at_period_end, true);
    assert.equal(organisation.paystack.subscription.next_renewal_at, null);
  } finally {
    restoreMethods(restores);
  }
});

test('cancelPaystackRenewal and generatePaystackManagementLink support billing settings actions', async () => {
  await withPaystackEnv(async () => {
    const restores = [];
    stubPlanQueries(restores);
    const organisation = createOrganisationDoc({
      status: 'active',
      subscription_status: 'active',
      paystack: {
        customer: {
          customer_code: 'CUS_MANAGE_123',
          email: 'billing@example.com',
        },
        subscription: {
          subscription_code: 'SUB_MANAGE_123',
          email_token: 'EMAIL_TOKEN_MANAGE_123',
          plan_code: 'PLN_starter_monthly',
          billing_cycle: 'monthly',
        },
        renewal: {
          status: 'active',
        },
      },
    });
    const originalFetch = global.fetch;

    restores.push(stubMethod(Payment, 'findOne', () => makeQuery(null)));

    global.fetch = async (url, options = {}) => {
      if (url === 'https://api.paystack.co/subscription/disable') {
        assert.equal(options.method, 'POST');
        return {
          ok: true,
          json: async () => ({ status: true, data: {} }),
        };
      }

      if (url === 'https://api.paystack.co/subscription/SUB_MANAGE_123/manage/link') {
        assert.equal(options.method, 'GET');
        return {
          ok: true,
          json: async () => ({
            status: true,
            data: {
              link: 'https://billing.paystack.test/manage/subscription',
            },
          }),
        };
      }

      if (url === 'https://api.paystack.co/subscription/SUB_MANAGE_123/manage/email') {
        assert.equal(options.method, 'POST');
        return {
          ok: true,
          json: async () => ({
            status: true,
            data: {},
          }),
        };
      }

      if (url === 'https://api.paystack.co/subscription/enable') {
        assert.equal(options.method, 'POST');
        return {
          ok: true,
          json: async () => ({ status: true, data: {} }),
        };
      }

      if (url === 'https://api.paystack.co/subscription/SUB_MANAGE_123') {
        assert.equal(options.method, 'GET');
        return {
          ok: true,
          json: async () => ({
            status: true,
            data: {
              id: 99,
              integration: 42,
              status: 'active',
              subscription_code: 'SUB_MANAGE_123',
              email_token: 'EMAIL_TOKEN_MANAGE_123',
              next_payment_date: '2026-06-13T00:00:00.000Z',
              open_invoice: 'INV_manage_123',
              customer: {
                customer_code: 'CUS_MANAGE_123',
                email: 'billing@example.com',
              },
              authorization: {
                authorization_code: 'AUTH_MANAGE_123',
                signature: 'SIG_MANAGE_123',
                last4: '4242',
                exp_month: '12',
                exp_year: '2031',
                card_type: 'visa',
                bank: 'Test Bank',
              },
              plan: {
                plan_code: 'PLN_starter_monthly',
              },
            },
          }),
        };
      }

      throw new Error(`Unexpected fetch URL: ${url}`);
    };

    try {
      const cancelResult = await cancelPaystackRenewal(organisation);
      assert.deepEqual(cancelResult, {
        subscription_code: 'SUB_MANAGE_123',
        cancel_at_period_end: true,
      });
      assert.equal(organisation.paystack.subscription.status, 'non_renewing');
      assert.equal(organisation.paystack.renewal.status, 'non_renewing');
      assert.equal(organisation.paystack.renewal.cancel_at_period_end, true);

      const linkResult = await generatePaystackManagementLink(organisation);
      const emailResult = await sendPaystackManagementLinkEmail(organisation);
      const resumeResult = await resumePaystackRenewal(organisation);
      const syncResult = await fetchAndSyncPaystackSubscription(organisation);

      assert.equal(linkResult.link, 'https://billing.paystack.test/manage/subscription');
      assert.equal(emailResult.sent, true);
      assert.equal(organisation.paystack.subscription.manage_link, 'https://billing.paystack.test/manage/subscription');
      assert.ok(organisation.paystack.subscription.manage_link_sent_at instanceof Date);
      assert.equal(resumeResult.cancel_at_period_end, false);
      assert.equal(resumeResult.status, 'active');
      assert.equal(organisation.paystack.subscription.status, 'active');
      assert.equal(organisation.paystack.renewal.cancel_at_period_end, false);
      assert.equal(syncResult.subscription.subscription_code, 'SUB_MANAGE_123');
      assert.equal(syncResult.organisation.paystack.subscription.open_invoice, 'INV_manage_123');
      assert.ok(syncResult.organisation.paystack.subscription.last_synced_at instanceof Date);
    } finally {
      global.fetch = originalFetch;
      restoreMethods(restores);
    }
  });
});
