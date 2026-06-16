import { Router } from 'express';
import {
  createJobType,
  deleteJobType,
  listJobTypes,
  updateJobType,
} from '../controllers/jobTypesController.js';
import { requireAuth, requireAdminAuth } from '../middleware/auth.js';

const router = Router();

router.get('/', requireAuth, listJobTypes);
router.post('/', requireAdminAuth, createJobType);
router.put('/:job_type_id', requireAdminAuth, updateJobType);
router.delete('/:job_type_id', requireAdminAuth, deleteJobType);

export default router;