/**
 * requestLogger.js
 *
 * Group 4 – Task 4.4: Per-request access-log middleware
 *
 * Attaches a unique `requestId` to every incoming request, then emits a
 * structured JSON log line when the response finishes, including:
 *   - HTTP method, path, status code
 *   - Response time in milliseconds
 *   - Authenticated staff ID (if `req.staffId` is set by the auth middleware)
 *
 * The `requestId` is sourced from the incoming `X-Request-Id` header when
 * present (useful for distributed tracing) or generated with a lightweight
 * counter-based ID that avoids the overhead of a full UUID library.
 */

import logger from '../utils/logger.js';

let _counter = 0;
const genRequestId = () => {
  _counter = (_counter + 1) % 1_000_000;
  return `${Date.now().toString(36)}-${_counter.toString(36).padStart(5, '0')}`;
};

export const requestLogger = (req, res, next) => {
  req.requestId = req.headers['x-request-id'] || genRequestId();
  res.setHeader('X-Request-Id', req.requestId);

  const startHr = process.hrtime.bigint();

  res.on('finish', () => {
    const durationMs = Number((process.hrtime.bigint() - startHr) / 1_000_000n);
    const level = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info';

    logger[level](
      {
        requestId: req.requestId,
        method: req.method,
        path: req.path,
        status: res.statusCode,
        duration_ms: durationMs,
        ...(req.staffId ? { staff_id: req.staffId } : {}),
      },
      'request completed',
    );
  });

  next();
};
