import test from 'node:test';
import assert from 'node:assert/strict';

import { getZaHolidayConfigsForMonth } from '../../src/services/planningService.js';

test('ZA public holiday presets return expected 2026 dates', () => {
  const jan = getZaHolidayConfigsForMonth('2026-01');
  assert.ok(Array.isArray(jan));
  assert.ok(jan.some((h) => h.date === '2026-01-01' && String(h.label || '').includes("New")));

  const aug = getZaHolidayConfigsForMonth('2026-08');
  assert.ok(aug.some((h) => h.date === '2026-08-10'));
});

