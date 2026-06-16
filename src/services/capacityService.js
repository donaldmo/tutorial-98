/**
 * capacityService.js
 *
 * Group 3 – Task 3.3: Working-Days Calendar and Derived Capacity Logic
 *
 * Provides capacity calculations that combine the WorkingDayCalendar model
 * (holiday-adjusted business days) with each staff member's
 * available_hours_per_month setting to produce effective monthly capacity.
 */

import Staff from '../models/Staff.js';
import { ensureCalendarForMonth, monthValue, round } from './planningService.js';

/**
 * Calculate effective capacity hours for a single staff member for a month.
 *
 * Capacity is scaled relative to a 160-hour baseline so that staff who have
 * a different available_hours_per_month still get the correct holiday
 * adjustment from the calendar.
 *
 * @param {string|import('mongoose').Types.ObjectId} staffId
 * @param {string} month  YYYY-MM
 * @returns {Promise<Object|null>}
 */
export const getStaffCapacity = async (staffId, month) => {
  const monthKey = monthValue(month);

  const staff = await Staff.findById(staffId);

  if (!staff) return null;
  const { summary: calendarSummary } = await ensureCalendarForMonth(monthKey, staff.organisation_id);

  const staffBaseCapacity = Number(staff.available_hours_per_month || 160);

  // Scale calendar capacity proportionally to the staff member's own base hours.
  const effectiveCapacity =
    calendarSummary.capacity_hours > 0
      ? (calendarSummary.capacity_hours * staffBaseCapacity) / 160
      : staffBaseCapacity;

  return {
    staff_id: staff._id.toString(),
    name: staff.name,
    role: staff.role,
    month: monthKey,
    available_hours_per_month: staffBaseCapacity,
    calendar: {
      working_days: calendarSummary.working_days_count,
      daily_capacity_hours: calendarSummary.daily_capacity_hours,
      capacity_hours: round(calendarSummary.capacity_hours),
      holidays: calendarSummary.holidays,
      extra_working_days: calendarSummary.extra_working_days,
    },
    effective_capacity_hours: round(effectiveCapacity),
  };
};

/**
 * Calculate capacity for all active staff for a given month.
 *
 * @param {string} month  YYYY-MM
 * @returns {Promise<Object>}
 */
export const getTeamCapacity = async (month, orgId) => {
  const monthKey = monthValue(month);

  const staffFilter = { is_active: true, is_archived: { $ne: true } };
  if (orgId) staffFilter.organisation_id = orgId;

  const [allStaff, { summary: calendarSummary }] = await Promise.all([
    Staff.find(staffFilter),
    ensureCalendarForMonth(monthKey, orgId),
  ]);

  const staffRows = allStaff.map((s) => {
    const staffBaseCapacity = Number(s.available_hours_per_month || 160);
    const effectiveCapacity =
      calendarSummary.capacity_hours > 0
        ? (calendarSummary.capacity_hours * staffBaseCapacity) / 160
        : staffBaseCapacity;

    return {
      staff_id: s._id.toString(),
      name: s.name,
      role: s.role,
      available_hours_per_month: staffBaseCapacity,
      effective_capacity_hours: round(effectiveCapacity),
    };
  });

  const totalBaseCapacity = allStaff.reduce(
    (acc, s) => acc + Number(s.available_hours_per_month || 160),
    0,
  );
  const totalEffectiveCapacity = staffRows.reduce((acc, s) => acc + s.effective_capacity_hours, 0);

  return {
    month: monthKey,
    calendar: {
      working_days: calendarSummary.working_days_count,
      daily_capacity_hours: calendarSummary.daily_capacity_hours,
      capacity_hours: round(calendarSummary.capacity_hours),
      holidays: calendarSummary.holidays,
      extra_working_days: calendarSummary.extra_working_days,
    },
    team_size: allStaff.length,
    total_available_hours: round(totalBaseCapacity),
    total_effective_capacity: round(totalEffectiveCapacity),
    staff: staffRows,
  };
};

/**
 * Derive a simple daily working hours figure for a given month from the
 * calendar configuration.  Falls back to 8 when no calendar is set.
 *
 * @param {string} month  YYYY-MM
 * @returns {Promise<{month:string, working_days:number, daily_capacity_hours:number, capacity_hours:number}>}
 */
export const getCalendarCapacitySummary = async (month) => {
  const monthKey = monthValue(month);
  const { summary } = await ensureCalendarForMonth(monthKey, null);
  return {
    month: monthKey,
    working_days: summary.working_days_count,
    daily_capacity_hours: summary.daily_capacity_hours,
    capacity_hours: round(summary.capacity_hours),
    holidays: summary.holidays,
    extra_working_days: summary.extra_working_days,
  };
};
