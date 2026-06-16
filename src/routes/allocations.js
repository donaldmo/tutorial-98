import { Router } from 'express';
import {
	completeAllocationComponent,
	createAllocation,
	deleteAllocation,
	getAllocationTimeSummary,
	getAllocationById,
	getJobAllocationCoverage,
	listAllocations,
	reallocateAllocation,
	startAllocationComponent,
	submitAllocationReview,
	uncompleteAllocationComponent,
	updateAllocation,
	deleteAllocationReview,
	getJobEfficiency,
	getStaffEfficiency,
	getOrganisationStaffEfficiencyOverview,
} from '../controllers/allocationsController.js';
import { requireAuth, requireAdminAuth } from '../middleware/auth.js';

const router = Router();

router.get('/', requireAuth, listAllocations);
router.get('/:allocation_id/time-summary', requireAuth, getAllocationTimeSummary);
router.post('/:allocation_id/reallocate', requireAdminAuth, reallocateAllocation);
router.post('/:allocation_id/review', requireAuth, submitAllocationReview);
router.delete('/:allocation_id/review', requireAuth, deleteAllocationReview);
router.get('/:allocation_id', requireAuth, getAllocationById);
router.post('/:allocation_id/start', requireAuth, startAllocationComponent);
router.post('/:allocation_id/complete', requireAuth, completeAllocationComponent);
router.post('/:allocation_id/uncomplete', requireAuth, uncompleteAllocationComponent);
router.post('/', requireAdminAuth, createAllocation);
router.put('/:allocation_id', requireAdminAuth, updateAllocation);
router.delete('/:allocation_id', requireAdminAuth, deleteAllocation);
router.get('/jobs/:job_id/efficiency', requireAuth, getJobEfficiency);
router.get('/staff/:staff_id/efficiency', requireAuth, getStaffEfficiency);
router.get('/organisation/staff-efficiency', requireAuth, getOrganisationStaffEfficiencyOverview);

export default router;
