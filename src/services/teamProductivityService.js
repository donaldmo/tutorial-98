import Allocation from '../models/Allocation.js';
import Job from '../models/Job.js';
import Staff from '../models/Staff.js';
import Department from '../models/Department.js';
import TimeEntry from '../models/TimeEntry.js';
import { isBillable } from './reportHelpers.js';

const round = (v, d = 2) => {
  const n = Number(v || 0);
  return Number(n.toFixed(d));
};

const sum = (arr, fn) => arr.reduce((s, x) => s + Number(fn(x) || 0), 0);

const resolveAssumedDeadline = (monthValueString) => {
  const sourceMonth = String(monthValueString || new Date().toISOString().slice(0, 7));
  const [year, monthNumber] = sourceMonth.split('-').map(Number);
  return new Date(Date.UTC(year, monthNumber - 1, 25));
};

const toDateOrNull = (value) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const getDepartmentId = (staffRec) => {
  if (staffRec?.department_id) return String(staffRec.department_id);
  if (Array.isArray(staffRec?.department_ids) && staffRec.department_ids.length > 0) {
    const firstId = staffRec.department_ids.find(Boolean);
    if (firstId) return String(firstId);
  }
  return '__unassigned__';
};

export default async function computeTeamProductivity(organisationId, { month = null, includeNonBillable = false } = {}) {
  const allocQuery = { organisation_id: organisationId };
  if (month) allocQuery.month = month;

  const allocations = await Allocation.find(allocQuery);
  if (!allocations || allocations.length === 0) {
    return {
      report_name: 'Team Productivity & Efficiency Scorecard',
      generated_at: new Date().toISOString(),
      month: month || null,
      summary: {
        team_size: 0,
        budget_adherence: 0,
        on_time_delivery: 0,
        jobs_assigned: 0,
      },
      teams: [],
    };
  }

  const allocIds = allocations.map((allocation) => allocation._id);
  const jobIds = Array.from(new Set(allocations.map((allocation) => String(allocation.job_id || '')).filter(Boolean)));
  const staffIds = Array.from(new Set(allocations.map((allocation) => String(allocation.staff_id || '')).filter(Boolean)));

  const [jobs, staff, departments] = await Promise.all([
    jobIds.length ? Job.find({ _id: { $in: jobIds }, organisation_id: organisationId }) : [],
    staffIds.length ? Staff.find({ _id: { $in: staffIds }, organisation_id: organisationId }) : [],
    Department.find({ organisation_id: organisationId }),
  ]);

  const jobById = new Map((jobs || []).map((job) => [String(job._id), job]));
  const staffById = new Map((staff || []).map((member) => [String(member._id), member]));
  const departmentById = new Map((departments || []).map((department) => [String(department._id), department]));

  const timeEntryQuery = allocIds.length
    ? { organisation_id: organisationId, allocation_id: { $in: allocIds } }
    : { organisation_id: organisationId, allocation_id: { $in: [] } };
  if (month) timeEntryQuery.date = { $regex: `^${month}` };

  let timeEntries = allocIds.length ? await TimeEntry.find(timeEntryQuery) : [];
  if (!includeNonBillable) {
    timeEntries = timeEntries.filter((entry) => isBillable(entry));
  }

  const loggedHoursByAllocationId = timeEntries.reduce((acc, entry) => {
    const allocationId = String(entry.allocation_id || '');
    if (!allocationId) return acc;
    acc.set(allocationId, (acc.get(allocationId) || 0) + Number(entry.hours_worked || 0));
    return acc;
  }, new Map());

  const allocationsByJobId = allocations.reduce((acc, allocation) => {
    const jobId = String(allocation.job_id || '');
    if (!jobId) return acc;
    if (!acc.has(jobId)) acc.set(jobId, []);
    acc.get(jobId).push(allocation);
    return acc;
  }, new Map());

  const jobPerformanceById = Array.from(allocationsByJobId.entries()).reduce((acc, [jobId, jobAllocations]) => {
    const job = jobById.get(jobId);
    const explicitDeadline = toDateOrNull(job?.deadline);
    const deadlineDate = explicitDeadline || resolveAssumedDeadline(month);
    const allocatedDate = jobAllocations
      .map((allocation) => toDateOrNull(allocation.created_at))
      .filter(Boolean)
      .sort((a, b) => a.getTime() - b.getTime())[0] || null;
    const comparisonDate = allocatedDate || new Date();
    const daysVariance = Math.round((comparisonDate.getTime() - deadlineDate.getTime()) / (1000 * 60 * 60 * 24));

    acc.set(jobId, {
      days_variance: daysVariance,
      performance: daysVariance <= 0 ? 'On Time' : 'Late',
      deadline_source: explicitDeadline ? 'explicit' : 'assumed_25th',
    });
    return acc;
  }, new Map());

  const teamsMap = allocations.reduce((acc, allocation) => {
    const staffRec = staffById.get(String(allocation.staff_id || ''));
    const departmentId = getDepartmentId(staffRec);
    const departmentName = departmentId !== '__unassigned__'
      ? (departmentById.get(departmentId)?.name || 'Unassigned')
      : 'Unassigned';
    const teamKey = departmentId;

    if (!acc.has(teamKey)) {
      acc.set(teamKey, {
        department_id: departmentId === '__unassigned__' ? null : departmentId,
        department_name: departmentName,
        team_size_ids: new Set(),
        job_ids: new Set(),
        budgeted_hours: 0,
        actual_hours: 0,
        on_time_job_ids: new Set(),
      });
    }

    const team = acc.get(teamKey);
    const allocationId = String(allocation._id);
    const jobId = String(allocation.job_id || '');
    const staffId = String(allocation.staff_id || '');
    const loggedHours = Number(loggedHoursByAllocationId.get(allocationId) || 0);
    const jobPerformance = jobPerformanceById.get(jobId);

    if (staffId) team.team_size_ids.add(staffId);
    if (jobId) {
      team.job_ids.add(jobId);
      if (jobPerformance?.performance === 'On Time') {
        team.on_time_job_ids.add(jobId);
      }
    }
    team.budgeted_hours += Number(allocation.adjusted_hours || 0);
    team.actual_hours += loggedHours;

    return acc;
  }, new Map());

  const teams = Array.from(teamsMap.values())
    .map((team) => {
      const teamSize = team.team_size_ids.size;
      const jobsAssigned = team.job_ids.size;
      const onTimeJobs = team.on_time_job_ids.size;
      const budgetAdherenceRaw = team.actual_hours > 0 ? (team.budgeted_hours / team.actual_hours) * 100 : 0;
      const budgetAdherence = Math.min(150, round(budgetAdherenceRaw, 1));
      const onTimeDelivery = jobsAssigned > 0 ? round((onTimeJobs / jobsAssigned) * 100, 1) : 0;
      const efficiencyScore = round((budgetAdherence * 0.6) + (onTimeDelivery * 0.4), 1);

      return {
        department_id: team.department_id,
        department_name: team.department_name,
        team_size: teamSize,
        jobs_assigned: jobsAssigned,
        budgeted_hours: round(team.budgeted_hours, 2),
        actual_hours: round(team.actual_hours, 2),
        budget_adherence: budgetAdherence,
        on_time_delivery: onTimeDelivery,
        efficiency_score: efficiencyScore,
      };
    })
    .sort((a, b) => Number(b.efficiency_score || 0) - Number(a.efficiency_score || 0));

  const uniqueStaffIds = new Set();
  const uniqueJobIds = new Set();
  teamsMap.forEach((team) => {
    team.team_size_ids.forEach((staffId) => uniqueStaffIds.add(staffId));
    team.job_ids.forEach((jobId) => uniqueJobIds.add(jobId));
  });

  return {
    report_name: 'Team Productivity & Efficiency Scorecard',
    generated_at: new Date().toISOString(),
    month: month || null,
    summary: {
      team_size: uniqueStaffIds.size,
      budget_adherence: teams.length > 0 ? round(sum(teams, (team) => team.budget_adherence) / teams.length, 1) : 0,
      on_time_delivery: teams.length > 0 ? round(sum(teams, (team) => team.on_time_delivery) / teams.length, 1) : 0,
      jobs_assigned: uniqueJobIds.size,
    },
    teams,
  };
}
