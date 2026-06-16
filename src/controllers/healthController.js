import { getEmailQueueHealthSnapshot } from '../jobs/emailQueue.js';
import { asyncHandler } from '../utils/asyncHandler.js';

export const health = (_req, res) => {
  res.json({ status: 'ok' });
};

export const queueHealth = asyncHandler(async (_req, res) => {
  const snapshot = await getEmailQueueHealthSnapshot();
  const statusCode = snapshot.healthy ? 200 : 503;

  res.status(statusCode).json({
    status: snapshot.healthy ? 'ok' : 'degraded',
    ...snapshot,
  });
});
