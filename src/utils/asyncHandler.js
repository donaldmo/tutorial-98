/**
 * asyncHandler.js
 *
 * Group 4 – Task 4.4: Wraps async route handlers so unhandled promise
 * rejections are forwarded to Express's error handler.
 * Attaches `req.requestId` to the caught error for structured logging context.
 */
export const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch((err) => {
    if (req.requestId) err.requestId = req.requestId;
    next(err);
  });
