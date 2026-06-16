import { Router } from 'express';
import {
  cancelSubscriptionRenewal,
  emailPaymentMethodManagementLink,
  generatePaymentMethodManagementLink,
  getSettings, updateSettings, getSubscription, retrySubscriptionCheckout, testEmailConfig, uploadLogo, logoUploadMiddleware,
  getOrgDetails, listOrgMembers, inviteOrgMember, removeOrgMember, listOrgInvites, revokeOrgInvite, updateOrgMemberRole,
  resumeSubscriptionRenewal,
  syncSubscriptionState,
  uploadProfilePicture, removeProfilePicture,
} from '../controllers/settingsController.js';
import { requireAuth, requireAdminAuth, requireRole } from '../middleware/auth.js';

const router = Router();

router.get('/', requireAuth, getSettings);
router.put('/', requireAuth, requireRole(['owner', 'admin']), updateSettings);
router.get('/subscription', requireAuth, getSubscription);
router.post('/subscription/retry-checkout', requireAuth, requireRole(['owner', 'admin']), retrySubscriptionCheckout);
router.post('/subscription/sync', requireAuth, requireRole(['owner', 'admin']), syncSubscriptionState);
router.post('/subscription/cancel-renewal', requireAuth, requireRole(['owner', 'admin']), cancelSubscriptionRenewal);
router.post('/subscription/resume-renewal', requireAuth, requireRole(['owner', 'admin']), resumeSubscriptionRenewal);
router.post(
  '/subscription/payment-method-link',
  requireAuth,
  requireRole(['owner', 'admin']),
  generatePaymentMethodManagementLink
);
router.post(
  '/subscription/payment-method-email',
  requireAuth,
  requireRole(['owner', 'admin']),
  emailPaymentMethodManagementLink
);
router.post('/upload-logo', requireAuth, requireRole(['owner', 'admin']), logoUploadMiddleware, uploadLogo);
router.post('/upload-profile-picture', requireAuth, logoUploadMiddleware, uploadProfilePicture);
router.delete('/profile-picture', requireAuth, removeProfilePicture);
router.post('/email/test', requireAuth, requireRole(['owner', 'admin']), testEmailConfig);

// Organisation details & member management
router.get('/organisation', requireAuth, getOrgDetails);
router.get('/organisation/members', requireAuth, requireRole(['owner', 'admin']), listOrgMembers);
router.post('/organisation/members/invite', requireAuth, requireRole(['owner', 'admin']), inviteOrgMember);
router.put('/organisation/members/:memberId/role', requireAdminAuth, updateOrgMemberRole);
router.delete('/organisation/members/:member_id', requireAuth, requireRole(['owner', 'admin']), removeOrgMember);
router.get('/organisation/invites', requireAuth, requireRole(['owner', 'admin']), listOrgInvites);
router.delete('/organisation/invites/:invite_id', requireAuth, requireRole(['owner', 'admin']), revokeOrgInvite);

export default router;
