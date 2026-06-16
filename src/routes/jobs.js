import { Router } from 'express';
import { createJob, deleteJob, getJobAllocationStatus, getJobById, listJobs, patchRecurringMonth, updateJob, updateJobStatus } from '../controllers/jobsController.js';
import { autoAllocateJob, getJobAllocationCoverage } from '../controllers/allocationsController.js';
import { requireAuth, requireAdminAuth } from '../middleware/auth.js';

const router = Router();

router.get('/', requireAuth, listJobs);
router.get('/:job_id', requireAuth, getJobById);
router.get('/:job_id/allocation-status', requireAuth, getJobAllocationStatus);
router.get('/:job_id/allocation-coverage', requireAuth, getJobAllocationCoverage);
router.post('/', requireAdminAuth, createJob);
router.post('/:job_id/auto-allocate', requireAdminAuth, autoAllocateJob);
router.put('/:job_id', requireAdminAuth, updateJob);
router.patch('/:job_id/status', requireAdminAuth, updateJobStatus);
router.patch('/:job_id/recurring-month', requireAdminAuth, patchRecurringMonth);
router.delete('/:job_id', requireAdminAuth, deleteJob);

export default router;
