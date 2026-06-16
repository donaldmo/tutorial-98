import { Router } from 'express';
import {
  createMonthlySnapshot,
  getMonthlySnapshotByMonth,
  getPlanningCalendar,
  getPlanningCalendarYear,
  listMonthlySnapshots,
  upsertPlanningCalendarConfig,
} from '../controllers/planningController.js';
import { requireAuth, requireAdminAuth } from '../middleware/auth.js';

const router = Router();

router.get('/calendar', requireAuth, getPlanningCalendar);
router.get('/calendar-year', requireAuth, getPlanningCalendarYear);
router.put('/calendar', requireAdminAuth, upsertPlanningCalendarConfig);
router.get('/snapshots', requireAuth, listMonthlySnapshots);
router.post('/snapshots', requireAdminAuth, createMonthlySnapshot);
router.get('/snapshots/:month', requireAuth, getMonthlySnapshotByMonth);

export default router;
