import TimeEntry from '../models/TimeEntry.js';
import Allocation from '../models/Allocation.js';
import Job from '../models/Job.js';
import { toObjectId } from '../utils/objectId.js';
import { serializeDocument, serializeList } from '../utils/serialize.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { parsePagination, buildPaginationMeta } from '../utils/pagination.js'; // Group 4 – Task 4.2
import { canActOnStaff } from '../middleware/auth.js';
import { syncJobWorkflowStatus } from '../services/workComponentService.js';
import {
  appendAllocationSnapshotVersion,
} from '../services/allocationSnapshotService.js';

const COMPLETED_JOB_LOCK_DETAIL = 'This job is completed and locked. Allocations and time entries can no longer be changed.';

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

const parseUtcIso = (value, field) => {
  if (!value || typeof value !== 'string') {
    throw new Error(`${field} is required and must be a UTC ISO datetime`);
  }
  const trimmed = value.trim();
  if (!trimmed.endsWith('Z')) {
    throw new Error(`${field} must be a UTC ISO datetime ending with Z`);
  }
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`${field} must be a valid UTC ISO datetime`);
  }
  return parsed;
};

const computeHoursWorked = (startTime, endTime) => {
  const ms = new Date(endTime).getTime() - new Date(startTime).getTime();
  const rawHours = ms / 3600000;
  const rounded = Number(rawHours.toFixed(2));
  if (!Number.isFinite(rounded) || rounded <= 0) {
    throw new Error('end_time must be later than start_time');
  }
  return rounded;
};

const recalcAllocationProgress = async (allocationId) => {
  const [allocation, sumResult] = await Promise.all([
    Allocation.findById(allocationId),
    TimeEntry.aggregate([
      { $match: { allocation_id: allocationId } },
      { $group: { _id: '$allocation_id', total: { $sum: '$hours_worked' } } },
    ]),
  ]);

  if (!allocation) return null;

  const actual = Number(sumResult?.[0]?.total || 0);
  const completedPct = allocation.adjusted_hours > 0 ? (actual / allocation.adjusted_hours) * 100 : 0;
  allocation.completed_percentage = Number(Math.max(0, Math.min(100, completedPct)).toFixed(2));
  await allocation.save();
  await syncJobWorkflowStatus(allocation.job_id);
  return allocation;
};

export const listTimeEntries = asyncHandler(async (req, res) => {
  const query = { organisation_id: req.user.organisation_id };

  if (req.query.staff_id) query.staff_id = toObjectId(req.query.staff_id, 'staff_id');
  if (req.query.job_id) query.job_id = toObjectId(req.query.job_id, 'job_id');
  if (req.query.allocation_id) query.allocation_id = toObjectId(req.query.allocation_id, 'allocation_id');
  if (req.query.month) {
    const month = String(req.query.month);
    const [y, m] = month.split('-');
    const nextMonth = `${parseInt(m) === 12 ? `${parseInt(y) + 1}-01` : `${y}-${String(parseInt(m) + 1).padStart(2, '0')}`}`;
    query.date = { $gte: `${month}-01`, $lt: `${nextMonth}-01` };
  }

  const { page, limit, skip } = parsePagination(req.query);
  const [records, total] = await Promise.all([
    TimeEntry.find(query)
      .sort({ start_time: -1, created_at: -1 })
      .skip(skip)
      .limit(limit)
      .populate('staff_id', 'name'),
    TimeEntry.countDocuments(query),
  ]);
  const data = records.map((record) => {
    const raw = serializeDocument(record);
    return {
      ...raw,
      staff_id: record.staff_id?._id?.toString?.() || raw.staff_id,
      staff_name: record.staff_id?.name || null,
    };
  });
  res.json({ data, pagination: buildPaginationMeta(total, page, limit) });
});

export const getTimeEntryById = asyncHandler(async (req, res) => {
  const _id = toObjectId(req.params.entry_id, 'entry_id');
  const record = await TimeEntry.findById(_id);
  if (!record) return res.status(404).json({ detail: 'Time entry not found' });
  if (String(record.organisation_id) !== String(req.user.organisation_id)) {
    return res.status(403).json({ detail: 'Access denied' });
  }

  return res.json(serializeDocument(record));
});

export const createTimeEntry = asyncHandler(async (req, res) => {
  const { allocation_id, start_time, end_time, description } = req.body || {};

  if (!allocation_id || !start_time || !end_time || !description) {
    return res.status(400).json({ detail: 'allocation_id, start_time, end_time and description are required' });
  }

  if (String(description).trim().length < 5) {
    return res.status(400).json({ detail: 'description must be at least 5 characters' });
  }

  let startTime;
  let endTime;
  let hoursWorked;
  try {
    startTime = parseUtcIso(start_time, 'start_time');
    endTime = parseUtcIso(end_time, 'end_time');
    hoursWorked = computeHoursWorked(startTime, endTime);
  } catch (error) {
    return res.status(400).json({ detail: error.message });
  }

  const allocationObjectId = toObjectId(allocation_id, 'allocation_id');
  const allocation = await Allocation.findById(allocationObjectId);
  if (!allocation) return res.status(404).json({ detail: 'Allocation not found' });
  if (!hasOrgAccess(allocation, req.user.organisation_id)) {
    return res.status(403).json({ detail: 'Access denied' });
  }
  const allocationJobState = await ensureAllocationJobMutable(allocation, req.user.organisation_id);
  if (!allocationJobState.ok) return res.status(allocationJobState.status).json({ detail: allocationJobState.detail });

  if (allocation.workflow_status === 'Completed') {
    return res.status(422).json({ detail: 'Cannot log time on a completed component. Mark it uncomplete first.' });
  }

  const allowed = await canActOnStaff(req.user, allocation.staff_id);
  if (!allowed) return res.status(403).json({ detail: 'You are not allowed to log time for this assignment' });

  if (allocation.workflow_status === 'Pending') {
    allocation.workflow_status = 'Doing';
    allocation.started_at = startTime;
    allocation.started_by = req.user?._id || null;
    allocation.started_timezone = req.body?.timezone || null;
    await allocation.save();
  }

  const created = await TimeEntry.create({
    allocation_id: allocation._id,
    staff_id: allocation.staff_id,
    job_id: allocation.job_id,
    start_time: startTime,
    end_time: endTime,
    date: startTime.toISOString().slice(0, 10),
    hours_worked: Number(hoursWorked),
    description: String(description).trim(),
    organisation_id: req.user.organisation_id,
    created_by: req.user._id,
  });

  await recalcAllocationProgress(allocation._id);
  const refreshedAllocation = await Allocation.findById(allocation._id);
  if (refreshedAllocation) {
    await appendAllocationSnapshotVersion({
      allocation: refreshedAllocation,
      state: refreshedAllocation.workflow_status === 'Completed' ? 'completed' : 'draft',
      reason: 'time_entry_created',
      createdBy: req.user?._id || null,
      monthScoped: false,
      force: true,
    });
  }

  return res.status(201).json(serializeDocument(created));
});

export const updateTimeEntry = asyncHandler(async (req, res) => {
  const _id = toObjectId(req.params.entry_id, 'entry_id');
  const body = { ...req.body };
  const existing = await TimeEntry.findById(_id);
  if (!existing) return res.status(404).json({ detail: 'Time entry not found' });
  if (String(existing.organisation_id) !== String(req.user.organisation_id)) {
    return res.status(403).json({ detail: 'Access denied' });
  }

  const allowedForExisting = await canActOnStaff(req.user, existing.staff_id);
  if (!allowedForExisting) return res.status(403).json({ detail: 'You are not allowed to update this time entry' });

  const existingAllocation = await Allocation.findById(existing.allocation_id);
  if (!existingAllocation) return res.status(404).json({ detail: 'Allocation not found' });
  if (!hasOrgAccess(existingAllocation, req.user.organisation_id)) {
    return res.status(403).json({ detail: 'Access denied' });
  }
  const mutableExisting = await ensureAllocationJobMutable(existingAllocation, req.user.organisation_id);
  if (!mutableExisting.ok) return res.status(mutableExisting.status).json({ detail: mutableExisting.detail });
  if (existingAllocation.workflow_status === 'Completed') {
    return res.status(422).json({ detail: 'Cannot modify time on a completed component. Mark it uncomplete first.' });
  }

  if (body.description !== undefined && String(body.description || '').trim().length < 5) {
    return res.status(400).json({ detail: 'description must be at least 5 characters' });
  }

  let targetAllocation = existingAllocation;
  if (body.allocation_id) {
    const allocationObjectId = toObjectId(body.allocation_id, 'allocation_id');
    const allocation = await Allocation.findById(allocationObjectId);
    if (!allocation) return res.status(404).json({ detail: 'Allocation not found' });
    if (!hasOrgAccess(allocation, req.user.organisation_id)) {
      return res.status(403).json({ detail: 'Access denied' });
    }
    const mutableTarget = await ensureAllocationJobMutable(allocation, req.user.organisation_id);
    if (!mutableTarget.ok) return res.status(mutableTarget.status).json({ detail: mutableTarget.detail });

    if (allocation.workflow_status === 'Completed') {
      return res.status(422).json({ detail: 'Cannot move time entry to a completed component. Mark it uncomplete first.' });
    }

    const allowed = await canActOnStaff(req.user, allocation.staff_id);
    if (!allowed) return res.status(403).json({ detail: 'You are not allowed to update this time entry' });

    body.allocation_id = allocation._id;
    body.staff_id = allocation.staff_id;
    body.job_id = allocation.job_id;
    targetAllocation = allocation;
  }

  let startTime = existing.start_time;
  let endTime = existing.end_time;
  try {
    if (body.start_time !== undefined) startTime = parseUtcIso(body.start_time, 'start_time');
    if (body.end_time !== undefined) endTime = parseUtcIso(body.end_time, 'end_time');
  } catch (error) {
    return res.status(400).json({ detail: error.message });
  }

  let hoursWorked;
  try {
    hoursWorked = computeHoursWorked(startTime, endTime);
  } catch (error) {
    return res.status(400).json({ detail: error.message });
  }

  body.start_time = startTime;
  body.end_time = endTime;
  body.date = new Date(startTime).toISOString().slice(0, 10);
  body.hours_worked = hoursWorked;
  if (body.description !== undefined) body.description = String(body.description).trim();

  const updated = await TimeEntry.findByIdAndUpdate(_id, body, { new: true, runValidators: true });
  if (!updated) return res.status(404).json({ detail: 'Time entry not found' });

  await Promise.all([
    recalcAllocationProgress(existing.allocation_id),
    existing.allocation_id?.toString() !== targetAllocation._id?.toString()
      ? recalcAllocationProgress(targetAllocation._id)
      : Promise.resolve(),
  ]);

  const [updatedExistingAllocation, updatedTargetAllocation] = await Promise.all([
    Allocation.findById(existing.allocation_id),
    existing.allocation_id?.toString() !== targetAllocation._id?.toString()
      ? Allocation.findById(targetAllocation._id)
      : Promise.resolve(null),
  ]);

  if (updatedExistingAllocation) {
    await appendAllocationSnapshotVersion({
      allocation: updatedExistingAllocation,
      state: updatedExistingAllocation.workflow_status === 'Completed' ? 'completed' : 'draft',
      reason: 'time_entry_updated_source',
      createdBy: req.user?._id || null,
      monthScoped: false,
      force: true,
    });
  }
  if (updatedTargetAllocation) {
    await appendAllocationSnapshotVersion({
      allocation: updatedTargetAllocation,
      state: updatedTargetAllocation.workflow_status === 'Completed' ? 'completed' : 'draft',
      reason: 'time_entry_updated_target',
      createdBy: req.user?._id || null,
      monthScoped: false,
      force: true,
    });
  }

  return res.json(serializeDocument(updated));
});

export const deleteTimeEntry = asyncHandler(async (req, res) => {
  const _id = toObjectId(req.params.entry_id, 'entry_id');
  const entry = await TimeEntry.findById(_id);
  if (!entry) return res.status(404).json({ detail: 'Time entry not found' });
  if (String(entry.organisation_id) !== String(req.user.organisation_id)) {
    return res.status(403).json({ detail: 'Access denied' });
  }

  const allocation = await Allocation.findById(entry.allocation_id);
  if (!allocation) return res.status(404).json({ detail: 'Allocation not found' });
  if (!hasOrgAccess(allocation, req.user.organisation_id)) {
    return res.status(403).json({ detail: 'Access denied' });
  }
  const mutable = await ensureAllocationJobMutable(allocation, req.user.organisation_id);
  if (!mutable.ok) return res.status(mutable.status).json({ detail: mutable.detail });
  if (allocation.workflow_status === 'Completed') {
    return res.status(422).json({ detail: 'Cannot delete time on a completed component. Mark it uncomplete first.' });
  }

  const allowed = await canActOnStaff(req.user, entry.staff_id);
  if (!allowed) return res.status(403).json({ detail: 'You are not allowed to delete this time entry' });

  const deleted = await TimeEntry.findByIdAndDelete(_id);
  if (!deleted) return res.status(404).json({ detail: 'Time entry not found' });

  await recalcAllocationProgress(entry.allocation_id);
  const refreshedAllocation = await Allocation.findById(entry.allocation_id);
  if (refreshedAllocation) {
    await appendAllocationSnapshotVersion({
      allocation: refreshedAllocation,
      state: refreshedAllocation.workflow_status === 'Completed' ? 'completed' : 'draft',
      reason: 'time_entry_deleted',
      createdBy: req.user?._id || null,
      monthScoped: false,
      force: true,
    });
  }

  return res.json({ message: 'Time entry deleted', id: _id.toString(), _id: _id.toString() });
});
