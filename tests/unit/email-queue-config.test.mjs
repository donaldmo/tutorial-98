import test from 'node:test';
import assert from 'node:assert/strict';
import { buildEmailQueueConfig } from '../../src/jobs/emailQueueConfig.js';

const restoreEnvVar = (key, value) => {
  if (typeof value === 'undefined') {
    delete process.env[key];
    return;
  }
  process.env[key] = value;
};

test('buildEmailQueueConfig uses fallback defaults', () => {
  const prevAttempts = process.env.EMAIL_JOB_ATTEMPTS;
  const prevQstashUrl = process.env.QSTASH_URL;
  const prevQstashToken = process.env.QSTASH_TOKEN;
  const prevDispatchUrl = process.env.QSTASH_EMAIL_DISPATCH_URL;
  const prevDispatchToken = process.env.EMAIL_JOB_DISPATCH_TOKEN;
  const prevBaseUrl = process.env.BASE_URL;
  const prevApiBaseUrl = process.env.API_BASE_URL;

  delete process.env.EMAIL_JOB_ATTEMPTS;
  delete process.env.QSTASH_URL;
  delete process.env.QSTASH_TOKEN;
  delete process.env.QSTASH_EMAIL_DISPATCH_URL;
  delete process.env.EMAIL_JOB_DISPATCH_TOKEN;
  delete process.env.BASE_URL;
  delete process.env.API_BASE_URL;

  const options = buildEmailQueueConfig();

  assert.equal(options.provider, 'qstash');
  assert.equal(options.queueName, 'email-notifications');
  assert.equal(options.qstashUrl, 'https://qstash.upstash.io');
  assert.equal(options.dispatchUrl, '');
  assert.equal(options.retries, 3);
  assert.equal(options.configured, false);

  restoreEnvVar('EMAIL_JOB_ATTEMPTS', prevAttempts);
  restoreEnvVar('QSTASH_URL', prevQstashUrl);
  restoreEnvVar('QSTASH_TOKEN', prevQstashToken);
  restoreEnvVar('QSTASH_EMAIL_DISPATCH_URL', prevDispatchUrl);
  restoreEnvVar('EMAIL_JOB_DISPATCH_TOKEN', prevDispatchToken);
  restoreEnvVar('BASE_URL', prevBaseUrl);
  restoreEnvVar('API_BASE_URL', prevApiBaseUrl);
});

test('buildEmailQueueConfig respects env overrides', () => {
  const prevAttempts = process.env.EMAIL_JOB_ATTEMPTS;
  const prevQstashUrl = process.env.QSTASH_URL;
  const prevQstashToken = process.env.QSTASH_TOKEN;
  const prevDispatchUrl = process.env.QSTASH_EMAIL_DISPATCH_URL;
  const prevDispatchToken = process.env.EMAIL_JOB_DISPATCH_TOKEN;
  const prevBaseUrl = process.env.BASE_URL;
  const prevApiBaseUrl = process.env.API_BASE_URL;

  process.env.EMAIL_JOB_ATTEMPTS = '5';
  process.env.QSTASH_URL = 'https://qstash-eu-central-1.upstash.io';
  process.env.QSTASH_TOKEN = 'token-123';
  process.env.QSTASH_EMAIL_DISPATCH_URL = 'https://api.example.com/api/email-jobs/dispatch';
  process.env.EMAIL_JOB_DISPATCH_TOKEN = 'dispatch-secret';
  delete process.env.BASE_URL;
  delete process.env.API_BASE_URL;

  const options = buildEmailQueueConfig();

  assert.equal(options.qstashUrl, 'https://qstash-eu-central-1.upstash.io');
  assert.equal(options.qstashToken, 'token-123');
  assert.equal(options.dispatchUrl, 'https://api.example.com/api/email-jobs/dispatch');
  assert.equal(options.dispatchToken, 'dispatch-secret');
  assert.equal(options.retries, 5);
  assert.equal(options.configured, true);

  restoreEnvVar('EMAIL_JOB_ATTEMPTS', prevAttempts);
  restoreEnvVar('QSTASH_URL', prevQstashUrl);
  restoreEnvVar('QSTASH_TOKEN', prevQstashToken);
  restoreEnvVar('QSTASH_EMAIL_DISPATCH_URL', prevDispatchUrl);
  restoreEnvVar('EMAIL_JOB_DISPATCH_TOKEN', prevDispatchToken);
  restoreEnvVar('BASE_URL', prevBaseUrl);
  restoreEnvVar('API_BASE_URL', prevApiBaseUrl);
});

test('buildEmailQueueConfig derives dispatch URL from BASE_URL', () => {
  const prevQstashToken = process.env.QSTASH_TOKEN;
  const prevDispatchUrl = process.env.QSTASH_EMAIL_DISPATCH_URL;
  const prevDispatchToken = process.env.EMAIL_JOB_DISPATCH_TOKEN;
  const prevBaseUrl = process.env.BASE_URL;
  const prevApiBaseUrl = process.env.API_BASE_URL;

  process.env.QSTASH_TOKEN = 'token-123';
  process.env.EMAIL_JOB_DISPATCH_TOKEN = 'dispatch-secret';
  delete process.env.QSTASH_EMAIL_DISPATCH_URL;
  process.env.BASE_URL = 'https://api.example.com';
  delete process.env.API_BASE_URL;

  const options = buildEmailQueueConfig();

  assert.equal(options.dispatchUrl, 'https://api.example.com/api/email-jobs/dispatch');
  assert.equal(options.configured, true);

  restoreEnvVar('QSTASH_TOKEN', prevQstashToken);
  restoreEnvVar('QSTASH_EMAIL_DISPATCH_URL', prevDispatchUrl);
  restoreEnvVar('EMAIL_JOB_DISPATCH_TOKEN', prevDispatchToken);
  restoreEnvVar('BASE_URL', prevBaseUrl);
  restoreEnvVar('API_BASE_URL', prevApiBaseUrl);
});
