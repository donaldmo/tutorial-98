/**
 * logger.js
 *
 * Group 4 – Task 4.4: Structured logging utility
 *
 * Thin JSON logger that writes to stdout with no extra runtime dependencies.
 * Each log line is a newline-delimited JSON object, compatible with log
 * aggregators (Datadog, Loki, CloudWatch, etc.).
 *
 * Usage:
 *   import logger from '../utils/logger.js';
 *   logger.info({ requestId, method, path }, 'Request received');
 *   logger.error({ err }, 'Unhandled exception');
 */

const LOG_LEVEL_RANK = { debug: 10, info: 20, warn: 30, error: 40 };
const NODE_ENV = process.env.NODE_ENV || 'development';
const MIN_LEVEL = process.env.LOG_LEVEL || (NODE_ENV === 'production' ? 'info' : 'debug');

const shouldLog = (level) => (LOG_LEVEL_RANK[level] ?? 0) >= (LOG_LEVEL_RANK[MIN_LEVEL] ?? 0);

/**
 * Serialise an Error so it survives JSON.stringify.
 */
const serializeError = (err) => {
  if (!(err instanceof Error)) return err;
  const out = { message: err.message, name: err.name };
  if (NODE_ENV !== 'production') {
    out.stack = err.stack;
  }
  if (err.statusCode) out.statusCode = err.statusCode;
  if (err.code) out.code = err.code;
  return out;
};

const write = (level, context, message) => {
  if (!shouldLog(level)) return;

  const entry = {
    ts: new Date().toISOString(),
    level,
    env: NODE_ENV,
    ...(context && typeof context === 'object' ? context : {}),
    message: message ?? (typeof context === 'string' ? context : undefined),
  };

  // Serialise any Error objects in the entry
  if (entry.err) entry.err = serializeError(entry.err);

  // eslint-disable-next-line no-console
  const fn = level === 'error' || level === 'warn' ? console.error : console.log;
  fn(JSON.stringify(entry));
};

const logger = {
  debug: (context, message) => write('debug', context, message),
  info:  (context, message) => write('info',  context, message),
  warn:  (context, message) => write('warn',  context, message),
  error: (context, message) => write('error', context, message),
};

export default logger;
