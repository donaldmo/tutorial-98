import Allocation from '../models/Allocation.js';
import Client from '../models/Client.js';
import Job from '../models/Job.js';
import JobType from '../models/JobType.js';
import Staff from '../models/Staff.js';
import OrganisationMembership from '../models/OrganisationMembership.js';
import TimeEntry from '../models/TimeEntry.js';
import { toObjectId } from '../utils/objectId.js';
import { serializeDocument, serializeList } from '../utils/serialize.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { calculateAllocationMetrics, normalizeWorkComponentService, round } from '../services/planningService.js';
import { parsePagination, buildPaginationMeta } from '../utils/pagination.js'; // Group 4 – Task 4.2
import { canActOnStaff } from '../middleware/auth.js';
import {
  validateAllocationMatchesWorkComponents,
  validateAllocationTotalPercentage,
  getAllocationCoverage,
  syncJobWorkflowStatus,
} from '../services/workComponentService.js';
import {
  appendAllocationSnapshotVersion,
  appendDraftFromLastCompletedSnapshot,
} from '../services/allocationSnapshotService.js';
import { sendAllocationNotificationEmail, sendAllocationAcceptanceNotification } from '../services/allocationEmailService.js';
import { createNotification } from './notificationsController.js';
import { getStaffCapacity } from '../services/capacityService.js';
import { recordJobCompletionEfficiency } from '../services/jobEfficiencyService.js';

const getCurrentMonth = () => {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
};

const MONTH_VALUE_PATTERN = /^\d{4}-\d{2}$/;
const COMPLETED_JOB_LOCK_DETAIL = 'This job is completed and locked. Allocations and time entries can no longer be changed.';
const OVER_CAPACITY_THRESHOLD = 90;

const normalizeWarnings = (warnings = [], defaultCode = 'ALLOCATION_WARNING') => {
  if (!Array.isArray(warnings)) return [];
  return warnings
    .map((item) => {
      if (!item) return null;
      if (typeof item === 'string') {
        return { code: defaultCode, message: item };
      }
      if (typeof item === 'object') {
        return {
          code: item.code || defaultCode,
          message: item.message || String(item.detail || 'Warning'),
          ...item,
        };
      }
      return { code: defaultCode, message: String(item) };
    })
    .filter(Boolean);
};

const mergeWarnings = (...warningArrays) => warningArrays.flatMap((warnings) => normalizeWarnings(warnings));

const sendAllocationEmailWithWarning = async ({
  allocation,
  job,
  staff,
  actorName,
  organisationId,
  variant,
  previousStaffName = null,
}) => {
  try {
    const result = await sendAllocationNotificationEmail({
      allocation,
      job,
      staff,
      actorName,
      organisationId,
      variant,
      previousStaffName,
    });
    return result?.warning ? [result.warning] : [];
  } catch (error) {
    return [{
      code: 'ALLOCATION_EMAIL_SEND_FAILED',
      message: 'Allocation saved but notification email could not be delivered.',
      allocationId: allocation?._id ? String(allocation._id) : null,
      staffId: staff?._id ? String(staff._id) : null,
      reason: 'unexpected_error',
      error: error?.message || 'Unknown email error',
    }];
  }
};

const createAllocationNotificationWithWarning = async ({
  allocation,
  job,
  staff,
  organisationId,
  type,
  title,
  message,
}) => {
  try {
    await createNotification({
      userId: staff?._id,
      organisationId,
      type,
      title,
      message,
      relatedJobId: job?._id,
      relatedAllocationId: allocation?._id,
    });
    return [];
  } catch (err) {
    return [{
      code: 'ALLOCATION_NOTIFICATION_CREATE_FAILED',
      message: 'Allocation saved but in-app notification could not be created.',
      allocationId: allocation?._id ? String(allocation._id) : null,
      staffId: staff?._id ? String(staff._id) : null,
      reason: err?.message || 'unknown',
    }];
  }
};

const buildAllocationNotificationMessage = ({
  variant = 'assigned',
  job,
  allocation,
  percentage,
  adjustedHours,
  actorName,
  previousStaffName = null,
}) => {
  const lines = [];
  const normalizedPct = Number.isFinite(Number(percentage)) ? Number(percentage).toFixed(2) : null;
  const normalizedHours = Number.isFinite(Number(adjustedHours)) ? Number(adjustedHours).toFixed(2) : null;

  if (variant === 'reassigned') {
    lines.push(`You have been reassigned to ${job?.name || 'a job'} (${job?.client_name || 'Unknown client'}).`);
  } else {
    lines.push(`You have been assigned to ${job?.name || 'a job'} (${job?.client_name || 'Unknown client'}).`);
  }

  if (job?.job_type_label) lines.push(`Service: ${job.job_type_label}`);
  if (allocation?.month) lines.push(`Month: ${allocation.month}`);
  if (normalizedPct !== null) lines.push(`Allocation: ${normalizedPct}%`);
  if (normalizedHours !== null) lines.push(`Planned hours: ${normalizedHours}h`);
  if (job?.deadline) {
    const parsedDeadline = new Date(job.deadline);
    if (!Number.isNaN(parsedDeadline.getTime())) {
      lines.push(`Deadline: ${parsedDeadline.toISOString().slice(0, 10)}`);
    }
  }
  if (allocation?.work_component_key) lines.push(`Component: ${allocation.work_component_key}`);
  if (allocation?.notes) lines.push(`Notes: ${allocation.notes}`);
  if (previousStaffName && variant === 'reassigned') lines.push(`Previously assigned to: ${previousStaffName}`);
  if (actorName) lines.push(`Assigned by: ${actorName}`);

  return lines.join('\n');
};

const assertJobMutable = (job) => {
  if (String(job?.status || '').toLowerCase() === 'completed') {
    return {
      ok: false,
      detail: COMPLETED_JOB_LOCK_DETAIL,
    };
  }

  return { ok: true };
};

const hasOrgAccess = (record, organisationId) => String(record?.organisation_id || '') === String(organisationId || '');

const canViewAllocationForRequest = async (req, allocation) => {
  if (req.admin) return true;
  return canActOnStaff(req.user, allocation?.staff_id);
};

const hasActiveStaffMembership = async (staffId, organisationId) => {
  const membership = await OrganisationMembership.findOne({
    staff_id: staffId,
    organisation_id: organisationId,
    status: 'active',
  })
    .select('_id')
    .lean();
  return Boolean(membership);
};

const assertStaffOrgAccess = async (staff, organisationId) => {
  if (!staff) return false;
  if (hasOrgAccess(staff, organisationId)) return true;
  return hasActiveStaffMembership(staff._id, organisationId);
};

const ensureAllocationJobMutable = async (allocation, organisationId) => {
  const job = await Job.findById(allocation.job_id);
  if (!job) {
    return { ok: false, status: 404, detail: 'Job not found' };
  }
  if (!hasOrgAccess(job, organisationId)) {
    return { ok: false, status: 403, detail: 'Access denied' };
  }

  const mutable = assertJobMutable(job);
  if (!mutable.ok) {
    return { ok: false, status: 422, detail: mutable.detail };
  }

  return { ok: true, job };
};

const toDateOrNow = (value) => {
  if (!value) return new Date();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const diffMinutes = (fromDate, toDate) => {
  if (!fromDate || !toDate) return null;
  const ms = new Date(toDate).getTime() - new Date(fromDate).getTime();
  if (Number.isNaN(ms)) return null;
  return Math.max(0, Math.round(ms / 60000));
};

const roundNumber = (value, digits = 2) => {
  const numeric = Number(value);
  if (Number.isNaN(numeric)) return 0;
  return Number(numeric.toFixed(digits));
};

const getOverCapacitySnapshot = async ({
  staffId,
  month,
  organisationId,
  additionalHours,
  excludeAllocationId = null,
}) => {
  const allocationQuery = {
    staff_id: staffId,
    month,
    status: 'active',
    organisation_id: organisationId,
  };
  if (excludeAllocationId) {
    allocationQuery._id = { $ne: excludeAllocationId };
  }

  const [capacitySnapshot, monthAllocations] = await Promise.all([
    getStaffCapacity(staffId, month),
    Allocation.find(allocationQuery).select('adjusted_hours'),
  ]);

  const existingHours = monthAllocations.reduce((sum, row) => sum + Number(row.adjusted_hours || 0), 0);
  const projectedHours = existingHours + Number(additionalHours || 0);
  const effectiveCapacity = Number(capacitySnapshot?.effective_capacity_hours || 0);
  const projectedUtilization = effectiveCapacity > 0 ? (projectedHours / effectiveCapacity) * 100 : 0;

  return {
    is_over_capacity: projectedUtilization >= OVER_CAPACITY_THRESHOLD,
    over_capacity_utilization_percentage: roundNumber(projectedUtilization, 1),
    over_capacity_projected_hours: roundNumber(projectedHours, 2),
    over_capacity_effective_capacity_hours: roundNumber(effectiveCapacity, 2),
    over_capacity_threshold: OVER_CAPACITY_THRESHOLD,
  };
};

const syncJobAllocationPercentage = async (jobId, targetMonth) => {
  if (!jobId) return;
  const job = await Job.findById(jobId);
  if (!job) return;

  if (targetMonth) {
    const monthRows = await Allocation.aggregate([
      { $match: { job_id: jobId, month: targetMonth, status: 'active' } },
      { $group: { _id: '$job_id', total: { $sum: '$percentage' } } },
    ]);
    const pct = monthRows[0]?.total || 0;
    const mStatus = pct >= 100 ? 'Fully Allocated' : pct > 0 ? 'Partially Allocated' : 'Pending';
    job.monthly_allocations.set(targetMonth, { allocated_percentage: pct, status: mStatus });
  }

  // total_allocated_percentage = max per-month percentage (not cross-month sum)
  let maxPct = 0;
  if (job.monthly_allocations && job.monthly_allocations.size > 0) {
    for (const entry of job.monthly_allocations.values()) {
      if (entry && entry.allocated_percentage > maxPct) {
        maxPct = entry.allocated_percentage;
      }
    }
  }
  job.total_allocated_percentage = maxPct;

  // updateAllocationStatus recalculates unified status and calls this.save()
  await job.updateAllocationStatus();
  await job.save();
  await syncJobWorkflowStatus(jobId);
};

export const listAllocations = asyncHandler(async (req, res) => {
  const query = { organisation_id: req.user.organisation_id };

  const statusFilter = typeof req.query.status === 'string' ? req.query.status.trim().toLowerCase() : '';
  if (statusFilter === 'active' || statusFilter === 'inactive') {
    query.status = statusFilter;
  } else if (statusFilter !== 'all') {
    query.status = 'active';
  }

  if (req.query.job_id) query.job_id = toObjectId(req.query.job_id, 'job_id');
  if (!req.admin) {
    query.staff_id = req.user._id;
  } else if (req.query.staff_id) {
    query.staff_id = toObjectId(req.query.staff_id, 'staff_id');
  }
  if (req.query.month) query.month = String(req.query.month);
  if (req.query.is_recurring !== undefined) {
    const isRecurring = req.query.is_recurring === 'true'
    const jobMatch = { organisation_id: req.user.organisation_id }
    if (isRecurring) {
      jobMatch.is_recurring = true
    } else {
      jobMatch.$or = [
        { is_recurring: false },
        { is_recurring: { $exists: false } },
      ]
    }
    const matchingJobs = await Job.find(jobMatch, { _id: 1 }).lean()
    query.job_id = { $in: matchingJobs.map(j => j._id) }
  }

  if (req.query.overCapacity !== undefined) {
    const overCapacityValue = String(req.query.overCapacity).trim().toLowerCase();
    if (['true', '1', 'yes'].includes(overCapacityValue)) {
      query.is_over_capacity = true;
    } else if (['false', '0', 'no'].includes(overCapacityValue)) {
      query.is_over_capacity = false;
    }
  }

  const { page, limit, skip } = parsePagination(req.query);
  const [records, total] = await Promise.all([
    Allocation.find(query)
      .sort({ created_at: -1 })
      .skip(skip)
      .limit(limit)
      .populate('job_id', 'name client_name job_type_label status is_recurring recurrence_type job_fee')
      .populate('staff_id', 'name role'),
    Allocation.countDocuments(query),
  ]);

  const allocationIds = records.map((record) => record._id).filter(Boolean);
  const logRanges = allocationIds.length > 0
    ? await TimeEntry.aggregate([
      { $match: { allocation_id: { $in: allocationIds } } },
      {
        $group: {
          _id: '$allocation_id',
          first_log_start_at: { $min: '$start_time' },
          latest_log_end_at: { $max: '$end_time' },
          total_logged_hours: { $sum: '$hours_worked' },
        },
      },
    ])
    : [];
  const logRangeMap = new Map(logRanges.map((row) => [String(row._id), row]));

  const data = records.map((alloc) => {
    const raw = serializeDocument(alloc);
    const logRange = logRangeMap.get(String(alloc._id));
    return {
      ...raw,
      // Denormalized job fields
      job_name: alloc.job_id?.name || raw.job_id || '',
      client_name: alloc.job_id?.client_name || '',
      job_type: alloc.job_id?.job_type_label || '',
      allocation_status: alloc.job_id?.status || null,
      job_status: alloc.job_id?.status || null,
      job_fee: Number(alloc.job_id?.job_fee || 0),
      is_recurring: alloc.job_id?.is_recurring || false,
      recurrence_type: alloc.job_id?.recurrence_type || null,
      // Denormalized staff fields
      staff_name: alloc.staff_id?.name || raw.staff_id || '',
      staff_role: alloc.staff_id?.role || '',
      // Keep original IDs as strings
      job_id: alloc.job_id?._id?.toString() || raw.job_id,
      staff_id: alloc.staff_id?._id?.toString() || raw.staff_id,
      first_log_start_at: logRange?.first_log_start_at || null,
      latest_log_end_at: logRange?.latest_log_end_at || null,
      total_logged_hours: roundNumber(logRange?.total_logged_hours || 0, 2),
    };
  });

  res.json({ data, pagination: buildPaginationMeta(total, page, limit) });
});

export const getAllocationById = asyncHandler(async (req, res) => {
  const _id = toObjectId(req.params.allocation_id, 'allocation_id');
  const record = await Allocation.findById(_id);
  if (!record) return res.status(404).json({ detail: 'Allocation not found' });
  if (String(record.organisation_id) !== String(req.user.organisation_id)) {
    return res.status(403).json({ detail: 'Access denied' });
  }
  if (!(await canViewAllocationForRequest(req, record))) {
    return res.status(403).json({ detail: 'Access denied' });
  }

  return res.json(serializeDocument(record));
});

export const createAllocation = asyncHandler(async (req, res) => {
  const {
    job_id, staff_id, percentage, month, months, notes, work_component_key,
    custom_component, component_label, component_service, component_role, allocated_fee,
  } = req.body || {};
  // Note: percentage is intentionally NOT defaulted here - let calculateAllocationMetrics
  // determine the appropriate value (full component share if omitted)

  if (!job_id || !staff_id) {
    return res.status(400).json({ detail: 'job_id and staff_id are required' });
  }

  const jobObjectId = toObjectId(job_id, 'job_id');
  const staffObjectId = toObjectId(staff_id, 'staff_id');

  const targetMonths = Array.isArray(months) && months.length > 0
    ? months
    : [month || getCurrentMonth()];

  for (const m of targetMonths) {
    if (!MONTH_VALUE_PATTERN.test(String(m))) {
      return res.status(400).json({ detail: `Invalid month format: ${m}. Must be YYYY-MM.` });
    }
  }

  const [job, staff] = await Promise.all([Job.findById(jobObjectId), Staff.findById(staffObjectId)]);

  if (!job) return res.status(404).json({ detail: 'Job not found' });
  if (!staff) return res.status(404).json({ detail: 'Staff not found' });
  const staffHasOrgAccess = await assertStaffOrgAccess(staff, req.user.organisation_id);
  if (!hasOrgAccess(job, req.user.organisation_id) || !staffHasOrgAccess) {
    return res.status(403).json({ detail: 'Access denied' });
  }
  const mutable = assertJobMutable(job);
  if (!mutable.ok) return res.status(422).json({ detail: mutable.detail });

  const isBatch = targetMonths.length > 1;
  const results = [];
  let wasUpdate = false;

  for (const targetMonth of targetMonths) {
    // ── Custom allocation-only component path ──────────────────────
    if (custom_component) {
      if (!allocated_fee) {
        return res.status(400).json({ detail: 'allocated_fee is required for custom components' });
      }

      const effectiveJobFee = Number(job.pricing_override ?? job.job_fee ?? 0);
      const derivedPercentage = effectiveJobFee > 0
        ? round((Number(allocated_fee) / effectiveJobFee) * 100, 2)
        : 0;

      const totalValidation = await validateAllocationTotalPercentage({
        jobId: jobObjectId,
        month: targetMonth,
        newPercentage: derivedPercentage,
      });
      if (!totalValidation.valid) {
        return res.status(422).json({
          detail: 'Allocation exceeds 100% total allocation limit',
          errors: totalValidation.errors,
          warnings: totalValidation.warnings,
        });
      }

      const overCapacitySnapshot = await getOverCapacitySnapshot({
        staffId: staffObjectId,
        month: targetMonth,
        organisationId: req.user.organisation_id,
        additionalHours: 0,
      });

      const created = await Allocation.create({
        job_id: jobObjectId,
        staff_id: staffObjectId,
        percentage: derivedPercentage,
        allocated_fee: Number(allocated_fee),
        calculated_hours: 0,
        adjusted_hours: 0,
        month: targetMonth,
        notes: notes || null,
        custom_component: true,
        component_label: component_label || null,
        component_service: normalizeWorkComponentService(component_service || ''),
        component_role: component_role || null,
        workflow_status: 'Pending',
        started_at: null,
        started_by: null,
        started_timezone: null,
        completed_at: null,
        completed_by: null,
        completed_timezone: null,
        assigned_to_started_minutes: null,
        started_to_completed_minutes: null,
        organisation_id: req.user.organisation_id,
        created_by: req.user._id,
        ...overCapacitySnapshot,
      });

      await appendAllocationSnapshotVersion({
        allocation: created,
        state: 'draft',
        reason: 'create_allocation',
        createdBy: req.user?._id || null,
        job,
        staff,
        monthScoped: false,
        force: true,
      });

      await syncJobAllocationPercentage(jobObjectId, targetMonth);

      const createNotifWarning = await createAllocationNotificationWithWarning({
        allocation: created,
        job,
        staff,
        organisationId: req.user?.organisation_id,
        type: 'allocation_assigned',
        title: 'New Job Allocation (Custom Component)',
        message: buildAllocationNotificationMessage({
          variant: 'assigned',
          job,
          allocation: created,
          percentage: derivedPercentage,
          adjustedHours: 0,
          actorName: req.user?.name || req.user?.email || 'Allocation manager',
        }),
      });

      const emailWarnings = await sendAllocationEmailWithWarning({
        allocation: created,
        job,
        staff,
        actorName: req.user?.name || req.user?.email || 'Allocation manager',
        organisationId: req.user?.organisation_id,
        variant: 'assigned',
        previousStaffName: null,
      });

      const responseWarnings = mergeWarnings(emailWarnings, createNotifWarning);

      results.push({
        ...serializeDocument(created),
        calculation_details: {
          effective_job_fee: round(effectiveJobFee, 2),
          recommended_percentage: derivedPercentage,
          custom_component: true,
        },
        warnings: responseWarnings,
      });

      continue;
    }

    // ── Standard allocation path ───────────────────────────────────
    const metrics = await calculateAllocationMetrics({
      job,
      staff,
      requestedPercentage: percentage,
      workComponentKey: work_component_key || null,
    });

    // Edit mode — look for existing allocation to update instead of creating
    let existingAlloc = null;
    if (req.query.edit === 'true') {
      existingAlloc = await Allocation.findOne({
        job_id: jobObjectId,
        staff_id: staffObjectId,
        month: targetMonth,
        work_component_key: work_component_key || null,
        organisation_id: req.user.organisation_id,
      });
    }
    if (existingAlloc) wasUpdate = true;

    const totalValidation = await validateAllocationTotalPercentage({
      jobId: jobObjectId,
      month: targetMonth,
      newPercentage: metrics.percentage,
      ...(existingAlloc ? { excludeAllocationId: existingAlloc._id } : {}),
    });
    if (!totalValidation.valid) {
      return res.status(422).json({
        detail: 'Allocation exceeds 100% total allocation limit',
        errors: totalValidation.errors,
        warnings: totalValidation.warnings,
      });
    }

    // Validate the allocation respects work component split rules using the normalized absolute percentage
    const validation = await validateAllocationMatchesWorkComponents({
      jobId: jobObjectId,
      newPercentage: metrics.percentage,
      month: targetMonth,
      ...(existingAlloc ? { excludeAllocationId: existingAlloc._id } : {}),
      explicitComponentKey: work_component_key || null,
    });
    if (!validation.valid) {
      return res.status(422).json({
        detail: 'Allocation violates work component split rules',
        errors: validation.errors,
        warnings: validation.warnings,
      });
    }

    const overCapacitySnapshot = await getOverCapacitySnapshot({
      staffId: staffObjectId,
      month: targetMonth,
      organisationId: req.user.organisation_id,
      additionalHours: Number(metrics.adjusted_hours || 0),
      ...(existingAlloc ? { excludeAllocationId: existingAlloc._id } : {}),
    });

    const allocFields = {
      job_id: jobObjectId,
      staff_id: staffObjectId,
      percentage: Number(metrics.percentage),
      allocated_fee: Number(metrics.allocated_fee),
      calculated_hours: Number(metrics.calculated_hours),
      adjusted_hours: Number(metrics.adjusted_hours),
      month: targetMonth,
      notes: notes || null,
      work_component_key: work_component_key || null,
      workflow_status: 'Pending',
      started_at: null,
      started_by: null,
      started_timezone: null,
      completed_at: null,
      completed_by: null,
      completed_timezone: null,
      assigned_to_started_minutes: null,
      started_to_completed_minutes: null,
      organisation_id: req.user.organisation_id,
      created_by: req.user._id,
      ...overCapacitySnapshot,
    };

    const created = existingAlloc
      ? await Allocation.findByIdAndUpdate(existingAlloc._id, allocFields, { new: true, runValidators: true })
      : await Allocation.create(allocFields);

    const snapshotReason = existingAlloc ? 'update_allocation' : 'create_allocation';

    await appendAllocationSnapshotVersion({
      allocation: created,
      state: 'draft',
      reason: snapshotReason,
      createdBy: req.user?._id || null,
      job,
      staff,
      monthScoped: false,
      force: true,
    });

    await syncJobAllocationPercentage(jobObjectId, targetMonth);

    const createNotifWarning = await createAllocationNotificationWithWarning({
      allocation: created,
      job,
      staff,
      organisationId: req.user?.organisation_id,
      type: 'allocation_assigned',
      title: existingAlloc ? 'Job Allocation Updated' : 'New Job Allocation',
      message: buildAllocationNotificationMessage({
        variant: 'assigned',
        job,
        allocation: created,
        percentage: metrics.percentage,
        adjustedHours: metrics.adjusted_hours,
        actorName: req.user?.name || req.user?.email || 'Allocation manager',
      }),
    });

    const emailWarnings = await sendAllocationEmailWithWarning({
      allocation: created,
      job,
      staff,
      actorName: req.user?.name || req.user?.email || 'Allocation manager',
      organisationId: req.user?.organisation_id,
      variant: existingAlloc ? 'reassigned' : 'assigned',
      previousStaffName: null,
    });

    const responseWarnings = mergeWarnings(validation.warnings, emailWarnings, createNotifWarning);

    results.push({
      ...serializeDocument(created),
      calculation_details: metrics.calculation_details,
      warnings: responseWarnings,
    });
  }

  if (isBatch) {
    return res.status(201).json(results);
  }
  return res.status(wasUpdate ? 200 : 201).json(results[0]);
});

export const updateAllocation = asyncHandler(async (req, res) => {
  const _id = toObjectId(req.params.allocation_id, 'allocation_id');
  const body = { ...req.body };

  if (body.job_id) body.job_id = toObjectId(body.job_id, 'job_id');
  if (body.staff_id) body.staff_id = toObjectId(body.staff_id, 'staff_id');

  const existing = await Allocation.findById(_id);
  if (!existing) return res.status(404).json({ detail: 'Allocation not found' });
  if (!hasOrgAccess(existing, req.user.organisation_id)) {
    return res.status(403).json({ detail: 'Access denied' });
  }
  const existingJobState = await ensureAllocationJobMutable(existing, req.user.organisation_id);
  if (!existingJobState.ok) return res.status(existingJobState.status).json({ detail: existingJobState.detail });

  const nextJobId = body.job_id || existing.job_id;
  const nextStaffId = body.staff_id || existing.staff_id;
  const [job, staff] = await Promise.all([Job.findById(nextJobId), Staff.findById(nextStaffId)]);
  if (!job) return res.status(404).json({ detail: 'Job not found' });
  if (!staff) return res.status(404).json({ detail: 'Staff not found' });
  const staffHasOrgAccess = await assertStaffOrgAccess(staff, req.user.organisation_id);
  if (!hasOrgAccess(job, req.user.organisation_id) || !staffHasOrgAccess) {
    return res.status(403).json({ detail: 'Access denied' });
  }

  const nextJobMutable = assertJobMutable(job);
  if (!nextJobMutable.ok) return res.status(422).json({ detail: nextJobMutable.detail });

  const nextMonth = body.month || existing.month;
  const nextWorkComponentKey = body.work_component_key ?? existing.work_component_key ?? null;

  // Calculate metrics first - this normalizes component-relative percentages to absolute job percentages
  // If percentage is not being updated, pass the existing absolute value (not component-relative)
  const isUpdatingPercentage = body.percentage !== undefined && body.percentage !== null;
  const metrics = await calculateAllocationMetrics({
    job,
    staff,
    requestedPercentage: isUpdatingPercentage ? body.percentage : existing.percentage,
    workComponentKey: nextWorkComponentKey,
  });

  const totalValidation = await validateAllocationTotalPercentage({
    jobId: nextJobId,
    month: nextMonth,
    newPercentage: metrics.percentage,
    excludeAllocationId: _id,
  });
  if (!totalValidation.valid) {
    return res.status(422).json({
      detail: 'Allocation exceeds 100% total allocation limit',
      errors: totalValidation.errors,
      warnings: totalValidation.warnings,
    });
  }

  // Validate the updated percentage still respects work component rules,
  // excluding the current allocation from the component's running total.
  // Use the normalized absolute percentage from metrics.
  const validation = await validateAllocationMatchesWorkComponents({
    jobId: nextJobId,
    newPercentage: metrics.percentage,
    month: nextMonth,
    excludeAllocationId: _id,
    explicitComponentKey: nextWorkComponentKey,
  });
  if (!validation.valid) {
    return res.status(422).json({
      detail: 'Allocation violates work component split rules',
      errors: validation.errors,
      warnings: validation.warnings,
    });
  }

  const overCapacitySnapshot = await getOverCapacitySnapshot({
    staffId: nextStaffId,
    month: nextMonth,
    organisationId: req.user.organisation_id,
    additionalHours: Number(metrics.adjusted_hours || 0),
    excludeAllocationId: _id,
  });

  const updated = await Allocation.findByIdAndUpdate(
    _id,
    {
      ...body,
      percentage: metrics.percentage,
      allocated_fee: metrics.allocated_fee,
      calculated_hours: metrics.calculated_hours,
      adjusted_hours: metrics.adjusted_hours,
      ...overCapacitySnapshot,
    },
    { new: true, runValidators: true },
  );
  if (!updated) return res.status(404).json({ detail: 'Allocation not found' });

  const wasReassigned = String(existing.staff_id || '') !== String(updated.staff_id || '');

  const createNotifWarning = wasReassigned
    ? await createAllocationNotificationWithWarning({
      allocation: updated,
      job,
      staff,
      organisationId: req.user?.organisation_id,
      type: 'allocation_reassigned',
      title: 'Allocation Reassigned',
      message: buildAllocationNotificationMessage({
        variant: 'reassigned',
        job,
        allocation: updated,
        percentage: metrics.percentage,
        adjustedHours: metrics.adjusted_hours,
        actorName: req.user?.name || req.user?.email || 'Allocation manager',
      }),
    })
    : [];

  const emailWarnings = wasReassigned
    ? await sendAllocationEmailWithWarning({
      allocation: updated,
      job,
      staff,
      actorName: req.user?.name || req.user?.email || 'Allocation manager',
      organisationId: req.user?.organisation_id,
      variant: 'reassigned',
    })
    : [];

  await Promise.all([
    syncJobAllocationPercentage(existing.job_id, existing.month),
    existing.job_id?.toString() !== updated.job_id?.toString() || existing.month !== nextMonth
      ? syncJobAllocationPercentage(updated.job_id, nextMonth)
      : Promise.resolve(),
    appendAllocationSnapshotVersion({
      allocation: updated,
      state: updated.workflow_status === 'Completed' ? 'completed' : 'draft',
      reason: 'update_allocation',
      createdBy: req.user?._id || null,
      job,
      staff,
    }),
  ]);

  return res.json({
    ...serializeDocument(updated),
    calculation_details: metrics.calculation_details,
    warnings: mergeWarnings(validation.warnings, emailWarnings, createNotifWarning),
  });
});

export const deleteAllocation = asyncHandler(async (req, res) => {
  const _id = toObjectId(req.params.allocation_id, 'allocation_id');
  const existing = await Allocation.findById(_id);
  if (!existing) return res.status(404).json({ detail: 'Allocation not found' });
  if (String(existing.organisation_id) !== String(req.user.organisation_id)) {
    return res.status(403).json({ detail: 'Access denied' });
  }
  const existingJobState = await ensureAllocationJobMutable(existing, req.user.organisation_id);
  if (!existingJobState.ok) return res.status(existingJobState.status).json({ detail: existingJobState.detail });

  const deleted = await Allocation.findByIdAndDelete(_id);
  if (!deleted) return res.status(404).json({ detail: 'Allocation not found' });

  await syncJobAllocationPercentage(deleted.job_id, deleted.month);

  return res.json({ message: 'Allocation deleted', id: _id.toString(), _id: _id.toString() });
});

export const getAllocationTimeSummary = asyncHandler(async (req, res) => {
  const _id = toObjectId(req.params.allocation_id, 'allocation_id');
  const allocation = await Allocation.findById(_id);
  if (!allocation) return res.status(404).json({ detail: 'Allocation not found' });
  if (String(allocation.organisation_id) !== String(req.user.organisation_id)) {
    return res.status(403).json({ detail: 'Access denied' });
  }
  if (!(await canViewAllocationForRequest(req, allocation))) {
    return res.status(403).json({ detail: 'Access denied' });
  }

  const entryMatch = { allocation_id: _id };
  if (req.query.month) {
    const month = String(req.query.month);
    const [y, m] = month.split('-');
    const nextMonth = `${parseInt(m) === 12 ? `${parseInt(y) + 1}-01` : `${y}-${String(parseInt(m) + 1).padStart(2, '0')}`}`;
    entryMatch.date = { $gte: `${month}-01`, $lt: `${nextMonth}-01` };
  }

  const [rows, entries] = await Promise.all([
    TimeEntry.aggregate([
      { $match: entryMatch },
      { $group: { _id: '$allocation_id', total: { $sum: '$hours_worked' } } },
    ]),
    TimeEntry.find(entryMatch).sort({ start_time: -1, created_at: -1 }).limit(300),
  ]);

  const budgetedHours = Number(allocation.adjusted_hours || 0);
  const loggedHours = Number(rows[0]?.total || 0);
  const remainingHours = Math.max(0, budgetedHours - loggedHours);
  const efficiency = budgetedHours > 0 ? (loggedHours / budgetedHours) * 100 : 0;

  return res.json({
    allocation_id: _id.toString(),
    allocation: serializeDocument(allocation),
    budgeted_hours: Number(budgetedHours.toFixed(2)),
    total_logged_hours: Number(loggedHours.toFixed(2)),
    remaining_hours: Number(remainingHours.toFixed(2)),
    efficiency_percentage: Number(Math.max(0, efficiency).toFixed(2)),
    allocated_fee: Number(allocation.allocated_fee || 0),
    time_entries: serializeList(entries),
  });
});

export const getJobEfficiency = asyncHandler(async (req, res) => {
  const jobId = toObjectId(req.params.job_id);
  const organisationId = req.user.organisation_id;
  
  const job = await Job.findOne({ _id: jobId, organisation_id: organisationId });
  if (!job) return res.status(404).json({ detail: 'Job not found in this organization' });
  
  const { calculateJobEfficiency } = await import('../services/jobEfficiencyService.js');
  const efficiency = await calculateJobEfficiency(jobId, organisationId);
  
  return res.json({
    job_id: jobId.toString(),
    job_name: job.name,
    client_name: job.client_name,
    efficiency_metrics: efficiency,
    historical_data: job.efficiency_metrics?.efficiency_history || []
  });
});

export const getOrganisationStaffEfficiencyOverview = asyncHandler(async (req, res) => {
  const organisationId = req.user.organisation_id; // Get current user's organization
  
  const { getOrganisationStaffEfficiency } = await import('../services/staffEfficiencyService.js');
  const efficiencyOverview = await getOrganisationStaffEfficiency(organisationId);
  
  return res.json({
    organisation_id: organisationId,
    staff_efficiency: efficiencyOverview,
    summary: {
      total_staff: efficiencyOverview.length,
      excellent_performance: efficiencyOverview.filter(s => s.efficiency_status === 'Excellent').length,
      good_performance: efficiencyOverview.filter(s => s.efficiency_status === 'Good').length,
      needs_improvement: efficiencyOverview.filter(s => s.efficiency_status === 'Needs Improvement').length,
      no_data: efficiencyOverview.filter(s => s.efficiency_status === 'No Data').length
    }
  });
});

export const reallocateAllocation = asyncHandler(async (req, res) => {
  const _id = toObjectId(req.params.allocation_id, 'allocation_id');
  const {
    reason,
    reallocation_type = 'transfer_staff',
    percentage_to_reallocate = 100,
    new_staff_id,
    split_transfers,
  } = req.body || {};

  const source = await Allocation.findById(_id);
  if (!source) return res.status(404).json({ detail: 'Allocation not found' });
  if (!hasOrgAccess(source, req.user.organisation_id)) {
    return res.status(403).json({ detail: 'Access denied' });
  }
  const sourceJobState = await ensureAllocationJobMutable(source, req.user.organisation_id);
  if (!sourceJobState.ok) return res.status(sourceJobState.status).json({ detail: sourceJobState.detail });

  const reasonText = String(reason || '').trim();
  if (reasonText.length < 5) {
    return res.status(400).json({ detail: 'Reason is required (min 5 chars)' });
  }

  const pct = Number(percentage_to_reallocate || 0);
  if (Number.isNaN(pct) || pct <= 0 || pct > 100) {
    return res.status(400).json({ detail: 'percentage_to_reallocate must be between 0 and 100' });
  }

  const [sourceStaff, job, timeRows] = await Promise.all([
    Staff.findById(source.staff_id),
    Job.findById(source.job_id),
    TimeEntry.aggregate([
      { $match: { allocation_id: _id } },
      { $group: { _id: '$allocation_id', total: { $sum: '$hours_worked' } } },
    ]),
  ]);
  if (!sourceStaff) return res.status(404).json({ detail: 'Source staff not found' });
  if (!job) return res.status(404).json({ detail: 'Job not found' });
  const sourceHasOrgAccess = await assertStaffOrgAccess(sourceStaff, req.user.organisation_id);
  if (!sourceHasOrgAccess || !hasOrgAccess(job, req.user.organisation_id)) {
    return res.status(403).json({ detail: 'Access denied' });
  }

  const budgetedHours = Number(source.adjusted_hours || 0);
  const loggedHours = Number(timeRows[0]?.total || 0);
  const remainingHours = Math.max(0, budgetedHours - loggedHours);
  if (remainingHours <= 0) {
    return res.status(422).json({ detail: 'No remaining hours available to reallocate' });
  }

  const sourcePct = Number(source.percentage || 0);
  const transferFraction = pct / 100;

  // If allocation is tied to a work component, calculate transfer in component-relative
  // space so a "Single Staff" transfer keeps the component share as-is.
  let sourceComponentRelativePct = null;
  if (source.work_component_key) {
    const sourceRecommendation = await calculateAllocationMetrics({
      job,
      staff: sourceStaff,
      requestedPercentage: undefined,
      workComponentKey: source.work_component_key,
    });
    const componentFullAbsPct = Number(sourceRecommendation?.calculation_details?.recommended_percentage || 0);
    if (componentFullAbsPct > 0) {
      sourceComponentRelativePct = (sourcePct / componentFullAbsPct) * 100;
    }
  }

  const transferredAbsPct = sourcePct * transferFraction;

  if (transferredAbsPct <= 0) {
    return res.status(422).json({ detail: 'Calculated transfer percentage is zero' });
  }

  let transfers = [];
  if (new_staff_id) {
    transfers = [{ staff_id: new_staff_id, percentage: pct }];
  } else if (Array.isArray(split_transfers)) {
    transfers = split_transfers
      .map((row) => ({ staff_id: row.staff_id, percentage: Number(row.percentage || 0) }))
      .filter((row) => row.staff_id && row.percentage > 0);
  }

  if (transfers.length === 0) {
    return res.status(400).json({ detail: 'No target staff provided for reallocation' });
  }

  const splitTotal = transfers.reduce((sum, row) => sum + Number(row.percentage || 0), 0);
  if (Math.abs(splitTotal - pct) > 0.01) {
    return res.status(400).json({ detail: `Split percentages must total ${pct}` });
  }

  const uniqueTargets = new Set(transfers.map((row) => String(row.staff_id)));
  if (uniqueTargets.size !== transfers.length) {
    return res.status(400).json({ detail: 'Each target staff can only appear once' });
  }
  if (uniqueTargets.has(String(source.staff_id))) {
    return res.status(400).json({ detail: 'Target staff cannot include current assignee' });
  }

  const targetIds = Array.from(uniqueTargets).map((id) => toObjectId(id, 'staff_id'));
  const targetStaffDocs = await Staff.find({ _id: { $in: targetIds } });
  if (targetStaffDocs.length !== targetIds.length) {
    return res.status(404).json({ detail: 'One or more target staff members were not found' });
  }
  const targetOrgAccess = await Promise.all(targetStaffDocs.map((staffDoc) => assertStaffOrgAccess(staffDoc, req.user.organisation_id)));
  if (targetOrgAccess.some((allowed) => !allowed)) {
    return res.status(403).json({ detail: 'Access denied' });
  }
  const targetStaffMap = new Map(targetStaffDocs.map((staffDoc) => [String(staffDoc._id), staffDoc]));

  const createdRows = [];
  const reallocationWarnings = [];
  for (const row of transfers) {
    const targetStaff = targetStaffMap.get(String(row.staff_id));
    if (!targetStaff) continue;

    const transferShare = Number(row.percentage || 0) / 100;
    const targetRequestedPct = source.work_component_key && sourceComponentRelativePct !== null
      ? (sourceComponentRelativePct * transferShare)
      : (sourcePct * transferShare);
    if (targetRequestedPct <= 0) continue;

    const metrics = await calculateAllocationMetrics({
      job,
      staff: targetStaff,
      requestedPercentage: targetRequestedPct,
      workComponentKey: source.work_component_key || null,
    });

    const overCapacitySnapshot = await getOverCapacitySnapshot({
      staffId: targetStaff._id,
      month: source.month,
      organisationId: req.user.organisation_id,
      additionalHours: Number(metrics.adjusted_hours || 0),
    });

    const created = await Allocation.create({
      job_id: source.job_id,
      staff_id: targetStaff._id,
      percentage: Number(metrics.percentage),
      allocated_fee: Number(metrics.allocated_fee),
      calculated_hours: Number(metrics.calculated_hours),
      adjusted_hours: Number(metrics.adjusted_hours),
      month: source.month,
      notes: source.notes || null,
      work_component_key: source.work_component_key || null,
      workflow_status: 'Pending',
      started_at: null,
      started_by: null,
      started_timezone: null,
      completed_at: null,
      completed_by: null,
      completed_timezone: null,
      assigned_to_started_minutes: null,
      started_to_completed_minutes: null,
      is_reallocated: true,
      reallocated_from_id: source._id,
      reallocation_reason: reasonText,
      reallocated_at: new Date(),
      status: 'active',
      organisation_id: req.user.organisation_id,
      created_by: req.user._id,
      ...overCapacitySnapshot,
    });

    await appendAllocationSnapshotVersion({
      allocation: created,
      state: 'draft',
      reason: 'reallocate_created_target',
      createdBy: req.user?._id || null,
      job,
      staff: targetStaff,
      monthScoped: false,
      force: true,
    });

    const createNotifWarning = await createAllocationNotificationWithWarning({
      allocation: created,
      job,
      staff: targetStaff,
      organisationId: req.user?.organisation_id,
      type: 'allocation_reassigned',
      title: 'Allocation Reassigned',
      message: buildAllocationNotificationMessage({
        variant: 'reassigned',
        job,
        allocation: created,
        percentage: metrics.percentage,
        adjustedHours: metrics.adjusted_hours,
        actorName: req.user?.name || req.user?.email || 'Allocation manager',
        previousStaffName: sourceStaff?.name || null,
      }),
    });

    const emailWarnings = await sendAllocationEmailWithWarning({
      allocation: created,
      job,
      staff: targetStaff,
      actorName: req.user?.name || req.user?.email || 'Allocation manager',
      organisationId: req.user?.organisation_id,
      variant: 'reassigned',
      previousStaffName: sourceStaff?.name || null,
    });

    reallocationWarnings.push(...createNotifWarning, ...emailWarnings);

    createdRows.push(created);
  }

  if (createdRows.length === 0) {
    return res.status(422).json({ detail: 'No allocations were created from this reallocation request' });
  }

  const sourceNewPct = Math.max(0, sourcePct - transferredAbsPct);
  if (sourceNewPct <= 0.0001) {
    source.status = 'inactive';
    source.percentage = 0.01;
    source.allocated_fee = 0;
    source.calculated_hours = Number(loggedHours.toFixed(2));
    source.adjusted_hours = Number(loggedHours.toFixed(2));
  } else {
    source.status = 'active';
    const sourceRequestedPct = source.work_component_key && sourceComponentRelativePct !== null
      ? (sourceComponentRelativePct * (1 - transferFraction))
      : sourceNewPct;
    const sourceMetrics = await calculateAllocationMetrics({
      job,
      staff: sourceStaff,
      requestedPercentage: sourceRequestedPct,
      workComponentKey: source.work_component_key || null,
    });
    source.percentage = Number(sourceMetrics.percentage);
    source.allocated_fee = Number(sourceMetrics.allocated_fee);
    source.calculated_hours = Number(sourceMetrics.calculated_hours);
    source.adjusted_hours = Number(sourceMetrics.adjusted_hours);
  }

  source.is_reallocated = true;
  source.reallocated_to_id = createdRows[0]?._id || null;
  source.reallocation_reason = reasonText;
  source.reallocated_at = new Date();
  await source.save();

  await appendAllocationSnapshotVersion({
    allocation: source,
    state: source.workflow_status === 'Completed' ? 'completed' : 'draft',
    reason: 'reallocate_source_updated',
    createdBy: req.user?._id || null,
    job,
    staff: sourceStaff,
  });

  await syncJobAllocationPercentage(source.job_id, source.month);

  return res.status(201).json({
    message: reallocation_type === 'add_staff' ? 'Allocation shared successfully' : 'Allocation reallocated successfully',
    source_allocation: serializeDocument(source),
    created_allocations: serializeList(createdRows),
    warnings: mergeWarnings(reallocationWarnings),
    transfer: {
      type: reallocation_type,
      percentage_to_reallocate: Number(pct.toFixed(2)),
      logged_hours: Number(loggedHours.toFixed(2)),
      remaining_hours: Number(remainingHours.toFixed(2)),
    },
  });
});

// POST /jobs/:job_id/auto-allocate
// Body: { month?: string, allocations: [{ staff_id, percentage?, work_component_key }] }
// Note: percentage is optional - if omitted, full component share will be allocated
export const autoAllocateJob = asyncHandler(async (req, res) => {
  const jobObjectId = toObjectId(req.params.job_id, 'job_id');
  const { month, allocations: allocationRequests = [] } = req.body || {};
  const targetMonth = month || getCurrentMonth();

  if (!MONTH_VALUE_PATTERN.test(String(targetMonth))) {
    return res.status(400).json({ detail: 'month must be in YYYY-MM format.' });
  }

  if (!Array.isArray(allocationRequests) || allocationRequests.length === 0) {
    return res.status(400).json({ detail: 'At least one allocation entry is required' });
  }

  const job = await Job.findById(jobObjectId);
  if (!job) return res.status(404).json({ detail: 'Job not found' });
  if (!hasOrgAccess(job, req.user.organisation_id)) {
    return res.status(403).json({ detail: 'Access denied' });
  }
  const jobMutable = assertJobMutable(job);
  if (!jobMutable.ok) return res.status(422).json({ detail: jobMutable.detail });

  const results = [];
  const errors = [];

  for (let i = 0; i < allocationRequests.length; i += 1) {
    const { staff_id, percentage, work_component_key: wck } = allocationRequests[i];
    if (!staff_id) {
      errors.push({ index: i, error: 'staff_id is required' });
      continue;
    }
    if (!wck) {
      errors.push({ index: i, staff_id, error: 'work_component_key is required for each allocation' });
      continue;
    }
    try {
      const staffObjectId = toObjectId(staff_id, 'staff_id');
      const staffDoc = await Staff.findById(staffObjectId);
      if (!staffDoc) {
        errors.push({ index: i, error: `Staff not found: ${staff_id}` });
        continue;
      }
      const staffHasOrgAccess = await assertStaffOrgAccess(staffDoc, req.user.organisation_id);
      if (!staffHasOrgAccess) {
        errors.push({ index: i, staff_id, error: 'Access denied' });
        continue;
      }

      // Calculate metrics first - this normalizes component-relative percentages to absolute job percentages
      // If percentage is omitted, full component share will be allocated
      const metrics = await calculateAllocationMetrics({
        job,
        staff: staffDoc,
        requestedPercentage: percentage, // undefined/null means "use full component share"
        workComponentKey: wck,
      });

      const totalValidation = await validateAllocationTotalPercentage({
        jobId: jobObjectId,
        month: targetMonth,
        newPercentage: metrics.percentage,
      });
      if (!totalValidation.valid) {
        errors.push({ index: i, staff_id, error: totalValidation.errors.join(' '), warnings: totalValidation.warnings });
        continue;
      }

      // Validate against work-component split rules using the normalized absolute percentage.
      // Already-created allocations in this batch are visible to the validation query since they're committed.
      const validation = await validateAllocationMatchesWorkComponents({
        jobId: jobObjectId,
        newPercentage: metrics.percentage,
        month: targetMonth,
        explicitComponentKey: wck,
      });
      if (!validation.valid) {
        errors.push({ index: i, staff_id, error: validation.errors.join(' '), warnings: validation.warnings });
        continue;
      }

      const overCapacitySnapshot = await getOverCapacitySnapshot({
        staffId: staffObjectId,
        month: targetMonth,
        organisationId: req.user.organisation_id,
        additionalHours: Number(metrics.adjusted_hours || 0),
      });

      const created = await Allocation.create({
        job_id: jobObjectId,
        staff_id: staffObjectId,
        percentage: Number(metrics.percentage),
        allocated_fee: Number(metrics.allocated_fee),
        calculated_hours: Number(metrics.calculated_hours),
        adjusted_hours: Number(metrics.adjusted_hours),
        month: targetMonth,
        notes: null,
        work_component_key: wck,
        workflow_status: 'Pending',
        started_at: null,
        started_by: null,
        started_timezone: null,
        completed_at: null,
        completed_by: null,
        completed_timezone: null,
        assigned_to_started_minutes: null,
        started_to_completed_minutes: null,
        organisation_id: req.user.organisation_id,
        created_by: req.user._id,
        ...overCapacitySnapshot,
      });
      await appendAllocationSnapshotVersion({
        allocation: created,
        state: 'draft',
        reason: 'auto_allocate_created',
        createdBy: req.user?._id || null,
        job,
        staff: staffDoc,
        monthScoped: false,
        force: true,
      });

      const createNotifWarning = await createAllocationNotificationWithWarning({
        allocation: created,
        job,
        staff: staffDoc,
        organisationId: req.user?.organisation_id,
        type: 'allocation_assigned',
        title: 'New Job Allocation',
        message: buildAllocationNotificationMessage({
          variant: 'assigned',
          job,
          allocation: created,
          percentage: metrics.percentage,
          adjustedHours: metrics.adjusted_hours,
          actorName: req.user?.name || req.user?.email || 'Allocation manager',
        }),
      });

      const emailWarnings = await sendAllocationEmailWithWarning({
        allocation: created,
        job,
        staff: staffDoc,
        actorName: req.user?.name || req.user?.email || 'Allocation manager',
        organisationId: req.user?.organisation_id,
        variant: 'assigned',
      });

      results.push({
        ...serializeDocument(created),
        calculation_details: metrics.calculation_details,
        warnings: mergeWarnings(validation.warnings, emailWarnings, createNotifWarning),
      });
    } catch (err) {
      errors.push({ index: i, error: err.message });
    }
  }

  await syncJobAllocationPercentage(jobObjectId, targetMonth);

  return res.status(201).json({
    message: `Created ${results.length} allocation${results.length !== 1 ? 's' : ''}`,
    created_count: results.length,
    error_count: errors.length,
    allocations: results,
    errors,
  });
});

export const startAllocationComponent = asyncHandler(async (req, res) => {
  const _id = toObjectId(req.params.allocation_id, 'allocation_id');
  const allocation = await Allocation.findById(_id);
  if (!allocation) return res.status(404).json({ detail: 'Allocation not found' });
  if (!hasOrgAccess(allocation, req.user.organisation_id)) {
    return res.status(403).json({ detail: 'Access denied' });
  }
  const allocationJobState = await ensureAllocationJobMutable(allocation, req.user.organisation_id);
  if (!allocationJobState.ok) return res.status(allocationJobState.status).json({ detail: allocationJobState.detail });

  const allowed = await canActOnStaff(req.user, allocation.staff_id);
  if (!allowed) return res.status(403).json({ detail: 'You are not allowed to start this assignment' });

  if (allocation.workflow_status === 'Completed') {
    return res.status(422).json({ detail: 'Component is already completed' });
  }

  const startedAt = toDateOrNow(req.body?.started_at);
  if (!startedAt) {
    return res.status(400).json({ detail: 'started_at must be a valid ISO datetime' });
  }

  allocation.workflow_status = 'Doing';
  allocation.started_at = startedAt;
  allocation.started_by = req.user?._id || null;
  allocation.started_timezone = req.body?.timezone || null;
  allocation.assigned_to_started_minutes = diffMinutes(allocation.created_at, startedAt);

  // If start is moved after completion accidentally, clear completion and let user complete again.
  if (allocation.completed_at && new Date(allocation.completed_at) < new Date(startedAt)) {
    allocation.completed_at = null;
    allocation.completed_by = null;
    allocation.completed_timezone = null;
    allocation.started_to_completed_minutes = null;
  }

  await allocation.save();
  await appendAllocationSnapshotVersion({
    allocation,
    state: 'draft',
    reason: 'start_component',
    createdBy: req.user?._id || null,
  });
  const jobStatus = await syncJobWorkflowStatus(allocation.job_id);

  return res.json({
    allocation: serializeDocument(allocation),
    job_status: jobStatus,
    durations: {
      assigned_to_started_minutes: allocation.assigned_to_started_minutes,
      started_to_completed_minutes: allocation.started_to_completed_minutes,
    },
  });
});

export const completeAllocationComponent = asyncHandler(async (req, res) => {
  const _id = toObjectId(req.params.allocation_id, 'allocation_id');
  const allocation = await Allocation.findById(_id);
  if (!allocation) return res.status(404).json({ detail: 'Allocation not found' });
  if (!hasOrgAccess(allocation, req.user.organisation_id)) {
    return res.status(403).json({ detail: 'Access denied' });
  }
  const allocationJobState = await ensureAllocationJobMutable(allocation, req.user.organisation_id);
  if (!allocationJobState.ok) return res.status(allocationJobState.status).json({ detail: allocationJobState.detail });

  const allowed = await canActOnStaff(req.user, allocation.staff_id);
  if (!allowed) return res.status(403).json({ detail: 'You are not allowed to complete this assignment' });

  if (allocation.workflow_status === 'Completed') {
    return res.status(422).json({ detail: 'Component is already completed' });
  }

  const completedAt = toDateOrNow(req.body?.completed_at);
  if (!completedAt) {
    return res.status(400).json({ detail: 'completed_at must be a valid ISO datetime' });
  }

  const earliestEntry = await TimeEntry.findOne({ allocation_id: _id }).sort({ start_time: 1, created_at: 1 });
  const startedAt = allocation.started_at
    ? new Date(allocation.started_at)
    : earliestEntry?.start_time
      ? new Date(earliestEntry.start_time)
      : completedAt;

  if (completedAt < startedAt) {
    return res.status(422).json({ detail: 'completed_at must be on or after the component start time' });
  }

  allocation.workflow_status = 'Completed';
  allocation.started_at = startedAt;
  allocation.started_by = allocation.started_by || req.user?._id || null;
  allocation.started_timezone = allocation.started_timezone || req.body?.timezone || null;
  allocation.assigned_to_started_minutes = diffMinutes(allocation.created_at, startedAt);
  allocation.completed_at = completedAt;
  allocation.completed_by = req.user?._id || null;
  allocation.completed_timezone = req.body?.timezone || null;
  allocation.started_to_completed_minutes = diffMinutes(startedAt, completedAt);
  allocation.completed_percentage = 100;

  await allocation.save();
  await appendAllocationSnapshotVersion({
    allocation,
    state: 'completed',
    reason: 'complete_component',
    createdBy: req.user?._id || null,
  });
  const jobStatus = await syncJobWorkflowStatus(allocation.job_id);

  // Record job-level efficiency (fire-and-forget to not block response)
  recordJobCompletionEfficiency(allocation._id, req.user?._id, completedAt).catch((err) => {
    console.warn(`[efficiency] Failed to record completion efficiency for allocation ${allocation._id}: ${err.message}`);
  });

  return res.json({
    allocation: serializeDocument(allocation),
    job_status: jobStatus,
    durations: {
      assigned_to_started_minutes: allocation.assigned_to_started_minutes,
      started_to_completed_minutes: allocation.started_to_completed_minutes,
    },
  });
});

export const uncompleteAllocationComponent = asyncHandler(async (req, res) => {
  const _id = toObjectId(req.params.allocation_id, 'allocation_id');
  const allocation = await Allocation.findById(_id);
  if (!allocation) return res.status(404).json({ detail: 'Allocation not found' });
  if (!hasOrgAccess(allocation, req.user.organisation_id)) {
    return res.status(403).json({ detail: 'Access denied' });
  }
  const allocationJobState = await ensureAllocationJobMutable(allocation, req.user.organisation_id);
  if (!allocationJobState.ok) return res.status(allocationJobState.status).json({ detail: allocationJobState.detail });

  const allowed = await canActOnStaff(req.user, allocation.staff_id);
  if (!allowed) return res.status(403).json({ detail: 'You are not allowed to re-open this assignment' });

  const [rows, earliestEntry] = await Promise.all([
    TimeEntry.aggregate([
      { $match: { allocation_id: _id } },
      { $group: { _id: '$allocation_id', total: { $sum: '$hours_worked' }, count: { $sum: 1 } } },
    ]),
    TimeEntry.findOne({ allocation_id: _id }).sort({ start_time: 1, created_at: 1 }),
  ]);

  const totalLogged = Number(rows[0]?.total || 0);
  const hasLogs = Number(rows[0]?.count || 0) > 0;

  allocation.workflow_status = hasLogs ? 'Doing' : 'Pending';
  allocation.completed_at = null;
  allocation.completed_by = null;
  allocation.completed_timezone = null;
  allocation.started_to_completed_minutes = null;

  if (hasLogs) {
    const startedAt = earliestEntry?.start_time ? new Date(earliestEntry.start_time) : new Date();
    allocation.started_at = startedAt;
    allocation.started_by = allocation.started_by || req.user?._id || null;
    allocation.assigned_to_started_minutes = diffMinutes(allocation.created_at, startedAt);
  } else {
    allocation.started_at = null;
    allocation.started_by = null;
    allocation.started_timezone = null;
    allocation.assigned_to_started_minutes = null;
  }

  const completedPct = allocation.adjusted_hours > 0 ? (totalLogged / allocation.adjusted_hours) * 100 : 0;
  allocation.completed_percentage = Number(Math.max(0, Math.min(100, completedPct)).toFixed(2));

  await allocation.save();
  await appendDraftFromLastCompletedSnapshot({
    allocation,
    reason: 'uncomplete_reopen',
    createdBy: req.user?._id || null,
  });
  const jobStatus = await syncJobWorkflowStatus(allocation.job_id);

  return res.json({
    allocation: serializeDocument(allocation),
    job_status: jobStatus,
    durations: {
      assigned_to_started_minutes: allocation.assigned_to_started_minutes,
      started_to_completed_minutes: allocation.started_to_completed_minutes,
    },
  });
});

/**
 * GET /jobs/:job_id/allocation-coverage
 * Returns a breakdown of required vs allocated roles for a job, including
 * which roles are missing or over/under threshold.
 */
export const getJobAllocationCoverage = asyncHandler(async (req, res) => {
  const jobObjectId = toObjectId(req.params.job_id, 'job_id');
  const job = await Job.findById(jobObjectId);
  if (!job) return res.status(404).json({ detail: 'Job not found' });
  if (!hasOrgAccess(job, req.user.organisation_id)) {
    return res.status(403).json({ detail: 'Access denied' });
  }

  const month = typeof req.query.month === 'string' ? String(req.query.month) : '';
  if (month && !MONTH_VALUE_PATTERN.test(month)) {
    return res.status(400).json({ detail: 'month must be in YYYY-MM format.' });
  }

  const coverage = await getAllocationCoverage(jobObjectId, month ? { month } : undefined);

  const jobTypeLabel = (job.job_type_entries || [])
    .map((e) => e.job_type_name || '')
    .filter(Boolean)
    .join(' & ');

  return res.json({
    job_id: jobObjectId.toString(),
    job_name: job.name,
    client_name: job.client_name,
    job_type_label: jobTypeLabel,
    allocation_status: job.status,
    job_fee: Number(job.job_fee || 0),
    ...coverage,
  });
});

// ── Review Submission ─────────────────────────────────────────────────────────────

export const submitAllocationReview = asyncHandler(async (req, res) => {
  const { allocation_id } = req.params;
  const { rating, comments } = req.body;
  const staffId = req.user?._id;

  if (!staffId) {
    return res.status(403).json({ detail: 'Authenticated user required to submit a review' });
  }

  // Validate input
  if (!rating || typeof rating !== 'number' || rating < 1 || rating > 5) {
    return res.status(400).json({ 
      detail: 'Rating is required and must be between 1 and 5' 
    });
  }

  // Find allocation
  const allocation = await Allocation.findById(allocation_id);
  if (!allocation) {
    return res.status(404).json({ detail: 'Allocation not found' });
  }

  // Org-scope access check
  if (!hasOrgAccess(allocation, req.user.organisation_id)) {
    return res.status(403).json({ detail: 'Access denied' });
  }

  // Check if workflow is completed
  if (allocation.workflow_status !== 'Completed') {
    return res.status(400).json({ 
      detail: 'Can only submit reviews for completed allocations' 
    });
  }

  // Check if already reviewed
  if (allocation.review_rating) {
    // Update existing review instead of returning error
    allocation.review_rating = rating;
    allocation.review_comments = comments || null;
    allocation.reviewed_at = new Date();
    allocation.reviewed_by = staffId;

    await allocation.save();

    // Return updated allocation
    res.json({
      allocation: serializeDocument(allocation),
      message: 'Review updated successfully'
    });
  } else {
    // Update allocation with review data
    allocation.review_rating = rating;
    allocation.review_comments = comments || null;
    allocation.reviewed_at = new Date();
    allocation.reviewed_by = staffId;

    await allocation.save();

    // Return updated allocation
    res.json({
      allocation: serializeDocument(allocation),
      message: 'Review submitted successfully'
    });
  }
});

// ── Review Deletion ─────────────────────────────────────────────────────────────

export const deleteAllocationReview = asyncHandler(async (req, res) => {
  const { allocation_id } = req.params;
  const staffId = req.user?._id;

  if (!staffId) {
    return res.status(403).json({ detail: 'Authenticated user required to delete a review' });
  }

  // Find allocation
  const allocation = await Allocation.findById(allocation_id);
  if (!allocation) {
    return res.status(404).json({ detail: 'Allocation not found' });
  }

  // Org-scope access check
  if (!hasOrgAccess(allocation, req.user.organisation_id)) {
    return res.status(403).json({ detail: 'Access denied' });
  }

  // Check if review exists
  if (!allocation.review_rating) {
    return res.status(400).json({ detail: 'No review found for this allocation' });
  }

  // Clear review fields
  allocation.review_rating = null;
  allocation.review_comments = null;
  allocation.reviewed_at = null;
  allocation.reviewed_by = null;

  await allocation.save();

  res.json({
    allocation: serializeDocument(allocation),
    message: 'Review removed successfully'
  });
});
