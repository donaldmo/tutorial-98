import { Router } from 'express';
import { getEnums } from '../controllers/settingsController.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

router.get('/', requireAuth, getEnums);

export default router;