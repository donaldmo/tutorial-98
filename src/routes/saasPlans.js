import { Router } from 'express';
import { getAllSaasPlans } from '../controllers/saasController.js';

const router = Router();

router.get('/', getAllSaasPlans);

export default router;
