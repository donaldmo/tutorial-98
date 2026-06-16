import { Router } from 'express';
import {
  cloneJobTemplate,
  createJobFromJobTemplate,
  createJobTemplate,
  deleteJobTemplate,
  listJobTemplates,
  updateJobTemplate,
} from '../controllers/jobTemplatesController.js';
import { requireAdminAuth, requireAuth } from '../middleware/auth.js';

const router = Router();

router.get('/', requireAuth, listJobTemplates);
router.post('/', requireAdminAuth, createJobTemplate);
router.post('/:job_template_id/clone', requireAdminAuth, cloneJobTemplate);
router.put('/:job_template_id', requireAdminAuth, updateJobTemplate);
router.delete('/:job_template_id', requireAdminAuth, deleteJobTemplate);
router.post('/:job_template_id/create-job', requireAdminAuth, createJobFromJobTemplate);

export default router;
