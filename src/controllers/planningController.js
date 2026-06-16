import Allocation from '../models/Allocation.js';
import Job from '../models/Job.js';
import MonthlySnapshot from '../models/MonthlySnapshot.js';
import Staff from '../models/Staff.js';
import TimeEntry from '../models/TimeEntry.js';
import WorkingDayCalendar from '../models/WorkingDayCalendar.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { serializeDocument, serializeList } from '../utils/serialize.js';
import {
  buildSnapshotPayload,
  calculateCalendarSummary,
  ensureCalendarForMonth,
  matchesMonth,
  monthValue,
  round,
  upsertMonthlySnapshot,
} from '../services/planningService.js';
import { getEffectiveAllocationView } from '../services/allocationSnapshotService.js';

const buildSnapshotInputs = async (month, orgId) => {
  const monthKey = monthValue(month);
  const [{ summary: calendarSummary }, jobs, staff, allocations, timeEntries] = await Promise.all([
    ensureCalendarForMonth(monthKey, orgId),
    Job.find({ organisation_id: orgId }),
    Staff.find({ is_active: true, is_archived: { $ne: true }, organisation_id: orgId }),
    Allocation.find({ month: monthKey, organisation_id: orgId }),
    TimeEntry.find({ date: { $regex: `^${monthKey}-` }, organisation_id: orgId }),
  ]);

  const effectiveAllocations = allocations.map((allocation) => getEffectiveAllocationView(allocation, { requestedMonth: monthKey }));

  const staffRows = staff.map((member) => {
    const memberAllocations = effectiveAllocations.filter((allocation) => allocation.staff_id?.toString() === member._id.toString());
    const allocatedHours = memberAllocations.reduce((acc, allocation) => acc + Number(allocation.adjusted_hours || 0), 0);
    const allocatedFees = memberAllocations.reduce((acc, allocation) => acc + Number(allocation.allocated_fee || 0), 0);
    const monthlyCapacity = calendarSummary.capacity_hours > 0
      ? calendarSummary.capacity_hours * ((Number(member.available_hours_per_month || 160) || 160) / 160)
      : Number(member.available_hours_per_month || 160);
    return {
      staff_id: member._id.toString(),
      name: member.name,
      role: member.role,
      monthly_capacity: round(monthlyCapacity),
      allocated_hours: round(allocatedHours),
      remaining_hours: round(monthlyCapacity - allocatedHours),
      utilization_percentage: round(monthlyCapacity > 0 ? (allocatedHours / monthlyCapacity) * 100 : 0, 1),
      allocated_fees: round(allocatedFees),
    };
  });

  const jobRows = jobs.map((job) => {
    const jobAllocations = effectiveAllocations.filter((allocation) => allocation.job_id?.toString() === job._id.toString());
    const allocationIds = jobAllocations.map((allocation) => allocation._id.toString());
    const actualHours = timeEntries
      .filter((entry) => allocationIds.includes(entry.allocation_id?.toString()))
      .reduce((acc, entry) => acc + Number(entry.hours_worked || 0), 0);
    const budgetedHours = jobAllocations.reduce((acc, allocation) => acc + Number(allocation.adjusted_hours || 0), 0);
    const fee = Number(job.pricing_override ?? job.job_fee ?? 0);
    const progress = budgetedHours > 0 ? (actualHours / budgetedHours) * 100 : 0;

    return {
      job_id: job._id.toString(),
      job_name: job.name,
      client_name: job.client_name,
      status: job.status,
      submission_date: job.submission_date,
      total_fee: round(fee),
      budgeted_wip: round(job.budgeted_wip || 0),
      budgeted_hours: round(budgetedHours),
      actual_hours: round(actualHours),
      progress_percentage: round(progress, 1),
      wip_value: round(Math.max(0, Number(job.budgeted_wip || 0) - ((progress / 100) * Number(job.budgeted_wip || 0)))),
    };
  });

  const overUnderRows = staff.map((member) => {
    const memberAllocations = effectiveAllocations.filter((allocation) => allocation.staff_id?.toString() === member._id.toString());
    const scheduledFees = memberAllocations.reduce((acc, allocation) => acc + Number(allocation.allocated_fee || 0), 0);
    const scheduledHours = memberAllocations.reduce((acc, allocation) => acc + Number(allocation.adjusted_hours || 0), 0);
    const monthlyFeeTarget = Number(member.annual_fee_budget || 0) / 12;
    const monthlyHoursTarget = Number(member.annual_budgeted_hours || 0) / 12;
    return {
      staff_id: member._id.toString(),
      name: member.name,
      role: member.role,
      monthly_fee_target: round(monthlyFeeTarget),
      scheduled_fees: round(scheduledFees),
      fee_variance: round(scheduledFees - monthlyFeeTarget),
      monthly_hours_target: round(monthlyHoursTarget),
      scheduled_hours: round(scheduledHours),
      hours_variance: round(scheduledHours - monthlyHoursTarget),
      fee_status: scheduledFees >= monthlyFeeTarget ? 'Over' : 'Under',
      hours_status: scheduledHours >= monthlyHoursTarget ? 'Over' : 'Under',
    };
  });

  return { month: monthKey, calendarSummary, staffRows, jobRows, overUnderRows };
};

export const getPlanningCalendar = asyncHandler(async (req, res) => {
  const month = monthValue(req.query.month);
  const { calendar, summary, holiday_configs } = await ensureCalendarForMonth(month, req.user.organisation_id);
  return res.json({
    ...(calendar ? serializeDocument(calendar) : { id: null, _id: null, month }),
    holiday_configs,
    ...summary,
  });
});

export const upsertPlanningCalendarConfig = asyncHandler(async (req, res) => {
  const month = monthValue(req.body?.month || req.query.month);
  const body = req.body || {};
  const workingDaysOverrideRaw = body.working_days_override;
  const working_days_override = workingDaysOverrideRaw === '' || workingDaysOverrideRaw == null
    ? null
    : Math.max(0, Math.floor(Number(workingDaysOverrideRaw)));
  const payload = {
    month,
    organisation_id: req.user.organisation_id,
    daily_capacity_hours: Number(body.daily_capacity_hours || 8),
    working_days_override: Number.isFinite(Number(working_days_override)) ? working_days_override : null,
    holidays: Array.isArray(body.holidays) ? body.holidays : [],
    extra_working_days: Array.isArray(body.extra_working_days) ? body.extra_working_days : [],
    notes: body.notes || null,
  };

  const updated = await WorkingDayCalendar.findOneAndUpdate(
    { month, organisation_id: req.user.organisation_id },
    payload,
    { upsert: true, new: true, runValidators: true },
  );

  const summary = calculateCalendarSummary(month, updated, Number(updated.daily_capacity_hours || 8));
  return res.json({ ...serializeDocument(updated), holiday_configs: updated.holidays || [], ...summary });
});

export const getPlanningCalendarYear = asyncHandler(async (req, res) => {
  const yearStr = String(req.query.year || '').trim();
  if (!/^\d{4}$/.test(yearStr)) {
    return res.status(400).json({ detail: 'year query parameter is required (YYYY)' });
  }

  const year = Number(yearStr);
  const orgId = req.user.organisation_id;
  const months = Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, '0')}`);
  const rows = await Promise.all(months.map(async (m) => {
    const { summary, holiday_configs, calendar } = await ensureCalendarForMonth(m, orgId);
    return {
      month: summary.month,
      working_days_count: summary.working_days_count,
      capacity_hours: summary.capacity_hours,
      daily_capacity_hours: summary.daily_capacity_hours,
      holidays: summary.holidays,
      holiday_configs,
      extra_working_days: summary.extra_working_days,
      working_days_override: calendar?.working_days_override ?? null,
      has_custom_config: Boolean(calendar && String(calendar.organisation_id || '') === String(orgId || '')),
    };
  }));

  return res.json({ year, months: rows });
});

export const listMonthlySnapshots = asyncHandler(async (req, res) => {
  const records = await MonthlySnapshot.find({ organisation_id: req.user.organisation_id }).sort({ month: -1 });
  return res.json(serializeList(records));
});

export const createMonthlySnapshot = asyncHandler(async (req, res) => {
  const month = monthValue(req.body?.month || req.query.month);
  const orgId = req.user.organisation_id;
  const inputs = await buildSnapshotInputs(month, orgId);
  const payload = { ...buildSnapshotPayload(inputs), organisation_id: orgId };
  const snapshot = await upsertMonthlySnapshot(payload, orgId);
  return res.status(201).json(serializeDocument(snapshot));
});

export const getMonthlySnapshotByMonth = asyncHandler(async (req, res) => {
  const month = monthValue(req.params.month);
  const record = await MonthlySnapshot.findOne({ month, organisation_id: req.user.organisation_id });
  if (!record) {
    return res.status(404).json({ detail: 'Snapshot not found' });
  }
  return res.json(serializeDocument(record));
});

export { buildSnapshotInputs };
