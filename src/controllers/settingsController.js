import { asyncHandler } from '../utils/asyncHandler.js';
import { serializeDocument } from '../utils/serialize.js';
import JobType from '../models/JobType.js';
import Organisation from '../models/Organisation.js';
import Payment from '../models/Payment.js';
import Setting from '../models/Setting.js';
import AuthToken from '../models/AuthToken.js';
import Admin from '../models/Admin.js';
import { DEFAULT_ENUMS } from '../services/planningService.js';
import { checkAdminSeatLimitByOrganisationId } from '../services/planLimitService.js';
import { buildSubscriptionUsageSnapshot } from '../services/subscriptionUsageService.js';
import { resendService } from '../services/resendService.js';
import { enqueueOrgAdminInviteEmailJob } from '../jobs/emailQueue.js';
import { encrypt } from '../utils/encryption.js';
import { getSaasPlans } from '../config/saasPlans.js';
import { upsertAdmin, revokeAdmin } from '../utils/orgMembership.js';
import { signJwt } from '../utils/jwt.js';
import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import multer from 'multer';
import { uploadToCloudinary } from '../utils/cloudinaryUpload.js';
import {
  cancelPaystackRenewal,
  fetchAndSyncPaystackSubscription,
  generatePaystackManagementLink,
  getPaystackSubscriptionCapabilities,
  initializePaystackCheckout,
  resolveRetryCheckoutTarget,
  resumePaystackRenewal,
  sendPaystackManagementLinkEmail,
} from '../services/paystackBillingService.js';
import { buildBillingAccessGate } from '../services/billingAccessGateService.js';
import { buildAdminAuthResponse, buildStaffAuthResponse, mapRoleToAccessLevel } from './authController.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/gif', 'image/svg+xml', 'image/webp'];
    cb(null, allowed.includes(file.mimetype));
  },
});
export const logoUploadMiddleware = upload.single('file');

const getOrgSettings = async (organisationId) => {
  if (!organisationId) {
    const err = new Error('No organisation context — cannot load settings');
    err.status = 400;
    throw err;
  }
  let settings = await Setting.findOne({ organisation_id: organisationId });
  if (!settings) {
    settings = await Setting.create({ organisation_id: organisationId });
  }
  return settings;
};

const serializeSettings = (settings) => {
  const doc = serializeDocument(settings);
  // Never expose the encrypted password to the client
  if (doc.emailConfig) {
    doc.emailConfig.encryptedPassword = undefined;
    doc.emailConfig.password = doc.emailConfig.encryptedPassword ? '••••••••' : '';
  }
  return doc;
};

export const getSettings = asyncHandler(async (req, res) => {
  const settings = await getOrgSettings(req.user.organisation_id);
  return res.json(serializeSettings(settings));
});

export const updateSettings = asyncHandler(async (req, res) => {
  const settings = await getOrgSettings(req.user.organisation_id);
  const body = { ...(req.body || {}) };

  // Handle emailConfig separately to encrypt the password
  if (body.emailConfig) {
    const incoming = body.emailConfig;
    const current = settings.emailConfig || {};

    settings.emailConfig = {
      host: incoming.host ?? current.host,
      port: incoming.port ?? current.port,
      secure: incoming.secure ?? current.secure,
      user: incoming.user ?? current.user,
      fromName: incoming.fromName ?? current.fromName,
      fromAddress: incoming.fromAddress ?? current.fromAddress,
      enabled: incoming.enabled ?? current.enabled,
      // Only update encryptedPassword if a new password string was provided
      encryptedPassword: incoming.password
        ? encrypt(incoming.password)
        : current.encryptedPassword,
    };

    delete body.emailConfig;
  }

  // Apply remaining fields
  Object.assign(settings, body);
  await settings.save();

  return res.json(serializeSettings(settings));
});

export const uploadLogo = asyncHandler(async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ detail: 'No image file provided.' });
  }

  const orgId = String(req.user.organisation_id);

  const result = await uploadToCloudinary(req.file.buffer, {
    folder: `brendmo-workflow/${orgId}`,
    public_id: 'logo',
    overwrite: true,
    resource_type: 'image',
  });

  const settings = await getOrgSettings(req.user.organisation_id);
  settings.logo_url = result.secure_url;
  await settings.save();

  return res.json({ logo_url: result.secure_url });
});

export const testEmailConfig = asyncHandler(async (req, res) => {
  const resendApiKey = String(process.env.RESEND_API_KEY || '').trim();
  const fromResendEmail = String(process.env.FROM_RESEND_EMAIL || '').trim();
  if (!resendApiKey || !fromResendEmail) {
    return res.status(400).json({
      detail: 'Resend configuration is incomplete. Set RESEND_API_KEY and FROM_RESEND_EMAIL first.',
    });
  }

  // Validate optional custom recipient
  const rawTo = req.body?.to;
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (rawTo && !emailRegex.test(String(rawTo).trim())) {
    return res.status(400).json({ detail: 'Invalid recipient email address.' });
  }
  const recipientEmail = rawTo ? String(rawTo).trim() : req.user.email;

  try {
    const info = await resendService(
      recipientEmail,
      'Brendmo Workflow — Resend test email',
      '<p>This is a test email confirming your Resend configuration is working correctly.</p>'
    );

    return res.json({
      message: `Test email sent to ${recipientEmail}`,
      provider: 'resend',
      message_id: info?.id || null,
    });
  } catch (err) {
    return res.status(502).json({
      detail: `Resend test failed: ${err.message}`,
      resend_error: err.code || null,
    });
  }
});

export const getEnums = asyncHandler(async (_req, res) => {
  const jobTypes = await JobType.find({ is_active: true }).sort({ name: 1 }).select('name');
  return res.json({
    ...DEFAULT_ENUMS,
    job_types: jobTypes.map((item) => item.name),
  });
});

export const getSubscription = asyncHandler(async (req, res) => {
  const organisationId = req.user?.organisation_id;
  const usageSnapshot = await buildSubscriptionUsageSnapshot(organisationId, {
    fallbackEmail: req.user?.email || null,
  });

  // Resolve organisation plan & subscription metadata
  let organisation = null;
  if (organisationId) {
    organisation = await Organisation.findById(organisationId).lean();
  }

  // Keep billing history aligned with the locally recorded Paystack transaction state,
  // including pending and failed checkout/renewal attempts created by callbacks/webhooks.
  const payments = organisationId
    ? await Payment.find({ organisation_id: organisationId })
        .sort({ created_at: -1, completed_at: -1 })
        .limit(20)
        .lean()
    : [];
  const latestCheckout = organisationId
    ? await Payment.findOne({
        organisation_id: organisationId,
        payment_method: 'paystack',
        status: { $in: ['pending', 'failed'] },
      })
        .sort({ created_at: -1 })
        .lean()
    : null;

  const nextRenewalAt =
    organisation?.paystack?.subscription?.next_renewal_at ||
    organisation?.paystack?.renewal?.next_charge_at ||
    organisation?.subscription_ends_at ||
    null;

  // Canonical plan catalog for display in the admin subscription UI
  const availablePlans = await getSaasPlans();
  const paystackCapabilities = getPaystackSubscriptionCapabilities(organisation);
  const accessGate = buildBillingAccessGate({
    organisation,
    latestCheckout,
    payments,
  });

  return res.json({
    ...usageSnapshot,
    subscription_status: organisation?.subscription_status || 'active',
    trial_ends_at: organisation?.trial_ends_at || null,
    subscription_ends_at: organisation?.subscription_ends_at || null,
    next_renewal_at: nextRenewalAt,
    status: organisation?.status || 'active',
    billing_provider: organisation?.billing_provider || null,
    paystack: organisation?.paystack || null,
    paystack_capabilities: paystackCapabilities,
    access_gate: accessGate,
    payments: payments.map((p) => ({
      id: p._id.toString(),
      status: p.status,
      description: p.description || null,
      plan: p.plan,
      billing_cycle: p.billing_cycle,
      amount: p.amount || 0,
      amount_gross: p.amount_gross || p.amount || 0,
      amount_fee: p.amount_fee || 0,
      amount_net: p.amount_net || p.amount || 0,
      currency: p.currency || 'ZAR',
      payment_method: p.payment_method || null,
      created_at: p.created_at,
      completed_at: p.completed_at,
      reference: p.paystack?.reference || null,
      gateway_response: p.paystack?.gateway_response || null,
      renewal_status: p.paystack?.renewal_status || null,
      renewal_due_at: p.paystack?.renewal_due_at || null,
      webhook_event: p.paystack?.webhook_event || null,
    })),
    checkout: latestCheckout
      ? {
          payment_id: latestCheckout._id.toString(),
          status: latestCheckout.status,
          plan: latestCheckout.plan,
          billing_cycle: latestCheckout.billing_cycle,
          intent: latestCheckout.paystack?.metadata?.intent || null,
          amount: latestCheckout.amount,
          reference: latestCheckout.paystack?.reference || null,
          access_code: latestCheckout.paystack?.access_code || null,
          authorization_url: latestCheckout.paystack?.metadata?.authorization_url || null,
          gateway_response: latestCheckout.paystack?.gateway_response || null,
          created_at: latestCheckout.created_at,
        }
      : null,
    actions: {
      can_change_plan: true,
      can_retry_checkout: Boolean(latestCheckout || (organisation?.plan && organisation.plan !== 'free')),
      can_cancel_renewal: paystackCapabilities.available.cancel_renewal,
      can_resume_renewal: paystackCapabilities.available.resume_renewal,
      can_manage_payment_method: paystackCapabilities.available.manage_link,
      can_email_payment_method_link: paystackCapabilities.available.manage_link_email,
      can_sync_subscription: paystackCapabilities.available.sync_subscription,
      capabilities: paystackCapabilities,
    },
    available_plans: availablePlans,
  });
});

export const retrySubscriptionCheckout = asyncHandler(async (req, res) => {
  const organisation = await Organisation.findById(req.user.organisation_id);
  if (!organisation) return res.status(404).json({ detail: 'Organisation not found' });

  const target = await resolveRetryCheckoutTarget(organisation, req.body || {});
  const checkoutSession = await initializePaystackCheckout({
    organisation,
    planId: target.planId,
    billingCycle: target.billingCycle,
    intent: req.body?.intent || null,
  });

  if (checkoutSession.mode === 'free') {
    return res.json({
      mode: 'free',
      message: checkoutSession.message,
      plan: 'free',
      billing_cycle: 'monthly',
      checkout: null,
    });
  }

  return res.json({
    payment_id: checkoutSession.payment?._id?.toString() || null,
    plan: target.planId,
    billing_cycle: target.billingCycle,
    checkout: checkoutSession.checkout,
  });
});

export const cancelSubscriptionRenewal = asyncHandler(async (req, res) => {
  const organisation = await Organisation.findById(req.user.organisation_id);
  if (!organisation) return res.status(404).json({ detail: 'Organisation not found' });

  const result = await cancelPaystackRenewal(organisation);
  return res.json({
    message: 'Subscription renewal cancellation requested successfully',
    ...result,
  });
});

export const generatePaymentMethodManagementLink = asyncHandler(async (req, res) => {
  const organisation = await Organisation.findById(req.user.organisation_id);
  if (!organisation) return res.status(404).json({ detail: 'Organisation not found' });

  const result = await generatePaystackManagementLink(organisation);
  return res.json({
    message: 'Payment method management link generated successfully',
    ...result,
  });
});

export const emailPaymentMethodManagementLink = asyncHandler(async (req, res) => {
  const organisation = await Organisation.findById(req.user.organisation_id);
  if (!organisation) return res.status(404).json({ detail: 'Organisation not found' });

  const result = await sendPaystackManagementLinkEmail(organisation);
  return res.json({
    message: 'Payment method management email sent successfully',
    ...result,
  });
});

export const resumeSubscriptionRenewal = asyncHandler(async (req, res) => {
  const organisation = await Organisation.findById(req.user.organisation_id);
  if (!organisation) return res.status(404).json({ detail: 'Organisation not found' });

  const result = await resumePaystackRenewal(organisation);
  return res.json({
    message: 'Subscription renewal resumed successfully',
    ...result,
  });
});

export const syncSubscriptionState = asyncHandler(async (req, res) => {
  const organisation = await Organisation.findById(req.user.organisation_id);
  if (!organisation) return res.status(404).json({ detail: 'Organisation not found' });

  const result = await fetchAndSyncPaystackSubscription(organisation);
  return res.json({
    message: 'Subscription state synced successfully',
    subscription_code: result.subscription?.subscription_code || organisation?.paystack?.subscription?.subscription_code || null,
    status: result.organisation?.paystack?.subscription?.status || null,
    next_renewal_at: result.organisation?.paystack?.subscription?.next_renewal_at || null,
    last_synced_at: result.organisation?.paystack?.subscription?.last_synced_at || null,
    capabilities: result.capabilities,
    remote_subscription: result.subscription || null,
  });
});

// ── Organisation member management ──────────────────────────────────────────

const PURPOSE_SECRET = process.env.JWT_PURPOSE_SECRET || process.env.JWT_SECRET;
const normalizedEmail = (email = '') => String(email).toLowerCase().trim();

const issueInviteToken = ({ email, organisationId, inviteRole = 'admin' }) => {
  const jti = crypto.randomUUID();
  const token = signJwt(
    {
      purpose: 'invite_admin',
      email: normalizedEmail(email),
      organisation_id: String(organisationId),
      invite_role: inviteRole,
      jti,
    },
    { secret: PURPOSE_SECRET, expiresIn: process.env.INVITE_TOKEN_TTL || '48h' }
  );
  const decoded = jwt.decode(token);
  const expiresAt = decoded?.exp ? new Date(decoded.exp * 1000) : new Date(Date.now() + 48 * 60 * 60 * 1000);
  return { token, jti, expiresAt };
};

export const getOrgDetails = asyncHandler(async (req, res) => {
  const org = await Organisation.findById(req.user.organisation_id)
    .populate('saas_plan_id', 'id name max_users max_clients max_jobs max_admins_per_organisation max_organisations_per_owner_email price_monthly price_annual')
    .lean();
  if (!org) return res.status(404).json({ detail: 'Organisation not found' });

  // Owner comes from the admins collection
  const ownerAdmin = await Admin.findOne({
    organisation_id: org._id,
    role: 'owner',
    status: 'active',
  }).lean();

  return res.json({
    id: org._id.toString(),
    firm_name: org.firm_name,
    subdomain: org.subdomain,
    email: org.email,
    phone: org.phone || null,
    plan: org.plan,
    saas_plan: org.saas_plan_id || null,
    subscription_status: org.subscription_status,
    created_at: org.created_at,
    owner: ownerAdmin
      ? { name: ownerAdmin.name, email: ownerAdmin.email, staff_id: ownerAdmin.staff_id?.toString() || null }
      : null,
  });
});

export const listOrgMembers = asyncHandler(async (req, res) => {
  const admins = await Admin.find({
    organisation_id: req.user.organisation_id,
    status: { $ne: 'revoked' },
  }).sort({ created_at: 1 }).lean();

  return res.json(admins.map((a) => ({
    id: a._id.toString(),
    staff_id: a.staff_id?.toString() || null,
    email: a.email,
    name: a.name,
    phone: a.phone || null,
    profile_picture_url: a.profile_picture_url || null,
    role: a.role,
    role_title: a.role_title || null,
    status: a.status,
    accepted_at: a.accepted_at,
    invited_at: a.invited_at,
  })));
});

export const inviteOrgMember = asyncHandler(async (req, res) => {
  const { email, role } = req.body || {};
  if (!email) return res.status(400).json({ detail: 'email is required' });

  const accessLevel = mapRoleToAccessLevel(role);

  const org = await Organisation.findById(req.user.organisation_id);
  if (!org) return res.status(404).json({ detail: 'Organisation not found' });
  if (!(await checkAdminSeatLimitByOrganisationId(res, org._id))) {
    return;
  }

  const inviteEmail = normalizedEmail(email);

  // Check if already an active admin
  const existing = await Admin.findOne({
    organisation_id: org._id,
    email: inviteEmail,
    status: 'active',
  }).lean();
  if (existing) return res.status(409).json({ detail: 'This email is already an active organisation admin.' });

  // Revoke any previous pending invites for the same email
  await AuthToken.updateMany(
    { token_kind: 'invite_admin', organisation_id: org._id, email: inviteEmail, status: 'active' },
    { $set: { status: 'revoked', revoked_at: new Date() } }
  );

  const invite = issueInviteToken({ email: inviteEmail, organisationId: org._id, inviteRole: accessLevel });

  const authTokenDoc = await AuthToken.create({
    token_kind: 'invite_admin',
    jwt_id: invite.jti,
    organisation_id: org._id,
    email: inviteEmail,
    invite_role: accessLevel,
    role_title: role || null,
    status: 'active',
    issued_by_staff_id: req.user._id,
    expires_at: invite.expiresAt,
  });

  // Create an invited Admin doc (staff_id null until accepted)
  await upsertAdmin(org._id, {
    staff_id: null,
    email: inviteEmail,
    name: null,
    role: accessLevel,
    role_title: role || null,
    status: 'invited',
    invited_by_admin_id: req.adminDoc?._id || null,
    invited_at: new Date(),
    accepted_at: null,
  });

  let emailQueued = false;
  let emailJobId = null;
  let emailError = null;

  try {
    const job = await enqueueOrgAdminInviteEmailJob({
      authTokenId: authTokenDoc._id,
      organisationId: org._id,
      email: inviteEmail,
      token: invite.token,
      invitedByName: req.user?.name || 'Organisation admin',
      organisationName: org.firm_name,
    });
    emailQueued = true;
    emailJobId = String(job.id || '');
  } catch (error) {
    emailError = error.message || 'Failed to queue invite email';
    console.warn(`[inviteOrgMember] Failed to queue invite email for ${inviteEmail}: ${emailError}`);
  }

  return res.status(201).json({
    message: emailQueued ? `Invite queued for ${inviteEmail}` : `Invite created for ${inviteEmail}, but email queue failed`,
    email_queued: emailQueued,
    email_job_id: emailJobId,
    email_error: emailError,
  });
});

export const removeOrgMember = asyncHandler(async (req, res) => {
  const adminDoc = await Admin.findOne({
    _id: req.params.member_id,
    organisation_id: req.user.organisation_id,
  });
  if (!adminDoc) return res.status(404).json({ detail: 'Admin not found' });
  if (adminDoc.role === 'owner') return res.status(403).json({ detail: 'Cannot remove the organisation owner.' });

  await revokeAdmin(adminDoc._id);
  return res.json({ message: 'Admin removed from organisation.' });
});

export const listOrgInvites = asyncHandler(async (req, res) => {
  const invites = await AuthToken.find({
    token_kind: 'invite_admin',
    organisation_id: req.user.organisation_id,
    status: 'active',
  }).sort({ created_at: -1 }).lean();

  return res.json(invites.map((i) => ({
    id: i._id.toString(),
    email: i.email,
    invite_role: i.invite_role,
    role_title: i.role_title || null,
    expires_at: i.expires_at,
    created_at: i.created_at,
  })));
});

export const updateOrgMemberRole = asyncHandler(async (req, res) => {
  const { memberId } = req.params;
  const { role } = req.body || {};

  if (!['admin', 'supervisor'].includes(role)) {
    return res.status(400).json({ detail: 'Role must be "admin" or "supervisor"' });
  }

  const admin = await Admin.findOne({
    _id: memberId,
    organisation_id: req.user.organisation_id,
  });
  if (!admin || admin.role === 'owner') {
    return res.status(404).json({ detail: 'Member not found' });
  }

  admin.role = role;
  await admin.save();

  return res.json({ message: 'Permissions updated', role: admin.role });
});

export const uploadProfilePicture = asyncHandler(async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ detail: 'No image file provided.' });
  }

  const orgId = String(req.user.organisation_id);
  const userId = String(req.admin?._id || req.user._id);

  const result = await uploadToCloudinary(req.file.buffer, {
    folder: `brendmo-workflow/${orgId}/avatars`,
    public_id: userId,
    overwrite: true,
    resource_type: 'image',
  });

  if (req.admin) {
    req.admin.profile_picture_url = result.secure_url;
    await req.admin.save();

    const authResponse = await buildAdminAuthResponse(req.admin, {
      preferredOrganisationId: req.activeOrganisationId || req.admin.orgSession,
    });
    return res.json({ profile_picture_url: result.secure_url, user: authResponse.admin });
  }

  req.user.profile_picture_url = result.secure_url;
  await req.user.save();

  const safeUser = serializeDocument(req.user);
  delete safeUser.passwordHash;
  delete safeUser.password_hash;
  return res.json({ profile_picture_url: result.secure_url, user: safeUser });
});

export const removeProfilePicture = asyncHandler(async (req, res) => {
  if (req.admin) {
    req.admin.profile_picture_url = null;
    await req.admin.save();

    const authResponse = await buildAdminAuthResponse(req.admin, {
      preferredOrganisationId: req.activeOrganisationId || req.admin.orgSession,
    });
    return res.json({ user: authResponse.admin });
  }

  if (req.user) {
    req.user.profile_picture_url = null;
    await req.user.save();

    const safeUser = serializeDocument(req.user);
    delete safeUser.passwordHash;
    delete safeUser.password_hash;
    return res.json({ user: safeUser });
  }

  return res.status(401).json({ detail: 'Not authenticated' });
});

export const revokeOrgInvite = asyncHandler(async (req, res) => {
  const invite = await AuthToken.findOne({
    _id: req.params.invite_id,
    token_kind: 'invite_admin',
    organisation_id: req.user.organisation_id,
  });
  if (!invite) return res.status(404).json({ detail: 'Invite not found' });

  invite.status = 'revoked';
  invite.revoked_at = new Date();
  await invite.save();

  // Also revoke the matching invited Admin doc
  await Admin.findOneAndUpdate(
    { organisation_id: req.user.organisation_id, email: invite.email, status: 'invited' },
    { $set: { status: 'revoked' } }
  );

  return res.json({ message: 'Invite revoked.' });
});
