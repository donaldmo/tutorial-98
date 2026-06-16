import Job from '../models/Job.js';
import Client from '../models/Client.js';
import JobType from '../models/JobType.js';
import Allocation from '../models/Allocation.js';
import { toObjectId } from '../utils/objectId.js';
import { checkPlanLimit } from '../services/planLimitService.js';
import { serializeDocument, serializeList } from '../utils/serialize.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { parsePagination, buildPaginationMeta } from '../utils/pagination.js'; // Group 4 – Task 4.2

const toNumOrNull = (v) => (v === undefined || v === null || v === '') ? null : Number(v);

const RECURRENCE_MONTH_INTERVALS = {
  monthly: 1,
  'bi-monthly': 2,
  quarterly: 3,
  biannually: 6,
  annually: 12,
};

export function parseDateInput(value) {
  if (!value) return null;
  const parts = String(value).split('-').map(Number);
  if (parts.length !== 3 || parts.some((part) => !Number.isInteger(part))) return null;
  const [year, month, day] = parts;
  const parsed = new Date(year, month - 1, day, 12, 0, 0, 0);
  if (
    Number.isNaN(parsed.getTime())
    || parsed.getFullYear() !== year
    || parsed.getMonth() !== month - 1
    || parsed.getDate() !== day
  ) {
    return null;
  }
  return parsed;
}

function toDateInputString(value) {
  if (!value) return null;
  const parsed = parseDateInput(value);
  if (!parsed) return null;
  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, '0');
  const day = String(parsed.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

const ensureJobVisibleToRequester = async (req, jobId) => {
  if (req.admin) return true;

  const hasAllocation = await Allocation.exists({
    organisation_id: req.user.organisation_id,
    job_id: jobId,
    staff_id: req.user._id,
  });

  return Boolean(hasAllocation);
};

function getDaysInMonth(year, monthIndex) {
  return new Date(year, monthIndex + 1, 0).getDate();
}

function buildOccurrenceDeadline(year, monthIndex, anchorDay) {
  if (!anchorDay) return null;
  const clampedDay = Math.min(anchorDay, getDaysInMonth(year, monthIndex));
  return new Date(year, monthIndex, clampedDay, 23, 59, 59);
}

function buildRecurringEntryKey(year, month) {
  return `${year}-${String(month).padStart(2, '0')}`;
}

function getRecurringEntryMonthKey(entry = {}) {
  if (!entry.year || !entry.month) return null;
  return buildRecurringEntryKey(entry.year, entry.month);
}

function generateMonthEntries(recurrenceType, recurrenceStartDate, recurrenceEndDate, existingEntries = [], deadlineDay = null) {
  const entries = [];
  const intervalMonths = RECURRENCE_MONTH_INTERVALS[recurrenceType];
  const startDate = parseDateInput(recurrenceStartDate);
  const endDate = parseDateInput(recurrenceEndDate);

  if (!intervalMonths || !startDate || !endDate || endDate < startDate) {
    return entries;
  }

  const existingMap = new Map(
    (existingEntries || []).map((entry) => [
      buildRecurringEntryKey(entry.year, entry.month),
      entry,
    ])
  );

  const anchorDay = deadlineDay || startDate.getDate();
  const cursor = new Date(startDate.getFullYear(), startDate.getMonth(), 1, 12, 0, 0, 0);
  const lastMonth = new Date(endDate.getFullYear(), endDate.getMonth(), 1, 12, 0, 0, 0);

  while (cursor <= lastMonth) {
    const year = cursor.getFullYear();
    const monthIndex = cursor.getMonth();
    const month = monthIndex + 1;
    const key = buildRecurringEntryKey(year, month);
    const existing = existingMap.get(key);

    entries.push({
      month,
      year,
      deadline: buildOccurrenceDeadline(year, monthIndex, anchorDay),
      status: existing?.status || 'Pending',
    });

    cursor.setMonth(cursor.getMonth() + intervalMonths);
  }

  return entries;
}

export function reconcileRecurringMonthEntries(recurrenceType, recurrenceStartDate, recurrenceEndDate, existingEntries = [], deadlineDay = null) {
  const nextEntries = generateMonthEntries(
    recurrenceType,
    recurrenceStartDate,
    recurrenceEndDate,
    existingEntries,
    deadlineDay,
  );
  const nextKeys = new Set(nextEntries.map(getRecurringEntryMonthKey).filter(Boolean));
  const removedKeys = (existingEntries || [])
    .map(getRecurringEntryMonthKey)
    .filter((key) => key && !nextKeys.has(key));

  return { nextEntries, removedKeys };
}

function removeMonthlyAllocationKeys(job, monthKeys = []) {
  if (!job?.monthly_allocations || monthKeys.length === 0) return false;

  let changed = false;
  monthKeys.forEach((monthKey) => {
    if (job.monthly_allocations.has(monthKey)) {
      job.monthly_allocations.delete(monthKey);
      changed = true;
    }
  });

  if (changed) {
    job.markModified('monthly_allocations');
  }
  return changed;
}

export function getRecurringPayloadError(payload = {}) {
  if (!payload.is_recurring) return null;
  if (!payload.recurrence_type || !RECURRENCE_MONTH_INTERVALS[payload.recurrence_type]) {
    return 'recurrence_type is required for recurring jobs';
  }
  if (!payload.recurrence_start_date || !payload.recurrence_end_date) {
    return 'recurrence_start_date and recurrence_end_date are required for recurring jobs';
  }
  const startDate = parseDateInput(payload.recurrence_start_date);
  const endDate = parseDateInput(payload.recurrence_end_date);
  if (!startDate || !endDate) {
    return 'recurrence_start_date and recurrence_end_date must be valid YYYY-MM-DD dates';
  }
  if (endDate < startDate) {
    return 'recurrence_end_date must be on or after recurrence_start_date';
  }
  return null;
}

const normalizeTemplateLikeEntries = async (entries = []) => {
  const resolved = await Promise.all(
    entries.map(async (entry = {}) => {
      let jobType = null;

      try {
        if (entry.job_type_id || entry.id) {
          jobType = await JobType.findById(toObjectId(entry.job_type_id || entry.id, 'job_type_entries[].job_type_id'));
        }
      } catch {
        jobType = null;
      }

      const name = String(entry.job_type_name || jobType?.name || '').trim();
      const workComponents = Array.isArray(entry.work_components)
        ? entry.work_components.map((component = {}) => ({
            name: String(component.name || component.role || '').trim(),
            service: String(component.service || 'general').trim() || 'general',
            role: component.role ? String(component.role).trim() : null,
            percentage: Number(component.percentage || 0),
            hours_multiplier: Number(component.hours_multiplier || 1),
          }))
        : [];

      if (!jobType && !name) return null;

      return {
        job_type_id: jobType?._id || null,
        job_type_name: name,
        fee: Number(entry.fee || 0),
        work_components: workComponents,
      };
    })
  );

  return resolved.filter(Boolean);
};

export const normalizeJobPayload = async (body = {}) => {
  const payload = { ...body };

  if (payload.client_id) {
    payload.client_id = toObjectId(payload.client_id, 'client_id');
  }

  // Resolve client
  const client = payload.client_id
    ? await Client.findById(payload.client_id)
    : (payload.client_name ? await Client.findOne({ name: payload.client_name }) : null);

  if (client) {
    payload.client_id = client._id;
    payload.client_name = client.name;
  }

  // Use service_fee as the authoritative job fee, fall back to job_fee
  if (payload.service_fee !== undefined && payload.service_fee !== null) {
    payload.job_fee = toNumOrNull(payload.service_fee) || 0;
    delete payload.service_fee;
  }

  // Normalize job_type — only the `job_types[]` array format is supported
  if (Array.isArray(payload.job_types) && payload.job_types.length > 0) {
    const entries = payload.job_types;
    delete payload.job_types;

    const resolvedTypes = await Promise.all(
      entries.map(async (entry) => {
        try {
          const jobTypeId = toObjectId(entry.id, 'job_types[].id');
          const jobType = await JobType.findById(jobTypeId);
          return { jobType };
        } catch {
          return { jobType: null };
        }
      })
    );

    payload.job_type_entries = resolvedTypes
      .filter((r) => r.jobType)
      .map((r, i) => ({
        job_type_id: r.jobType._id,
        job_type_name: r.jobType.name,
        fee: Number(entries[i]?.fee || 0),
        work_components: entries[i]?.work_components ?? [],
      }));
  }

  if ((!Array.isArray(payload.job_type_entries) || payload.job_type_entries.length === 0) && Array.isArray(payload.job_type_entries_input)) {
    payload.job_type_entries = await normalizeTemplateLikeEntries(payload.job_type_entries_input);
    delete payload.job_type_entries_input;
  }

  if (Array.isArray(payload.job_type_entries) && payload.job_type_entries.length > 0) {
    payload.job_type_entries = await normalizeTemplateLikeEntries(payload.job_type_entries);
  }

  if (payload.pricing_override === '') payload.pricing_override = null;
  if (payload.budgeted_wip === '')     payload.budgeted_wip = 0;
  if (payload.submission_date === '')  payload.submission_date = null;

  if (payload.is_recurring) {
    payload.month_range = null;
    payload.recurrence_type = payload.recurrence_type ? String(payload.recurrence_type).trim() : null;
    payload.recurrence_start_date = toDateInputString(payload.recurrence_start_date);
    payload.recurrence_end_date = toDateInputString(payload.recurrence_end_date);
    if (payload.deadline_day !== undefined && payload.deadline_day !== null) {
      payload.deadline_day = Number(payload.deadline_day);
      if (payload.deadline_day < 1) payload.deadline_day = 1;
      if (payload.deadline_day > 31) payload.deadline_day = 31;
    }
  } else {
    payload.month_range = null;
    payload.recurrence_type = null;
    payload.recurrence_start_date = null;
    payload.recurrence_end_date = null;
    payload.recurring_month_entries = [];
  }

  // Accept deadline_day for all jobs, clamp to 1-31
  if (payload.deadline_day !== undefined && payload.deadline_day !== null && payload.deadline_day !== '') {
    payload.deadline_day = Number(payload.deadline_day);
    if (payload.deadline_day < 1) payload.deadline_day = 1;
    if (payload.deadline_day > 31) payload.deadline_day = 31;
  } else {
    payload.deadline_day = null;
  }

  return payload;
};

export const listJobs = asyncHandler(async (req, res) => {
  const query = { organisation_id: req.user.organisation_id };

  // --- Task 3.4: submission_date, pricing_override and budgeted_wip filters ---

  // Filter by job status (e.g. Pending, In Progress, Completed)
  if (req.query.status) {
    query.status = String(req.query.status);
  }

  // Filter by department
  if (req.query.department_id) {
    query.department_id = String(req.query.department_id);
  }

  // Filter by client ObjectId
  if (req.query.client_id) {
    try {
      query.client_id = toObjectId(req.query.client_id, 'client_id');
    } catch (_err) {
      return res.status(400).json({ detail: 'Invalid client_id format' });
    }
  }

  // Filter by financial year (e.g. "2026")
  if (req.query.financial_year) {
    query.financial_year = String(req.query.financial_year);
  }

  // Filter: only jobs that have a manual pricing override set
  if (String(req.query.has_pricing_override || '').toLowerCase() === 'true') {
    query.pricing_override = { $ne: null, $gt: 0 };
  }

  // Filter by submission_date range (ISO date strings YYYY-MM-DD)
  if (req.query.submission_date_from || req.query.submission_date_to) {
    query.submission_date = {};
    if (req.query.submission_date_from) {
      query.submission_date.$gte = new Date(req.query.submission_date_from);
    }
    if (req.query.submission_date_to) {
      query.submission_date.$lte = new Date(req.query.submission_date_to);
    }
  }

  // Filter by deadline range (ISO date strings YYYY-MM-DD)
  if (req.query.deadline_from || req.query.deadline_to) {
    query.deadline = {};
    if (req.query.deadline_from) {
      query.deadline.$gte = new Date(req.query.deadline_from);
    }
    if (req.query.deadline_to) {
      query.deadline.$lte = new Date(req.query.deadline_to);
    }
  }

  // Keyword search across job name and client name
  // Group 4 – Task 4.1: use $text (backed by text index) when available;
  // fall back to escaped regex so the endpoint works before the index is built.
  if (req.query.search) {
    const term = String(req.query.search).trim();
    if (term) {
      query.$text = { $search: term };
    }
  }

  // Filter by allocation status (Partially Allocated, Fully Allocated)
  if (req.query.allocation_status) {
    const allowed = ['Partially Allocated', 'Fully Allocated'];
    const val = String(req.query.allocation_status);
    if (!allowed.includes(val)) {
      return res.status(400).json({
        detail: `allocation_status must be one of: ${allowed.join(', ')}`,
      });
    }
    query.status = val;
  }

  // Filter by recurring status (true / false)
  if (req.query.is_recurring !== undefined) {
    query.is_recurring = req.query.is_recurring === 'true';
  }

  // Filter by month (YYYY-MM)
  //   - Recurring jobs: matched against recurring_month_entries.$elemMatch
  //   - Once-off jobs: matched against submission_date range
  if (req.query.month) {
    const parts = String(req.query.month).split('-');
    if (parts.length === 2) {
      const year = parseInt(parts[0], 10);
      const monthNum = parseInt(parts[1], 10);
      if (!isNaN(year) && !isNaN(monthNum) && monthNum >= 1 && monthNum <= 12) {
        const startOfMonth = new Date(year, monthNum - 1, 1);
        const endOfMonth = new Date(year, monthNum, 0, 23, 59, 59, 999);
        query.$or = [
          {
            is_recurring: true,
            recurring_month_entries: { $elemMatch: { month: monthNum, year } },
          },
          {
            is_recurring: { $ne: true },
            submission_date: { $gte: startOfMonth, $lte: endOfMonth },
          },
        ];
      }
    }
  }

  if (!req.admin) {
    const assignedJobIds = await Allocation.distinct('job_id', {
      organisation_id: req.user.organisation_id,
      staff_id: req.user._id,
    });
    query._id = { $in: assignedJobIds };
  }

  // Sort
  const sortFieldMap = {
    created_at: 'createdAt',
    updated_at: 'updatedAt',
    client_name: 'client_name',
    job_fee: 'job_fee',
    deadline: 'deadline',
    status: 'status',
    priority: 'priority',
    total_allocated_percentage: 'total_allocated_percentage',
    name: 'name',
  };
  const sortBy = sortFieldMap[String(req.query.sort_by || 'created_at')] || 'createdAt';
  const sortOrder = req.query.sort_order === 'asc' ? 1 : -1;

  const { page, limit, skip } = parsePagination(req.query);
  const [records, total] = await Promise.all([
    Job.find(query).sort({ [sortBy]: sortOrder }).skip(skip).limit(limit).lean(),
    Job.countDocuments(query),
  ]);

  res.json({ data: serializeList(records), pagination: buildPaginationMeta(total, page, limit) });
});

export const getJobById = asyncHandler(async (req, res) => {
  const _id = toObjectId(req.params.job_id, 'job_id');
  const record = await Job.findById(_id);
  if (!record) return res.status(404).json({ detail: 'Job not found' });
  if (String(record.organisation_id) !== String(req.user.organisation_id)) {
    return res.status(403).json({ detail: 'Access denied' });
  }
  if (!(await ensureJobVisibleToRequester(req, _id))) {
    return res.status(403).json({ detail: 'Access denied' });
  }
  return res.json(serializeDocument(record));
});

export const createJob = asyncHandler(async (req, res) => {
  const body = await normalizeJobPayload(req.body || {});
  if (!body.name || !body.client_name || body.job_fee === undefined) {
    return res.status(400).json({ detail: 'name, client_name, job_type and job_fee are required' });
  }
  const recurringError = getRecurringPayloadError(body);
  if (recurringError) {
    return res.status(400).json({ detail: recurringError });
  }
  if (body.is_recurring) {
    body.recurring_month_entries = reconcileRecurringMonthEntries(
      body.recurrence_type,
      body.recurrence_start_date,
      body.recurrence_end_date,
      [],
      body.deadline_day,
    ).nextEntries;
  }

  const withinLimit = await checkPlanLimit(req, res, 'jobs');
  if (!withinLimit) return;

  const created = await Job.create({
    ...body,
    financial_year: body.financial_year || String(new Date().getUTCFullYear()),
    organisation_id: req.user.organisation_id,
    created_by: req.user._id,
  });

  return res.status(201).json(serializeDocument(created));
});

export const updateJob = asyncHandler(async (req, res) => {
  const _id = toObjectId(req.params.job_id, 'job_id');
  const payload = await normalizeJobPayload(req.body || {});

  const existing = await Job.findById(_id);
  if (!existing) return res.status(404).json({ detail: 'Job not found' });
  if (String(existing.organisation_id) !== String(req.user.organisation_id)) {
    return res.status(403).json({ detail: 'Access denied' });
  }

  if (existing.status === 'Completed' && payload.status !== 'On Hold') {
    return res.status(422).json({
      detail: 'This job is completed and locked. Allocations and time entries can no longer be changed.',
    });
  }

  const recurringError = getRecurringPayloadError(payload);
  if (recurringError) {
    return res.status(400).json({ detail: recurringError });
  }
  if (payload.is_recurring) {
    const { nextEntries, removedKeys } = reconcileRecurringMonthEntries(
      payload.recurrence_type,
      payload.recurrence_start_date,
      payload.recurrence_end_date,
      existing.recurring_month_entries || [],
      payload.deadline_day,
    );
    existing.recurring_month_entries = nextEntries;
    payload.recurring_month_entries = nextEntries;
    existing.markModified('recurring_month_entries');
    removeMonthlyAllocationKeys(existing, removedKeys);
  }

  Object.keys(payload).forEach((key) => {
    if (key !== '_id' && key !== 'id') {
      existing[key] = payload[key];
    }
  });

  const updated = await existing.save();
  return res.json(serializeDocument(updated));
});

export const patchRecurringMonth = asyncHandler(async (req, res) => {
  const _id = toObjectId(req.params.job_id, 'job_id');
  const { month, year, status, deadline } = req.body;

  if (!month || !year) {
    return res.status(400).json({ detail: 'month and year are required' });
  }

  const job = await Job.findById(_id);
  if (!job) return res.status(404).json({ detail: 'Job not found' });
  if (String(job.organisation_id) !== String(req.user.organisation_id)) {
    return res.status(403).json({ detail: 'Access denied' });
  }
  if (!job.is_recurring) {
    return res.status(400).json({ detail: 'Job is not recurring' });
  }

  const entry = job.recurring_month_entries.find(
    (e) => e.month === month && e.year === year
  );
  if (!entry) {
    return res.status(404).json({ detail: 'Month entry not found' });
  }

  if (status !== undefined) entry.status = status;
  if (deadline !== undefined) entry.deadline = deadline ? new Date(deadline) : null;

  await job.save();
  return res.json(serializeDocument(job));
});

export const deleteJob = asyncHandler(async (req, res) => {
  const _id = toObjectId(req.params.job_id, 'job_id');
  const existing = await Job.findById(_id);
  if (!existing) return res.status(404).json({ detail: 'Job not found' });
  if (String(existing.organisation_id) !== String(req.user.organisation_id)) {
    return res.status(403).json({ detail: 'Access denied' });
  }
  if (existing.status === 'Completed') {
    return res.status(422).json({
      detail: 'This job is completed and locked. Allocations and time entries can no longer be changed.',
    });
  }
  const deleted = await Job.findByIdAndDelete(_id);
  if (!deleted) return res.status(404).json({ detail: 'Job not found' });
  return res.json({ message: 'Job deleted', id: _id.toString(), _id: _id.toString() });
});

const VALID_STATUS_TRANSITIONS = {
  'Pending': ['Partially Allocated', 'Fully Allocated', 'In Progress', 'On Hold', 'Completed'],
  'Partially Allocated': ['Fully Allocated', 'In Progress', 'On Hold', 'Pending', 'Completed'],
  'Fully Allocated': ['In Progress', 'Partially Allocated', 'On Hold', 'Pending', 'Completed'],
  'In Progress': ['Completed', 'On Hold', 'Partially Allocated'],
  'Completed': ['On Hold'],
  'On Hold': ['Pending', 'Partially Allocated', 'Fully Allocated', 'In Progress', 'Completed'],
};

export const updateJobStatus = asyncHandler(async (req, res) => {
  const _id = toObjectId(req.params.job_id, 'job_id');
  const { status } = req.body;

  if (!status) {
    return res.status(400).json({ detail: 'status is required' });
  }

  const allowed = ['Pending', 'Partially Allocated', 'Fully Allocated', 'In Progress', 'Completed', 'On Hold'];
  if (!allowed.includes(status)) {
    return res.status(400).json({
      detail: `Invalid status. Must be one of: ${allowed.join(', ')}`,
    });
  }

  const job = await Job.findById(_id);
  if (!job) return res.status(404).json({ detail: 'Job not found' });
  if (String(job.organisation_id) !== String(req.user.organisation_id)) {
    return res.status(403).json({ detail: 'Access denied' });
  }

  const validTransitions = VALID_STATUS_TRANSITIONS[job.status] || [];
  if (!validTransitions.includes(status)) {
    return res.status(422).json({
      detail: `Cannot transition from "${job.status}" to "${status}". Allowed: ${validTransitions.join(', ')}`,
    });
  }

  if (status === 'Completed' && job.status === 'On Hold') {
    // Allow completing from On Hold
  }

  job.status = status;
  await job.save();

  return res.json({ ...serializeDocument(job), message: `Job status updated to "${status}"` });
});

export const getJobAllocationStatus = asyncHandler(async (req, res) => {
  const _id = toObjectId(req.params.job_id, 'job_id');
  const record = await Job.findById(_id);
  if (!record) return res.status(404).json({ detail: 'Job not found' });
  if (String(record.organisation_id) !== String(req.user.organisation_id)) {
    return res.status(403).json({ detail: 'Access denied' });
  }
  if (!(await ensureJobVisibleToRequester(req, _id))) {
    return res.status(403).json({ detail: 'Access denied' });
  }
  const totalAllocated = Number(record.total_allocated_percentage || 0);
  return res.json({
    job_id: _id.toString(),
    job_name: record.name,
    total_allocated_percentage: totalAllocated,
    remaining_percentage: Math.max(0, 100 - totalAllocated),
  });
});
