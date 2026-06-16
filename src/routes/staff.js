import { Router } from 'express';
import {
  archiveStaff,
  createStaff,
  deleteStaff,
  getStaffById,
  getStaffMonthlySummary,
  listStaffMonthlySummaryRows,
  listStaff,
  restoreStaff,
  updateStaff,
  resendWelcomeEmail,
} from '../controllers/staffController.js';
import { changePassword } from '../controllers/authController.js';
import { requireAuth, requireAdminAuth } from '../middleware/auth.js';

const router = Router();

router.get('/', requireAuth, listStaff);
router.get('/monthly-summaries', requireAuth, listStaffMonthlySummaryRows);
router.get('/:staff_id/monthly-summary', requireAuth, getStaffMonthlySummary);
router.get('/:staff_id', requireAuth, getStaffById);
router.post('/', requireAdminAuth, createStaff);
router.post('/:staff_id/archive', requireAdminAuth, archiveStaff);
router.post('/:staff_id/restore', requireAdminAuth, restoreStaff);
router.post('/:staff_id/resend-welcome', requireAdminAuth, resendWelcomeEmail);
router.put('/me/password', requireAuth, changePassword);
router.put('/:staff_id', requireAdminAuth, updateStaff);
router.delete('/:staff_id', requireAdminAuth, deleteStaff);

export default router;
