import { Router } from 'express';
import {
  getCapacitySummary,
  getDepartmentEfficiency,
  getJobsStatusDrilldown,
  getJobsEfficiency,
  getLifecycleEfficiency,
  getManagementDashboard,
  getOverutilisedDrilldown,
  getStaffEfficiency,
  getUnderutilisedDrilldown,
  getWipSummary,
} from '../controllers/analyticsController.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

router.get('/efficiency/staff', requireAuth, getStaffEfficiency);
router.get('/efficiency/jobs', requireAuth, getJobsEfficiency);
router.get('/efficiency/departments', requireAuth, getDepartmentEfficiency);
router.get('/efficiency/lifecycle', requireAuth, getLifecycleEfficiency);
router.get('/management-dashboard', requireAuth, getManagementDashboard);

// Group 3 – Task 3.4: WIP summary with budgeted_wip, pricing_override, over/under
// GET /analytics/wip-summary[?month=YYYY-MM]
router.get('/wip-summary', requireAuth, getWipSummary);

// Group 3 – Task 3.3: Calendar-aware team capacity
// GET /analytics/capacity[?month=YYYY-MM]
router.get('/capacity', requireAuth, getCapacitySummary);
router.get('/drilldown/underutilised', requireAuth, getUnderutilisedDrilldown);
router.get('/drilldown/overutilised', requireAuth, getOverutilisedDrilldown);
router.get('/drilldown/jobs/:status', requireAuth, getJobsStatusDrilldown);

export default router;
