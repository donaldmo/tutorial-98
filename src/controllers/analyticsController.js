import Allocation from '../models/Allocation.js';
import Job from '../models/Job.js';
import Staff from '../models/Staff.js';
import TimeEntry from '../models/TimeEntry.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { getTeamCapacity } from '../services/capacityService.js';
import { monthValue } from '../services/planningService.js';
import { buildEfficiencySnapshot } from '../services/reportHelpers.js';

const round = (value, p = 2) => Number((value || 0).toFixed(p));

const getDepartmentJobIds = async (orgId, departmentId) => {
  if (!departmentId) return null;
  const jobs = await Job.find({ organisation_id: orgId, department_id: String(departmentId) }, { _id: 1 });
  return jobs.map((job) => job._id);
};

const isCompletedAllocation = (allocation) => {
  const workflowStatus = String(allocation?.workflow_status || '').toLowerCase();
  return Boolean(allocation?.completed_at) || workflowStatus === 'completed';
};

const isStartedAllocation = (allocation) => {
  const workflowStatus = String(allocation?.workflow_status || '').toLowerCase();
  return Boolean(allocation?.started_at) || workflowStatus === 'doing';
};

export const getStaffEfficiency = asyncHandler(async (req, res) => {
  const month = String(req.query.month || new Date().toISOString().slice(0, 7));
  const orgId = req.user.organisation_id;
  const departmentId = req.query.department_id ? String(req.query.department_id) : null;
  const snapshot = await buildEfficiencySnapshot(orgId, { month, departmentId });
  return res.json({ month: snapshot.month, staff: snapshot.staff });
});

export const getJobsEfficiency = asyncHandler(async (req, res) => {
  const month = String(req.query.month || new Date().toISOString().slice(0, 7));
  const orgId = req.user.organisation_id;
  const snapshot = await buildEfficiencySnapshot(orgId, { month });
  return res.json({ month: snapshot.month, jobs: snapshot.jobs });
});

export const getDepartmentEfficiency = asyncHandler(async (req, res) => {
  const month = String(req.query.month || new Date().toISOString().slice(0, 7));
  const orgId = req.user.organisation_id;
  const departmentId = req.query.department_id ? String(req.query.department_id) : null;
  const snapshot = await buildEfficiencySnapshot(orgId, { month, departmentId });
  return res.json(snapshot.departments);
});

export const getManagementDashboard = asyncHandler(async (req, res) => {
  const month = String(req.query.month || new Date().toISOString().slice(0, 7));
  const orgId = req.user.organisation_id;
  const snapshot = await buildEfficiencySnapshot(orgId, { month });
  return res.json({
    month: snapshot.month,
    summary: snapshot.summary,
  });
});

export const getLifecycleEfficiency = asyncHandler(async (req, res) => {
  const month = String(req.query.month || new Date().toISOString().slice(0, 7));
  const orgId = req.user.organisation_id;

  const allocations = await Allocation.find({ month, organisation_id: orgId });

  const withStaff = allocations.filter((allocation) => Boolean(allocation?.staff_id));

  const realisedRows = withStaff.filter((allocation) => isCompletedAllocation(allocation));
  const floatingRows = withStaff.filter(
    (allocation) => isStartedAllocation(allocation) && !isCompletedAllocation(allocation)
  );

  const totalTrackedRows = realisedRows.length + floatingRows.length;
  const realisedCount = realisedRows.length;
  const floatingCount = floatingRows.length;

  const realisedHours = round(realisedRows.reduce((acc, row) => acc + Number(row.adjusted_hours || 0), 0));
  const floatingHours = round(floatingRows.reduce((acc, row) => acc + Number(row.adjusted_hours || 0), 0));

  const realisedFees = round(realisedRows.reduce((acc, row) => acc + Number(row.allocated_fee || 0), 0));
  const floatingFees = round(floatingRows.reduce((acc, row) => acc + Number(row.allocated_fee || 0), 0));

  return res.json({
    month,
    realised: {
      count: realisedCount,
      hours: realisedHours,
      fees: realisedFees,
      percentage: round(totalTrackedRows > 0 ? (realisedCount / totalTrackedRows) * 100 : 0, 1),
    },
    floating: {
      count: floatingCount,
      hours: floatingHours,
      fees: floatingFees,
      percentage: round(totalTrackedRows > 0 ? (floatingCount / totalTrackedRows) * 100 : 0, 1),
    },
  });
});

// Group 3 – Task 3.4: WIP summary
export const getWipSummary = asyncHandler(async (req, res) => {
  const month = String(req.query.month || new Date().toISOString().slice(0, 7));
  const orgId = req.user.organisation_id;

  const jobs = await Job.find({ organisation_id: orgId });

  const rows = jobs.map((job) => {
    const fee = Number(job.job_fee || 0);
    const effectivePrice = job.pricing_override != null ? Number(job.pricing_override) : fee;
    const budgetedWip = Number(job.budgeted_wip || 0);
    const variance = budgetedWip - effectivePrice;

    return {
      job_id: job._id.toString(),
      job_name: job.name,
      client_name: job.client_name,
      status: job.status,
      job_fee: round(fee),
      pricing_override: job.pricing_override != null ? round(Number(job.pricing_override)) : null,
      effective_price: round(effectivePrice),
      budgeted_wip: round(budgetedWip),
      variance: round(variance),
      variance_status: variance >= 0 ? 'Under' : 'Over',
    };
  });

  const totalBudgetedWip = rows.reduce((acc, r) => acc + r.budgeted_wip, 0);
  const totalEffectivePrice = rows.reduce((acc, r) => acc + r.effective_price, 0);

  return res.json({
    month,
    total_budgeted_wip: round(totalBudgetedWip),
    total_effective_price: round(totalEffectivePrice),
    total_variance: round(totalBudgetedWip - totalEffectivePrice),
    jobs: rows,
  });
});

// Group 3 – Task 3.3: Calendar-aware team capacity
export const getCapacitySummary = asyncHandler(async (req, res) => {
  const month = String(req.query.month || new Date().toISOString().slice(0, 7));
  const orgId = req.user.organisation_id;
  const data = await getTeamCapacity(monthValue(month), orgId);
  return res.json(data);
});

export const getUnderutilisedDrilldown = asyncHandler(async (req, res) => {
  const month = String(req.query.month || new Date().toISOString().slice(0, 7));
  const orgId = req.user.organisation_id;
  const departmentId = req.query.department_id ? String(req.query.department_id) : null;
  const jobIds = await getDepartmentJobIds(orgId, departmentId);
  const staffFilter = {
    is_active: true,
    is_archived: { $ne: true },
    organisation_id: orgId,
    ...(departmentId ? { department_id: departmentId } : {}),
  };
  const [capacity, allocations, staffList] = await Promise.all([
    getTeamCapacity(monthValue(month), orgId),
    Allocation.find({ month, organisation_id: orgId, ...(jobIds ? { job_id: { $in: jobIds } } : {}) }),
    Staff.find(staffFilter).select('_id hourly_rate'),
  ]);
  const scopedStaffIds = new Set(staffList.map((staff) => staff._id.toString()));

  const hourlyRateByStaff = new Map(staffList.map((s) => [s._id.toString(), Number(s.hourly_rate || 0)]));

  const rows = capacity.staff
    .filter((row) => scopedStaffIds.has(row.staff_id))
    .map((row) => {
      const staffId = row.staff_id;
      const staffAllocs = allocations.filter((a) => a.staff_id?.toString() === staffId);
      const allocatedHours = staffAllocs.reduce((acc, a) => acc + Number(a.adjusted_hours || 0), 0);
      const capacityHours = Number(row.effective_capacity_hours || 0);
      const utilization = capacityHours > 0 ? (allocatedHours / capacityHours) * 100 : 0;
      const hoursToFill = Math.max(0, capacityHours - allocatedHours);
      const hourlyRate = hourlyRateByStaff.get(staffId) || 0;

      return {
        staff_id: staffId,
        name: row.name,
        role: row.role,
        hourly_rate: round(hourlyRate),
        utilization_percentage: round(utilization, 1),
        hours_to_fill: round(hoursToFill, 1),
        potential_fee_loss: round(hoursToFill * hourlyRate),
      };
    })
    .filter((row) => row.utilization_percentage < 50)
    .sort((a, b) => a.utilization_percentage - b.utilization_percentage);

  return res.json({
    month,
    total_count: rows.length,
    total_hours_to_fill: round(rows.reduce((acc, row) => acc + Number(row.hours_to_fill || 0), 0), 1),
    under_utilised_staff: rows,
  });
});

export const getOverutilisedDrilldown = asyncHandler(async (req, res) => {
  const month = String(req.query.month || new Date().toISOString().slice(0, 7));
  const orgId = req.user.organisation_id;
  const departmentId = req.query.department_id ? String(req.query.department_id) : null;
  const jobIds = await getDepartmentJobIds(orgId, departmentId);
  const staffFilter = {
    is_active: true,
    is_archived: { $ne: true },
    organisation_id: orgId,
    ...(departmentId ? { department_id: departmentId } : {}),
  };
  const [capacity, allocations] = await Promise.all([
    getTeamCapacity(monthValue(month), orgId),
    Allocation.find({ month, organisation_id: orgId, ...(jobIds ? { job_id: { $in: jobIds } } : {}) }),
  ]);
  const scopedStaff = await Staff.find(staffFilter).select('_id');
  const scopedStaffIds = new Set(scopedStaff.map((staff) => staff._id.toString()));

  const rows = capacity.staff
    .filter((row) => scopedStaffIds.has(row.staff_id))
    .map((row) => {
      const staffId = row.staff_id;
      const staffAllocs = allocations.filter((a) => a.staff_id?.toString() === staffId);
      const allocatedHours = staffAllocs.reduce((acc, a) => acc + Number(a.adjusted_hours || 0), 0);
      const capacityHours = Number(row.effective_capacity_hours || 0);
      const utilization = capacityHours > 0 ? (allocatedHours / capacityHours) * 100 : 0;
      const overAllocatedHours = Math.max(0, allocatedHours - capacityHours);
      return {
        staff_id: staffId,
        name: row.name,
        role: row.role,
        utilization_percentage: round(utilization, 1),
        over_allocated_hours: round(overAllocatedHours, 1),
        risk_level: utilization >= 120 ? 'High' : 'Medium',
      };
    })
    .filter((row) => row.utilization_percentage > 90)
    .sort((a, b) => b.utilization_percentage - a.utilization_percentage);

  return res.json({
    month,
    total_count: rows.length,
    over_utilised_staff: rows,
  });
});

export const getJobsStatusDrilldown = asyncHandler(async (req, res) => {
  const statusRaw = String(req.params.status || '').trim();
  const normalized = statusRaw.toLowerCase();

  const orgId = req.user.organisation_id;
  const departmentId = req.query.department_id ? String(req.query.department_id) : null;
  let filter = { organisation_id: orgId, ...(departmentId ? { department_id: departmentId } : {}) };
  if (normalized === 'pending') filter.status = 'Pending';
  else if (normalized === 'in progress') filter.status = 'In Progress';
  else if (normalized === 'completed') filter.status = 'Completed';
  else if (normalized === 'partially allocated') filter.status = 'Partially Allocated';
  else if (normalized === 'fully allocated') filter.status = 'Fully Allocated';
  else if (normalized === 'on hold') filter.status = 'On Hold';

  const jobs = await Job.find(filter).select('_id name client_name job_type_label job_fee total_allocated_percentage');

  const rows = jobs.map((job) => {
    const fee = Number(job.job_fee || 0);
    const pct = Number(job.total_allocated_percentage || 0);
    return {
      job_id: job._id.toString(),
      name: job.name,
      job_type: job.job_type_label || 'General',
      client_name: job.client_name,
      job_fee: round(fee),
      total_allocated_percentage: round(pct, 1),
      remaining_fee: round(Math.max(0, fee * (1 - Math.min(100, pct) / 100))),
    };
  });

  return res.json({
    status: statusRaw,
    month: String(req.query.month || ''),
    department_id: departmentId,
    total_count: rows.length,
    total_fees: round(rows.reduce((acc, row) => acc + Number(row.job_fee || 0), 0)),
    jobs: rows,
  });
});
