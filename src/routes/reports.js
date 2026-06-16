import { Router } from 'express';
import {
  reportActualVsBudgeted,
  reportCapacityPlanning,
  reportFirmProfitability,
  reportMonthlySnapshotHistory,
  reportOvertimeBurnout,
  reportOverUnderSchedule,
  reportQualityReview,
  reportRevenuePerEmployee,
  reportClosedPerStaff,
  reportTeamProductivity,
  reportTurnaroundTime,
  reportUtilizationProductivity,
  reportWipStatus,
} from '../controllers/reportsController.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

router.get('/utilization-productivity', requireAuth, reportUtilizationProductivity);
router.get('/wip-status', requireAuth, reportWipStatus);
router.get('/firm-profitability', requireAuth, reportFirmProfitability);
router.get('/revenue-per-employee', requireAuth, reportRevenuePerEmployee);
router.get('/closed-per-staff', requireAuth, reportClosedPerStaff);
router.get('/actual-vs-budgeted', requireAuth, reportActualVsBudgeted);
router.get('/turnaround-time', requireAuth, reportTurnaroundTime);
router.get('/team-productivity', requireAuth, reportTeamProductivity);
router.get('/capacity-planning', requireAuth, reportCapacityPlanning);
router.get('/overtime-burnout', requireAuth, reportOvertimeBurnout);
router.get('/quality-review', requireAuth, reportQualityReview);
router.get('/over-under-schedule', requireAuth, reportOverUnderSchedule);
router.get('/monthly-snapshot-history', requireAuth, reportMonthlySnapshotHistory);
export default router;
