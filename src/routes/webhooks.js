import { Router } from 'express';
import {
  deleteWebhook,
  exportForPowerBi,
  exportForSage,
  listWebhooks,
  registerWebhook,
} from '../controllers/webhooksController.js';
import { requireAuth, requireAdminAuth } from '../middleware/auth.js';

const router = Router();

router.get('/power-bi/data-export', requireAuth, exportForPowerBi);
router.get('/sage/sync-data', requireAuth, exportForSage);
router.post('/register', requireAdminAuth, registerWebhook);
router.get('/', requireAuth, listWebhooks);
router.delete('/:webhook_id', requireAdminAuth, deleteWebhook);

export default router;
