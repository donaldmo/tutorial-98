import Staff from '../models/Staff.js';
import Job from '../models/Job.js';
import Allocation from '../models/Allocation.js';
import TimeEntry from '../models/TimeEntry.js';
import Department from '../models/Department.js';
import OrganisationMembership from '../models/OrganisationMembership.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { toObjectId } from '../utils/objectId.js';
import { ensureCalendarForMonth, monthValue } from '../services/planningService.js';

const round = (value, precision = 2) => Number(Number(value || 0).toFixed(precision));

const getDepartmentJobIds = async (orgId, departmentId) => {
  if (!departmentId) return null;
  const jobs = await Job.find({ organisation_id: orgId, department_id: String(departmentId) }, { _id: 1 });
  return jobs.map((job) => job._id);
};

export const getDashboardSummary = asyncHandler(async (_req, res) => {
  const [
    totalStaff,
    activeStaff,
    totalJobs,
    pendingJobs,
    inProgressJobs,
    totalAllocations,
    totalTimeEntries,
    openAuthorizations,
  ] = await Promise.all([
    Staff.countDocuments({}),
    Staff.countDocuments({ is_active: true, is_archived: { $ne: true } }),
    Job.countDocuments({}),
    Job.countDocuments({ status: 'Pending' }),
    Job.countDocuments({ status: 'In Progress' }),
    Allocation.countDocuments({}),
    TimeEntry.countDocuments({}),
    // Avoid hard dependency on model import to keep this lightweight
    Staff.db.collection('authorization_requests').countDocuments({ status: 'Pending' }),
  ]);

  return res.json({
    generated_at: new Date().toISOString(),
    summary: {
      total_staff: totalStaff,
      active_staff: activeStaff,
      total_jobs: totalJobs,
      pending_jobs: pendingJobs,
      in_progress_jobs: inProgressJobs,
      total_allocations: totalAllocations,
      total_time_entries: totalTimeEntries,
      pending_authorizations: openAuthorizations,
    },
  });
});

export const getPersonalDashboardSummary = asyncHandler(async (req, res) => {
  const staffId = toObjectId(req.params.staff_id, 'staff_id');
  const orgId = req.activeOrganisationId || req.user.organisation_id;

  if (!req.admin && String(req.user?._id || '') !== String(staffId)) {
    return res.status(403).json({ detail: 'You can only view your own dashboard summary.' });
  }

  const staffMember = req.admin
    ? await Staff.findById(staffId)
        .select('name role email phone profile_picture_url organisation_id is_active is_archived')
        .lean()
    : req.user?.toObject?.() || req.user;

  if (!staffMember || staffMember.is_active === false || staffMember.is_archived === true) {
    return res.status(404).json({ detail: 'Staff member not found.' });
  }

  if (req.admin) {
    const hasMembership =
      String(staffMember.organisation_id || '') === String(orgId || '') ||
      await OrganisationMembership.exists({
        staff_id: staffId,
        organisation_id: orgId,
        status: 'active',
      });

    if (!hasMembership) {
      return res.status(404).json({ detail: 'Staff member not found in the active organisation.' });
    }
  }

  const [allocations, totalTimeResult] = await Promise.all([
    Allocation.find({ staff_id: staffId, organisation_id: orgId }),
    TimeEntry.aggregate([
      { $match: { staff_id: staffId, organisation_id: orgId } },
      { $group: { _id: '$staff_id', totalHours: { $sum: '$hours_worked' } } },
    ]),
  ]);

  const allocationIds = allocations.map((a) => a._id);
  const jobIds = [...new Set(allocations.map((a) => a.job_id?.toString()).filter(Boolean))];

  return res.json({
    id: staffId.toString(),
    _id: staffId.toString(),
    generated_at: new Date().toISOString(),
    staff: {
      id: staffId.toString(),
      name: staffMember.name || null,
      role: staffMember.role || null,
      email: staffMember.email || null,
      phone: staffMember.phone || null,
      profile_picture_url: staffMember.profile_picture_url || null,
    },
    summary: {
      assigned_allocations: allocations.length,
      assigned_jobs: jobIds.length,
      total_adjusted_hours: Number(allocations.reduce((acc, cur) => acc + Number(cur.adjusted_hours || 0), 0).toFixed(2)),
      completed_allocations: allocations.filter((a) => a.workflow_status === 'Completed').length,
      total_logged_hours: Number((totalTimeResult[0]?.totalHours || 0).toFixed(2)),
      allocation_ids: allocationIds.map((x) => x.toString()),
    },
  });
});

// ─── Summary Enhanced ──────────────────────────────────────────────────────
export const getSummaryEnhanced = asyncHandler(async (req, res) => {
  const month = String(req.query.month || new Date().toISOString().slice(0, 7));
  const { department_id } = req.query;
  const orgId = req.user.organisation_id;

  const jobFilter = { organisation_id: orgId, ...(department_id ? { department_id: String(department_id) } : {}) };
  const staffFilter = { is_active: true, is_archived: { $ne: true }, organisation_id: orgId, ...(department_id ? { department_id: String(department_id) } : {}) };

  const [
    staffMembers,
    totalJobs,
    pendingJobs,
    doingJobs,
    completedJobs,
    pendingAllocationJobs,
    partiallyAllocatedJobs,
    fullyAllocatedJobs,
    onHoldJobs,
    jobFeeAgg,
    { summary: calendarSummary },
  ] = await Promise.all([
    Staff.find(staffFilter).select('_id available_hours_per_month'),
    Job.countDocuments(jobFilter),
    Job.countDocuments({ ...jobFilter, status: 'Pending' }),
    Job.countDocuments({ ...jobFilter, status: 'In Progress' }),
    Job.countDocuments({ ...jobFilter, status: 'Completed' }),
    Job.countDocuments({ ...jobFilter, status: 'Pending', total_allocated_percentage: 0 }),
    Job.countDocuments({ ...jobFilter, status: 'Partially Allocated' }),
    Job.countDocuments({ ...jobFilter, status: 'Fully Allocated' }),
    Job.countDocuments({ ...jobFilter, status: 'On Hold' }),
    Job.aggregate([{ $match: jobFilter }, { $group: { _id: null, total: { $sum: '$job_fee' } } }]),
    ensureCalendarForMonth(monthValue(month), orgId),
  ]);

  // Build allocation filter — if dept scoped, restrict to jobs in that dept
  let allocationFilter = { month, organisation_id: orgId };
  if (department_id) {
    const jobsInDept = await Job.find({ department_id: String(department_id), organisation_id: orgId }, { _id: 1 });
    allocationFilter = { month, organisation_id: orgId, job_id: { $in: jobsInDept.map((j) => j._id) } };
  }

  const monthAllocations = await Allocation.find(allocationFilter);
  const allocatedHours = monthAllocations.reduce((a, c) => a + Number(c.adjusted_hours || 0), 0);
  const allocatedFees = monthAllocations.reduce((a, c) => a + Number(c.allocated_fee || 0), 0);

  const totalBaseHours = staffMembers.reduce((acc, s) => acc + Number(s.available_hours_per_month || 160), 0);
  const capacityBase = calendarSummary.capacity_hours > 0
    ? (calendarSummary.capacity_hours * totalBaseHours) / 160
    : totalBaseHours;
  const utilizationPct = capacityBase > 0 ? round((allocatedHours / capacityBase) * 100, 1) : 0;

  return res.json({
    total_staff: staffMembers.length,
    jobs: {
      total: totalJobs,
      pending: pendingJobs,
      in_progress: doingJobs,
      completed: completedJobs,
      pending_allocation: pendingAllocationJobs,
      partially_allocated: partiallyAllocatedJobs,
      fully_allocated: fullyAllocatedJobs,
      on_hold: onHoldJobs,
    },
    capacity: {
      utilization_percentage: utilizationPct,
      allocated_hours: round(allocatedHours),
    },
    revenue: {
      total_job_fees: round(jobFeeAgg[0]?.total || 0),
      allocated_fees_this_month: round(allocatedFees),
    },
  });
});

// ─── Capacity ─────────────────────────────────────────────────────────────
export const getDashboardCapacity = asyncHandler(async (req, res) => {
  const month = String(req.query.month || new Date().toISOString().slice(0, 7));
  const monthKey = monthValue(month);
  const orgId = req.user.organisation_id;
  const departmentId = req.query.department_id ? String(req.query.department_id) : null;
  const staffFilter = { is_active: true, is_archived: { $ne: true }, organisation_id: orgId, ...(departmentId ? { department_id: departmentId } : {}) };
  const scopedJobIds = await getDepartmentJobIds(orgId, departmentId);
  const allocationFilter = {
    month: monthKey,
    organisation_id: orgId,
    ...(scopedJobIds ? { job_id: { $in: scopedJobIds } } : {}),
  };

  const [staffList, allocations, { summary: calendarSummary }] = await Promise.all([
    Staff.find(staffFilter),
    Allocation.find(allocationFilter),
    ensureCalendarForMonth(monthKey, orgId),
  ]);

  const staffCapacity = staffList
    .map((staff) => {
      const staffId = staff._id.toString();
      const staffAllocations = allocations.filter((a) => a.staff_id?.toString() === staffId);

      const allocatedHours = staffAllocations.reduce((acc, a) => acc + Number(a.adjusted_hours || 0), 0);
      const allocatedFees = staffAllocations.reduce((acc, a) => acc + Number(a.allocated_fee || 0), 0);

      const baseMonthlyHours = Number(staff.available_hours_per_month || 160);
      const effectiveCapacity = calendarSummary.capacity_hours > 0
        ? (calendarSummary.capacity_hours * baseMonthlyHours) / 160
        : baseMonthlyHours;

      const utilization = effectiveCapacity > 0 ? (allocatedHours / effectiveCapacity) * 100 : 0;

      return {
        staff_id: staffId,
        name: staff.name,
        role: staff.role,
        allocated_hours: round(allocatedHours),
        allocated_fees: round(allocatedFees),
        capacity_hours: round(effectiveCapacity),
        remaining_hours: round(Math.max(0, effectiveCapacity - allocatedHours)),
        utilization_percentage: round(utilization, 1),
      };
    })
    .sort((a, b) => b.utilization_percentage - a.utilization_percentage);

  return res.json({
    month: monthKey,
    calendar: {
      working_days_count: calendarSummary.working_days_count,
      daily_capacity_hours: calendarSummary.daily_capacity_hours,
      capacity_hours: round(calendarSummary.capacity_hours),
    },
    staff_capacity: staffCapacity,
  });
});

// ─── Insights ─────────────────────────────────────────────────────────────
export const getDashboardInsights = asyncHandler(async (req, res) => {
  const month = String(req.query.month || new Date().toISOString().slice(0, 7));
  const monthKey = monthValue(month);
  const orgId = req.user.organisation_id;
  const departmentId = req.query.department_id ? String(req.query.department_id) : null;
  const staffFilter = { is_active: true, is_archived: { $ne: true }, organisation_id: orgId, ...(departmentId ? { department_id: departmentId } : {}) };
  const jobFilter = { organisation_id: orgId, ...(departmentId ? { department_id: departmentId } : {}) };
  const scopedJobIds = await getDepartmentJobIds(orgId, departmentId);
  const allocationFilter = {
    month: monthKey,
    organisation_id: orgId,
    ...(scopedJobIds ? { job_id: { $in: scopedJobIds } } : {}),
  };

  const [staffList, allocations, pendingJobs, partialJobs, { summary: calendarSummary }] = await Promise.all([
    Staff.find(staffFilter),
    Allocation.find(allocationFilter),
    Job.find({ ...jobFilter, status: 'Pending' }).select('_id name client_name priority'),
    Job.find({ ...jobFilter, status: 'Partially Allocated' }).select('_id name client_name total_allocated_percentage'),
    ensureCalendarForMonth(monthKey, orgId),
  ]);

  const staffInsights = staffList.map((staff) => {
    const staffId = staff._id.toString();
    const staffAllocations = allocations.filter((a) => a.staff_id?.toString() === staffId);
    const allocatedHours = staffAllocations.reduce((acc, a) => acc + Number(a.adjusted_hours || 0), 0);
    const baseMonthlyHours = Number(staff.available_hours_per_month || 160);
    const effectiveCapacity = calendarSummary.capacity_hours > 0
      ? (calendarSummary.capacity_hours * baseMonthlyHours) / 160
      : baseMonthlyHours;
    const utilization = effectiveCapacity > 0 ? (allocatedHours / effectiveCapacity) * 100 : 0;
    return {
      staff_id: staffId,
      name: staff.name,
      role: staff.role,
      utilization: round(utilization, 1),
      hours_to_fill: round(Math.max(0, effectiveCapacity - allocatedHours), 1),
      over_hours: round(Math.max(0, allocatedHours - effectiveCapacity), 1),
    };
  });

  const underUtilised = staffInsights
    .filter((s) => s.utilization < 50)
    .sort((a, b) => a.utilization - b.utilization)
    .slice(0, 5);

  const overUtilised = staffInsights
    .filter((s) => s.utilization > 90)
    .sort((a, b) => b.utilization - a.utilization)
    .slice(0, 5);

  const insights = [];

  if (overUtilised.length) {
    insights.push({
      type: 'danger',
      title: 'Over-utilised staff risk',
      message: `${overUtilised.length} team member(s) are above 90% utilization this month.`,
      recommendation: 'Rebalance allocations across departments to reduce burnout risk.',
      details: overUtilised,
    });
  }

  if (underUtilised.length) {
    insights.push({
      type: 'warning',
      title: 'Available capacity detected',
      message: `${underUtilised.length} team member(s) are below 50% utilization.`,
      recommendation: 'Move pending or partially allocated jobs to available staff where possible.',
      details: underUtilised,
    });
  }

  if (partialJobs.length) {
    insights.push({
      type: 'warning',
      title: 'Partially allocated jobs',
      message: `${partialJobs.length} job(s) are partially allocated and need completion.`,
      recommendation: 'Complete role allocations for partially allocated jobs.',
      details: partialJobs.slice(0, 5).map((job) => ({
        name: job.name,
        client: job.client_name,
        allocated_percentage: round(Number(job.total_allocated_percentage || 0), 1),
        remaining_percentage: round(Math.max(0, 100 - Number(job.total_allocated_percentage || 0)), 1),
      })),
    });
  }

  if (pendingJobs.length) {
    insights.push({
      type: 'info',
      title: 'Pending jobs backlog',
      message: `${pendingJobs.length} job(s) are still pending and not in progress.`,
      recommendation: 'Prioritise job kickoff and assignment to avoid delivery delays.',
      details: pendingJobs.slice(0, 5).map((job) => ({
        name: job.name,
        client: job.client_name,
        priority: job.priority,
      })),
    });
  }

  if (!insights.length) {
    insights.push({
      type: 'success',
      title: 'Operations look healthy',
      message: 'No major allocation or utilization risks detected for this month.',
      recommendation: 'Continue monitoring weekly and keep allocation data up to date.',
      details: [],
    });
  }

  return res.json({ month: monthKey, insights });
});

// ─── Time Summary ──────────────────────────────────────────────────────────
export const getTimeSummary = asyncHandler(async (req, res) => {
  const month = String(req.query.month || new Date().toISOString().slice(0, 7));
  const { department_id } = req.query;
  const orgId = req.user.organisation_id;

  let allocationFilter = { month, organisation_id: orgId };
  if (department_id) {
    const jobsInDept = await Job.find({ department_id: String(department_id), organisation_id: orgId }, { _id: 1 });
    allocationFilter = { month, organisation_id: orgId, job_id: { $in: jobsInDept.map((j) => j._id) } };
  }

  const allocations = await Allocation.find(allocationFilter);
  const allocationIds = allocations.map((a) => a._id);
  const timeEntries = allocationIds.length
    ? await TimeEntry.find({
      allocation_id: { $in: allocationIds },
      date: { $regex: `^${month}` },
    })
    : [];

  const totalBudgeted = allocations.reduce((a, c) => a + Number(c.adjusted_hours || 0), 0);
  const totalFees = allocations.reduce((a, c) => a + Number(c.allocated_fee || 0), 0);
  const totalLogged = timeEntries.reduce((a, c) => a + Number(c.hours_worked || 0), 0);
  const efficiency = totalBudgeted > 0 ? round((totalLogged / totalBudgeted) * 100, 1) : 0;
  const effectiveRate = totalLogged > 0 ? round(totalFees / totalLogged) : 0;

  return res.json({
    month,
    overall: {
      total_budgeted: round(totalBudgeted),
      total_logged: round(totalLogged),
      efficiency,
      total_fees: round(totalFees),
      effective_rate: round(effectiveRate),
    },
  });
});

// ─── Work Status by Department ─────────────────────────────────────────────
export const getWorkStatusByDepartment = asyncHandler(async (req, res) => {
  const month = String(req.query.month || new Date().toISOString().slice(0, 7));
  const { department_id } = req.query;
  const orgId = req.user.organisation_id;

  const today = new Date(); today.setHours(0, 0, 0, 0);
  const in7Days = new Date(today); in7Days.setDate(in7Days.getDate() + 7);
  const in30Days = new Date(today); in30Days.setDate(in30Days.getDate() + 30);

  const inactiveStatuses = ['Completed', 'Cancelled'];
  const isActive = (j) => !inactiveStatuses.includes(j.status);
  const isOverdue = (j) => j.deadline && new Date(j.deadline) < today && isActive(j);
  const isUrgent = (j) => j.deadline && new Date(j.deadline) >= today && new Date(j.deadline) < in7Days && isActive(j);
  const isUpcoming = (j) => j.deadline && new Date(j.deadline) >= in7Days && new Date(j.deadline) < in30Days && isActive(j);
  const isOngoing = (j) => j.status === 'In Progress';

  const [departments, allJobs] = await Promise.all([
    Department.find(department_id ? { _id: department_id, organisation_id: orgId } : { is_active: true, organisation_id: orgId }),
    Job.find(department_id ? { department_id: String(department_id), organisation_id: orgId } : { organisation_id: orgId }),
  ]);

  const deptRows = departments.map((dept) => {
    const deptId = dept._id.toString();
    const deptJobs = allJobs.filter((j) => j.department_id === deptId);
    return {
      department_id: deptId,
      department_name: dept.name,
      department_code: dept.name.substring(0, 3).toUpperCase(),
      overdue_count: deptJobs.filter(isOverdue).length,
      urgent_count: deptJobs.filter(isUrgent).length,
      upcoming_count: deptJobs.filter(isUpcoming).length,
      ongoing_count: deptJobs.filter(isOngoing).length,
    };
  });

  return res.json({
    month,
    totals: {
      total_overdue: allJobs.filter(isOverdue).length,
      total_urgent: allJobs.filter(isUrgent).length,
      total_upcoming: allJobs.filter(isUpcoming).length,
      total_ongoing: allJobs.filter(isOngoing).length,
    },
    departments: deptRows,
  });
});
