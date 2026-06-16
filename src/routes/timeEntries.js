import { Router } from 'express';
import {
	createTimeEntry,
	deleteTimeEntry,
	getTimeEntryById,
	listTimeEntries,
	updateTimeEntry,
} from '../controllers/timeEntriesController.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

router.get('/', requireAuth, listTimeEntries);
router.get('/:entry_id', requireAuth, getTimeEntryById);
router.post('/', requireAuth, createTimeEntry);
router.put('/:entry_id', requireAuth, updateTimeEntry);
router.delete('/:entry_id', requireAuth, deleteTimeEntry);

export default router;
