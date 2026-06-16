import { strict as assert } from 'assert';
import test from 'node:test';

import {
  calculateEfficiencyPercentage,
  getEfficiencyStatus,
} from '../../src/services/reportHelpers.js';

test.describe('reportHelpers efficiency rules', () => {
  test('returns 100 percent and In Progress for zero budget and zero actual', () => {
    assert.equal(calculateEfficiencyPercentage(0, 0), 100);
    assert.equal(getEfficiencyStatus(0, 0), 'In Progress');
  });

  test('returns Efficient when actual is within or below budget', () => {
    assert.equal(calculateEfficiencyPercentage(10, 8), 80);
    assert.equal(getEfficiencyStatus(10, 8), 'Efficient');
    assert.equal(getEfficiencyStatus(10, 10), 'Efficient');
  });

  test('returns Slightly Over when variance is within 20 percent of budget', () => {
    assert.equal(calculateEfficiencyPercentage(10, 11), 110);
    assert.equal(getEfficiencyStatus(10, 11), 'Slightly Over');
    assert.equal(getEfficiencyStatus(10, 12), 'Slightly Over');
  });

  test('returns Over Budget when variance is within 50 percent of budget', () => {
    assert.equal(calculateEfficiencyPercentage(10, 14), 140);
    assert.equal(getEfficiencyStatus(10, 14), 'Over Budget');
    assert.equal(getEfficiencyStatus(10, 15), 'Over Budget');
  });

  test('returns Significantly Over when variance exceeds 50 percent of budget', () => {
    assert.equal(calculateEfficiencyPercentage(10, 16), 160);
    assert.equal(getEfficiencyStatus(10, 16), 'Significantly Over');
  });

  test('treats unbudgeted logged work as significantly over', () => {
    assert.equal(calculateEfficiencyPercentage(0, 3), 0);
    assert.equal(getEfficiencyStatus(0, 3), 'Significantly Over');
  });
});
