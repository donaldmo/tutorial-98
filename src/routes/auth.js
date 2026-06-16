import { Router } from 'express';
import {
  adminForgotPassword,
  adminLogin,
  adminMigrationStatus,
  adminMe,
  adminResetPassword,
  updateAdminOnboardingPreference,
  updateProfile,
  createOrganisationAsAdmin,
  acceptInvite,
  acceptStaffInvite,
  changePassword,
  demoAdminLogin,
  getRegistrations,
  login,
  logout,
  me,
  meOrganisations,
  register,
  requestPasswordReset,
  resendVerificationEmail,
  resetPassword,
  reviewRegistration,
  selectOrganisation,
  staffForgotPassword,
  staffResetPassword,
  verifyEmail,
  verifyPin,
} from '../controllers/authController.js';
import { requireAuth, requireAdminAuth } from '../middleware/auth.js';

const router = Router();

// ── Staff auth ────────────────────────────────────────────────────────────────
router.post('/login', login);
router.post('/register', register);

// ── Admin auth ────────────────────────────────────────────────────────────────
router.post('/admin-login', adminLogin);
router.post('/demo-admin-login', demoAdminLogin);

// ── Shared (entity-aware) ─────────────────────────────────────────────────────
router.post('/verify-email', verifyEmail);
router.post('/verify-pin', verifyPin);
router.post('/resend-verification', resendVerificationEmail);
router.post('/request-password-reset', requestPasswordReset);
router.post('/reset-password', resetPassword);
router.post('/admin-forgot-password', adminForgotPassword);
router.post('/admin-reset-password', adminResetPassword);
router.post('/staff-forgot-password', staffForgotPassword);
router.post('/staff-reset-password', staffResetPassword);
router.post('/accept-invite', acceptInvite);
router.post('/accept-staff-invite', acceptStaffInvite);

// ── Protected — staff ─────────────────────────────────────────────────────────
router.get('/me', requireAuth, me);
router.put('/me', requireAuth, updateProfile);
router.get('/me/organisations', requireAuth, meOrganisations);
router.post('/select-organisation', requireAuth, selectOrganisation);
router.put('/me/password', requireAuth, changePassword);

// ── Protected — admin ─────────────────────────────────────────────────────────
router.get('/admin/me', requireAdminAuth, adminMe);
router.put('/admin/me', requireAdminAuth, updateAdminOnboardingPreference);
router.get('/admin/migration-status', requireAdminAuth, adminMigrationStatus);
router.post('/admin/create-organisation', requireAdminAuth, createOrganisationAsAdmin);
router.put('/admin/me/password', requireAdminAuth, changePassword);

// ── Shared ────────────────────────────────────────────────────────────────────
router.post('/logout', logout);

// ── Legacy stubs ──────────────────────────────────────────────────────────────
router.get('/registrations', requireAuth, getRegistrations);
router.put('/registrations/:registration_id', requireAuth, reviewRegistration);

export default router;
