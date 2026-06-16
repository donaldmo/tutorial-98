/**
 * AppError.js
 *
 * Group 4 – Task 4.4: Operational error class
 *
 * Distinguishes expected, operational errors (wrong input, not found, etc.)
 * from unexpected programmer errors (null references, assertion failures, etc.).
 *
 * The central errorHandler only trusts errors with `isOperational === true`
 * to produce a clean client response; all others become generic 500s.
 *
 * Usage:
 *   import AppError from '../utils/AppError.js';
 *   throw new AppError('Client not found', 404);
 */

class AppError extends Error {
  /**
   * @param {string}  message    Human-readable message (safe to send to client)
   * @param {number}  statusCode HTTP status code (default 500)
   */
  constructor(message, statusCode = 500) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.isOperational = true;

    // Maintains proper stack trace in V8
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, AppError);
    }
  }
}

export default AppError;
