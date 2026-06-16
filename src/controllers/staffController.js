import crypto from 'node:crypto';
import Staff from '../models/Staff.js';
import OrganisationMembership from '../models/OrganisationMembership.js';
import Allocation from '../models/Allocation.js';
import TimeEntry from '../models/TimeEntry.js';
import AuthToken from '../models/AuthToken.js';
import { signJwt } from '../utils/jwt.js';
import { toObjectId } from '../utils/objectId.js';
import { checkPlanLimit } from '../services/planLimitService.js';
import { hashPassword } from '../utils/password.js';
import { validatePasswordStrength } from '../utils/passwordPolicy.js';
import { serializeDocument, serializeList } from '../utils/serialize.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { parsePagination, buildPaginationMeta } from '../utils/pagination.js';
import {
  enqueueStaffWelcomeEmailJob,
  enqueueStaffWelcomeResendJob,
} from '../jobs/emailQueue.js';
import { getAllocationCoverage } from '../services/workComponentService.js';
import { ensureStaffMembership } from '../services/staffMembershipService.js';
import { listStaffMonthlySummaries } from '../services/staffMonthlySummaryService.js';
import { normalizeWorkComponentKey, round } from '../services/planningService.js';

const PURPOSE_SECRET = process.env.JWT_PURPOSE_SECRET || process.env.JWT_SECRET;
const DEFAULT_PENDING_STAFF_NAME = 'Pending Staff';
const DEFAULT_TEMP_PASSWORD = process.env.STAFF_IMPORT_DEFAULT_PASSWORD || 'ChangeMe123!';

const getCurrentMonth = () => {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
};

const sanitizeStaff = (item) => {
  const next = { ...item };
  delete next.passwordHash;
  delete next.password_hash;
  return next;
};

const normalizeEmail = (value = '') => String(value).toLowerCase().trim();

const generateProductionTemporaryPassword = () => String(crypto.randomInt(10000000, 100000000));

const generateTemporaryPassword = () => {
  if (process.env.NODE_ENV === 'production') {
    return generateProductionTemporaryPassword();
  }
  return DEFAULT_TEMP_PASSWORD;
};

const getPreferredNameFromEmail = (email = '') => {
  const local = String(email).split('@')[0] || '';
  const cleaned = local.replace(/[._-]+/g, ' ').trim();
  if (!cleaned) return DEFAULT_PENDING_STAFF_NAME;
  return cleaned
    .split(' ')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
    .slice(0, 80);
};

const hasStaffOrgAccess = async (staff, organisationId) => {
  if (!staff || !organisationId) return false;
  if (String(staff.organisation_id || '') === String(organisationId || '')) return true;
  const membership = await OrganisationMembership.findOne({
    organisation_id: organisationId,
    staff_id: staff._id,
    status: 'active',
  })
    .select('_id')
    .lean();
  return Boolean(membership);
};

export const listStaff = asyncHandler(async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query);
  const membershipRows = await OrganisationMembership.find({
    organisation_id: req.user.organisation_id,
    status: 'active',
  })
    .select('staff_id')
    .lean();
  const membershipStaffIds = membershipRows.map((row) => row.staff_id).filter(Boolean);
  const filterConditions = [
    { $or: [
      { organisation_id: req.user.organisation_id },
      membershipStaffIds.length > 0 ? { _id: { $in: membershipStaffIds } } : { _id: null },
    ]},
  ];
  if (req.query.search) {
    const escaped = req.query.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    filterConditions.push({
      $or: [
        { name: { $regex: escaped, $options: 'i' } },
        { email: { $regex: escaped, $options: 'i' } },
        { role: { $regex: escaped, $options: 'i' } },
      ],
    });
  }
  if (req.query.archived === 'true') {
    filterConditions.push({ is_archived: true });
  } else {
    filterConditions.push({ is_archived: { $ne: true } });
  }
  const tenantFilter = filterConditions.length > 1 ? { $and: filterConditions } : filterConditions[0];
  const [records, total] = await Promise.all([
    Staff.find(tenantFilter).sort({ createdAt: -1 }).skip(skip).limit(limit),
    Staff.countDocuments(tenantFilter),
  ]);
  res.json({ data: serializeList(records).map(sanitizeStaff), pagination: buildPaginationMeta(total, page, limit) });
});

export const getStaffById = asyncHandler(async (req, res) => {
  const _id = toObjectId(req.params.staff_id, 'staff_id');
  const record = await Staff.findById(_id);
  if (!record) return res.status(404).json({ detail: 'Staff not found' });
  const hasAccess = await hasStaffOrgAccess(record, req.user.organisation_id);
  if (!hasAccess) {
    return res.status(403).json({ detail: 'Access denied' });
  }
  return res.json(sanitizeStaff(serializeDocument(record)));
});

export const createStaff = asyncHandler(async (req, res) => {
  const body = req.body || {};
  if (!body.email) {
    return res.status(400).json({ detail: 'email is required' });
  }

  const withinLimit = await checkPlanLimit(req, res, 'users');
  if (!withinLimit) return;

  const normalizedEmail = normalizeEmail(body.email);
  const exists = await Staff.findOne({ email: normalizedEmail });

  if (exists) {
    await ensureStaffMembership({
      organisationId: req.user.organisation_id,
      staffId: exists._id,
      role: 'member',
    });

    return res.status(201).json({
      ...sanitizeStaff(serializeDocument(exists)),
      attached_existing_staff: true,
      created_new_staff: false,
      email_queued: false,
      email_sent: false,
      email_error: null,
      invite_required: false,
    });
  }

  const plainPassword = generateTemporaryPassword();
  if (process.env.NODE_ENV !== 'production') {
    const passwordValidation = validatePasswordStrength(plainPassword, { email: normalizedEmail });
    if (passwordValidation) {
      return res.status(500).json({ detail: 'Could not provision a temporary password. Please retry.' });
    }
  }
  const hashed = await hashPassword(plainPassword);
  const pendingName = body.name?.trim() || getPreferredNameFromEmail(normalizedEmail);

  const created = await Staff.create({
    name: pendingName,
    email: normalizedEmail,
    passwordHash: hashed,
    role: body.role,
    access_level: body.access_level,
    hourly_rate: body.hourly_rate,
    available_hours_per_month: body.available_hours_per_month,
    productivity_factor: body.productivity_factor,
    efficiency: body.efficiency,
    annual_fee_budget: body.annual_fee_budget,
    annual_budgeted_hours: body.annual_budgeted_hours,
    phone: body.phone,
    manager_id: body.manager_id,
    supervisor_ids: body.supervisor_ids,
    department_ids: body.department_ids,
    department_id: body.department_id,
    is_active: false,
    is_archived: body.is_archived,
    can_delete: body.can_delete,
    mustChangePassword: true,
    organisation_id: req.user.organisation_id,
    created_by: req.user._id,
  });

  await ensureStaffMembership({
    organisationId: req.user.organisation_id,
    staffId: created._id,
    role: 'member',
  });

  // Issue invite_staff token (48h) so staff can activate their account
  let acceptLink = null;
  let inviteTokenDoc = null;
  try {
    const jti = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000);
    const inviteToken = signJwt(
      { sub: created._id.toString(), purpose: 'invite_staff', email: created.email, jti, organisation_id: String(req.user.organisation_id) },
      { secret: PURPOSE_SECRET, expiresIn: '48h' }
    );
    inviteTokenDoc = await AuthToken.create({
      token_kind: 'invite_staff',
      jwt_id: jti,
      staff_id: created._id,
      organisation_id: req.user.organisation_id,
      email: created.email,
      status: 'active',
      expires_at: expiresAt,
      issued_by_admin_id: req.user._id,
    });
    const base = String(process.env.APP_BASE_URL || '').replace(/\/$/, '');
    acceptLink = `${base}/auth/login?staff_invite=true&token=${encodeURIComponent(inviteToken)}`;
  } catch (err) {
    console.warn(`[createStaff] Failed to issue invite token for ${created.email}: ${err.message}`);
  }

  let emailQueued = false;
  let emailJobId = null;
  let emailError = null;
  try {
    const job = await enqueueStaffWelcomeEmailJob({
      staffId: created._id,
      organisationId: req.user.organisation_id,
      password: plainPassword,
      acceptLink,
      inviteTokenId: inviteTokenDoc?._id || null,
    });
    emailQueued = true;
    emailJobId = String(job.id || '');
    created.welcome_email_error = null;
    created.welcome_email_error_at = null;
    await created.save();
  } catch (err) {
    emailError = err.message || 'Failed to queue email delivery';
    try {
      created.welcome_email_error = emailError;
      created.welcome_email_error_at = new Date();
      await created.save();
    } catch { /* ignore secondary save failure */ }
    console.warn(`[createStaff] Failed to queue welcome email for ${created.email}: ${emailError}`);
  }

  return res.status(201).json({
    ...sanitizeStaff(serializeDocument(created)),
    attached_existing_staff: false,
    created_new_staff: true,
    email_queued: emailQueued,
    email_job_id: emailJobId,
    email_sent: false,
    email_error: emailError,
    invite_required: true,
  });
});

export const updateStaff = asyncHandler(async (req, res) => {
  const _id = toObjectId(req.params.staff_id, 'staff_id');
  const body = { ...req.body };

  const existing = await Staff.findById(_id);
  if (!existing) return res.status(404).json({ detail: 'Staff not found' });
  const hasAccess = await hasStaffOrgAccess(existing, req.user.organisation_id);
  if (!hasAccess) {
    return res.status(403).json({ detail: 'Access denied' });
  }

  if (body.email) {
    body.email = String(body.email).toLowerCase().trim();
  }

  if (body.password) {
    const passwordValidation = validatePasswordStrength(body.password, { email: body.email });
    if (passwordValidation) return res.status(400).json({ detail: passwordValidation });

    body.passwordHash = await hashPassword(body.password);
    delete body.password;
  }

  const updated = await Staff.findByIdAndUpdate(_id, body, { new: true, runValidators: true });
  if (!updated) return res.status(404).json({ detail: 'Staff not found' });

  return res.json(sanitizeStaff(serializeDocument(updated)));
});

export const deleteStaff = asyncHandler(async (req, res) => {
  const _id = toObjectId(req.params.staff_id, 'staff_id');
  const existing = await Staff.findById(_id);
  if (!existing) return res.status(404).json({ detail: 'Staff not found' });
  const hasAccess = await hasStaffOrgAccess(existing, req.user.organisation_id);
  if (!hasAccess) {
    return res.status(403).json({ detail: 'Access denied' });
  }
  const deleted = await Staff.findByIdAndDelete(_id);
  if (!deleted) return res.status(404).json({ detail: 'Staff not found' });
  return res.json({ message: 'Staff deleted', id: _id.toString(), _id: _id.toString() });
});

export const archiveStaff = asyncHandler(async (req, res) => {
  const _id = toObjectId(req.params.staff_id, 'staff_id');
  const existing = await Staff.findById(_id);
  if (!existing) return res.status(404).json({ detail: 'Staff not found' });
  const hasAccess = await hasStaffOrgAccess(existing, req.user.organisation_id);
  if (!hasAccess) {
    return res.status(403).json({ detail: 'Access denied' });
  }

  existing.is_archived = true;
  existing.is_active = false;
  await existing.save();

  return res.json({
    message: 'Staff archived',
    data: sanitizeStaff(serializeDocument(existing)),
  });
});

export const restoreStaff = asyncHandler(async (req, res) => {
  const _id = toObjectId(req.params.staff_id, 'staff_id');
  const existing = await Staff.findById(_id);
  if (!existing) return res.status(404).json({ detail: 'Staff not found' });
  const hasAccess = await hasStaffOrgAccess(existing, req.user.organisation_id);
  if (!hasAccess) {
    return res.status(403).json({ detail: 'Access denied' });
  }

  existing.is_archived = false;
  existing.is_active = true;
  await existing.save();

  return res.json({
    message: 'Staff restored',
    data: sanitizeStaff(serializeDocument(existing)),
  });
});

/**
 * GET /staff/:staff_id/monthly-summary?month=YYYY-MM
 * Returns all active allocations for the staff member in the given month,
 * alongside capacity and utilization metrics (mirrors the Excel per-person sheet).
 */
export const resendWelcomeEmail = asyncHandler(async (req, res) => {
  const _id = toObjectId(req.params.staff_id, 'staff_id');
  const staff = await Staff.findById(_id);
  if (!staff) return res.status(404).json({ detail: 'Staff not found' });
  const hasAccess = await hasStaffOrgAccess(staff, req.user.organisation_id);
  if (!hasAccess) {
    return res.status(403).json({ detail: 'Access denied' });
  }

  // Auto-generate a new secure password
  const newPassword = crypto.randomBytes(9).toString('base64url'); // 12-char URL-safe
  staff.passwordHash = await hashPassword(newPassword);
  staff.mustChangePassword = true;
  staff.welcome_email_error = null;
  staff.welcome_email_error_at = null;
  await staff.save();

  let emailQueued = false;
  let emailJobId = null;
  let emailError = null;
  try {
    const job = await enqueueStaffWelcomeResendJob({
      staffId: staff._id,
      organisationId: req.user.organisation_id,
      password: newPassword,
    });
    emailQueued = true;
    emailJobId = String(job.id || '');
  } catch (err) {
    emailError = err.message || 'Failed to queue email delivery';
    staff.welcome_email_error = emailError;
    staff.welcome_email_error_at = new Date();
    await staff.save();
    console.warn(`[resendWelcomeEmail] Failed to queue for ${staff.email}: ${emailError}`);
  }

  return res.json({
    message: emailQueued ? 'Welcome email queued successfully' : 'Failed to queue welcome email',
    email_queued: emailQueued,
    email_job_id: emailJobId,
    email_sent: false,
    email_error: emailError,
  });
});

export const getStaffMonthlySummary = asyncHandler(async (req, res) => {
  const _id = toObjectId(req.params.staff_id, 'staff_id');
  const month = String(req.query.month || '').trim() || getCurrentMonth();

  if (!/^\d{4}-\d{2}$/.test(month)) {
    return res.status(400).json({ detail: 'month must be in YYYY-MM format' });
  }

  const staff = await Staff.findById(_id);
  if (!staff) return res.status(404).json({ detail: 'Staff not found' });
  const hasAccess = await hasStaffOrgAccess(staff, req.user.organisation_id);
  if (!hasAccess) {
    return res.status(403).json({ detail: 'Access denied' });
  }
  if (!req.admin && String(req.user?._id || '') !== String(_id)) {
    return res.status(403).json({ detail: 'Access denied' });
  }

  const allocations = await Allocation.find({ staff_id: _id, organisation_id: req.user.organisation_id, month, status: 'active' })
    .populate('job_id', 'name client_name job_type_label job_fee pricing_override budgeted_wip status deadline')
    .lean();

  const productivity = Number(staff.productivity_factor || 0.8);
  const efficiency = Number(staff.efficiency || 1);
  const hourlyRate = Number(staff.hourly_rate || 0);
  const availableHours = Number(staff.available_hours_per_month || 160);
  const capacityHours = round(availableHours * productivity, 2);
  const allocationIds = allocations.map((allocation) => allocation._id).filter(Boolean);
  const logRows = allocationIds.length > 0
    ? await TimeEntry.aggregate([
      { $match: { allocation_id: { $in: allocationIds } } },
      {
        $group: {
          _id: '$allocation_id',
          total_logged_hours: { $sum: '$hours_worked' },
        },
      },
    ])
    : [];
  const logHoursByAllocationId = new Map(
    logRows.map((row) => [String(row._id), Number(row.total_logged_hours || 0)]),
  );

  const serializedAllocations = allocations.map((a) => ({
    allocation_id: a._id.toString(),
    staff_id: a.staff_id?.toString?.() || _id.toString(),
    job_id: a.job_id?._id?.toString() || a.job_id?.toString() || null,
    job_name: a.job_id?.name || 'Unknown',
    client_name: a.job_id?.client_name || 'Unknown',
    job_type_label: a.job_id?.job_type_label || '',
    job_fee: Number(a.job_id?.job_fee || 0),
    job_budgeted_wip: Number(a.job_id?.budgeted_wip || 0),
    allocation_status: a.job_id?.status || null,
    job_status: a.job_id?.status || null,
    deadline: a.job_id?.deadline || null,
    work_component_key: a.work_component_key ? normalizeWorkComponentKey(a.work_component_key) : null,
    percentage: Number(a.percentage || 0),
    allocated_fee: Number(a.allocated_fee || 0),
    calculated_hours: Number(a.calculated_hours || 0),
    adjusted_hours: Number(a.adjusted_hours || 0),
    status: a.status,
    workflow_status: a.workflow_status || 'Pending',
    started_at: a.started_at || null,
    completed_at: a.completed_at || null,
    started_timezone: a.started_timezone || null,
    completed_timezone: a.completed_timezone || null,
    assigned_to_started_minutes: a.assigned_to_started_minutes ?? null,
    started_to_completed_minutes: a.started_to_completed_minutes ?? null,
    total_logged_hours: round(logHoursByAllocationId.get(String(a._id)) || 0, 2),
    notes: a.notes || null,
  }));

  const totalAllocatedFee = round(
    serializedAllocations.reduce((s, a) => s + a.allocated_fee, 0),
    2,
  );
  const totalScheduledHours = round(
    serializedAllocations.reduce((s, a) => s + a.adjusted_hours, 0),
    2,
  );
  const remainingCapacity = round(Math.max(0, capacityHours - totalScheduledHours), 2);
  const utilizationPercentage = round(
    capacityHours > 0 ? (totalScheduledHours / capacityHours) * 100 : 0,
    1,
  );
  const seenJobKeys = new Set();
  let jobFeeTotal = 0;
  let budgetedWipTotal = 0;
  let budgetedHoursTotal = 0;
  let loggedHoursTotal = 0;

  for (const allocation of serializedAllocations) {
    const jobKey = String(
      allocation.job_id
      || `${allocation.client_name || ''}::${allocation.job_name || ''}`,
    );
    const computedFee = allocation.job_fee * (Number(allocation.percentage || 0) / 100);
    const fee = Number(allocation.allocated_fee ?? computedFee);
    const budgetedHours = hourlyRate > 0 ? (fee * efficiency) / hourlyRate : 0;
    const budgetedWip = hourlyRate * budgetedHours;

    if (!seenJobKeys.has(jobKey)) {
      seenJobKeys.add(jobKey);
      jobFeeTotal += Number(allocation.job_fee || 0);
    }

    budgetedWipTotal += budgetedWip;
    budgetedHoursTotal += budgetedHours;
    loggedHoursTotal += Number(allocation.total_logged_hours || 0);
  }

  const uniqueJobIds = [...new Set(serializedAllocations.map((a) => a.job_id).filter(Boolean))];
  const requiredComponentsByJobEntries = await Promise.all(
    uniqueJobIds.map(async (jobId) => {
      try {
        const coverage = await getAllocationCoverage(jobId);
        const keys = (coverage?.requiredRoles || [])
          .map((r) => r?.key)
          .filter(Boolean);
        return [jobId, keys];
      } catch {
        return [jobId, []];
      }
    }),
  );
  const requiredComponentsByJob = Object.fromEntries(requiredComponentsByJobEntries);

  return res.json({
    staff_id: _id.toString(),
    staff_name: staff.name,
    role: staff.role,
    month,
    hourly_rate: hourlyRate,
    productivity_factor: productivity,
    efficiency,
    allocations: serializedAllocations,
    required_components_by_job: requiredComponentsByJob,
    derived_totals: {
      job_fee_total: round(jobFeeTotal, 2),
      budgeted_wip_total: round(budgetedWipTotal, 2),
      budgeted_hours_total: round(budgetedHoursTotal, 2),
      logged_hours_total: round(loggedHoursTotal, 2),
    },
    summary: {
      total_allocations: serializedAllocations.length,
      total_allocated_fee: totalAllocatedFee,
      total_scheduled_hours: totalScheduledHours,
      capacity_hours: capacityHours,
      remaining_capacity: remainingCapacity,
      utilization_percentage: utilizationPercentage,
    },
  });
});

export const listStaffMonthlySummaryRows = asyncHandler(async (req, res) => {
  const month = String(req.query.month || '').trim() || getCurrentMonth();
  const staffId = req.admin
    ? (String(req.query.staff_id || '').trim() || null)
    : String(req.user?._id || '').trim() || null;

  if (!/^\d{4}-\d{2}$/.test(month)) {
    return res.status(400).json({ detail: 'month must be in YYYY-MM format' });
  }

  const data = await listStaffMonthlySummaries(req.user.organisation_id, {
    month,
    staffId,
  });

  return res.json(data);
});
