import test from 'node:test';
import assert from 'node:assert/strict';

import { buildFrontendBillingRedirectUrl } from '../../src/controllers/saasController.js';

test('buildFrontendBillingRedirectUrl returns settings billing success route with reference', () => {
  const prevAppBaseUrl = process.env.APP_BASE_URL;
  process.env.APP_BASE_URL = 'https://app.example.com';

  try {
    const url = buildFrontendBillingRedirectUrl({
      status: 'success',
      reference: 'ref_success_123',
    });

    assert.equal(
      url,
      'https://app.example.com/app/settings?tab=subscription&paystack=success&reference=ref_success_123',
    );
  } finally {
    if (typeof prevAppBaseUrl === 'undefined') {
      delete process.env.APP_BASE_URL;
    } else {
      process.env.APP_BASE_URL = prevAppBaseUrl;
    }
  }
});

test('buildFrontendBillingRedirectUrl includes failure reason when callback verification fails', () => {
  const prevAppBaseUrl = process.env.APP_BASE_URL;
  process.env.APP_BASE_URL = 'https://app.example.com';

  try {
    const url = buildFrontendBillingRedirectUrl({
      status: 'failed',
      reference: 'ref_failed_123',
      reason: 'verification_failed',
    });

    assert.equal(
      url,
      'https://app.example.com/app/settings?tab=subscription&paystack=failed&reference=ref_failed_123&reason=verification_failed',
    );
  } finally {
    if (typeof prevAppBaseUrl === 'undefined') {
      delete process.env.APP_BASE_URL;
    } else {
      process.env.APP_BASE_URL = prevAppBaseUrl;
    }
  }
});
