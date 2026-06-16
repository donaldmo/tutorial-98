import { Router } from 'express';
import {
  adminDashboard,
  createSubscription,
  exportOrganisations,
  getBillingConfig,
  getOrganisationDetail,
  getPlans,
  getUsage,
  listActivity,
  listAllPayments,
  listOrganisations,
  payfastItnWebhook,
  paystackCallback,
  paystackWebhook,
  registerOrganisation,
  revenueOverTime,
  sendAnnouncement,
  subscriptionMetrics,
  superAdminLogin,
  updateOrganisationPlan,
  updateOrganisationStatus,
  usageStatistics,
} from '../controllers/saasController.js';
import { requireAuth, requireSuperAdminAuth, requireOrganisationAuth } from '../middleware/auth.js';

const router = Router();

router.get('/billing/config', getBillingConfig);
router.get('/plans', getPlans);
router.get('/usage', requireAuth, getUsage);
router.post('/organisations/register', registerOrganisation);
router.post('/subscribe', requireOrganisationAuth, createSubscription);
router.post('/payfast-itn', payfastItnWebhook);
router.get('/paystack/callback', paystackCallback);
router.post('/paystack/webhook', paystackWebhook);

router.post('/admin/login', superAdminLogin);
router.get('/admin/dashboard', requireSuperAdminAuth, adminDashboard);
router.get('/admin/organisations', requireSuperAdminAuth, listOrganisations);
router.get('/admin/organisations/export', requireSuperAdminAuth, exportOrganisations);
router.get('/admin/organisations/:id', requireSuperAdminAuth, getOrganisationDetail);
router.patch('/admin/organisations/:id/status', requireSuperAdminAuth, updateOrganisationStatus);
router.patch('/admin/organisations/:id/plan', requireSuperAdminAuth, updateOrganisationPlan);
router.get('/admin/payments', requireSuperAdminAuth, listAllPayments);
router.get('/admin/revenue-over-time', requireSuperAdminAuth, revenueOverTime);
router.get('/admin/usage-statistics', requireSuperAdminAuth, usageStatistics);
router.get('/admin/subscription-metrics', requireSuperAdminAuth, subscriptionMetrics);
router.get('/admin/activity', requireSuperAdminAuth, listActivity);
router.post('/admin/announcements', requireSuperAdminAuth, sendAnnouncement);

export default router;
