const PAYSTACK_REQUIRED_FIELDS = [
  ['secretKey', 'PAYSTACK_SECRET_KEY'],
  ['publicKey', 'PAYSTACK_PUBLIC_KEY'],
  ['callbackUrl', 'PAYSTACK_CALLBACK_URL'],
  ['webhookUrl', 'PAYSTACK_WEBHOOK_URL'],
];

const normalizeString = (value) => {
  const normalized = String(value || '').trim();
  return normalized || null;
};

export const buildPaystackConfig = () => {
  const config = {
    provider: 'paystack',
    mode: 'test',
    secretKey: normalizeString(process.env.PAYSTACK_SECRET_KEY),
    publicKey: normalizeString(process.env.PAYSTACK_PUBLIC_KEY),
    callbackUrl: normalizeString(process.env.PAYSTACK_CALLBACK_URL),
    webhookUrl: normalizeString(process.env.PAYSTACK_WEBHOOK_URL),
  };

  const missingFields = PAYSTACK_REQUIRED_FIELDS
    .filter(([property]) => !config[property])
    .map(([, envName]) => envName);

  return {
    ...config,
    configured: missingFields.length === 0,
    missingFields,
  };
};

export const getPaystackPublicConfig = () => {
  const config = buildPaystackConfig();
  return {
    provider: config.provider,
    mode: config.mode,
    publicKey: config.publicKey,
    callbackUrl: config.callbackUrl,
    webhookUrl: config.webhookUrl,
    configured: config.configured,
    missingFields: config.missingFields,
  };
};

export const assertPaystackBillingConfigured = () => {
  const config = buildPaystackConfig();
  if (config.configured) {
    return config;
  }

  const error = new Error(
    `Billing is not configured for Paystack test mode. Missing: ${config.missingFields.join(', ')}`
  );
  error.status = 503;
  error.code = 'BILLING_CONFIG_INCOMPLETE';
  error.details = { missingFields: config.missingFields };
  throw error;
};
