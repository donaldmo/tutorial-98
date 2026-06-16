import Allocation from '../models/Allocation.js';
import OrganisationMembership from '../models/OrganisationMembership.js';
import Staff from '../models/Staff.js';
import TimeEntry from '../models/TimeEntry.js';
import { ensureCalendarForMonth, monthValue, round } from './planningService.js';

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

const buildTenantStaffFilter = async (organisationId, { staffId = null, staffIds = null } = {}) => {
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

  const filter = {
    $and: [
      { $or: tenantScope },
      { is_archived: { $ne: true } },
    ],
  };

  if (staffId) {
    filter.$and.push({ _id: staffId });
  } else if (Array.isArray(staffIds) && staffIds.length > 0) {
    filter.$and.push({ _id: { $in: staffIds } });
  }

  return filter;
};

const buildMonthlyCapacityHours = (staff, calendarSummary) => {
  const workingDays = Number(calendarSummary?.working_days_count || 0);
  const hoursPerDay = Number(staff?.hours_per_day || calendarSummary?.daily_capacity_hours || 8);
  const productivityFactor = Number(staff?.productivity_factor || 0);

  if (workingDays > 0 && hoursPerDay > 0) {
    return round(workingDays * hoursPerDay * productivityFactor, 2);
  }

  const monthlyAvailable = Number(staff?.available_hours_per_month || 0);
  if (monthlyAvailable > 0) {
    return round(monthlyAvailable, 2);
  }

  const annualBudgeted = Number(staff?.annual_budgeted_hours || 0);
  if (annualBudgeted > 0) {
    return round(annualBudgeted / 12, 2);
  }

  return 0;
};

export const listStaffMonthlySummaries = async (
  organisationId,
  { month = null, staffId = null, staffIds = null, includeAllocations = false } = {},
) => {
  const monthKey = monthValue(month);
  const nextMonth = nextMonthValue(monthKey);
  const [{ summary: calendarSummary }, staffFilter] = await Promise.all([
    ensureCalendarForMonth(monthKey, organisationId),
    buildTenantStaffFilter(organisationId, { staffId, staffIds }),
  ]);

  let staffList = await Staff.find(staffFilter)
    .select('name role department_id hourly_rate hours_per_day available_hours_per_month productivity_factor efficiency annual_budgeted_hours')
    .lean();

  const allocationFilter = { organisation_id: organisationId, month: monthKey };
  if (staffId) {
    allocationFilter.staff_id = staffId;
  } else if (Array.isArray(staffIds) && staffIds.length > 0) {
    allocationFilter.staff_id = { $in: staffIds };
  }

  const allocations = await Allocation.find(allocationFilter).lean();

  const loadedStaffIds = new Set(staffList.map((staff) => String(staff._id)));
  const missingAssignedStaffIds = Array.from(
    new Set(allocations.map((allocation) => String(allocation.staff_id || '')).filter(Boolean)),
  ).filter((id) => !loadedStaffIds.has(id));

  if (missingAssignedStaffIds.length > 0) {
    const fallbackStaff = await Staff.find({
      _id: { $in: missingAssignedStaffIds },
      is_archived: { $ne: true },
    })
      .select('name role department_id hourly_rate hours_per_day available_hours_per_month productivity_factor efficiency annual_budgeted_hours')
      .lean();
    staffList = [...staffList, ...fallbackStaff.filter((staff) => !loadedStaffIds.has(String(staff._id)))];
  }

  const allocationIds = allocations.map((allocation) => allocation._id);
  const timeEntryQuery = {
    organisation_id: organisationId,
    allocation_id: { $in: allocationIds },
  };
  if (nextMonth) {
    timeEntryQuery.date = { $gte: `${monthKey}-01`, $lt: `${nextMonth}-01` };
  }
  const timeEntries = allocationIds.length ? await TimeEntry.find(timeEntryQuery).lean() : [];

  const timeTotalsByAllocationId = new Map();
  timeEntries.forEach((entry) => {
    const allocationId = entry.allocation_id ? String(entry.allocation_id) : null;
    if (!allocationId) return;
    const current = timeTotalsByAllocationId.get(allocationId) || 0;
    timeTotalsByAllocationId.set(allocationId, current + Number(entry.hours_worked || 0));
  });

  const rows = staffList.map((staff) => {
    const currentStaffId = String(staff._id);
    const staffAllocations = allocations.filter((allocation) => String(allocation.staff_id || '') === currentStaffId);
    const allocatedHours = round(
      staffAllocations.reduce((sum, allocation) => sum + Number(allocation.adjusted_hours || 0), 0),
    );
    const actualHours = round(
      staffAllocations.reduce(
        (sum, allocation) => sum + Number(timeTotalsByAllocationId.get(String(allocation._id)) || 0),
        0,
      ),
    );
    const monthlyCapacityHours = buildMonthlyCapacityHours(staff, calendarSummary);
    const remainingHours = round(Math.max(0, monthlyCapacityHours - allocatedHours));
    const totalAllocatedFee = round(
      staffAllocations.reduce((sum, allocation) => sum + Number(allocation.allocated_fee || 0), 0),
    );

    return {
      staff_id: currentStaffId,
      staff_name: staff.name,
      name: staff.name,
      role: staff.role,
      department_id: staff.department_id ? String(staff.department_id) : null,
      month: monthKey,
      hourly_rate: Number(staff.hourly_rate || 0),
      hours_per_day: Number(staff.hours_per_day || calendarSummary.daily_capacity_hours || 8),
      productivity_factor: Number(staff.productivity_factor || 0),
      efficiency: Number(staff.efficiency || 0),
      working_days_count: Number(calendarSummary.working_days_count || 0),
      daily_capacity_hours: Number(calendarSummary.daily_capacity_hours || 0),
      calendar_capacity_hours: round(calendarSummary.capacity_hours || 0),
      available_hours_per_month: Number(staff.available_hours_per_month || 0),
      monthly_capacity_hours: monthlyCapacityHours,
      allocated_hours: allocatedHours,
      actual_hours: actualHours,
      remaining_hours: remainingHours,
      utilization_percentage: round(monthlyCapacityHours > 0 ? (allocatedHours / monthlyCapacityHours) * 100 : 0, 1),
      productivity_percentage: round(allocatedHours > 0 ? (actualHours / allocatedHours) * 100 : 0, 1),
      total_allocated_fee: totalAllocatedFee,
      allocations: includeAllocations
        ? staffAllocations.map((allocation) => ({
            allocation_id: String(allocation._id),
            job_id: allocation.job_id ? String(allocation.job_id) : null,
            work_component_key: allocation.work_component_key || null,
            allocated_fee: round(allocation.allocated_fee || 0),
            adjusted_hours: round(allocation.adjusted_hours || 0),
            percentage: Number(allocation.percentage || 0),
            status: allocation.status || null,
          }))
        : undefined,
    };
  });

  return {
    month: monthKey,
    calendar: {
      working_days_count: Number(calendarSummary.working_days_count || 0),
      daily_capacity_hours: Number(calendarSummary.daily_capacity_hours || 0),
      capacity_hours: round(calendarSummary.capacity_hours || 0),
      holidays: calendarSummary.holidays || [],
      extra_working_days: calendarSummary.extra_working_days || [],
    },
    staff: rows,
  };
};

export default {
  listStaffMonthlySummaries,
};
