import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import AuthorizationRequest from '../models/AuthorizationRequest.js';
import AuthToken from '../models/AuthToken.js';
import Notification from '../models/Notification.js';
import Admin from '../models/Admin.js';
import Organisation from '../models/Organisation.js';
import { resolveMembership } from '../utils/orgMembership.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { toObjectId } from '../utils/objectId.js';
import { signJwt } from '../utils/jwt.js';
import { checkAdminSeatLimitByOrganisationId } from '../services/planLimitService.js';
import { enqueueOrgAdminInviteEmailJob } from '../jobs/emailQueue.js';
import { serializeDocument, serializeList } from '../utils/serialize.js';
import { mapRoleToAccessLevel } from './authController.js';

const PURPOSE_SECRET = process.env.JWT_PURPOSE_SECRET || process.env.JWT_SECRET;

const normalizedEmail = (email = '') => String(email).toLowerCase().trim();

const getActorMembership = async (actor) => {
  if (!actor?._id) return null;
  const resolved = await resolveMembership(actor._id, actor.organisation_id || null);
  return resolved ? { org: resolved.org, member: resolved.member } : null;
};

const assertOrgAdmin = async (actor) => {
  const result = await getActorMembership(actor);
  if (!result || !['owner', 'admin'].includes(String(result.member?.role || '').toLowerCase())) {
    const error = new Error('Organisation admin access required');
    error.status = 403;
    throw error;
  }
  return { membership: result.member, organisation: result.org };
};

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
    {
      secret: PURPOSE_SECRET,
      expiresIn: process.env.INVITE_TOKEN_TTL || '48h',
    }
  );

  const decoded = jwt.decode(token);
  const expiresAt = decoded?.exp ? new Date(decoded.exp * 1000) : new Date(Date.now() + 48 * 60 * 60 * 1000);
  return { token, jti, expiresAt };
};

const createNotification = async ({ recipient_id, title, message, type, related_id }) => {
  await Notification.create({ recipient_id, title, message, type, related_id: related_id?.toString?.() || null });
};

export const listAuthorizationRequests = asyncHandler(async (req, res) => {
  const query = { organisation_id: req.user.organisation_id };

  if (req.query.status) query.status = String(req.query.status);
  if (req.query.department_id) query.department_id = toObjectId(req.query.department_id, 'department_id');

  const rows = await AuthorizationRequest.find(query).sort({ created_at: -1 });
  return res.json(serializeList(rows));
});

export const getPendingAuthorizations = asyncHandler(async (req, res) => {
  const query = { status: 'Pending', organisation_id: req.user.organisation_id };
  if (req.query.supervisor_id) {
    query.reviewed_by = toObjectId(req.query.supervisor_id, 'supervisor_id');
  }

  const rows = await AuthorizationRequest.find(query).sort({ created_at: -1 });
  return res.json(serializeList(rows));
});

export const createAuthorizationRequest = asyncHandler(async (req, res) => {
  const body = req.body || {};

  if (!body.job_id || !body.staff_id || !body.requested_by || !body.reason) {
    return res.status(400).json({ detail: 'job_id, staff_id, requested_by and reason are required' });
  }

  const created = await AuthorizationRequest.create({
    allocation_id: body.allocation_id ? toObjectId(body.allocation_id, 'allocation_id') : null,
    job_id: toObjectId(body.job_id, 'job_id'),
    staff_id: toObjectId(body.staff_id, 'staff_id'),
    requested_by: toObjectId(body.requested_by, 'requested_by'),
    department_id: body.department_id ? toObjectId(body.department_id, 'department_id') : null,
    reason: String(body.reason),
    percentage_requested: Number(body.percentage_requested || 100),
    status: 'Pending',
    organisation_id: req.user.organisation_id,
  });

  await createNotification({
    recipient_id: toObjectId(body.requested_by, 'requested_by'),
    title: 'Authorization Submitted',
    message: 'Your authorization request is pending review.',
    type: 'authorization_pending',
    related_id: created._id,
  });

  return res.status(201).json(serializeDocument(created));
});

export const approveAuthorization = asyncHandler(async (req, res) => {
  const requestId = toObjectId(req.params.request_id, 'request_id');
  const reviewerId = toObjectId(req.body.reviewer_id, 'reviewer_id');

  const existing = await AuthorizationRequest.findById(requestId);
  if (!existing) return res.status(404).json({ detail: 'Authorization request not found' });
  if (String(existing.organisation_id) !== String(req.user.organisation_id)) {
    return res.status(403).json({ detail: 'Access denied' });
  }

  const updated = await AuthorizationRequest.findByIdAndUpdate(
    requestId,
    {
      status: 'Approved',
      reviewed_by: reviewerId,
      review_notes: req.body.notes || null,
      reviewed_at: new Date(),
    },
    { new: true }
  );

  if (!updated) return res.status(404).json({ detail: 'Authorization request not found' });

  await createNotification({
    recipient_id: updated.requested_by,
    title: 'Authorization Approved',
    message: 'Your authorization request has been approved.',
    type: 'authorization_approved',
    related_id: updated._id,
  });

  return res.json(serializeDocument(updated));
});

export const rejectAuthorization = asyncHandler(async (req, res) => {
  const requestId = toObjectId(req.params.request_id, 'request_id');
  const reviewerId = toObjectId(req.body.reviewer_id, 'reviewer_id');

  const existing = await AuthorizationRequest.findById(requestId);
  if (!existing) return res.status(404).json({ detail: 'Authorization request not found' });
  if (String(existing.organisation_id) !== String(req.user.organisation_id)) {
    return res.status(403).json({ detail: 'Access denied' });
  }

  const updated = await AuthorizationRequest.findByIdAndUpdate(
    requestId,
    {
      status: 'Rejected',
      reviewed_by: reviewerId,
      review_notes: req.body.notes || null,
      reviewed_at: new Date(),
    },
    { new: true }
  );

  if (!updated) return res.status(404).json({ detail: 'Authorization request not found' });

  await createNotification({
    recipient_id: updated.requested_by,
    title: 'Authorization Rejected',
    message: 'Your authorization request has been rejected.',
    type: 'authorization_rejected',
    related_id: updated._id,
  });

  return res.json(serializeDocument(updated));
});

export const overrideAuthorization = asyncHandler(async (req, res) => {
  const requestId = toObjectId(req.params.request_id, 'request_id');
  const reviewerId = toObjectId(req.body.partner_id, 'partner_id');

  const existing = await AuthorizationRequest.findById(requestId);
  if (!existing) return res.status(404).json({ detail: 'Authorization request not found' });
  if (String(existing.organisation_id) !== String(req.user.organisation_id)) {
    return res.status(403).json({ detail: 'Access denied' });
  }

  const updated = await AuthorizationRequest.findByIdAndUpdate(
    requestId,
    {
      status: 'Overridden',
      reviewed_by: reviewerId,
      review_notes: req.body.notes || null,
      reviewed_at: new Date(),
    },
    { new: true }
  );

  if (!updated) return res.status(404).json({ detail: 'Authorization request not found' });

  await createNotification({
    recipient_id: updated.requested_by,
    title: 'Authorization Overridden',
    message: 'A partner override was applied to your authorization request.',
    type: 'authorization_overridden',
    related_id: updated._id,
  });

  return res.json(serializeDocument(updated));
});

export const listOrganizationMembers = asyncHandler(async (req, res) => {
  const { organisation } = await assertOrgAdmin(req.user);

  const members = (organisation.members || []).filter((m) => m.status !== 'revoked');

  const results = [];
  for (const m of members) {
    const admin = await Admin.findOne({ email: m.email, organisation_id: organisation._id }).lean();
    results.push({
      id: m._id?.toString(),
      staff_id: m.staff_id?.toString() || null,
      email: m.email,
      name: admin?.name || m.name,
      phone: admin?.phone || null,
      profile_picture_url: admin?.profile_picture_url || null,
      role: m.role,
      role_title: admin?.role_title || null,
      status: m.status,
      accepted_at: m.accepted_at,
      invited_at: m.invited_at,
    });
  }
  return res.json(results);
});

export const listOrganizationInvites = asyncHandler(async (req, res) => {
  const { organisation } = await assertOrgAdmin(req.user);

  const rows = await AuthToken.find({
    token_kind: 'invite_admin',
    organisation_id: organisation._id,
  }).sort({ created_at: -1 });

  return res.json(serializeList(rows));
});

export const inviteOrganizationAdmin = asyncHandler(async (req, res) => {
  const { organisation } = await assertOrgAdmin(req.user);
  const { email, role } = req.body || {};
  const accessLevel = mapRoleToAccessLevel(role);

  if (!email) {
    return res.status(400).json({ detail: 'email is required' });
  }
  if (!(await checkAdminSeatLimitByOrganisationId(res, organisation._id))) {
    return;
  }

  const normalizedInviteEmail = normalizedEmail(email);

  // New invite always revokes previous active invite token(s) for same org/email/role.
  await AuthToken.updateMany(
    {
      token_kind: 'invite_admin',
      organisation_id: organisation._id,
      email: normalizedInviteEmail,
      invite_role: accessLevel,
      status: 'active',
    },
    {
      $set: { status: 'revoked', revoked_at: new Date() },
    }
  );

  const invite = issueInviteToken({ email: normalizedInviteEmail, organisationId: organisation._id, inviteRole: accessLevel });

  const created = await AuthToken.create({
    token_kind: 'invite_admin',
    jwt_id: invite.jti,
    organisation_id: organisation._id,
    email: normalizedInviteEmail,
    invite_role: accessLevel,
    role_title: role || null,
    status: 'active',
    issued_by_staff_id: req.user._id,
    expires_at: invite.expiresAt,
  });

  let emailQueued = false;
  let emailJobId = null;
  let emailError = null;
  try {
    const job = await enqueueOrgAdminInviteEmailJob({
      authTokenId: created._id,
      organisationId: organisation._id,
      email: normalizedInviteEmail,
      token: invite.token,
      invitedByName: req.user?.name || 'Organisation admin',
      organisationName: organisation.firm_name,
    });
    emailQueued = true;
    emailJobId = String(job.id || '');
  } catch (error) {
    emailError = error.message || 'Failed to queue email delivery';
    console.warn(`[inviteOrganizationAdmin] Failed to queue invite email for ${normalizedInviteEmail}: ${emailError}`);
  }

  return res.status(201).json({
    message: emailQueued ? 'Admin invite queued' : 'Admin invite created but email queue failed',
    email_queued: emailQueued,
    email_job_id: emailJobId,
    email_error: emailError,
    invite: serializeDocument(created),
  });
});

export const revokeOrganizationInvite = asyncHandler(async (req, res) => {
  const { organisation } = await assertOrgAdmin(req.user);
  const inviteId = toObjectId(req.params.invite_id, 'invite_id');

  const invite = await AuthToken.findOne({
    _id: inviteId,
    token_kind: 'invite_admin',
    organisation_id: organisation._id,
  });
  if (!invite) return res.status(404).json({ detail: 'Invite not found' });

  if (invite.status === 'active') {
    invite.status = 'revoked';
    invite.revoked_at = new Date();
    await invite.save();
  }

  return res.json({ message: 'Invite revoked' });
});
