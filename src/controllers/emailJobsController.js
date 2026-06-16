import { randomUUID } from 'node:crypto';
import { asyncHandler } from '../utils/asyncHandler.js';
import { listFailedEmailJobs } from '../jobs/emailQueue.js';
import EmailJobLog from '../models/EmailJobLog.js';
import { processEmailJob } from '../services/emailJobProcessor.js';

const extractBearerToken = (headerValue = '') => {
  const value = String(headerValue || '').trim();
  if (!value.toLowerCase().startsWith('bearer ')) return null;
  return value.slice(7).trim() || null;
};

const headerValue = (req, name) => (
  req.get(name)
  || req.get(name.toLowerCase())
  || req.headers[name.toLowerCase()]
  || null
);

const parseAttemptsMade = (req) => {
  const retryHeader = (
    headerValue(req, 'Upstash-Retried')
    || headerValue(req, 'Upstash-Retry-Count')
    || headerValue(req, 'Upstash-Retries')
  );
  const retryCount = Number(retryHeader);
  if (!Number.isFinite(retryCount) || retryCount < 0) return 1;
  return retryCount + 1;
};

export const dispatchEmailJob = asyncHandler(async (req, res) => {
  const expectedToken = String(process.env.EMAIL_JOB_DISPATCH_TOKEN || '').trim();
  const providedToken = extractBearerToken(req.headers.authorization || '');

  if (!expectedToken || providedToken !== expectedToken) {
    return res.status(401).json({ detail: 'Unauthorized dispatch request' });
  }

  const messageId = String(
    headerValue(req, 'Upstash-Message-Id')
    || req.body?.client_message_id
    || randomUUID()
  );

  const jobType = String(req.body?.job_type || '').trim();
  const payload = req.body?.payload || null;

  if (!jobType || !payload || typeof payload !== 'object') {
    return res.status(400).json({ detail: 'Invalid email job payload' });
  }

  const attemptsMade = parseAttemptsMade(req);
  const maxAttempts = Math.max(1, Number(process.env.EMAIL_JOB_ATTEMPTS || 3) + 1);

  await EmailJobLog.findOneAndUpdate(
    { message_id: messageId },
    {
      $set: {
        provider: 'qstash',
        job_type: jobType,
        payload,
        status: 'processing',
        attempts_made: attemptsMade,
        max_attempts: maxAttempts,
        failed_reason: null,
        stacktrace: [],
        dispatched_at: new Date(),
      },
    },
    { upsert: true, new: true }
  );

  try {
    await processEmailJob({ jobType, payload });

    await EmailJobLog.findOneAndUpdate(
      { message_id: messageId },
      {
        $set: {
          status: 'sent',
          finished_at: new Date(),
          failed_reason: null,
          stacktrace: [],
        },
      }
    );

    return res.status(202).json({ ok: true, message_id: messageId });
  } catch (error) {
    await EmailJobLog.findOneAndUpdate(
      { message_id: messageId },
      {
        $set: {
          status: 'failed',
          finished_at: new Date(),
          failed_reason: error.message || 'Email dispatch failed',
          stacktrace: error.stack ? String(error.stack).split('\n').slice(0, 5) : [],
        },
      }
    );
    throw error;
  }
});

export const getFailedEmailJobs = asyncHandler(async (req, res) => {
  const limit = Number(req.query.limit || 20);
  const rows = await listFailedEmailJobs({ limit });

  return res.json({
    count: rows.length,
    data: rows,
  });
});
