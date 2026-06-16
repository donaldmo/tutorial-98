import { Router } from 'express';
import {
  createJobFromTemplate,
  createTemplate,
  deleteTemplate,
  installBuiltInTemplateController,
  listTemplates,
  updateTemplate,
} from '../controllers/templatesController.js';
import { requireAdminAuth, requireAuth } from '../middleware/auth.js';

const router = Router();

router.get('/', requireAuth, listTemplates);
router.post('/', requireAdminAuth, createTemplate);
router.put('/:template_id', requireAdminAuth, updateTemplate);
router.delete('/:template_id', requireAdminAuth, deleteTemplate);
router.post('/built-in/:template_key/install', requireAdminAuth, installBuiltInTemplateController);
router.post('/:template_id/create-job', requireAdminAuth, createJobFromTemplate);

export default router;
