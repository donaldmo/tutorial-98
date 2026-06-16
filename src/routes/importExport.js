import { Router } from 'express';
import {
  bulkImportJobs,
  bulkImportJobTypes,
  bulkImportStaff,
  exportJobsCsv,
  getJobsImportTemplate,
  getJobTypesImportTemplate,
  getStaffImportTemplate,
} from '../controllers/importExportController.js';
import { requireAuth, requireAdminAuth } from '../middleware/auth.js';

const router = Router();

router.post('/jobs/bulk-import', requireAdminAuth, bulkImportJobs);
router.get('/jobs/import-template', requireAuth, getJobsImportTemplate);
router.get('/jobs/export-csv', requireAuth, exportJobsCsv);

router.post('/staff/bulk-import', requireAdminAuth, bulkImportStaff);
router.get('/staff/import-template', requireAuth, getStaffImportTemplate);

router.post('/job-types/bulk-import', requireAdminAuth, bulkImportJobTypes);
router.get('/job-types/import-template', requireAuth, getJobTypesImportTemplate);

export default router;
