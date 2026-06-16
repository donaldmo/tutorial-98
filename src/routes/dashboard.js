import { Router } from 'express';
import {
  getDashboardCapacity,
  getDashboardInsights,
  getDashboardSummary,
  getPersonalDashboardSummary,
  getSummaryEnhanced,
  getTimeSummary,
  getWorkStatusByDepartment,
} from '../controllers/dashboardController.js';
import { requireAuth, requireAdminAuth } from '../middleware/auth.js';

const router = Router();

router.get('/summary', requireAdminAuth, getDashboardSummary);
router.get('/capacity', requireAuth, getDashboardCapacity);
router.get('/insights', requireAuth, getDashboardInsights);
router.get('/summary-enhanced', requireAuth, getSummaryEnhanced);
router.get('/time-summary', requireAuth, getTimeSummary);
router.get('/work-status-by-department', requireAuth, getWorkStatusByDepartment);
router.get('/personal/:staff_id', requireAuth, getPersonalDashboardSummary);

export default router;
