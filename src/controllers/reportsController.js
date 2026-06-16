import Allocation from '../models/Allocation.js';
import Department from '../models/Department.js';
import Job from '../models/Job.js';
import MonthlySnapshot from '../models/MonthlySnapshot.js';
import Staff from '../models/Staff.js';
import TimeEntry from '../models/TimeEntry.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { buildSnapshotInputs } from './planningController.js';
import { ensureCalendarForMonth, monthValue, round } from '../services/planningService.js';
import { getEffectiveAllocationView } from '../services/allocationSnapshotService.js';
import { buildFirmProfitabilityReport, buildUtilizationProductivityReport, buildWipStatusReport, isBillable } from '../services/reportHelpers.js';
import { withPerformanceMeta, withRiskMeta, withStatusMeta } from '../services/reportsNormalization.js';
import computeTeamProductivity from '../services/teamProductivityService.js';
import { listStaffMonthlySummaries } from '../services/staffMonthlySummaryService.js';
// Revenue per employee implementation removed — endpoint disabled

const monthKeyValue = (m) => monthValue(m);

const summarizeRiskLevels = (rows = []) => ({
  high_risk_count: rows.filter((row) => row.risk_level === 'High').length,
  medium_risk_count: rows.filter((row) => row.risk_level === 'Medium').length,
  low_risk_count: rows.filter((row) => row.risk_level === 'Low').length,
  total_overtime: round(rows.reduce((acc, row) => acc + Number(row.overtime_hours || 0), 0), 2),
});

/**
 * loadCommon – Group 4 / Task 4.3: optimised shared data loader.
 *
 * Changes from original:
 * - TimeEntry is now queried by known allocation IDs (not full table scan).
 *   Callers may still pass `month` to restrict allocations first; the
 *   resulting allocation IDs are then used to filter time entries in the DB.
 * - An `allocFilter` override is accepted for callers that already have a
 *   specific query (e.g. all allocations regardless of month).
 */
const loadCommon = async (month, orgId, { allocFilter } = {}) => {
  const allocationQuery = allocFilter ?? (month ? { month, organisation_id: orgId } : { organisation_id: orgId });

  const [jobs, staff, allocations, departments] = await Promise.all([
    Job.find({ organisation_id: orgId }),
    Staff.find({ is_active: true, is_archived: { $ne: true }, organisation_id: orgId }),
    Allocation.find(allocationQuery),
    Department.find({ is_active: true, organisation_id: orgId }),
  ]);

  // Only fetch time entries for the allocations we already have – no full scan.
  const allocIds = allocations.map((a) => a._id);
  const timeEntries = allocIds.length
    ? await TimeEntry.find({ organisation_id: orgId, allocation_id: { $in: allocIds } })
    : [];

  const effectiveAllocations = allocations.map((allocation) => getEffectiveAllocationView(allocation, { requestedMonth: month }));

  return { jobs, staff, allocations: effectiveAllocations, timeEntries, departments };
};

export const reportUtilizationProductivity = asyncHandler(async (req, res) => {
  const month = monthKeyValue(req.query.month);
  const orgId = req.user.organisation_id;
  const report = await buildUtilizationProductivityReport(orgId, { month });
  return res.json(report);
});

export const reportWipStatus = asyncHandler(async (req, res) => {
  const month = req.query.month ? monthKeyValue(req.query.month) : null;
  const orgId = req.user.organisation_id;
  const includeNonBillable = req.query.include_non_billable === 'true' || req.query.include_non_billable === true;
  const report = await buildWipStatusReport(orgId, { month, includeNonBillable });
  return res.json(report);
});

export const reportFirmProfitability = asyncHandler(async (req, res) => {
  const month = req.query.month ? monthKeyValue(req.query.month) : null;
  const orgId = req.user.organisation_id;
  const report = await buildFirmProfitabilityReport(orgId, { month });
  return res.json(report);
});

export const reportRevenuePerEmployee = asyncHandler(async (req, res) => {
  const month = monthKeyValue(req.query.month);
  const orgId = req.user.organisation_id;
  const { staff, allocations, departments } = await loadCommon(month, orgId);
  let staffRecords = Array.isArray(staff) ? [...staff] : [];
  const loadedStaffIds = new Set(staffRecords.map((row) => String(row._id)));
  const assignedStaffIds = Array.from(new Set(allocations.map((allocation) => String(allocation.staff_id || '')).filter(Boolean)));
  const missingAssignedStaffIds = assignedStaffIds.filter((staffId) => !loadedStaffIds.has(staffId));

  if (missingAssignedStaffIds.length > 0) {
    const fallbackStaff = await Staff.find({
      _id: { $in: missingAssignedStaffIds },
      is_archived: { $ne: true },
    });

    const mergedById = new Map(staffRecords.map((row) => [String(row._id), row]));
    fallbackStaff.forEach((row) => {
      mergedById.set(String(row._id), row);
    });
    staffRecords = Array.from(mergedById.values());
  }

  const staffById = new Map((staffRecords || []).map((s) => [String(s._id), s]));
  const allocationsByStaff = allocations.reduce((acc, allocation) => {
    const sid = String(allocation.staff_id || '') || 'unassigned';
    if (!acc.has(sid)) acc.set(sid, []);
    acc.get(sid).push(allocation);
    return acc;
  }, new Map());
  const deptMap = new Map((departments || []).map((d) => [String(d._id), d]));
  const resolveDepartmentId = (staffRec) => {
    if (staffRec?.department_id) return String(staffRec.department_id);
    if (Array.isArray(staffRec?.department_ids) && staffRec.department_ids.length > 0) {
      return String(staffRec.department_ids[0]);
    }
    return '__unassigned__';
  };

  const staffRows = Array.from(allocationsByStaff.entries()).map(([sid, allocs]) => {
    const staffRec = staffById.get(sid);
    const name = staffRec ? staffRec.name : (allocs[0]?.staff_name || 'Unassigned');
    const departmentId = resolveDepartmentId(staffRec);
    const departmentName = departmentId !== '__unassigned__' ? (deptMap.get(departmentId)?.name || 'Unassigned') : 'Unassigned';

    const allocationsDetails = allocs.map((allocation) => {
      const allocationId = String(allocation._id);
      const allocatedRevenue = Number(allocation.allocated_fee || 0);
      const allocatedHours = Number(allocation.adjusted_hours || 0);
      const staffHourly = staffRec && Number(staffRec.hourly_rate) > 0 ? Number(staffRec.hourly_rate) : 0;
      const impliedRate = allocatedHours > 0 ? allocatedRevenue / allocatedHours : 0;
      const effectiveRate = staffHourly > 0 ? staffHourly : impliedRate;
      const estimatedCost = allocatedHours * effectiveRate * 0.5;

      return {
        allocation_id: allocationId,
        job_id: allocation.job_id || null,
        work_component_key: allocation.work_component_key || null,
        allocated_hours: round(allocatedHours, 2),
        allocated_fee: round(allocatedRevenue, 2),
        effective_hourly_rate: round(effectiveRate, 2),
        estimated_cost: round(estimatedCost, 2),
        workflow_status: allocation.workflow_status || null,
      };
    });

    const totalAllocatedHours = allocationsDetails.reduce((acc, detail) => acc + Number(detail.allocated_hours || 0), 0);
    const totalAllocatedRevenue = allocationsDetails.reduce((acc, detail) => acc + Number(detail.allocated_fee || 0), 0);
    const totalEstimatedCost = allocationsDetails.reduce((acc, detail) => acc + Number(detail.estimated_cost || 0), 0);
    const totalNetContribution = totalAllocatedRevenue - totalEstimatedCost;

    return {
      staff_id: sid,
      staff_name: name,
      name,
      role: staffRec?.role || allocs[0]?.staff_role || '',
      department_id: departmentId === '__unassigned__' ? null : departmentId,
      department_name: departmentName,
      allocation_count: allocs.length,
      allocated_hours: round(totalAllocatedHours, 2),
      allocated_revenue: round(totalAllocatedRevenue, 2),
      estimated_cost: round(totalEstimatedCost, 2),
      net_contribution: round(totalNetContribution, 2),
      allocations: allocationsDetails,
    };
  }).sort((a, b) => Number(b.allocated_revenue || 0) - Number(a.allocated_revenue || 0));

  const teamsMap = staffRows.reduce((acc, row) => {
    const key = String(row.department_id || '__unassigned__');
    if (!acc.has(key)) {
      acc.set(key, {
        department_id: row.department_id || null,
        department_name: row.department_name || 'Unassigned',
        staff_count: 0,
        allocated_revenue: 0,
        estimated_cost: 0,
        net_contribution: 0,
      });
    }

    const current = acc.get(key);
    current.staff_count += 1;
    current.allocated_revenue += Number(row.allocated_revenue || 0);
    current.estimated_cost += Number(row.estimated_cost || 0);
    current.net_contribution += Number(row.net_contribution || 0);
    return acc;
  }, new Map());

  const teams = Array.from(teamsMap.values())
    .map((team) => ({
      department_id: team.department_id,
      department_name: team.department_name,
      staff_count: team.staff_count,
      allocated_revenue: round(team.allocated_revenue, 2),
      estimated_cost: round(team.estimated_cost, 2),
      net_contribution: round(team.net_contribution, 2),
      revenue_per_head: round(team.staff_count > 0 ? team.allocated_revenue / team.staff_count : 0, 2),
    }))
    .sort((a, b) => Number(b.allocated_revenue || 0) - Number(a.allocated_revenue || 0));

  const totalAllocatedRevenue = staffRows.reduce((acc, row) => acc + Number(row.allocated_revenue || 0), 0);
  const totalEstimatedCost = staffRows.reduce((acc, row) => acc + Number(row.estimated_cost || 0), 0);
  const totalNetContribution = totalAllocatedRevenue - totalEstimatedCost;
  const totalStaff = staffRows.length;

  try {
    console.info(`[reports] GET /reports/revenue-per-employee user=${req.user?.id || 'unknown'} org=${orgId} month=${month} staff=${staffRows.length} teams=${teams.length}`);
  } catch (e) {
    // ignore logging issues
  }

  return res.json({
    report_name: 'Revenue per Employee / per Team',
    month,
    generated_at: new Date().toISOString(),
    summary: {
      total_allocated_revenue: round(totalAllocatedRevenue, 2),
      total_estimated_cost: round(totalEstimatedCost, 2),
      total_net_contribution: round(totalNetContribution, 2),
      total_staff: totalStaff,
      total_teams: teams.length,
      average_revenue_per_head: round(totalStaff > 0 ? totalAllocatedRevenue / totalStaff : 0, 2),
    },
    staff: staffRows,
    teams,
  });
});

export const reportActualVsBudgeted = asyncHandler(async (req, res) => {
  const month = monthKeyValue(req.query.month);
  const orgId = req.user.organisation_id;
  const allocQuery = month ? { organisation_id: orgId, month } : { organisation_id: orgId };
  const allocations = await Allocation.find(allocQuery);

  if (!allocations || allocations.length === 0) {
    return res.json({
      report_name: 'Actual vs. Budgeted Hours (Firm View)',
      month,
      generated_at: new Date().toISOString(),
      summary: { budgeted_hours: 0, actual_hours: 0, efficiency_gap: 0, jobs_over_budget: 0 },
      jobs: [],
    });
  }

  const allocIds = allocations.map((a) => a._id);
  const jobIds = Array.from(new Set(allocations.map((a) => String(a.job_id)).filter(Boolean)));
  const jobs = jobIds.length ? await Job.find({ _id: { $in: jobIds } }) : [];
  const jobById = new Map(jobs.map((j) => [String(j._id), j]));

  const timeEntryQuery = allocIds.length ? { organisation_id: orgId, allocation_id: { $in: allocIds } } : { organisation_id: orgId, allocation_id: { $in: [] } };
  if (month) timeEntryQuery.date = { $regex: `^${month}` };
  const timeEntries = allocIds.length ? await TimeEntry.find(timeEntryQuery) : [];

  const entriesByAlloc = timeEntries.reduce((acc, e) => {
    const aid = String(e.allocation_id);
    if (!acc[aid]) acc[aid] = [];
    acc[aid].push(e);
    return acc;
  }, {});

  const allocationDetailsById = {};
  allocations.forEach((a) => {
    const aid = String(a._id);
    const entries = entriesByAlloc[aid] || [];
    const logged = entries.reduce((s, e) => s + Number(e.hours_worked || 0), 0);

    allocationDetailsById[aid] = {
      allocation_id: aid,
      job_id: String(a.job_id || ''),
      work_component_key: a.work_component_key || null,
      adjusted_hours: Number(a.adjusted_hours || 0),
      workflow_status: a.workflow_status || null,
      staff_id: a.staff_id || null,
      staff_name: a.staff_name || null,
      logged_hours: round(logged, 2),
    };
  });

  const allocsByJob = allocations.reduce((acc, a) => {
    const jid = String(a.job_id || '');
    if (!acc[jid]) acc[jid] = [];
    acc[jid].push(allocationDetailsById[String(a._id)]);
    return acc;
  }, {});

  const jobRows = Object.keys(allocsByJob).map((jid) => {
    const jobRec = jobById.get(jid) || {};
    const allocs = allocsByJob[jid] || [];
    const budgeted = allocs.reduce((s, a) => s + Number(a.adjusted_hours || 0), 0);
    const actual = allocs.reduce((s, a) => s + Number(a.logged_hours || 0), 0);
    const variance = actual - budgeted;
    const variancePct = budgeted > 0 ? (variance / budgeted) * 100 : null;
    return {
      job_id: jid,
      job_name: jobRec.name || null,
      client_name: jobRec.client_name || 'Unknown',
      budgeted_hours: round(budgeted),
      actual_hours: round(actual),
      variance_hours: round(variance),
      variance_percentage: variancePct == null ? null : round(variancePct, 1),
      allocations: allocs,
      ...withStatusMeta(variance > 0 ? 'Over Budget' : 'On Track'),
    };
  }).sort((a, b) => Number(b.variance_hours || 0) - Number(a.variance_hours || 0));

  const totalBudgeted = round(jobRows.reduce((acc, r) => acc + Number(r.budgeted_hours || 0), 0));
  const totalActual = round(jobRows.reduce((acc, r) => acc + Number(r.actual_hours || 0), 0));

  try {
    console.info(`[reports] GET /reports/actual-vs-budgeted org=${orgId} month=${month} allocations=${allocations.length} timeEntries=${timeEntries.length || 0} jobs=${jobRows.length}`);
    if (allocations.length > 0) {
      const sample = allocations[0];
      console.info(`[reports] sample_allocation id=${String(sample._id)} job_id=${String(sample.job_id)} adjusted_hours=${Number(sample.adjusted_hours || 0)} workflow_status=${String(sample.workflow_status || '')}`);
    }
  } catch (e) {
    // ignore logging errors
  }

  return res.json({
    report_name: 'Actual vs. Budgeted Hours (Firm View)',
    month,
    generated_at: new Date().toISOString(),
    summary: {
      budgeted_hours: totalBudgeted,
      actual_hours: totalActual,
      efficiency_gap: round(totalActual - totalBudgeted),
      jobs_over_budget: jobRows.filter((row) => row.status === 'Over Budget').length,
    },
    jobs: jobRows,
  });
});

export const reportTurnaroundTime = asyncHandler(async (req, res) => {
  const month = req.query.month ? monthKeyValue(req.query.month) : null;
  const orgId = req.user.organisation_id;
  const { jobs, allocations } = await loadCommon(month, orgId);
  const now = new Date();
  const DAY_MS = 1000 * 60 * 60 * 24;
  const jobById = new Map(jobs.map((j) => [String(j._id), j]));
  const resolveAssumedDeadline = (monthValueString) => {
    const sourceMonth = String(monthValueString || monthValue(now));
    const [year, monthNumber] = sourceMonth.split('-').map(Number);
    return new Date(Date.UTC(year, monthNumber - 1, 25));
  };
  const toDateOrNull = (value) => {
    if (!value) return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  };
  const daysBetween = (end, start) => (start && end ? Math.round((end.getTime() - start.getTime()) / DAY_MS) : null);
  const allocationsByJob = allocations.reduce((acc, allocation) => {
    const jobId = String(allocation.job_id || '');
    if (!jobId) return acc;
    if (!acc[jobId]) acc[jobId] = [];
    acc[jobId].push(allocation);
    return acc;
  }, {});

  const jobRows = Object.keys(allocationsByJob).map((jid) => {
    const job = jobById.get(jid);
    if (!job) return null;
    const jobAllocations = allocationsByJob[jid];
    const explicitDeadline = toDateOrNull(job.deadline);
    const deadlineDate = explicitDeadline || resolveAssumedDeadline(month);
    const allocatedDate = jobAllocations
      .map((allocation) => toDateOrNull(allocation.created_at))
      .filter(Boolean)
      .sort((a, b) => a.getTime() - b.getTime())[0] || null;
    const comparisonDate = allocatedDate || now;
    const comparisonDateSource = allocatedDate ? 'allocation_created_at' : 'current_date';
    const daysVariance = daysBetween(comparisonDate, deadlineDate);

    return {
      job_id: jid,
      job_name: job.name,
      client_name: job.client_name || 'Unassigned',
      ...withStatusMeta(job.status || 'Pending'),
      deadline: deadlineDate.toISOString(),
      deadline_source: explicitDeadline ? 'explicit' : 'assumed_25th',
      comparison_date: comparisonDate.toISOString(),
      comparison_date_source: comparisonDateSource,
      days_variance: daysVariance,
      ...withPerformanceMeta(daysVariance <= 0 ? 'On Time' : 'Late'),
      allocation_count: jobAllocations.length,
    };
  }).filter(Boolean).sort((a, b) => {
    return Number(b.days_variance || 0) - Number(a.days_variance || 0);
  });
  const onTimeJobs = jobRows.filter((r) => r.performance === 'On Time');
  const lateJobs = jobRows.filter((r) => r.performance === 'Late');

  try {
    console.info(`[reports] GET /reports/turnaround-time user=${req.user?.id || 'unknown'} org=${orgId} month=${month} jobs=${jobRows.length} late=${lateJobs.length}`);
  } catch (e) {
    // ignore logging issues
  }

  return res.json({
    report_name: 'Turnaround Time Performance',
    generated_at: now.toISOString(),
    month,
    summary: {
      total_jobs: jobRows.length,
      on_time_count: onTimeJobs.length,
      late_count: lateJobs.length,
      on_time_rate: round(jobRows.length > 0 ? (onTimeJobs.length / jobRows.length) * 100 : 0, 1),
    },
    jobs: jobRows,
  });
});

export const reportTeamProductivity = asyncHandler(async (req, res) => {
  const month = req.query.month ? monthKeyValue(req.query.month) : null;
  const includeNonBillable = req.query.include_non_billable === 'true' || req.query.include_non_billable === true;
  const departmentId = req.query.department_id ? String(req.query.department_id) : null;
  const orgId = req.user.organisation_id;

  const report = await computeTeamProductivity(orgId, { month, includeNonBillable });

  // Optional server-side filter by department id.
  if (departmentId) {
    report.teams = (report.teams || []).filter((team) => String(team.department_id || '') === departmentId);
  }

  return res.json(report);
});

export const reportClosedPerStaff = asyncHandler(async (req, res) => {
  const month = req.query.month ? monthKeyValue(req.query.month) : null;
  const orgId = req.user.organisation_id;
  const { staff, allocations } = await loadCommon(month, orgId);

  const closed = allocations.filter((a) => String(a.workflow_status || '') === 'Completed');

  const byStaff = staff.map((s) => {
    const sid = String(s._id);
    const count = closed.filter((a) => String(a.staff_id || '') === sid).length;
    return { staff_id: sid, name: s.name, closed_count: count };
  });

  try {
    console.info(`[reports] closed-per-staff month=${month} org=${orgId} totalClosed=${closed.length}`);
    byStaff.forEach((b) => console.info(`[reports] closed-per-staff staff=${b.staff_id} name=${b.name} closed=${b.closed_count}`));
  } catch (e) {
    // ignore logging issues
  }

  return res.json({ month, total_closed: closed.length, by_staff: byStaff });
});

export const reportCapacityPlanning = asyncHandler(async (req, res) => {
  const month = monthKeyValue(req.query.month);
  const orgId = req.user.organisation_id;
  const [{ month: monthValue, calendar, staff }, departments] = await Promise.all([
    listStaffMonthlySummaries(orgId, { month }),
    Department.find({ is_active: true, organisation_id: orgId }).lean(),
  ]);
  const deptMap = new Map(departments.map((department) => [String(department._id), department]));

  const rows = staff.map((row) => {
    const utilization = Number(row.utilization_percentage || 0);
    return {
      staff_id: String(row.staff_id),
      staff_name: row.staff_name,
      name: row.name,
      role: row.role,
      department: deptMap.get(String(row.department_id || ''))?.name || 'Unassigned',
      capacity_hours: round(row.monthly_capacity_hours),
      allocated_hours: round(row.allocated_hours),
      remaining_hours: round(row.remaining_hours),
      utilization_percentage: round(utilization, 1),
      ...withStatusMeta(utilization > 100 ? 'Overloaded' : utilization < 50 ? 'Underutilized' : 'Optimal'),
    };
  });

  return res.json({
    report_name: 'Capacity Planning Report',
    month: monthValue,
    calendar,
    summary: {
      total_staff: rows.length,
      overloaded_count: rows.filter((row) => row.status === 'Overloaded').length,
      underutilized_count: rows.filter((row) => row.status === 'Underutilized').length,
      optimal_count: rows.filter((row) => row.status === 'Optimal').length,
    },
    staff: rows,
  });
});

export const reportOvertimeBurnout = asyncHandler(async (req, res) => {
  const month = monthKeyValue(req.query.month);
  const orgId = req.user.organisation_id;
  const { month: monthValue, calendar, staff } = await listStaffMonthlySummaries(orgId, { month });

  const rows = staff.map((row) => {
    const budgeted = Number(row.allocated_hours || 0);
    const actual = Number(row.actual_hours || 0);
    const overtime = Math.max(0, actual - budgeted);
    const overtimePercentage = budgeted > 0 ? (overtime / budgeted) * 100 : 0;
    const riskLevel = overtimePercentage > 30 || actual > budgeted * 1.2
      ? 'High'
      : overtimePercentage > 15 || actual > budgeted
        ? 'Medium'
        : 'Low';

    return {
      staff_id: String(row.staff_id),
      staff_name: row.staff_name,
      name: row.name,
      role: row.role,
      budgeted_hours: round(budgeted),
      actual_hours: round(actual),
      overtime_hours: round(overtime),
      overtime_percentage: round(overtimePercentage, 1),
      ...withRiskMeta(riskLevel),
    };
  });

  return res.json({
    report_name: 'Overtime & Burnout Risk Tracker',
    month: monthValue,
    calendar,
    summary: summarizeRiskLevels(rows),
    staff: rows,
  });
});

export const reportQualityReview = asyncHandler(async (req, res) => {
  const month = req.query.month ? monthKeyValue(req.query.month) : null;
  const orgId = req.user.organisation_id;
  const { jobs, allocations, timeEntries, staff } = await loadCommon(month, orgId);
  const loadedStaffIds = new Set(staff.map((staffMember) => staffMember._id.toString()));
  const missingAssignedStaffIds = Array.from(
    new Set(allocations.map((allocation) => allocation.staff_id?.toString()).filter(Boolean)),
  ).filter((id) => !loadedStaffIds.has(id));
  const fallbackStaff = missingAssignedStaffIds.length > 0
    ? await Staff.find({
      _id: { $in: missingAssignedStaffIds },
      is_archived: { $ne: true },
    }).lean()
    : [];
  const allStaff = [...staff, ...fallbackStaff];
  const staffMap = new Map(allStaff.map((staffMember) => [staffMember._id.toString(), staffMember]));
  const timeEntriesByAllocationId = timeEntries.reduce((acc, entry) => {
    const allocationId = entry.allocation_id?.toString();
    if (!allocationId) return acc;
    if (!acc.has(allocationId)) acc.set(allocationId, []);
    acc.get(allocationId).push(entry);
    return acc;
  }, new Map());

  const exceptions = [];
  for (const job of jobs) {
    const allocs = allocations.filter((a) => a.job_id?.toString() === job._id.toString());
    for (const alloc of allocs) {
      const allocationTimeEntries = timeEntriesByAllocationId.get(alloc._id.toString()) || [];
      const actual = allocationTimeEntries.reduce((acc, entry) => acc + Number(entry.hours_worked || 0), 0);
      const budgeted = Number(alloc.adjusted_hours || 0);
      const variancePct = budgeted > 0 ? ((actual - budgeted) / budgeted) * 100 : 0;

      if (variancePct > 30) {
        const trainingRecommendation = variancePct > 50
          ? 'Time estimation and task management'
          : 'Process optimization';
        const resolvedStaffId = alloc.staff_id?.toString() || null;
        const resolvedStaffName = staffMap.get(resolvedStaffId)?.name || alloc.staff_name || 'Unknown';
        exceptions.push({
          job_id: job._id.toString(),
          job_name: job.name,
          staff_id: resolvedStaffId,
          staff_name: resolvedStaffName,
          variance_percentage: round(variancePct, 1),
          exception_type: 'Significant Over-Budget',
          training_recommendation: trainingRecommendation,
          issue: `Significant Over-Budget - ${trainingRecommendation}`,
        });
      }
    }
  }

  const staffInsights = Array.from(exceptions.reduce((acc, exception) => {
    const staffKey = exception.staff_id || `staff-name:${exception.staff_name || 'Unknown'}`;
    if (!acc.has(staffKey)) {
      acc.set(staffKey, {
        staff_id: exception.staff_id,
        staff_name: exception.staff_name || 'Unknown',
        exception_count: 0,
        total_variance_percentage: 0,
        max_variance_percentage: 0,
        training_recommendation: 'Process optimization',
      });
    }

    const current = acc.get(staffKey);
    const variancePercentage = Number(exception.variance_percentage || 0);
    current.exception_count += 1;
    current.total_variance_percentage += variancePercentage;
    current.max_variance_percentage = Math.max(current.max_variance_percentage, variancePercentage);
    if (variancePercentage > 50) {
      current.training_recommendation = 'Time estimation and task management';
    }
    return acc;
  }, new Map()).values())
    .map((row) => ({
      staff_id: row.staff_id,
      staff_name: row.staff_name,
      exception_count: row.exception_count,
      average_variance_percentage: round(row.exception_count > 0 ? row.total_variance_percentage / row.exception_count : 0, 1),
      max_variance_percentage: round(row.max_variance_percentage, 1),
      training_recommendation: row.training_recommendation,
    }))
    .sort((a, b) => {
      if (Number(b.exception_count || 0) !== Number(a.exception_count || 0)) {
        return Number(b.exception_count || 0) - Number(a.exception_count || 0);
      }
      return Number(b.average_variance_percentage || 0) - Number(a.average_variance_percentage || 0);
    });

  return res.json({
    report_name: 'Quality Review Exceptions Report',
    generated_at: new Date().toISOString(),
    summary: {
      total_exceptions: exceptions.length,
      staff_with_issues: staffInsights.length,
      avg_variance: round(exceptions.length > 0 ? exceptions.reduce((acc, row) => acc + Number(row.variance_percentage || 0), 0) / exceptions.length : 0, 1),
    },
    exceptions,
    staff_insights: staffInsights,
  });
});

export const reportOverUnderSchedule = asyncHandler(async (req, res) => {
  const month = monthKeyValue(req.query.month);
  const orgId = req.user.organisation_id;
  const { month: snapshotMonth, overUnderRows } = await buildSnapshotInputs(month, orgId);

  return res.json({
    report_name: 'Over / Under Schedule Report',
    month: snapshotMonth,
    summary: {
      total_fee_variance: round(overUnderRows.reduce((acc, row) => acc + Number(row.fee_variance || 0), 0), 2),
      total_hours_variance: round(overUnderRows.reduce((acc, row) => acc + Number(row.hours_variance || 0), 0), 2),
    },
    staff: overUnderRows,
  });
});

export const reportMonthlySnapshotHistory = asyncHandler(async (req, res) => {
  const month = req.query.month ? monthKeyValue(req.query.month) : null;
  const orgId = req.user.organisation_id;
  const query = { organisation_id: orgId, ...(month ? { month } : {}) };
  const snapshots = await MonthlySnapshot.find(query).sort({ month: -1 });
  return res.json({
    report_name: 'Monthly Snapshot History',
    ...(month ? { month } : {}),
    snapshots: snapshots.map((snapshot) => ({
      ...snapshot.toObject(),
      id: snapshot._id.toString(),
      _id: snapshot._id.toString(),
    })),
  });
});
