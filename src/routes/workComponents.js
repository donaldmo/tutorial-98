/**
 * workComponents.js – router
 *
 * Group 3 – Task 3.1: Job-Type Work Component Split Rules
 *
 * Mounts under /work-components (registered in routes/index.js).
 */

import { Router } from 'express';
import {
  getWorkComponentRules,
  getRoleWeight,
  previewWorkComponentSplit,
} from '../controllers/workComponentsController.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

// GET /work-components?job_type=Audit
// Returns the work component rules for the given job type.
router.get('/', requireAuth, getWorkComponentRules);

// GET /work-components/role-weight?job_type=Audit&role=Partner
// Returns the effective percentage + hours_multiplier for a role in a job type.
router.get('/role-weight', requireAuth, getRoleWeight);

// POST /work-components/preview  { job_type, job_fee, total_hours }
// Returns a fee/hours breakdown across all work components.
router.post('/preview', requireAuth, previewWorkComponentSplit);

export default router;
