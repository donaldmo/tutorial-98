import { Router } from 'express';
import {
  createDepartment,
  deleteDepartment,
  getDepartmentById,
  listDepartments,
  updateDepartment,
} from '../controllers/departmentsController.js';
import { requireAuth, requireAdminAuth } from '../middleware/auth.js';

const router = Router();

router.get('/', requireAuth, listDepartments);
router.get('/:dept_id', requireAuth, getDepartmentById);
router.post('/', requireAdminAuth, createDepartment);
router.put('/:dept_id', requireAdminAuth, updateDepartment);
router.delete('/:dept_id', requireAdminAuth, deleteDepartment);

export default router;
