import { Router } from 'express';
import { requireAdminAuth } from '../middleware/auth.js';
import { dispatchEmailJob, getFailedEmailJobs } from '../controllers/emailJobsController.js';

const router = Router();

router.post('/dispatch', dispatchEmailJob);
router.get('/failed', requireAdminAuth, getFailedEmailJobs);

export default router;
