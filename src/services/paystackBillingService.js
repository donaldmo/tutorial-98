import crypto from 'node:crypto';
import mongoose from 'mongoose';
import Payment from '../models/Payment.js';
import Organisation from '../models/Organisation.js';
import SaasPlan from '../models/SaasPlan.js';
import { assertPaystackBillingConfigured } from '../config/paystack.js';
import { getSaasPlansMap as getPersistedSaasPlansMap } from '../utils/saasPlansDb.js';
import { sendPaymentSuccessEmail } from './emailService.js';

const PAYSTACK_API_BASE_URL = 'https://api.paystack.co';
const BILLING_CYCLES = new Set(['monthly', 'annual']);
const PAYSTACK_IPS = new Set(['52.31.139.75', '52.49.173.169', '52.214.14.220']);

const coerceString = (value) => {
  const normalized = String(value ?? '').trim();
  return normalized || null;
};

const normalizeBillingCycle = (value) => (value === 'annual' ? 'annual' : 'monthly');

const toPaystackPlanInterval = (billingCycle) =>
  normalizeBillingCycle(billingCycle) === 'annual' ? 'annually' : 'monthly';

export const toPaystackSubunit = (amount) => {
  const numeric = Number(amount ?? 0);
  if (!Number.isFinite(numeric) || numeric < 0) {
    const error = new Error('Invalid billing amount');
    error.status = 400;
    throw error;
  }
  return Math.round(numeric * 100);
};

const toMoneyAmount = (subunitAmount) => {
  const numeric = Number(subunitAmount ?? 0);
  if (!Number.isFinite(numeric)) return 0;
  return Number((numeric / 100).toFixed(2));
};

const formatMoneyLabel = (currency, amount) =>
  `${coerceString(currency) || 'ZAR'} ${Number(amount ?? 0).toLocaleString('en-ZA', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const formatDateLabel = (value) => {
  const parsed = asDate(value);
  if (!parsed) return '—';
  return parsed.toLocaleDateString('en-ZA', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
};

const normalizeLower = (value) => String(value ?? '').trim().toLowerCase();

const parseJsonObject = (value) => {
  if (!value) return null;
  if (typeof value === 'object') return value;
  if (typeof value !== 'string') return null;
  try {
    return JSON.parse(value);
  } catch (_error) {
    return null;
  }
};

const asDate = (value) => {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === 'number' && Number.isFinite(value)) {
    const milliseconds = value > 9999999999 ? value : value * 1000;
    const parsed = new Date(milliseconds);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const buildPaystackReference = (organisationId) => {
  const safeOrgId = String(organisationId || 'org').replace(/[^a-zA-Z0-9]/g, '').slice(-12) || 'org';
  const randomPart = crypto.randomBytes(6).toString('hex');
  return `brendmo-${safeOrgId}-${Date.now()}-${randomPart}`;
};

const buildPlanDescriptor = (plan, billingCycle) => {
  const normalizedCycle = normalizeBillingCycle(billingCycle);
  const cycleLabel = normalizedCycle === 'annual' ? 'Annual' : 'Monthly';
  const mapping = plan?.billing?.paystack?.[normalizedCycle] || null;
  const amount = normalizedCycle === 'annual' ? Number(plan?.price_annual || 0) : Number(plan?.price_monthly || 0);
  return {
    billingCycle: normalizedCycle,
    localPlanKey: mapping?.local_plan_key || `${plan?.id || 'plan'}:${normalizedCycle}`,
    interval: toPaystackPlanInterval(normalizedCycle),
    amount,
    amountSubunit: toPaystackSubunit(amount),
    name: `Brendmo ${plan?.name || plan?.id || 'Plan'} ${cycleLabel}`,
    description: `brendmo:${mapping?.local_plan_key || `${plan?.id || 'plan'}:${normalizedCycle}`}`,
  };
};

const getPaystackPlanMapping = (plan, billingCycle) => {
  const normalizedCycle = normalizeBillingCycle(billingCycle);
  return plan?.billing?.paystack?.[normalizedCycle] || null;
};

const setPaystackPlanCode = async (planId, billingCycle, planCode) => {
  const normalizedCycle = normalizeBillingCycle(billingCycle);
  await SaasPlan.updateOne(
    { id: planId },
    { $set: { [`billing.paystack.${normalizedCycle}.plan_code`]: planCode } }
  );
};

const findMatchingPaystackPlan = (plans, descriptor) => {
  if (!Array.isArray(plans)) return null;
  return (
    plans.find((plan) => coerceString(plan?.description) === descriptor.description) ||
    plans.find(
      (plan) =>
        coerceString(plan?.name) === descriptor.name &&
        Number(plan?.amount || 0) === descriptor.amountSubunit &&
        normalizeLower(plan?.interval) === descriptor.interval
    ) ||
    null
  );
};

const buildHttpError = (message, status = 500, details = null) => {
  const error = new Error(message);
  error.status = status;
  if (details) error.details = details;
  return error;
};

const paystackRequest = async (method, pathname, { body = null } = {}) => {
  const config = assertPaystackBillingConfigured();
  const response = await fetch(`${PAYSTACK_API_BASE_URL}${pathname}`, {
    method,
    headers: {
      Authorization: `Bearer ${config.secretKey}`,
      'Content-Type': 'application/json',
    },
    body: body == null ? undefined : JSON.stringify(body),
  });

  let payload = null;
  try {
    payload = await response.json();
  } catch (_error) {
    payload = null;
  }

  if (!response.ok || payload?.status === false) {
    const message =
      payload?.message ||
      payload?.error ||
      `Paystack request failed with status ${response.status}`;
    throw buildHttpError(message, response.status || 502, payload);
  }

  return payload?.data ?? payload;
};

const getPersistedPlanMap = async () => {
  const plans = await getPersistedSaasPlansMap();
  return plans || {};
};

const resolvePlanByPlanCode = async (planCode) => {
  if (!planCode) return null;
  const planMap = await getPersistedPlanMap();
  return (
    Object.values(planMap).find((plan) => {
      const monthlyCode = plan?.billing?.paystack?.monthly?.plan_code || null;
      const annualCode = plan?.billing?.paystack?.annual?.plan_code || null;
      return monthlyCode === planCode || annualCode === planCode;
    }) || null
  );
};

const resolvePlanByLocalKey = async (localPlanKey) => {
  if (!localPlanKey) return null;
  const planMap = await getPersistedPlanMap();
  return (
    Object.values(planMap).find((plan) => {
      const monthlyKey = plan?.billing?.paystack?.monthly?.local_plan_key || null;
      const annualKey = plan?.billing?.paystack?.annual?.local_plan_key || null;
      return monthlyKey === localPlanKey || annualKey === localPlanKey;
    }) || null
  );
};

const resolveSaasPlan = async (planId) => {
  const planMap = await getPersistedPlanMap();
  const plan = planMap?.[planId] || null;
  if (!plan) {
    const error = new Error('Invalid plan');
    error.status = 400;
    throw error;
  }
  return plan;
};

const resolveOrganisationSaasPlanDoc = async (planId) => {
  return SaasPlan.findOne({ id: planId });
};

const derivePlanAndCycleFromMetadata = async (payload = {}) => {
  const metadata = parseJsonObject(payload?.metadata) || {};
  const localPlanKey = coerceString(metadata?.local_plan_key);
  const planIdFromMetadata = coerceString(metadata?.plan);
  const billingCycleFromMetadata = coerceString(metadata?.billing_cycle);

  if (planIdFromMetadata && BILLING_CYCLES.has(billingCycleFromMetadata)) {
    return {
      plan: await resolveSaasPlan(planIdFromMetadata),
      billingCycle: normalizeBillingCycle(billingCycleFromMetadata),
      metadata,
    };
  }

  if (localPlanKey) {
    const plan = await resolvePlanByLocalKey(localPlanKey);
    if (plan) {
      const monthlyKey = plan?.billing?.paystack?.monthly?.local_plan_key;
      return {
        plan,
        billingCycle: monthlyKey === localPlanKey ? 'monthly' : 'annual',
        metadata,
      };
    }
  }

  return { plan: null, billingCycle: null, metadata };
};

const syncOrCreatePaystackPlan = async (plan, billingCycle) => {
  const normalizedCycle = normalizeBillingCycle(billingCycle);
  const mapping = getPaystackPlanMapping(plan, normalizedCycle);
  if (!mapping) {
    throw buildHttpError(`Plan "${plan.id}" does not define a Paystack mapping for ${normalizedCycle}`, 400);
  }

  if (mapping.plan_code) {
    return { ...mapping, source: 'stored' };
  }

  const descriptor = buildPlanDescriptor(plan, normalizedCycle);
  const paystackPlans = await paystackRequest('GET', '/plan');
  const matchedPlan = findMatchingPaystackPlan(paystackPlans, descriptor);
  const resolvedPlanCode = matchedPlan?.plan_code || null;

  if (resolvedPlanCode) {
    await setPaystackPlanCode(plan.id, normalizedCycle, resolvedPlanCode);
    return { ...mapping, plan_code: resolvedPlanCode, source: 'synced' };
  }

  const createdPlan = await paystackRequest('POST', '/plan', {
    body: {
      name: descriptor.name,
      amount: descriptor.amountSubunit,
      interval: descriptor.interval,
      description: descriptor.description,
      currency: 'ZAR',
      send_invoices: true,
      send_sms: false,
    },
  });

  const createdPlanCode = coerceString(createdPlan?.plan_code);
  if (!createdPlanCode) {
    throw buildHttpError('Paystack plan creation did not return a plan_code', 502, createdPlan);
  }

  await setPaystackPlanCode(plan.id, normalizedCycle, createdPlanCode);
  return { ...mapping, plan_code: createdPlanCode, source: 'created' };
};

const buildCheckoutMetadata = ({
  organisation,
  paymentId,
  plan,
  billingCycle,
  localPlanKey,
  intent = 'retry',
  previousSubscriptionCode = null,
  previousEmailToken = null,
  previousPlan = null,
  previousBillingCycle = null,
}) => ({
  source: 'brendmo-workflow',
  organisation_id: String(organisation._id),
  payment_id: String(paymentId),
  plan: plan.id,
  billing_cycle: normalizeBillingCycle(billingCycle),
  local_plan_key: localPlanKey,
  intent: coerceString(intent) || 'retry',
  previous_subscription_code: coerceString(previousSubscriptionCode) || null,
  previous_subscription_email_token: coerceString(previousEmailToken) || null,
  previous_plan: coerceString(previousPlan) || null,
  previous_billing_cycle: previousBillingCycle ? normalizeBillingCycle(previousBillingCycle) : null,
});

const disablePaystackSubscriptionByToken = async ({ subscriptionCode, emailToken }) => {
  const resolvedCode = coerceString(subscriptionCode);
  const resolvedToken = coerceString(emailToken);
  if (!resolvedCode || !resolvedToken) {
    throw buildHttpError('No active Paystack subscription was found for this organisation', 409);
  }

  await paystackRequest('POST', '/subscription/disable', {
    body: {
      code: resolvedCode,
      token: resolvedToken,
    },
  });

  return {
    subscription_code: resolvedCode,
    cancel_at_period_end: true,
  };
};

const applyChargeAuthorizationDetails = (target, authorization) => {
  target.authorization_code = coerceString(authorization?.authorization_code) || target.authorization_code || null;
  target.authorization_signature = coerceString(authorization?.signature) || target.authorization_signature || null;
  target.authorization_last4 = coerceString(authorization?.last4) || target.authorization_last4 || null;
  target.authorization_exp_month = coerceString(authorization?.exp_month) || target.authorization_exp_month || null;
  target.authorization_exp_year = coerceString(authorization?.exp_year) || target.authorization_exp_year || null;
  target.authorization_card_type = coerceString(authorization?.card_type || authorization?.brand) || target.authorization_card_type || null;
  target.authorization_bank = coerceString(authorization?.bank) || target.authorization_bank || null;
};

const computeFallbackNextRenewal = (billingCycle) => {
  const next = new Date();
  if (normalizeBillingCycle(billingCycle) === 'annual') {
    next.setFullYear(next.getFullYear() + 1);
  } else {
    next.setMonth(next.getMonth() + 1);
  }
  return next;
};

const normalizeSubscriptionLifecycleStatus = (value) => {
  const normalized = normalizeLower(value);
  if (!normalized) return null;
  if (normalized === 'non-renewing' || normalized === 'non_renewing') return 'non_renewing';
  return normalized;
};

const deriveInvoiceCode = (payload = {}) =>
  coerceString(payload?.invoice_code) ||
  coerceString(payload?.invoiceCode) ||
  coerceString(payload?.invoice?.invoice_code) ||
  coerceString(payload?.invoice?.invoiceCode) ||
  coerceString(payload?.subscription?.open_invoice) ||
  coerceString(payload?.open_invoice) ||
  null;

const getSubscriptionCodeFromPayload = (payload = {}) =>
  coerceString(payload?.subscription_code) ||
  coerceString(payload?.subscription?.subscription_code) ||
  coerceString(payload?.invoice?.subscription?.subscription_code) ||
  null;

const isStaleSubscriptionEventForOrganisation = (organisation, payload = {}) => {
  const currentSubscriptionCode = coerceString(organisation?.paystack?.subscription?.subscription_code);
  const payloadSubscriptionCode = getSubscriptionCodeFromPayload(payload);
  return Boolean(currentSubscriptionCode && payloadSubscriptionCode && currentSubscriptionCode !== payloadSubscriptionCode);
};

const applySuccessfulBillingState = async ({
  organisation,
  payment = null,
  plan = null,
  billingCycle = null,
  reference = null,
  transactionData = null,
  subscriptionData = null,
  eventType = null,
}) => {
  const resolvedPlanId = plan?.id || payment?.plan || organisation.plan || 'free';
  const resolvedBillingCycle =
    normalizeBillingCycle(
      billingCycle || payment?.billing_cycle || organisation?.paystack?.subscription?.billing_cycle || 'monthly'
    );
  const saasPlanDoc = await resolveOrganisationSaasPlanDoc(resolvedPlanId);
  const customer = transactionData?.customer || subscriptionData?.customer || {};
  const authorization = transactionData?.authorization || subscriptionData?.authorization || {};
  const nextRenewalAt =
    asDate(subscriptionData?.next_payment_date) ||
    asDate(transactionData?.next_payment_date) ||
    organisation.paystack?.renewal?.next_charge_at ||
    computeFallbackNextRenewal(resolvedBillingCycle);

  organisation.plan = resolvedPlanId;
  organisation.saas_plan_id = saasPlanDoc?._id || organisation.saas_plan_id;
  organisation.subscription_status = 'active';
  organisation.status = 'active';
  organisation.billing_provider = 'paystack';
  organisation.subscription_ends_at = nextRenewalAt || organisation.subscription_ends_at;

  organisation.paystack.customer.customer_code =
    coerceString(customer?.customer_code) || organisation.paystack.customer.customer_code || null;
  organisation.paystack.customer.email = coerceString(customer?.email) || organisation.paystack.customer.email || organisation.email;
  organisation.paystack.customer.integration = Number(customer?.integration ?? organisation.paystack.customer.integration ?? 0) || null;
  organisation.paystack.customer.customer_id = Number(customer?.id ?? organisation.paystack.customer.customer_id ?? 0) || null;
  organisation.paystack.customer.identified_at = new Date();

  organisation.paystack.subscription.plan_code =
    coerceString(subscriptionData?.plan?.plan_code) ||
    coerceString(transactionData?.plan?.plan_code) ||
    coerceString(transactionData?.plan_code) ||
    payment?.paystack?.plan_code ||
    organisation.paystack.subscription.plan_code ||
    null;
  organisation.paystack.subscription.subscription_code =
    coerceString(subscriptionData?.subscription_code) ||
    coerceString(transactionData?.subscription?.subscription_code) ||
    payment?.paystack?.subscription_code ||
    organisation.paystack.subscription.subscription_code ||
    null;
  organisation.paystack.subscription.email_token =
    coerceString(subscriptionData?.email_token) ||
    coerceString(transactionData?.subscription?.email_token) ||
    payment?.paystack?.email_token ||
    organisation.paystack.subscription.email_token ||
    null;
  organisation.paystack.subscription.paystack_id =
    Number(subscriptionData?.id ?? organisation.paystack.subscription.paystack_id ?? 0) || null;
  organisation.paystack.subscription.integration =
    Number(subscriptionData?.integration ?? organisation.paystack.subscription.integration ?? 0) || null;
  organisation.paystack.subscription.open_invoice =
    deriveInvoiceCode(subscriptionData) ||
    deriveInvoiceCode(transactionData) ||
    organisation.paystack.subscription.open_invoice ||
    null;
  organisation.paystack.subscription.billing_cycle = resolvedBillingCycle;
  organisation.paystack.subscription.status =
    normalizeSubscriptionLifecycleStatus(subscriptionData?.status) ||
    normalizeSubscriptionLifecycleStatus(transactionData?.status) ||
    normalizeSubscriptionLifecycleStatus(eventType === 'subscription.not_renew' ? 'non_renewing' : null) ||
    organisation.paystack.subscription.status ||
    'active';
  organisation.paystack.subscription.subscribed_at =
    asDate(subscriptionData?.createdAt) ||
    asDate(transactionData?.paid_at || transactionData?.paidAt) ||
    organisation.paystack.subscription.subscribed_at ||
    new Date();
  organisation.paystack.subscription.next_renewal_at = nextRenewalAt;
  organisation.paystack.subscription.cancelled_at =
    eventType === 'subscription.disable' ? new Date() : null;
  organisation.paystack.subscription.cancel_requested_at =
    normalizeSubscriptionLifecycleStatus(subscriptionData?.status) === 'non_renewing' || eventType === 'subscription.not_renew'
      ? organisation.paystack.subscription.cancel_requested_at || new Date()
      : null;
  organisation.paystack.subscription.last_synced_at =
    subscriptionData ? new Date() : organisation.paystack.subscription.last_synced_at || null;
  applyChargeAuthorizationDetails(organisation.paystack.subscription, authorization);

  organisation.paystack.transaction.transaction_id =
    Number(transactionData?.id ?? payment?.paystack?.transaction_id ?? organisation.paystack.transaction.transaction_id ?? 0) || null;
  organisation.paystack.transaction.reference =
    coerceString(reference || transactionData?.reference || payment?.paystack?.reference) ||
    organisation.paystack.transaction.reference ||
    null;
  organisation.paystack.transaction.access_code =
    coerceString(payment?.paystack?.access_code) || organisation.paystack.transaction.access_code || null;
  organisation.paystack.transaction.status =
    coerceString(transactionData?.status || payment?.status) || organisation.paystack.transaction.status || 'success';
  organisation.paystack.transaction.amount =
    Number(transactionData?.amount ?? payment?.amount_gross ?? payment?.amount ?? organisation.paystack.transaction.amount ?? 0) || null;
  organisation.paystack.transaction.currency =
    coerceString(transactionData?.currency || payment?.currency) || organisation.paystack.transaction.currency || 'ZAR';
  organisation.paystack.transaction.gateway_response =
    coerceString(transactionData?.gateway_response) || organisation.paystack.transaction.gateway_response || null;
  organisation.paystack.transaction.channel =
    coerceString(transactionData?.channel || authorization?.channel) || organisation.paystack.transaction.channel || null;
  organisation.paystack.transaction.fees =
    Number(transactionData?.fees ?? payment?.amount_fee ?? organisation.paystack.transaction.fees ?? 0) || null;
  organisation.paystack.transaction.paid_at =
    asDate(transactionData?.paid_at || transactionData?.paidAt) || organisation.paystack.transaction.paid_at || new Date();
  organisation.paystack.transaction.metadata =
    parseJsonObject(transactionData?.metadata) ||
    payment?.paystack?.metadata ||
    organisation.paystack.transaction.metadata ||
    null;

  organisation.paystack.renewal.status = eventType === 'subscription.not_renew' ? 'non_renewing' : 'active';
  organisation.paystack.renewal.next_charge_at = nextRenewalAt;
  organisation.paystack.renewal.last_attempt_at =
    asDate(transactionData?.paid_at || transactionData?.paidAt) ||
    asDate(subscriptionData?.updatedAt) ||
    new Date();
  organisation.paystack.renewal.last_success_at =
    asDate(transactionData?.paid_at || transactionData?.paidAt) || organisation.paystack.renewal.last_success_at || new Date();
  organisation.paystack.renewal.last_failed_at = organisation.paystack.renewal.last_failed_at || null;
  organisation.paystack.renewal.warning = null;
  organisation.paystack.renewal.failure_code = null;
  organisation.paystack.renewal.failure_message = null;
  organisation.paystack.renewal.cancel_at_period_end =
    normalizeSubscriptionLifecycleStatus(subscriptionData?.status) === 'non_renewing' || eventType === 'subscription.not_renew';
};

const maybeRetirePreviousSubscriptionAfterPlanChange = async ({
  organisation,
  payment = null,
  subscriptionData = null,
  transactionData = null,
}) => {
  const metadata = parseJsonObject(payment?.paystack?.metadata) || {};
  if (coerceString(metadata?.intent) !== 'plan_change') {
    return false;
  }

  const previousSubscriptionCode = coerceString(metadata?.previous_subscription_code);
  const previousEmailToken = coerceString(metadata?.previous_subscription_email_token);
  const retiredAt = metadata?.previous_subscription_retired_at || null;
  const currentSubscriptionCode =
    coerceString(subscriptionData?.subscription_code) ||
    coerceString(transactionData?.subscription?.subscription_code) ||
    coerceString(payment?.paystack?.subscription_code) ||
    coerceString(organisation?.paystack?.subscription?.subscription_code);

  if (!previousSubscriptionCode || !previousEmailToken || retiredAt) {
    return false;
  }

  if (!currentSubscriptionCode || currentSubscriptionCode === previousSubscriptionCode) {
    return false;
  }

  await disablePaystackSubscriptionByToken({
    subscriptionCode: previousSubscriptionCode,
    emailToken: previousEmailToken,
  });

  payment.paystack.metadata = {
    ...metadata,
    previous_subscription_retired_at: new Date(),
    previous_subscription_retired: true,
  };
  await payment.save();
  return true;
};

const applyFailedBillingState = (
  organisation,
  { message = null, code = null, nextChargeAt = null, reference = null, transactionData = null } = {}
) => {
  organisation.subscription_status = 'past_due';
  organisation.billing_provider = 'paystack';
  organisation.paystack.subscription.status =
    normalizeSubscriptionLifecycleStatus(code) ||
    organisation.paystack.subscription.status ||
    'attention';
  organisation.paystack.subscription.next_renewal_at =
    asDate(nextChargeAt) || organisation.paystack.subscription.next_renewal_at || null;
  organisation.paystack.renewal.status = 'past_due';
  organisation.paystack.renewal.last_attempt_at =
    asDate(transactionData?.paid_at || transactionData?.paidAt) || new Date();
  organisation.paystack.renewal.last_failed_at = new Date();
  organisation.paystack.renewal.next_charge_at = asDate(nextChargeAt) || organisation.paystack.renewal.next_charge_at || null;
  organisation.paystack.renewal.warning = message || 'Latest Paystack renewal attempt failed';
  organisation.paystack.renewal.failure_code = code || null;
  organisation.paystack.renewal.failure_message = message || null;
  organisation.paystack.renewal.cancel_at_period_end = false;
  organisation.paystack.transaction.reference =
    coerceString(reference || transactionData?.reference) || organisation.paystack.transaction.reference || null;
  organisation.paystack.transaction.status = 'failed';
  organisation.paystack.transaction.gateway_response =
    coerceString(message || transactionData?.gateway_response) || organisation.paystack.transaction.gateway_response || null;
};

const applyDisabledSubscriptionState = (organisation, subscriptionData = null) => {
  const cancelledAt = asDate(subscriptionData?.updatedAt) || new Date();
  organisation.subscription_status = 'cancelled';
  organisation.billing_provider = 'paystack';
  organisation.subscription_ends_at = cancelledAt;
  organisation.paystack.subscription.status = 'disabled';
  organisation.paystack.subscription.cancelled_at = cancelledAt;
  organisation.paystack.subscription.next_renewal_at = null;
  organisation.paystack.renewal.status = 'cancelled';
  organisation.paystack.renewal.next_charge_at = null;
  organisation.paystack.renewal.cancel_at_period_end = true;
};

const updatePaymentFromTransaction = (payment, { transactionData, plan = null, billingCycle = null, eventType = null }) => {
  if (!payment) return;
  const metadata = parseJsonObject(transactionData?.metadata) || payment.paystack?.metadata || null;
  const grossAmount =
    transactionData?.amount != null
      ? toMoneyAmount(transactionData.amount)
      : Number(payment.amount_gross ?? payment.amount ?? 0) || 0;
  const feeAmount =
    transactionData?.fees != null
      ? toMoneyAmount(transactionData.fees)
      : Number(payment.amount_fee ?? payment.paystack?.fees ?? 0) || 0;
  payment.status = transactionData?.status === 'success' ? 'completed' : payment.status;
  payment.amount = grossAmount;
  payment.amount_gross = grossAmount;
  payment.amount_fee = feeAmount;
  payment.amount_net = Number((grossAmount - feeAmount).toFixed(2)) || 0;
  if (transactionData?.status === 'success') {
    payment.completed_at = asDate(transactionData?.paid_at || transactionData?.paidAt) || payment.completed_at || new Date();
  }
  payment.plan = plan?.id || payment.plan;
  payment.billing_cycle = normalizeBillingCycle(billingCycle || payment.billing_cycle);
  payment.currency = coerceString(transactionData?.currency || payment.currency) || 'ZAR';
  payment.payment_method = 'paystack';
  payment.paystack.customer_code =
    coerceString(transactionData?.customer?.customer_code) || payment.paystack.customer_code || null;
  payment.paystack.plan_code =
    coerceString(transactionData?.plan?.plan_code || transactionData?.plan_code) || payment.paystack.plan_code || null;
  payment.paystack.subscription_code =
    coerceString(transactionData?.subscription?.subscription_code) || payment.paystack.subscription_code || null;
  payment.paystack.invoice_code = deriveInvoiceCode(transactionData) || payment.paystack.invoice_code || null;
  payment.paystack.email_token =
    coerceString(transactionData?.subscription?.email_token) || payment.paystack.email_token || null;
  payment.paystack.transaction_id = Number(transactionData?.id ?? payment.paystack.transaction_id ?? 0) || null;
  payment.paystack.reference = coerceString(transactionData?.reference) || payment.paystack.reference || null;
  payment.paystack.authorization_code =
    coerceString(transactionData?.authorization?.authorization_code) || payment.paystack.authorization_code || null;
  payment.paystack.authorization_signature =
    coerceString(transactionData?.authorization?.signature) || payment.paystack.authorization_signature || null;
  payment.paystack.gateway_response =
    coerceString(transactionData?.gateway_response) || payment.paystack.gateway_response || null;
  payment.paystack.channel = coerceString(transactionData?.channel) || payment.paystack.channel || null;
  payment.paystack.fees = feeAmount || null;
  payment.paystack.paid_at = asDate(transactionData?.paid_at || transactionData?.paidAt) || payment.paystack.paid_at || null;
  payment.paystack.renewal_status =
    transactionData?.status === 'success'
      ? 'success'
      : payment.paystack.renewal_status || null;
  payment.paystack.webhook_event = eventType || payment.paystack.webhook_event || null;
  payment.paystack.metadata = metadata;
};

const maybeSendPaymentSuccessEmail = async ({ organisation, payment, plan, billingCycle, transactionData }) => {
  if (!payment || payment.paystack?.success_email_sent_at) return null;

  const recipient = coerceString(organisation?.email);
  if (!recipient) return null;

  const result = await sendPaymentSuccessEmail({
    to: recipient,
    name: organisation?.firm_name || 'there',
    organisationName: organisation?.firm_name || null,
    planName: plan?.name || plan?.id || organisation?.plan || 'Subscription',
    billingCycle: normalizeBillingCycle(billingCycle || payment?.billing_cycle || 'monthly'),
    amountLabel: formatMoneyLabel(
      transactionData?.currency || payment?.currency || 'ZAR',
      toMoneyAmount(transactionData?.amount ?? payment?.amount_gross ?? payment?.amount ?? 0),
    ),
    reference: coerceString(transactionData?.reference) || payment?.paystack?.reference || null,
    nextRenewalLabel: formatDateLabel(
      organisation?.paystack?.subscription?.next_renewal_at ||
      organisation?.paystack?.renewal?.next_charge_at ||
      organisation?.subscription_ends_at ||
      null,
    ),
  });

  if (!result?.sent) return null;

  payment.paystack.success_email_sent_at = new Date();
  payment.paystack.success_email_message_id = result.messageId || null;
  await payment.save();
  return result;
};

const getPaymentLookupCandidates = (payload = {}) => {
  const metadata = parseJsonObject(payload?.metadata) || {};
  return {
    paymentId: coerceString(metadata?.payment_id),
    invoiceCode: deriveInvoiceCode(payload),
    reference:
      coerceString(payload?.reference) ||
      coerceString(payload?.transaction?.reference) ||
      coerceString(payload?.invoice?.transaction?.reference),
    subscriptionCode:
      coerceString(payload?.subscription_code) ||
      coerceString(payload?.subscription?.subscription_code) ||
      coerceString(payload?.invoice?.subscription?.subscription_code),
  };
};

const findPaymentForPayload = async (payload = {}) => {
  const lookup = getPaymentLookupCandidates(payload);
  if (lookup.paymentId && mongoose.Types.ObjectId.isValid(lookup.paymentId)) {
    const payment = await Payment.findById(lookup.paymentId);
    if (payment) return payment;
  }
  if (lookup.invoiceCode) {
    const payment = await Payment.findOne({ 'paystack.invoice_code': lookup.invoiceCode }).sort({ created_at: -1 });
    if (payment) return payment;
  }
  if (lookup.reference) {
    const payment = await Payment.findOne({ 'paystack.reference': lookup.reference }).sort({ created_at: -1 });
    if (payment) return payment;
  }
  return null;
};

const findOrganisationForPayload = async (payload = {}, payment = null) => {
  if (payment?.organisation_id) {
    const organisation = await Organisation.findById(payment.organisation_id);
    if (organisation) return organisation;
  }

  const metadata = parseJsonObject(payload?.metadata) || {};
  const organisationId = coerceString(metadata?.organisation_id);
  if (organisationId && mongoose.Types.ObjectId.isValid(organisationId)) {
    const organisation = await Organisation.findById(organisationId);
    if (organisation) return organisation;
  }

  const subscriptionCode =
    coerceString(payload?.subscription_code) ||
    coerceString(payload?.subscription?.subscription_code) ||
    coerceString(payload?.invoice?.subscription?.subscription_code);
  if (subscriptionCode) {
    const organisation = await Organisation.findOne({ 'paystack.subscription.subscription_code': subscriptionCode });
    if (organisation) return organisation;
  }

  const customerCode =
    coerceString(payload?.customer?.customer_code) ||
    coerceString(payload?.customer_code) ||
    coerceString(payload?.invoice?.customer?.customer_code);
  if (customerCode) {
    const organisation = await Organisation.findOne({ 'paystack.customer.customer_code': customerCode });
    if (organisation) return organisation;
  }

  const email =
    coerceString(payload?.customer?.email) ||
    coerceString(payload?.email) ||
    coerceString(payload?.invoice?.customer?.email);
  if (email) {
    const organisation = await Organisation.findOne({ email: normalizeLower(email) });
    if (organisation) return organisation;
  }

  return null;
};

const createRenewalPayment = async ({
  organisation,
  plan = null,
  billingCycle = null,
  transactionData = null,
  eventType = null,
}) => {
  const resolvedPlanId = plan?.id || organisation.plan;
  const resolvedBillingCycle =
    normalizeBillingCycle(billingCycle || organisation.paystack?.subscription?.billing_cycle || 'monthly');
  const payment = await Payment.create({
    organisation_id: organisation._id,
    amount: toMoneyAmount(transactionData?.amount),
    currency: coerceString(transactionData?.currency) || 'ZAR',
    status: transactionData?.status === 'success' ? 'completed' : 'failed',
    payment_method: 'paystack',
    description: `${resolvedPlanId} plan - ${resolvedBillingCycle} renewal`,
    plan: resolvedPlanId,
    billing_cycle: resolvedBillingCycle,
    amount_gross: toMoneyAmount(transactionData?.amount),
    amount_fee: toMoneyAmount(transactionData?.fees),
    amount_net: toMoneyAmount(Number(transactionData?.amount || 0) - Number(transactionData?.fees || 0)),
    completed_at: asDate(transactionData?.paid_at || transactionData?.paidAt),
    paystack: {
      customer_code: coerceString(transactionData?.customer?.customer_code),
      plan_code: coerceString(transactionData?.plan?.plan_code || transactionData?.plan_code),
      subscription_code: coerceString(transactionData?.subscription?.subscription_code),
      invoice_code: deriveInvoiceCode(transactionData),
      email_token: coerceString(transactionData?.subscription?.email_token),
      transaction_id: Number(transactionData?.id || 0) || null,
      reference: coerceString(transactionData?.reference),
      authorization_code: coerceString(transactionData?.authorization?.authorization_code),
      authorization_signature: coerceString(transactionData?.authorization?.signature),
      gateway_response: coerceString(transactionData?.gateway_response),
      channel: coerceString(transactionData?.channel),
      fees: toMoneyAmount(transactionData?.fees),
      paid_at: asDate(transactionData?.paid_at || transactionData?.paidAt),
      renewal_due_at:
        asDate(transactionData?.next_payment_date) ||
        asDate(transactionData?.due_date) ||
        asDate(transactionData?.invoice_date) ||
        null,
      renewal_status: transactionData?.status === 'success' ? 'success' : 'failed',
      webhook_event: eventType || null,
      metadata: parseJsonObject(transactionData?.metadata),
    },
  });
  return payment;
};

const resolvePlanAndCycle = async ({ payload = null, payment = null, organisation = null } = {}) => {
  const parsed = await derivePlanAndCycleFromMetadata(payload || {});
  if (parsed.plan && parsed.billingCycle) {
    return parsed;
  }

  const planCode =
    coerceString(payload?.plan?.plan_code) ||
    coerceString(payload?.plan_code) ||
    coerceString(payment?.paystack?.plan_code) ||
    coerceString(organisation?.paystack?.subscription?.plan_code);
  if (planCode) {
    const plan = await resolvePlanByPlanCode(planCode);
    if (plan) {
      const monthlyCode = plan?.billing?.paystack?.monthly?.plan_code;
      return {
        plan,
        billingCycle: monthlyCode === planCode ? 'monthly' : 'annual',
        metadata: parsed.metadata,
      };
    }
  }

  if (payment?.plan) {
    return {
      plan: await resolveSaasPlan(payment.plan),
      billingCycle: normalizeBillingCycle(payment.billing_cycle),
      metadata: parsed.metadata,
    };
  }

  if (organisation?.plan) {
    return {
      plan: await resolveSaasPlan(organisation.plan),
      billingCycle: normalizeBillingCycle(organisation?.paystack?.subscription?.billing_cycle || 'monthly'),
      metadata: parsed.metadata,
    };
  }

  return { plan: null, billingCycle: null, metadata: parsed.metadata };
};

export const verifyPaystackWebhookSignature = (payload, signature, secretKey = null) => {
  const secret = coerceString(secretKey) || assertPaystackBillingConfigured().secretKey;
  const rawPayload = typeof payload === 'string' ? payload : JSON.stringify(payload || {});
  const expectedSignature = crypto.createHmac('sha512', secret).update(rawPayload).digest('hex');
  return Boolean(signature) && expectedSignature === String(signature);
};

export const isKnownPaystackIp = (ipAddress) => PAYSTACK_IPS.has(String(ipAddress || '').trim());

export const ensurePaystackPlanForBilling = async (planId, billingCycle) => {
  const plan = await resolveSaasPlan(planId);
  return syncOrCreatePaystackPlan(plan, billingCycle);
};

export const initializePaystackCheckout = async ({ organisation, planId, billingCycle = 'monthly', intent = null }) => {
  if (!organisation?._id) {
    throw buildHttpError('Organisation is required for billing checkout', 400);
  }

  const plan = await resolveSaasPlan(planId);
  const normalizedCycle = normalizeBillingCycle(billingCycle);
  const previousSubscriptionCode = coerceString(organisation?.paystack?.subscription?.subscription_code);
  const previousEmailToken = coerceString(organisation?.paystack?.subscription?.email_token);
  const currentBillingCycle = normalizeBillingCycle(organisation?.paystack?.subscription?.billing_cycle || 'monthly');
  const hasActiveSubscriptionToReplace = Boolean(
    organisation?.plan &&
    organisation.plan !== 'free' &&
    previousSubscriptionCode &&
    previousEmailToken
  );
  const requestedIntent =
    coerceString(intent) ||
    (hasActiveSubscriptionToReplace && (plan.id !== organisation.plan || normalizedCycle !== currentBillingCycle)
      ? 'plan_change'
      : 'retry');
  const amount = normalizedCycle === 'annual' ? Number(plan.price_annual || 0) : Number(plan.price_monthly || 0);

  if (amount <= 0) {
    if (hasActiveSubscriptionToReplace) {
      await disablePaystackSubscriptionByToken({
        subscriptionCode: previousSubscriptionCode,
        emailToken: previousEmailToken,
      });
      organisation.paystack.subscription.cancel_requested_at = new Date();
      organisation.paystack.subscription.cancelled_at = new Date();
      organisation.paystack.subscription.status = 'disabled';
      organisation.paystack.subscription.next_renewal_at = null;
      organisation.paystack.renewal.status = 'cancelled';
      organisation.paystack.renewal.next_charge_at = null;
      organisation.paystack.renewal.cancel_at_period_end = true;
    }
    const saasPlanDoc = await resolveOrganisationSaasPlanDoc('free');
    organisation.plan = 'free';
    organisation.saas_plan_id = saasPlanDoc?._id || organisation.saas_plan_id;
    organisation.subscription_status = 'active';
    organisation.status = 'active';
    organisation.billing_provider = null;
    await organisation.save();
    return {
      plan,
      payment: null,
      checkout: null,
      mode: 'free',
      message: 'Switched to free plan',
    };
  }

  const config = assertPaystackBillingConfigured();
  const mapping = await syncOrCreatePaystackPlan(plan, normalizedCycle);
  const reference = buildPaystackReference(organisation._id);
  const paymentId = new mongoose.Types.ObjectId();
  const metadata = buildCheckoutMetadata({
    organisation,
    paymentId,
    plan,
    billingCycle: normalizedCycle,
    localPlanKey: mapping.local_plan_key,
    intent: requestedIntent,
    previousSubscriptionCode: requestedIntent === 'plan_change' ? previousSubscriptionCode : null,
    previousEmailToken: requestedIntent === 'plan_change' ? previousEmailToken : null,
    previousPlan: requestedIntent === 'plan_change' ? organisation.plan : null,
    previousBillingCycle: requestedIntent === 'plan_change' ? currentBillingCycle : null,
  });

  const payment = new Payment({
    _id: paymentId,
    organisation_id: organisation._id,
    amount,
    currency: 'ZAR',
    status: 'pending',
    payment_method: 'paystack',
      description: requestedIntent === 'plan_change'
        ? `${plan.id} plan - ${normalizedCycle} plan change`
        : `${plan.id} plan - ${normalizedCycle}`,
    plan: plan.id,
    billing_cycle: normalizedCycle,
    paystack: {
      plan_code: mapping.plan_code,
      reference,
      metadata: {
        ...metadata,
        callback_url: config.callbackUrl,
        webhook_url: config.webhookUrl,
      },
    },
  });

  try {
    const initialized = await paystackRequest('POST', '/transaction/initialize', {
      body: {
        email: organisation.email,
        amount: String(toPaystackSubunit(amount)),
        currency: 'ZAR',
        reference,
        callback_url: config.callbackUrl,
        plan: mapping.plan_code,
        metadata: metadata,
      },
    });

    payment.paystack.reference = coerceString(initialized?.reference) || reference;
    payment.paystack.access_code = coerceString(initialized?.access_code);
    payment.paystack.metadata = {
      ...payment.paystack.metadata,
      authorization_url: coerceString(initialized?.authorization_url),
    };
    await payment.save();

    organisation.billing_provider = 'paystack';
    organisation.paystack.subscription.plan_code = mapping.plan_code;
    organisation.paystack.subscription.billing_cycle = normalizedCycle;
    organisation.paystack.transaction.reference = payment.paystack.reference;
    organisation.paystack.transaction.access_code = payment.paystack.access_code;
    organisation.paystack.renewal.status = 'pending';
    await organisation.save();

    return {
      mode: 'paystack',
      plan,
      payment,
      checkout: {
        provider: 'paystack',
        mode: config.mode,
        public_key: config.publicKey,
        callback_url: config.callbackUrl,
        webhook_url: config.webhookUrl,
        authorization_url: coerceString(initialized?.authorization_url),
        access_code: payment.paystack.access_code,
        reference: payment.paystack.reference,
        plan_code: mapping.plan_code,
        local_plan_key: mapping.local_plan_key,
        mapping_status: mapping.source || 'configured',
        intent: requestedIntent,
      },
    };
  } catch (error) {
    payment.status = 'failed';
    payment.paystack.gateway_response = error.message || 'Paystack checkout initialization failed';
    payment.paystack.metadata = {
      ...payment.paystack.metadata,
      init_error: error.message || 'Paystack checkout initialization failed',
    };
    await payment.save();
    throw error;
  }
};

export const verifyPaystackTransaction = async (reference) => {
  const normalizedReference = coerceString(reference);
  if (!normalizedReference) {
    throw buildHttpError('A Paystack transaction reference is required', 400);
  }
  return paystackRequest('GET', `/transaction/verify/${encodeURIComponent(normalizedReference)}`);
};

export const syncBillingStateFromVerifiedTransaction = async (transactionData, { eventType = 'callback' } = {}) => {
  const payment = await findPaymentForPayload(transactionData);
  const organisation = await findOrganisationForPayload(transactionData, payment);
  if (!organisation) {
    throw buildHttpError('Unable to resolve organisation for verified Paystack transaction', 404, {
      reference: transactionData?.reference || null,
    });
  }

  const { plan, billingCycle } = await resolvePlanAndCycle({ payload: transactionData, payment, organisation });
  const resolvedPayment =
    payment ||
    (transactionData?.status === 'success'
      ? await createRenewalPayment({ organisation, plan, billingCycle, transactionData, eventType })
      : null);

  if (resolvedPayment) {
    updatePaymentFromTransaction(resolvedPayment, { transactionData, plan, billingCycle, eventType });
    if (transactionData?.status && transactionData.status !== 'success') {
      resolvedPayment.status = 'failed';
      resolvedPayment.paystack.gateway_response =
        coerceString(transactionData?.gateway_response) || resolvedPayment.paystack.gateway_response || 'Charge failed';
    }
    await resolvedPayment.save();
  }

  if (transactionData?.status === 'success') {
    await applySuccessfulBillingState({
      organisation,
      payment: resolvedPayment,
      plan,
      billingCycle,
      reference: transactionData?.reference,
      transactionData,
      eventType,
    });
    await maybeRetirePreviousSubscriptionAfterPlanChange({
      organisation,
      payment: resolvedPayment,
      transactionData,
    });
  } else {
    applyFailedBillingState(organisation, {
      message: coerceString(transactionData?.gateway_response) || 'Paystack charge failed',
      code: coerceString(transactionData?.status),
      reference: transactionData?.reference,
      transactionData,
    });
  }

  await organisation.save();
  if (transactionData?.status === 'success') {
    await maybeSendPaymentSuccessEmail({
      organisation,
      payment: resolvedPayment,
      plan,
      billingCycle,
      transactionData,
    });
  }
  return { organisation, payment: resolvedPayment, transaction: transactionData };
};

const syncBillingStateFromSubscriptionPayload = async (subscriptionData, { eventType }) => {
  const payment = await findPaymentForPayload(subscriptionData);
  const organisation = await findOrganisationForPayload(subscriptionData, payment);
  if (!organisation) {
    throw buildHttpError('Unable to resolve organisation for Paystack subscription event', 404, {
      subscription_code: subscriptionData?.subscription_code || null,
    });
  }

  const { plan, billingCycle } = await resolvePlanAndCycle({ payload: subscriptionData, payment, organisation });
  if (isStaleSubscriptionEventForOrganisation(organisation, subscriptionData)) {
    return { organisation, payment, ignored: true, eventType };
  }

  if (eventType === 'subscription.disable') {
    applyDisabledSubscriptionState(organisation, subscriptionData);
  } else {
    await applySuccessfulBillingState({
      organisation,
      payment,
      plan,
      billingCycle,
      transactionData: null,
      subscriptionData,
      eventType,
    });
  }

  await organisation.save();
  return { organisation, payment };
};

const syncBillingStateFromInvoicePayload = async (invoiceData, { eventType }) => {
  const payment = await findPaymentForPayload(invoiceData);
  const organisation = await findOrganisationForPayload(invoiceData, payment);
  if (!organisation) {
    throw buildHttpError('Unable to resolve organisation for Paystack invoice event', 404, {
      subscription_code: invoiceData?.subscription?.subscription_code || null,
    });
  }

  const { plan, billingCycle } = await resolvePlanAndCycle({ payload: invoiceData, payment, organisation });
  if (isStaleSubscriptionEventForOrganisation(organisation, invoiceData)) {
    return { organisation, payment, ignored: true, eventType };
  }
  const nextChargeAt =
    asDate(invoiceData?.next_payment_date) ||
    asDate(invoiceData?.due_date) ||
    asDate(invoiceData?.invoice_date) ||
    null;

  if (eventType === 'invoice.create') {
    organisation.billing_provider = 'paystack';
    organisation.paystack.subscription.open_invoice = deriveInvoiceCode(invoiceData) || organisation.paystack.subscription.open_invoice || null;
    organisation.paystack.subscription.last_synced_at = new Date();
    organisation.paystack.renewal.status = 'pending';
    organisation.paystack.renewal.last_attempt_at = new Date();
    organisation.paystack.renewal.next_charge_at = nextChargeAt;
    organisation.paystack.renewal.warning = null;
  } else if (eventType === 'invoice.payment_failed') {
    let resolvedPayment = payment;
    if (payment) {
      payment.status = 'failed';
      payment.paystack.renewal_status = 'failed';
      payment.paystack.renewal_due_at = nextChargeAt;
      payment.paystack.invoice_code = deriveInvoiceCode(invoiceData) || payment.paystack.invoice_code || null;
      payment.paystack.webhook_event = eventType;
      payment.paystack.gateway_response =
        coerceString(invoiceData?.description) || payment.paystack.gateway_response || 'Renewal charge failed';
      await payment.save();
    } else {
      resolvedPayment = await createRenewalPayment({
        organisation,
        plan,
        billingCycle,
        transactionData: {
          amount: invoiceData?.amount,
          currency: invoiceData?.currency || 'ZAR',
          status: 'failed',
          reference: invoiceData?.transaction?.reference || null,
          metadata: invoiceData?.metadata || null,
          gateway_response: invoiceData?.description || 'Renewal charge failed',
          subscription: invoiceData?.subscription || null,
          customer: invoiceData?.customer || null,
          invoice_code: deriveInvoiceCode(invoiceData),
          due_date: invoiceData?.due_date || null,
        },
        eventType,
      });
    }
    applyFailedBillingState(organisation, {
      message: coerceString(invoiceData?.description) || 'Paystack invoice payment failed',
      code: coerceString(invoiceData?.status),
      nextChargeAt,
      reference: invoiceData?.transaction?.reference || resolvedPayment?.paystack?.reference || null,
      transactionData: {
        reference: invoiceData?.transaction?.reference || null,
        gateway_response: invoiceData?.description || 'Renewal charge failed',
      },
    });
  } else if (eventType === 'invoice.update') {
    if (normalizeLower(invoiceData?.status) === 'success' || invoiceData?.paid === true) {
      const transactionData = {
        id: invoiceData?.transaction?.id || null,
        reference: invoiceData?.transaction?.reference || null,
        amount: invoiceData?.amount || null,
        currency: invoiceData?.currency || 'ZAR',
        paid_at: invoiceData?.paid_at || invoiceData?.updatedAt || null,
        gateway_response: invoiceData?.description || 'Invoice paid',
        metadata: invoiceData?.metadata || null,
        plan: invoiceData?.subscription?.plan || null,
        status: 'success',
        customer: invoiceData?.customer || null,
        subscription: invoiceData?.subscription || null,
        invoice_code: deriveInvoiceCode(invoiceData),
        next_payment_date: invoiceData?.next_payment_date || null,
      };
      const resolvedPayment =
        payment ||
        await createRenewalPayment({
          organisation,
          plan,
          billingCycle,
          transactionData,
          eventType,
        });
      updatePaymentFromTransaction(resolvedPayment, { transactionData, plan, billingCycle, eventType });
      await resolvedPayment.save();
      await applySuccessfulBillingState({
        organisation,
        payment: resolvedPayment,
        plan,
        billingCycle,
        reference: invoiceData?.transaction?.reference || resolvedPayment?.paystack?.reference || null,
        transactionData,
        subscriptionData: invoiceData?.subscription || null,
        eventType,
      });
      await maybeRetirePreviousSubscriptionAfterPlanChange({
        organisation,
        payment: resolvedPayment,
        subscriptionData: invoiceData?.subscription || null,
        transactionData,
      });
    }
  }

  await organisation.save();
  return { organisation, payment };
};

export const handlePaystackWebhookEvent = async ({ event, data }) => {
  const eventType = coerceString(event);
  if (!eventType || !data) {
    throw buildHttpError('Invalid Paystack webhook payload', 400);
  }

  if (eventType === 'charge.success') {
    return syncBillingStateFromVerifiedTransaction(data, { eventType });
  }

  if (eventType === 'subscription.create' || eventType === 'subscription.not_renew' || eventType === 'subscription.disable') {
    return syncBillingStateFromSubscriptionPayload(data, { eventType });
  }

  if (eventType === 'invoice.create' || eventType === 'invoice.payment_failed' || eventType === 'invoice.update') {
    return syncBillingStateFromInvoicePayload(data, { eventType });
  }

  return { ignored: true, event: eventType };
};

export const getPaystackSubscriptionCapabilities = (organisation = null) => {
  const subscriptionCode = coerceString(organisation?.paystack?.subscription?.subscription_code);
  const emailToken = coerceString(organisation?.paystack?.subscription?.email_token);
  const cancelAtPeriodEnd = Boolean(
    organisation?.paystack?.renewal?.cancel_at_period_end || organisation?.paystack?.subscription?.cancel_requested_at
  );

  return {
    provider: 'paystack',
    supported: {
      cancel_renewal: true,
      resume_renewal: true,
      manage_link: true,
      manage_link_email: true,
      fetch_subscription: true,
      sync_subscription: true,
    },
    available: {
      cancel_renewal: Boolean(subscriptionCode && emailToken && !cancelAtPeriodEnd),
      resume_renewal: Boolean(subscriptionCode && emailToken && cancelAtPeriodEnd),
      manage_link: Boolean(subscriptionCode),
      manage_link_email: Boolean(subscriptionCode),
      fetch_subscription: Boolean(subscriptionCode),
      sync_subscription: Boolean(subscriptionCode),
    },
    state: {
      subscription_code: subscriptionCode,
      status: coerceString(organisation?.paystack?.subscription?.status),
      cancel_at_period_end: cancelAtPeriodEnd,
      last_synced_at: organisation?.paystack?.subscription?.last_synced_at || null,
    },
  };
};

export const fetchAndSyncPaystackSubscription = async (organisation) => {
  const subscriptionCode = coerceString(organisation?.paystack?.subscription?.subscription_code);
  if (!subscriptionCode) {
    throw buildHttpError('No Paystack subscription was found for this organisation', 409);
  }

  const subscription = await paystackRequest('GET', `/subscription/${encodeURIComponent(subscriptionCode)}`);
  const payment = await Payment.findOne({
    organisation_id: organisation._id,
    'paystack.subscription_code': subscriptionCode,
  }).sort({ created_at: -1 });
  const { plan, billingCycle } = await resolvePlanAndCycle({ payload: subscription, payment, organisation });
  const remoteStatus = normalizeSubscriptionLifecycleStatus(subscription?.status);

  if (remoteStatus === 'disabled') {
    applyDisabledSubscriptionState(organisation, subscription);
  } else if (remoteStatus === 'attention' || remoteStatus === 'past_due') {
    applyFailedBillingState(organisation, {
      message: 'Paystack reported that the subscription needs payment attention',
      code: remoteStatus,
      nextChargeAt: subscription?.next_payment_date || null,
    });
  } else {
    await applySuccessfulBillingState({
      organisation,
      payment,
      plan,
      billingCycle,
      subscriptionData: subscription,
      eventType: remoteStatus === 'non_renewing' ? 'subscription.not_renew' : 'subscription.fetch',
    });
  }

  organisation.paystack.subscription.last_synced_at = new Date();
  await organisation.save();

  return {
    organisation,
    payment,
    subscription,
    capabilities: getPaystackSubscriptionCapabilities(organisation),
  };
};

export const cancelPaystackRenewal = async (organisation) => {
  const subscriptionCode = coerceString(organisation?.paystack?.subscription?.subscription_code);
  const emailToken = coerceString(organisation?.paystack?.subscription?.email_token);
  const result = await disablePaystackSubscriptionByToken({ subscriptionCode, emailToken });

  organisation.billing_provider = 'paystack';
  organisation.paystack.subscription.cancel_requested_at = new Date();
  organisation.paystack.subscription.status = 'non_renewing';
  organisation.paystack.renewal.cancel_at_period_end = true;
  organisation.paystack.renewal.status = 'non_renewing';
  await organisation.save();

  return {
    ...result,
  };
};

export const generatePaystackManagementLink = async (organisation) => {
  const subscriptionCode = coerceString(organisation?.paystack?.subscription?.subscription_code);
  if (!subscriptionCode) {
    throw buildHttpError('No Paystack subscription was found for this organisation', 409);
  }

  const response = await paystackRequest(
    'GET',
    `/subscription/${encodeURIComponent(subscriptionCode)}/manage/link`
  );

  organisation.paystack.subscription.manage_link = coerceString(response?.link) || null;
  organisation.paystack.subscription.manage_link_generated_at = new Date();
  await organisation.save();

  return {
    subscription_code: subscriptionCode,
    link: coerceString(response?.link),
  };
};

export const sendPaystackManagementLinkEmail = async (organisation) => {
  const subscriptionCode = coerceString(organisation?.paystack?.subscription?.subscription_code);
  if (!subscriptionCode) {
    throw buildHttpError('No Paystack subscription was found for this organisation', 409);
  }

  await paystackRequest('POST', `/subscription/${encodeURIComponent(subscriptionCode)}/manage/email`);
  organisation.paystack.subscription.manage_link_sent_at = new Date();
  await organisation.save();

  return {
    subscription_code: subscriptionCode,
    sent: true,
  };
};

export const resumePaystackRenewal = async (organisation) => {
  const subscriptionCode = coerceString(organisation?.paystack?.subscription?.subscription_code);
  const emailToken = coerceString(organisation?.paystack?.subscription?.email_token);
  if (!subscriptionCode || !emailToken) {
    throw buildHttpError('No resumable Paystack subscription was found for this organisation', 409);
  }

  await paystackRequest('POST', '/subscription/enable', {
    body: {
      code: subscriptionCode,
      token: emailToken,
    },
  });

  organisation.billing_provider = 'paystack';
  organisation.paystack.subscription.status = 'active';
  organisation.paystack.subscription.cancel_requested_at = null;
  organisation.paystack.subscription.cancelled_at = null;
  organisation.paystack.renewal.status = 'active';
  organisation.paystack.renewal.cancel_at_period_end = false;
  organisation.paystack.renewal.warning = null;
  organisation.paystack.renewal.failure_code = null;
  organisation.paystack.renewal.failure_message = null;

  const synced = await fetchAndSyncPaystackSubscription(organisation);
  return {
    subscription_code: subscriptionCode,
    cancel_at_period_end: false,
    status: synced.organisation?.paystack?.subscription?.status || 'active',
    next_renewal_at: synced.organisation?.paystack?.subscription?.next_renewal_at || null,
  };
};

export const resolveRetryCheckoutTarget = async (organisation, payload = {}) => {
  const explicitPlan = coerceString(payload?.plan);
  const explicitBillingCycle = coerceString(payload?.billing_cycle);
  if (explicitPlan) {
    return {
      planId: explicitPlan,
      billingCycle: normalizeBillingCycle(explicitBillingCycle),
    };
  }

  const latestRetryablePayment = await Payment.findOne({
    organisation_id: organisation._id,
    payment_method: 'paystack',
    status: { $in: ['pending', 'failed'] },
  }).sort({ created_at: -1 });

  if (latestRetryablePayment?.plan) {
    return {
      planId: latestRetryablePayment.plan,
      billingCycle: normalizeBillingCycle(latestRetryablePayment.billing_cycle),
    };
  }

  if (organisation.plan && organisation.plan !== 'free') {
    return {
      planId: organisation.plan,
      billingCycle: normalizeBillingCycle(organisation?.paystack?.subscription?.billing_cycle || 'monthly'),
    };
  }

  throw buildHttpError('No retryable paid checkout was found for this organisation', 409);
};
