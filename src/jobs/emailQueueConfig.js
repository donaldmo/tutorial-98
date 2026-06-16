const DEFAULT_QUEUE_NAME = 'email-notifications';

const clampRetries = (value) => {
  const num = Number(value);
  if (!Number.isFinite(num)) return 3;
  return Math.max(0, Math.min(Math.floor(num), 5));
};

const normalizeBaseUrl = (value) => String(value || '').trim().replace(/\/+$/, '');

const resolveDispatchUrl = () => {
  const explicitDispatchUrl = String(process.env.QSTASH_EMAIL_DISPATCH_URL || '').trim();
  if (explicitDispatchUrl) return explicitDispatchUrl;

  const baseUrl = normalizeBaseUrl(process.env.BASE_URL || '');
  if (!baseUrl) return '';

  if (baseUrl.endsWith('/api')) {
    return `${baseUrl}/email-jobs/dispatch`;
  }

  return `${baseUrl}/api/email-jobs/dispatch`;
};

export const buildEmailQueueConfig = () => {
  const qstashUrl = String(process.env.QSTASH_URL || 'https://qstash.upstash.io').trim();
  const qstashToken = String(process.env.QSTASH_TOKEN || '').trim();
  const dispatchUrl = resolveDispatchUrl();
  const dispatchToken = String(process.env.EMAIL_JOB_DISPATCH_TOKEN || '').trim();

  return {
    provider: 'qstash',
    queueName: DEFAULT_QUEUE_NAME,
    qstashUrl,
    qstashToken,
    dispatchUrl,
    dispatchToken,
    retries: clampRetries(process.env.EMAIL_JOB_ATTEMPTS || 3),
    configured: Boolean(qstashToken && dispatchUrl && dispatchToken),
  };
};
