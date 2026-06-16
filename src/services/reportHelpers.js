/**
 * reportHelpers.js
 * Shared helpers for reports and analytics.
 *
 * Constraints: no schema changes. `isBillable` implements report-time
 * heuristics to determine whether a `TimeEntry` counts as billable.
 */

import Allocation from '../models/Allocation.js';
import Department from '../models/Department.js';
import Job from '../models/Job.js';
import OrganisationMembership from '../models/OrganisationMembership.js';
import Staff from '../models/Staff.js';
import TimeEntry from '../models/TimeEntry.js';
import { listStaffMonthlySummaries } from './staffMonthlySummaryService.js';

const round = (value, precision = 2) => Number(Number(value || 0).toFixed(precision));

const nextMonthValue = (month) => {
  const [yearRaw, monthRaw] = String(month || '').split('-');
  const year = Number(yearRaw);
  const monthNumber = Number(monthRaw);
  if (!Number.isFinite(year) || !Number.isFinite(monthNumber) || monthNumber < 1 || monthNumber > 12) {
    return null;
  }

  if (monthNumber === 12) {
    return `${year + 1}-01`;
  }

  return `${year}-${String(monthNumber + 1).padStart(2, '0')}`;
};

export const isBillable = (timeEntry = {}, { nonBillableTags = ['non-billable', 'pto', 'unpaid'] } = {}) => {
  if (Object.prototype.hasOwnProperty.call(timeEntry, 'billable')) {
    return Boolean(timeEntry.billable);
  }

  if (Array.isArray(timeEntry.tags)) {
    const lowerTags = timeEntry.tags.map((t) => String(t).toLowerCase());
    if (nonBillableTags.some((tag) => lowerTags.includes(tag))) return false;
  }

  if (timeEntry.type && String(timeEntry.type).toLowerCase().includes('pto')) return false;
  if (timeEntry.is_paid_time_off || timeEntry.isPTO) return false;

  // Default to billable when unsure (conservative for revenue reporting)
  return true;
};

export const calculateEfficiencyPercentage = (budgetedHours, actualHours) => {
  const budgeted = Number(budgetedHours || 0);
  const actual = Number(actualHours || 0);

  if (budgeted <= 0) {
    return actual <= 0 ? 100 : 0;
  }

  return round((actual / budgeted) * 100, 1);
};

export const getEfficiencyStatus = (budgetedHours, actualHours) => {
  const budgeted = Number(budgetedHours || 0);
  const actual = Number(actualHours || 0);
  const variance = actual - budgeted;

  if (actual <= 0) return 'In Progress';
  if (variance <= 0) return 'Efficient';
  if (budgeted <= 0) return 'Significantly Over';
  if (variance <= budgeted * 0.2) return 'Slightly Over';
  if (variance <= budgeted * 0.5) return 'Over Budget';
  return 'Significantly Over';
};

const buildMonthScopedWorkInputs = async (organisationId, { month = null, departmentId = null } = {}) => {
  const monthValue = String(month || new Date().toISOString().slice(0, 7));
  const nextMonth = nextMonthValue(monthValue);

  const departmentFilter = { organisation_id: organisationId, is_active: true };
  if (departmentId) {
    departmentFilter._id = departmentId;
  }

  const allocationFilter = { month: monthValue, organisation_id: organisationId };

  const membershipRows = await OrganisationMembership.find({
    organisation_id: organisationId,
    status: 'active',
  })
    .select('staff_id')
    .lean();
  const membershipStaffIds = membershipRows.map((row) => row.staff_id).filter(Boolean);

  const tenantScope = [{ organisation_id: organisationId }];
  if (membershipStaffIds.length > 0) {
    tenantScope.push({ _id: { $in: membershipStaffIds } });
  }

  const staffFilter = {
    $and: [
      { $or: tenantScope },
      { is_archived: { $ne: true } },
    ],
  };
  if (departmentId) {
    staffFilter.$and.push({
      $or: [
        { department_id: departmentId },
        { department_ids: departmentId },
      ],
    });
  }

  let [staffList, allocations, jobs, departments] = await Promise.all([
    Staff.find(staffFilter).select('name role hourly_rate department_id department_ids'),
    Allocation.find(allocationFilter),
    Job.find({ organisation_id: organisationId }).select('_id name client_name status department_id job_fee pricing_override submission_date job_type_entries job_type_label'),
    Department.find(departmentFilter),
  ]);

  if (!departmentId && departments.length === 0) {
    departments = await Department.find({ organisation_id: organisationId });
  }

  const loadedStaffIds = new Set(staffList.map((staff) => String(staff._id)));
  const assignedStaffIds = Array.from(
    new Set(allocations.map((allocation) => String(allocation.staff_id || '')).filter(Boolean)),
  );
  const missingAssignedStaffIds = assignedStaffIds.filter((staffId) => !loadedStaffIds.has(staffId));
  if (missingAssignedStaffIds.length > 0) {
    const fallbackStaff = await Staff.find({
      _id: { $in: missingAssignedStaffIds },
      is_archived: { $ne: true },
    }).select('name role hourly_rate department_id department_ids');

    const mergedById = new Map(staffList.map((staff) => [String(staff._id), staff]));
    fallbackStaff.forEach((staff) => {
      mergedById.set(String(staff._id), staff);
    });
    staffList = Array.from(mergedById.values());
  }

  const allocationIds = allocations.map((allocation) => allocation._id);
  const timeEntryQuery = {
    organisation_id: organisationId,
    allocation_id: { $in: allocationIds },
  };
  if (nextMonth) {
    timeEntryQuery.date = { $gte: `${monthValue}-01`, $lt: `${nextMonth}-01` };
  }
  const timeEntries = allocationIds.length ? await TimeEntry.find(timeEntryQuery) : [];

  const timeTotalsByAllocationId = new Map();
  timeEntries.forEach((entry) => {
    const allocationId = entry.allocation_id ? String(entry.allocation_id) : null;
    if (!allocationId) return;
    const current = timeTotalsByAllocationId.get(allocationId) || 0;
    timeTotalsByAllocationId.set(allocationId, current + Number(entry.hours_worked || 0));
  });

  return {
    month: monthValue,
    nextMonth,
    staffList,
    allocations,
    jobs,
    departments,
    timeEntries,
    timeTotalsByAllocationId,
  };
};

export async function buildUtilizationProductivityReport(organisationId, { month = null } = {}) {
  const { month: monthValue, staff } = await listStaffMonthlySummaries(organisationId, { month });

  const staffRows = staff.map((row) => ({
    staff_id: row.staff_id,
    staff_name: row.staff_name,
    name: row.name,
    role: row.role,
    available_hours: round(row.monthly_capacity_hours),
    allocated_hours: round(row.allocated_hours),
    actual_hours: round(row.actual_hours),
    utilization_percentage: round(row.utilization_percentage, 1),
    productivity_percentage: round(row.productivity_percentage, 1),
  }));

  const totalAvailable = staffRows.reduce((sum, staff) => sum + Number(staff.available_hours || 0), 0);
  const totalAllocated = staffRows.reduce((sum, staff) => sum + Number(staff.allocated_hours || 0), 0);
  const totalActual = staffRows.reduce((sum, staff) => sum + Number(staff.actual_hours || 0), 0);

  return {
    report_name: 'Utilization & Productivity Report',
    month: monthValue,
    summary: {
      available_hours: round(totalAvailable),
      allocated_hours: round(totalAllocated),
      actual_hours: round(totalActual),
      utilization: round(totalAvailable > 0 ? (totalAllocated / totalAvailable) * 100 : 0, 1),
      productivity: round(totalAllocated > 0 ? (totalActual / totalAllocated) * 100 : 0, 1),
      total_available_hours: round(totalAvailable),
      total_allocated_hours: round(totalAllocated),
      total_actual_hours: round(totalActual),
      firm_utilization: round(totalAvailable > 0 ? (totalAllocated / totalAvailable) * 100 : 0, 1),
      firm_productivity: round(totalAllocated > 0 ? (totalActual / totalAllocated) * 100 : 0, 1),
    },
    staff_breakdown: staffRows,
  };
}

const resolveServiceLineLabel = (job = {}) => {
  const entryNames = Array.isArray(job.job_type_entries)
    ? job.job_type_entries
        .map((entry) => String(entry?.job_type_name || '').trim())
        .filter(Boolean)
    : [];

  if (entryNames.length > 0) {
    return entryNames.join(', ');
  }

  const legacyLabel = String(job.job_type_label || '').trim();
  if (legacyLabel) {
    return legacyLabel;
  }

  return 'Other';
};

export async function buildFirmProfitabilityReport(organisationId, { month = null } = {}) {
  const {
    month: monthValue,
    jobs,
    allocations,
    timeEntries,
    staffList,
  } = await buildMonthScopedWorkInputs(organisationId, { month });

  const jobById = new Map(jobs.map((job) => [String(job._id), job]));
  const staffRateById = new Map(staffList.map((staff) => [String(staff._id), Number(staff.hourly_rate || 0)]));

  const timeEntriesByAllocationId = new Map();
  timeEntries.forEach((entry) => {
    const allocationId = entry.allocation_id ? String(entry.allocation_id) : null;
    if (!allocationId) return;
    if (!timeEntriesByAllocationId.has(allocationId)) {
      timeEntriesByAllocationId.set(allocationId, []);
    }
    timeEntriesByAllocationId.get(allocationId).push(entry);
  });

  const allocationsByJob = allocations.reduce((acc, allocation) => {
    const jobId = String(allocation.job_id || '');
    if (!jobId) return acc;
    if (!acc.has(jobId)) acc.set(jobId, []);
    acc.get(jobId).push(allocation);
    return acc;
  }, new Map());

  const jobRows = Array.from(allocationsByJob.entries()).map(([jobId, jobAllocations]) => {
    const job = jobById.get(jobId);
    if (!job || jobAllocations.length === 0) return null;

    const actualHours = jobAllocations.reduce((sum, allocation) => {
      const allocationEntries = timeEntriesByAllocationId.get(String(allocation._id)) || [];
      return sum + allocationEntries.reduce((entrySum, entry) => entrySum + Number(entry.hours_worked || 0), 0);
    }, 0);

    const laborCost = jobAllocations.reduce((sum, allocation) => {
      const staffRate = Number(staffRateById.get(String(allocation.staff_id)) || 0);
      const budgetedHours = Number(allocation.adjusted_hours || 0);
      const fallbackRate = budgetedHours > 0
        ? Number(allocation.allocated_fee || 0) / budgetedHours
        : 0;
      const effectiveRate = staffRate > 0 ? staffRate : fallbackRate;
      return sum + (budgetedHours * effectiveRate * 0.5);
    }, 0);

    const revenue = Number(job.pricing_override ?? job.job_fee ?? 0);
    const grossMargin = revenue - laborCost;
    const serviceLine = resolveServiceLineLabel(job);

    return {
      job_id: jobId,
      job_name: job.name,
      client_name: job.client_name,
      service_line: serviceLine,
      revenue: round(revenue, 2),
      labor_cost: round(laborCost, 2),
      gross_margin: round(grossMargin, 2),
      actual_hours: round(actualHours, 2),
      margin_percentage: round(revenue > 0 ? (grossMargin / revenue) * 100 : 0, 1),
      allocation_count: jobAllocations.length,
    };
  }).filter(Boolean);

  const serviceLineMap = jobRows.reduce((acc, row) => {
    const key = row.service_line || 'Other';
    if (!acc.has(key)) {
      acc.set(key, { service_line: key, revenue: 0, labor_cost: 0, gross_margin: 0, job_count: 0 });
    }

    const current = acc.get(key);
    current.revenue += Number(row.revenue || 0);
    current.labor_cost += Number(row.labor_cost || 0);
    current.gross_margin += Number(row.gross_margin || 0);
    current.job_count += 1;
    return acc;
  }, new Map());

  const serviceLines = Array.from(serviceLineMap.values())
    .map((row) => ({
      service_line: row.service_line,
      revenue: round(row.revenue, 2),
      labor_cost: round(row.labor_cost, 2),
      gross_margin: round(row.gross_margin, 2),
      margin_percentage: round(row.revenue > 0 ? (row.gross_margin / row.revenue) * 100 : 0, 1),
      job_count: row.job_count,
    }))
    .sort((a, b) => Number(b.revenue || 0) - Number(a.revenue || 0));

  const totalRevenue = jobRows.reduce((sum, row) => sum + Number(row.revenue || 0), 0);
  const totalLaborCost = jobRows.reduce((sum, row) => sum + Number(row.labor_cost || 0), 0);
  const totalGrossMargin = totalRevenue - totalLaborCost;

  return {
    report_name: 'Firm Profitability Dashboard',
    month: monthValue,
    generated_at: new Date().toISOString(),
    summary: {
      total_revenue: round(totalRevenue, 2),
      total_labor_cost: round(totalLaborCost, 2),
      total_gross_margin: round(totalGrossMargin, 2),
      margin_percentage: round(totalRevenue > 0 ? (totalGrossMargin / totalRevenue) * 100 : 0, 1),
      overall_margin_percentage: round(totalRevenue > 0 ? (totalGrossMargin / totalRevenue) * 100 : 0, 1),
    },
    service_lines: serviceLines,
    jobs: jobRows,
  };
}

const normalizeWipStatus = (jobStatus, allocations = []) => {
  const normalizedJobStatus = String(jobStatus || '').trim();
  const allocationStatuses = allocations.map((allocation) => String(allocation.workflow_status || '').trim());

  if (normalizedJobStatus === 'In Progress' || allocationStatuses.some((status) => status === 'Doing')) {
    return 'In Progress';
  }

  if (['Pending', 'Partially Allocated', 'Fully Allocated', 'On Hold'].includes(normalizedJobStatus)) {
    return normalizedJobStatus;
  }

  if (allocationStatuses.length > 0 && allocationStatuses.every((status) => status === 'Pending')) {
    return 'Pending';
  }

  if (allocationStatuses.length > 0) {
    return 'Fully Allocated';
  }

  return 'Pending';
};

const toWipStatusBucket = (status) => {
  const normalizedStatus = String(status || '').trim();
  if (normalizedStatus === 'In Progress') return 'In Progress';
  if (normalizedStatus === 'Fully Allocated') return 'Fully Allocated';
  return 'Pending';
};

export async function buildWipStatusReport(organisationId, { month = null, includeNonBillable = false } = {}) {
  const {
    month: monthValue,
    jobs,
    allocations,
    timeEntries,
  } = await buildMonthScopedWorkInputs(organisationId, { month });

  const jobById = new Map(jobs.map((job) => [String(job._id), job]));
  const timeEntriesByAllocationId = new Map();
  timeEntries.forEach((entry) => {
    const allocationId = entry.allocation_id ? String(entry.allocation_id) : null;
    if (!allocationId) return;
    if (!timeEntriesByAllocationId.has(allocationId)) {
      timeEntriesByAllocationId.set(allocationId, []);
    }
    timeEntriesByAllocationId.get(allocationId).push(entry);
  });

  const activeAllocations = allocations.filter((allocation) => String(allocation.workflow_status || '') !== 'Completed');
  const allocationsByJob = activeAllocations.reduce((acc, allocation) => {
    const jobId = String(allocation.job_id || '');
    if (!jobId) return acc;
    if (!acc.has(jobId)) acc.set(jobId, []);
    acc.get(jobId).push(allocation);
    return acc;
  }, new Map());

  const rows = Array.from(allocationsByJob.entries()).map(([jobId, jobAllocations]) => {
    const job = jobById.get(jobId);
    if (!job) return null;
    if (String(job.status || '') === 'Completed') return null;
    if (jobAllocations.length === 0) return null;

    const relevantAllocations = jobAllocations.filter((allocation) => String(allocation.workflow_status || '') !== 'Completed');
    if (relevantAllocations.length === 0) return null;

    const startedComponents = relevantAllocations.map((allocation) => {
      const allocationId = String(allocation._id);
      const allocatedFee = Number(allocation.allocated_fee || 0);
      const budgetedHours = Number(allocation.adjusted_hours || 0);
      const actualHours = (timeEntriesByAllocationId.get(allocationId) || [])
        .filter((entry) => (includeNonBillable ? true : isBillable(entry)))
        .reduce((sum, entry) => sum + Number(entry.hours_worked || 0), 0);
      const progressPercentage = Math.min(100, Number(allocation.percentage || 0));

      return {
        allocation_id: allocationId,
        staff_id: allocation.staff_id ? String(allocation.staff_id) : null,
        work_component_key: allocation.work_component_key || '',
        allocated_fee: round(allocatedFee, 2),
        adjusted_hours: round(budgetedHours, 2),
        actual_hours: round(actualHours, 2),
        workflow_status: allocation.workflow_status || 'Pending',
        progress_percentage: round(progressPercentage, 1),
        wip_value: round(allocatedFee * (progressPercentage / 100), 2),
      };
    });

    const allocatedFee = startedComponents.reduce((sum, component) => sum + Number(component.allocated_fee || 0), 0);
    const budgetedHours = startedComponents.reduce((sum, component) => sum + Number(component.adjusted_hours || 0), 0);
    const actualHours = startedComponents.reduce((sum, component) => sum + Number(component.actual_hours || 0), 0);
    const progressPercentage = Math.min(
      100,
      relevantAllocations.reduce((sum, allocation) => sum + Number(allocation.percentage || 0), 0),
    );
    const status = normalizeWipStatus(job.status, relevantAllocations);
    const totalFee = Number(job.pricing_override ?? job.job_fee ?? 0);
    const wipValue = startedComponents.reduce((sum, component) => sum + Number(component.wip_value || 0), 0);

    return {
      job_id: jobId,
      job_name: job.name,
      client_name: job.client_name,
      status,
      status_bucket: toWipStatusBucket(status),
      submission_date: job.submission_date || null,
      total_fee: round(totalFee, 2),
      allocated_fee: round(allocatedFee, 2),
      budgeted_hours: round(budgetedHours, 2),
      actual_hours: round(actualHours, 2),
      progress_percentage: round(progressPercentage, 1),
      wip_value: round(wipValue, 2),
      started_component_count: startedComponents.length,
      started_components: startedComponents,
    };
  }).filter(Boolean);

  const jobsInProgress = rows.filter((row) => row.status_bucket === 'In Progress').length;
  const allocatedCount = rows.filter((row) => row.status_bucket === 'Fully Allocated').length;
  const pendingCount = rows.filter((row) => row.status_bucket === 'Pending').length;

  return {
    report_name: 'WIP (Work-in-Progress) Status Report',
    month: monthValue,
    generated_at: new Date().toISOString(),
    summary: {
      total_wip_value: round(rows.reduce((sum, row) => sum + Number(row.wip_value || 0), 0), 2),
      jobs_in_progress: jobsInProgress,
      total_jobs_in_progress: jobsInProgress,
      allocated_count: allocatedCount,
      pending_count: pendingCount,
      total_wip_jobs: rows.length,
    },
    jobs: rows,
  };
}

export async function buildEfficiencySnapshot(organisationId, { month = null, departmentId = null } = {}) {
  const {
    month: monthValue,
    staffList,
    allocations,
    jobs,
    departments,
    timeEntries,
    timeTotalsByAllocationId,
  } = await buildMonthScopedWorkInputs(organisationId, { month, departmentId });

  const jobsById = new Map(jobs.map((job) => [String(job._id), job]));
  const staffDepartmentMap = new Map(
    staffList.map((staff) => {
      const departmentIds = new Set();
      if (staff.department_id) {
        departmentIds.add(String(staff.department_id));
      }
      if (Array.isArray(staff.department_ids)) {
        staff.department_ids.forEach((id) => {
          if (id) departmentIds.add(String(id));
        });
      }
      return [String(staff._id), departmentIds];
    }),
  );

  const departmentIdsInScope = new Set(departments.map((department) => String(department._id)));

  const staffRows = staffList.map((staff) => {
    const staffId = String(staff._id);
    const staffAllocations = allocations.filter((allocation) => String(allocation.staff_id || '') === staffId);

    const budgeted = staffAllocations.reduce((sum, allocation) => sum + Number(allocation.adjusted_hours || 0), 0);
    const allocatedFees = staffAllocations.reduce((sum, allocation) => sum + Number(allocation.allocated_fee || 0), 0);
    const actual = staffAllocations.reduce(
      (sum, allocation) => sum + Number(timeTotalsByAllocationId.get(String(allocation._id)) || 0),
      0,
    );
    const variance = actual - budgeted;
    const hourlyRate = Number(staff.hourly_rate || 0);
    const effectiveRate = actual > 0 && allocatedFees > 0 ? allocatedFees / actual : hourlyRate;

    return {
      staff_id: staffId,
      name: staff.name,
      role: staff.role,
      hourly_rate: round(hourlyRate),
      budgeted_hours: round(budgeted),
      actual_hours: round(actual),
      variance_hours: round(variance),
      efficiency_percentage: calculateEfficiencyPercentage(budgeted, actual),
      effective_hourly_rate: round(effectiveRate),
      efficiency_status: getEfficiencyStatus(budgeted, actual),
    };
  });

  const departmentTotalsMap = new Map();
  const departmentStaffSetMap = new Map();

  allocations.forEach((allocation) => {
    const allocationId = String(allocation._id);
    const staffId = allocation.staff_id ? String(allocation.staff_id) : null;
    const candidateDepartmentIds = new Set();

    const staffDepartmentIds = staffId ? staffDepartmentMap.get(staffId) : null;
    if (staffDepartmentIds && staffDepartmentIds.size > 0) {
      staffDepartmentIds.forEach((id) => candidateDepartmentIds.add(id));
    } else {
      const jobId = allocation.job_id ? String(allocation.job_id) : null;
      const jobDepartmentId = jobId ? jobsById.get(jobId)?.department_id : null;
      if (jobDepartmentId) {
        candidateDepartmentIds.add(String(jobDepartmentId));
      }
    }

    const scopedDepartmentIds = Array.from(candidateDepartmentIds).filter((id) => departmentIdsInScope.has(id));
    if (scopedDepartmentIds.length === 0) return;

    const budgeted = Number(allocation.adjusted_hours || 0);
    const actual = Number(timeTotalsByAllocationId.get(allocationId) || 0);

    scopedDepartmentIds.forEach((id) => {
      const totals = departmentTotalsMap.get(id) || { budgeted: 0, actual: 0 };
      totals.budgeted += budgeted;
      totals.actual += actual;
      departmentTotalsMap.set(id, totals);

      if (!departmentStaffSetMap.has(id)) {
        departmentStaffSetMap.set(id, new Set());
      }
      if (staffId) {
        departmentStaffSetMap.get(id).add(staffId);
      }
    });
  });

  const departmentRows = departments.map((department) => {
    const id = String(department._id);
    const totals = departmentTotalsMap.get(id) || { budgeted: 0, actual: 0 };
    return {
      department_id: id,
      department_name: department.name,
      avg_efficiency: calculateEfficiencyPercentage(totals.budgeted, totals.actual),
      staff_count: (departmentStaffSetMap.get(id) || new Set()).size,
      total_budgeted_hours: round(totals.budgeted),
      total_actual_hours: round(totals.actual),
    };
  });

  const totalBudgetedFromRows = departmentRows.reduce((sum, row) => sum + Number(row.total_budgeted_hours || 0), 0);
  const totalActualFromRows = departmentRows.reduce((sum, row) => sum + Number(row.total_actual_hours || 0), 0);
  const totalBudgeted = allocations.reduce((sum, allocation) => sum + Number(allocation.adjusted_hours || 0), 0);
  const totalAllocatedFees = allocations.reduce((sum, allocation) => sum + Number(allocation.allocated_fee || 0), 0);
  const totalActual = timeEntries.reduce((sum, entry) => sum + Number(entry.hours_worked || 0), 0);

  const unassignedBudgeted = totalBudgeted - totalBudgetedFromRows;
  const unassignedActual = totalActual - totalActualFromRows;
  if (unassignedBudgeted > 0 || unassignedActual > 0) {
    departmentRows.push({
      department_id: '__unassigned__',
      department_name: 'Unassigned',
      avg_efficiency: calculateEfficiencyPercentage(unassignedBudgeted, unassignedActual),
      staff_count: 0,
      total_budgeted_hours: round(unassignedBudgeted),
      total_actual_hours: round(unassignedActual),
    });
  }

  const overallEfficiency = calculateEfficiencyPercentage(totalBudgeted, totalActual);
  const effectiveRate = totalActual > 0 ? totalAllocatedFees / totalActual : 0;
  let overallStatus = 'Healthy';
  let recommendation = 'Team is performing well';
  if (overallEfficiency > 100 && overallEfficiency <= 120) {
    overallStatus = 'Needs Attention';
    recommendation = 'Review higher-variance teams and jobs to improve efficiency.';
  } else if (overallEfficiency > 120) {
    overallStatus = 'Critical';
    recommendation = 'Immediate intervention recommended: review allocations and tracked time.';
  }

  const jobRows = jobs.map((job) => {
    const jobId = String(job._id);
    const jobAllocations = allocations.filter((allocation) => String(allocation.job_id || '') === jobId);
    const budgeted = jobAllocations.reduce((sum, allocation) => sum + Number(allocation.adjusted_hours || 0), 0);
    const actual = jobAllocations.reduce(
      (sum, allocation) => sum + Number(timeTotalsByAllocationId.get(String(allocation._id)) || 0),
      0,
    );
    const variance = actual - budgeted;

    return {
      job_id: jobId,
      job_name: job.name,
      client_name: job.client_name,
      status: job.status,
      budgeted_hours: round(budgeted),
      actual_hours: round(actual),
      variance_hours: round(variance),
      variance_percentage: round(budgeted > 0 ? (variance / budgeted) * 100 : 0, 1),
      calculated_efficiency: calculateEfficiencyPercentage(budgeted, actual),
      stored_efficiency: job.efficiency_metrics?.current_efficiency || null,
      last_calculated: job.efficiency_metrics?.last_calculated_at || null,
    };
  });

  return {
    month: monthValue,
    staff: staffRows,
    departments: departmentRows,
    jobs: jobRows,
    summary: {
      budgeted_hours: round(totalBudgeted),
      actual_hours: round(totalActual),
      overall_efficiency: overallEfficiency,
      productivity_percentage: overallEfficiency,
      total_allocated_fees: round(totalAllocatedFees),
      effective_hourly_rate: round(effectiveRate),
      overall_status: overallStatus,
      recommendation,
    },
  };
}

export default {
  isBillable,
  calculateEfficiencyPercentage,
  getEfficiencyStatus,
  buildFirmProfitabilityReport,
  buildWipStatusReport,
  buildUtilizationProductivityReport,
  buildEfficiencySnapshot,
};
