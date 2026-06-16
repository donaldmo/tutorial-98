import { Router } from 'express';
import analyticsRoutes from './analytics.js';
import authorizationRoutes from './authorization.js';
import authRoutes from './auth.js';
import allocationRoutes from './allocations.js';
import clientRoutes from './clients.js';
import dashboardRoutes from './dashboard.js';
import departmentRoutes from './departments.js';
import enumRoutes from './enums.js';
import emailJobsRoutes from './emailJobs.js';
import healthRoutes from './health.js';
import importExportRoutes from './importExport.js';
import jobTemplateRoutes from './jobTemplates.js';
import jobTypeRoutes from './jobTypes.js';
import jobRoutes from './jobs.js';
import notificationRoutes from './notifications.js';
import planningRoutes from './planning.js';
import reportRoutes from './reports.js';
import saasRoutes from './saas.js';
import saasPlansRoutes from './saasPlans.js';
import settingsRoutes from './settings.js';
import staffRoutes from './staff.js';
import templateRoutes from './templates.js';
import timeEntryRoutes from './timeEntries.js';
import webhookRoutes from './webhooks.js';
// Group 3 – Task 3.1: work component split rules
import workComponentRoutes from './workComponents.js';

const router = Router();

router.use(healthRoutes);
router.use('/', importExportRoutes);
router.use('/auth', authRoutes);
router.use('/staff', staffRoutes);
router.use('/clients', clientRoutes);
router.use('/jobs', jobRoutes);
router.use('/job-templates', jobTemplateRoutes);
router.use('/job-types', jobTypeRoutes);
router.use('/allocations', allocationRoutes);
router.use('/time-entries', timeEntryRoutes);
router.use('/departments', departmentRoutes);
router.use('/authorization-requests', authorizationRoutes);
router.use('/notifications', notificationRoutes);
router.use('/dashboard', dashboardRoutes);
router.use('/analytics', analyticsRoutes);
router.use('/reports', reportRoutes);
router.use('/planning', planningRoutes);
router.use('/settings', settingsRoutes);
router.use('/templates', templateRoutes);
router.use('/enums', enumRoutes);
router.use('/email-jobs', emailJobsRoutes);
router.use('/webhooks', webhookRoutes);
router.use('/saas', saasRoutes);
router.use('/saas-plans', saasPlansRoutes);
// Group 3 – work component split rules (query/preview, mutation via /job-types)
router.use('/work-components', workComponentRoutes);

export default router;
