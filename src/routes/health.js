import { Router } from 'express';
import { health, queueHealth } from '../controllers/healthController.js';

const router = Router();

router.get('/health', health);
router.get('/health/queue', queueHealth);

export default router;
