const BILLING_GATE_TARGET_URL = '/app/settings?tab=subscription';

const normalizeValue = (value) => String(value || '').trim().toLowerCase();

const hasCompletedPaidBilling = ({ organisation, payments = [] }) => {
  if (!organisation) return false;
  if (organisation?.paystack?.subscription?.subscription_code) return true;

  return payments.some((payment) =>
    normalizeValue(payment?.payment_method) === 'paystack' &&
    normalizeValue(payment?.status) === 'completed'
  );
};

export const buildBillingAccessGate = ({ organisation, latestCheckout = null, payments = [] } = {}) => {
  if (!organisation) {
    return {
      requires_billing_completion: false,
      reason: 'no_organisation',
      target_url: BILLING_GATE_TARGET_URL,
      has_completed_purchase: false,
      checkout_status: null,
    };
  }

  const plan = normalizeValue(organisation.plan);
  const organisationStatus = normalizeValue(organisation.status);
  const subscriptionStatus = normalizeValue(organisation.subscription_status);
  const renewalStatus = normalizeValue(organisation?.paystack?.renewal?.status);
  const checkoutStatus = normalizeValue(latestCheckout?.status) || null;
  const hasCompletedPurchase = hasCompletedPaidBilling({ organisation, payments });

  if (plan === 'free') {
    return {
      requires_billing_completion: false,
      reason: 'free_plan',
      target_url: BILLING_GATE_TARGET_URL,
      has_completed_purchase: hasCompletedPurchase,
      checkout_status: checkoutStatus,
    };
  }

  const requiresRecovery =
    subscriptionStatus === 'past_due' ||
    subscriptionStatus === 'expired' ||
    renewalStatus === 'past_due';

  const requiresBillingCompletion =
    requiresRecovery ||
    (
      !hasCompletedPurchase &&
      (
        organisationStatus === 'pending' ||
        subscriptionStatus === 'trial' ||
        checkoutStatus === 'pending' ||
        checkoutStatus === 'failed'
      )
    );

  let reason = 'billing_complete';
  if (requiresBillingCompletion && requiresRecovery) {
    reason = 'payment_failed';
  } else if (requiresBillingCompletion && checkoutStatus === 'failed') {
    reason = 'payment_failed';
  } else if (requiresBillingCompletion && checkoutStatus === 'pending') {
    reason = 'checkout_pending';
  } else if (requiresBillingCompletion && organisationStatus === 'pending') {
    reason = 'billing_pending';
  } else if (requiresBillingCompletion) {
    reason = 'payment_required';
  }

  return {
    requires_billing_completion: requiresBillingCompletion,
    reason,
    target_url: BILLING_GATE_TARGET_URL,
    has_completed_purchase: hasCompletedPurchase,
    checkout_status: checkoutStatus,
  };
};

export const getBillingGateTargetUrl = () => BILLING_GATE_TARGET_URL;
