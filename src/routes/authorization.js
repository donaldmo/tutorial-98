import { Router } from 'express';
import {
  approveAuthorization,
  createAuthorizationRequest,
  getPendingAuthorizations,
  inviteOrganizationAdmin,
  listOrganizationInvites,
  listOrganizationMembers,
  listAuthorizationRequests,
  overrideAuthorization,
  revokeOrganizationInvite,
  rejectAuthorization,
} from '../controllers/authorizationController.js';
import { requireAuth, requireAdminAuth } from '../middleware/auth.js';

const router = Router();

router.get('/', requireAuth, listAuthorizationRequests);
router.get('/pending', requireAuth, getPendingAuthorizations);
router.post('/', requireAdminAuth, createAuthorizationRequest);
router.post('/:request_id/approve', requireAdminAuth, approveAuthorization);
router.post('/:request_id/reject', requireAdminAuth, rejectAuthorization);
router.post('/:request_id/override', requireAdminAuth, overrideAuthorization);

router.get('/org/members', requireAuth, listOrganizationMembers);
router.get('/org/invites', requireAuth, listOrganizationInvites);
router.post('/org/invites', requireAdminAuth, inviteOrganizationAdmin);
router.post('/org/invites/:invite_id/revoke', requireAdminAuth, revokeOrganizationInvite);

export default router;
