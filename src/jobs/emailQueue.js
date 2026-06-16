import { randomUUID } from 'node:crypto';
import { Client } from '@upstash/qstash';
import EmailJobLog from '../models/EmailJobLog.js';
import { buildEmailQueueConfig } from './emailQueueConfig.js';

const config = buildEmailQueueConfig();

const EMAIL_QUEUE_NAME = config.queueName;

const EMAIL_JOB_TYPES = {
  STAFF_WELCOME: 'staff_welcome',
  STAFF_WELCOME_RESEND: 'staff_welcome_resend',
  ORG_ADMIN_INVITE: 'org_admin_invite',
  ORG_VERIFICATION_PIN: 'org_verification_pin',
  ADMIN_SEED_WELCOME: 'admin_seed_welcome',
  ADMIN_FORGOT_PASSWORD_PIN: 'admin_forgot_password_pin',
  STAFF_FORGOT_PASSWORD_PIN: 'staff_forgot_password_pin',
};

const qstashClient = config.qstashToken
  ? new Client({
    baseUrl: config.qstashUrl,
    token: config.qstashToken,
  })
  : null;

const parseMessageId = (response) => (
  response?.messageId
  || response?.message_id
  || response?.id
  || null
);

const assertQueueConfigured = () => {
  if (!config.configured || !qstashClient) {
    throw new Error('QStash queue is not configured. Set QSTASH_TOKEN, EMAIL_JOB_DISPATCH_TOKEN, and either QSTASH_EMAIL_DISPATCH_URL or BASE_URL');
  }
};

const publishJob = async ({ jobType, payload, messageId }) => {
  assertQueueConfigured();

  const response = await qstashClient.publish({
    url: config.dispatchUrl,
    body: JSON.stringify({
      job_type: jobType,
      payload,
      client_message_id: messageId,
    }),
    headers: {
      Authorization: `Bearer ${config.dispatchToken}`,
      'Content-Type': 'application/json',
    },
    retries: config.retries,
  });

  const providerMessageId = parseMessageId(response) || messageId;

  await EmailJobLog.findOneAndUpdate(
    { message_id: providerMessageId },
    {
      $set: {
        provider: 'qstash',
        job_type: jobType,
        payload,
        status: 'queued',
        attempts_made: 0,
        max_attempts: config.retries + 1,
        failed_reason: null,
        stacktrace: [],
      },
    },
    { upsert: true, new: true }
  );

  return {
    id: providerMessageId,
  };
};

export const enqueueStaffWelcomeEmailJob = async ({
  staffId,
  organisationId,
  password,
  acceptLink = null,
  inviteTokenId = null,
}) => {
  const clientMessageId = inviteTokenId
    ? `staff-welcome:${String(inviteTokenId)}`
    : `staff-welcome:${String(staffId)}:${randomUUID()}`;

  return publishJob({
    jobType: EMAIL_JOB_TYPES.STAFF_WELCOME,
    messageId: clientMessageId,
    payload: {
      staffId: String(staffId),
      organisationId: String(organisationId),
      password,
      acceptLink,
      inviteTokenId: inviteTokenId ? String(inviteTokenId) : null,
    },
  });
};

export const enqueueStaffWelcomeResendJob = async ({
  staffId,
  organisationId,
  password,
}) => {
  const clientMessageId = `staff-welcome-resend:${String(staffId)}:${Date.now()}:${randomUUID()}`;

  return publishJob({
    jobType: EMAIL_JOB_TYPES.STAFF_WELCOME_RESEND,
    messageId: clientMessageId,
    payload: {
      staffId: String(staffId),
      organisationId: String(organisationId),
      password,
    },
  });
};

export const enqueueOrgAdminInviteEmailJob = async ({
  authTokenId,
  organisationId,
  email,
  token,
  invitedByName,
  organisationName,
}) => {
  return publishJob({
    jobType: EMAIL_JOB_TYPES.ORG_ADMIN_INVITE,
    messageId: `org-admin-invite:${String(authTokenId)}`,
    payload: {
      authTokenId: String(authTokenId),
      organisationId: String(organisationId),
      email: String(email),
      token,
      invitedByName,
      organisationName,
    },
  });
};

export const enqueueOrgVerificationPinEmailJob = async ({
  authTokenId,
  organisationId,
  email,
  name,
  pin,
  expiryLabel,
  firmName,
}) => {
  return publishJob({
    jobType: EMAIL_JOB_TYPES.ORG_VERIFICATION_PIN,
    messageId: `org-verify-pin:${String(authTokenId)}`,
    payload: {
      authTokenId: String(authTokenId),
      organisationId: String(organisationId),
      email: String(email),
      name,
      pin,
      expiryLabel,
      firmName,
    },
  });
};

export const enqueueAdminSeedWelcomeEmailJob = async ({
  organisationId,
  email,
  name,
  password,
  orgName,
}) => {
  return publishJob({
    jobType: EMAIL_JOB_TYPES.ADMIN_SEED_WELCOME,
    messageId: `admin-seed-welcome:${String(email).toLowerCase().trim()}`,
    payload: {
      organisationId: String(organisationId),
      email: String(email),
      name,
      password,
      orgName,
    },
  });
};

export const enqueueAdminForgotPasswordPinEmailJob = async ({
  authTokenId,
  organisationId,
  email,
  name,
  pin,
  expiryLabel,
  redirectPath,
}) => {
  return publishJob({
    jobType: EMAIL_JOB_TYPES.ADMIN_FORGOT_PASSWORD_PIN,
    messageId: `admin-forgot-password-pin:${String(authTokenId)}`,
    payload: {
      authTokenId: String(authTokenId),
      organisationId: organisationId ? String(organisationId) : null,
      email: String(email),
      name,
      pin,
      expiryLabel,
      redirectPath,
      accountType: 'admin',
    },
  });
};

export const enqueueStaffForgotPasswordPinEmailJob = async ({
  authTokenId,
  organisationId,
  email,
  name,
  pin,
  expiryLabel,
  redirectPath,
}) => {
  return publishJob({
    jobType: EMAIL_JOB_TYPES.STAFF_FORGOT_PASSWORD_PIN,
    messageId: `staff-forgot-password-pin:${String(authTokenId)}`,
    payload: {
      authTokenId: String(authTokenId),
      organisationId: organisationId ? String(organisationId) : null,
      email: String(email),
      name,
      pin,
      expiryLabel,
      redirectPath,
      accountType: 'staff',
    },
  });
};

export const closeEmailQueue = async () => Promise.resolve();

export const getEmailQueueHealthSnapshot = async () => {
  const startedAt = Date.now();
  let counts = null;
  let countsError = null;

  try {
    const [queued, processing, sent, failed] = await Promise.all([
      EmailJobLog.countDocuments({ status: 'queued' }),
      EmailJobLog.countDocuments({ status: 'processing' }),
      EmailJobLog.countDocuments({ status: 'sent' }),
      EmailJobLog.countDocuments({ status: 'failed' }),
    ]);
    counts = {
      queued,
      processing,
      sent,
      failed,
    };
  } catch (error) {
    countsError = error.message || 'Could not load queue counts';
  }

  const healthy = config.configured && !countsError;

  return {
    healthy,
    latency_ms: Date.now() - startedAt,
    provider: {
      name: 'qstash',
      configured: config.configured,
      base_url: config.qstashUrl,
      dispatch_url: config.dispatchUrl || null,
      error: config.configured ? null : 'Missing QStash environment variables',
    },
    queue: {
      name: EMAIL_QUEUE_NAME,
      counts,
      error: countsError,
    },
  };
};

export const listFailedEmailJobs = async ({ limit = 20 } = {}) => {
  const safeLimit = Math.max(1, Math.min(Number(limit || 20), 100));
  const failedJobs = await EmailJobLog.find({ status: 'failed' })
    .sort({ updated_at: -1 })
    .limit(safeLimit)
    .lean();

  return failedJobs.map((job) => ({
    id: String(job.message_id),
    name: job.job_type,
    data: job.payload,
    attempts_made: Number(job.attempts_made || 0),
    max_attempts: Number(job.max_attempts || 0),
    failed_reason: job.failed_reason || null,
    stacktrace: Array.isArray(job.stacktrace) ? job.stacktrace.slice(0, 5) : [],
    created_at: job.created_at ? new Date(job.created_at).toISOString() : null,
    processed_at: job.dispatched_at ? new Date(job.dispatched_at).toISOString() : null,
    finished_at: job.finished_at ? new Date(job.finished_at).toISOString() : null,
  }));
};

export { EMAIL_QUEUE_NAME, EMAIL_JOB_TYPES };