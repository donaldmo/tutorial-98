import { Router } from 'express';
import {
  createClient,
  deleteClient,
  getClientById,
  getClientFeeConfig,
  importClients,
  previewClientFeeSplit,
  updateClient,
  updateClientFeeConfig,
  listClients,
} from '../controllers/clientsController.js';
import { requireAuth, requireAdminAuth } from '../middleware/auth.js';

const router = Router();

router.get('/', requireAuth, listClients);
router.get('/:client_id', requireAuth, getClientById);
router.post('/', requireAdminAuth, createClient);
router.post('/import', requireAdminAuth, importClients);
router.put('/:client_id', requireAdminAuth, updateClient);
router.delete('/:client_id', requireAdminAuth, deleteClient);

// Group 3 – Task 3.2: Per-client role-based fee split configuration
// GET  /clients/:client_id/fee-config            → read current split
// PUT  /clients/:client_id/fee-config            → replace split array
// POST /clients/:client_id/fee-config/preview    → calculate amounts without saving
router.get('/:client_id/fee-config', requireAuth, getClientFeeConfig);
router.put('/:client_id/fee-config', requireAdminAuth, updateClientFeeConfig);
router.post('/:client_id/fee-config/preview', requireAdminAuth, previewClientFeeSplit);

export default router;