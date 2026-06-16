import { strict as assert } from 'assert';
import test from 'node:test';
import computeTeamProductivity from '../../../src/services/teamProductivityService.js';

test('computeTeamProductivity is exported and is a function', () => {
  assert.equal(typeof computeTeamProductivity, 'function');
});
