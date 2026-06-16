import { createRequire } from 'module';
import Client from '../models/Client.js';
import JobType from '../models/JobType.js';
import MonthlySnapshot from '../models/MonthlySnapshot.js';
import Setting from '../models/Setting.js';
import WorkingDayCalendar from '../models/WorkingDayCalendar.js';
import { SA_PUBLIC_HOLIDAYS_BY_YEAR } from '../config/publicHolidaysZA.js';

const require = createRequire(import.meta.url);

export const SYSTEM_JOB_TYPES = require('../utils/systemJobTypes.json');

export const nameToCode = (name) => String(name || '')
  .trim()
  .toUpperCase()
  .replace(/[\s-]+/g, '_')
  .replace(/[^A-Z0-9_]/g, '');

export const round = (value, precision = 2) => Number((Number(value) || 0).toFixed(precision));
export const monthValue = (month) => String(month || new Date().toISOString().slice(0, 7));
export const monthDatePattern = (month) => new RegExp(`^${monthValue(month)}-`);

export const normalizeWorkComponentService = (value) => {
  const token = String(value || '').trim().toLowerCase().replace(/[\s_-]+/g, '');

  if (!token || token === 'general' || token === 'gen') return 'general';
  if (token === 'p' || token === 'payroll') return 'payroll';
  if (token === 'm' || token === 'ma' || token === 'managementaccounts' || token === 'managementaccount') return 'ma';
  if (token === 'onceoff' || token === 'onceoffservice' || token === 'onceoffjob') return 'once_off';

  return String(value || '').trim().toLowerCase();
};

export const normalizeWorkComponentKey = (serviceOrKey, roleValue = undefined) => {
  if (roleValue === undefined) {
    const [servicePart = 'general', ...roleParts] = String(serviceOrKey || '').split(':');
    const role = roleParts.join(':').trim();
    return `${normalizeWorkComponentService(servicePart)}:${role || 'unknown'}`;
  }

  const role = String(roleValue || '').trim();
  return `${normalizeWorkComponentService(serviceOrKey)}:${role || 'unknown'}`;
};

export const DEFAULT_ENUMS = {
  roles: [
    'Partner',
    'Director',
    'Manager',
    'Reviewer',
    'Auditor',
    'Senior Accountant',
    'Accountant',
    'Junior Accountant',
    'Bookkeeper',
    'Accounting Intern',
    'Trainee',
    'Admin',
  ],
  priorities: ['Low', 'Medium', 'High', 'Critical'],
  currencies: ['ZAR', 'USD', 'EUR', 'GBP'],
  job_types: [],
};

export const normalizeSplitRows = (rows = [], valueField = 'percentage') => rows
  .filter((row) => row && row.role)
  .map((row) => ({
    ...row,
    role: String(row.role).trim(),
    [valueField]: Number(row[valueField] || 0),
  }))
  .filter((row) => row.role && row[valueField] >= 0);

export const normalizeWorkComponents = (rows = []) => rows
  .filter((row) => row && row.name)
  .map((row) => ({
    name: String(row.name).trim(),
    service: String(row.service || 'general').trim(),
    role: row.role ? String(row.role).trim() : null,
    percentage: Number(row.percentage || 0),
    hours_multiplier: Number(row.hours_multiplier || 1),
  }))
  .filter((row) => row.name && row.percentage >= 0);

export const getSystemJobTypeByName = (name) => SYSTEM_JOB_TYPES.find((item) => item.name === name) || null;
export const isReservedSystemJobTypeName = (name) => Boolean(getSystemJobTypeByName(String(name || '').trim()));

export const sanitizeName = (value) => String(value || '').trim();

export const matchesMonth = (dateValue, month) => monthDatePattern(month).test(String(dateValue || ''));

export const getJobTypeConfig = async (nameOrId) => {
  if (!nameOrId) return null;

  // Only include the _id branch when nameOrId is a valid ObjectId string to
  // avoid a Mongoose CastError when a plain job-type name (e.g. 'Audit') is passed.
  const { Types } = await import('mongoose');
  const query = Types.ObjectId.isValid(String(nameOrId))
    ? { $or: [{ _id: nameOrId }, { name: String(nameOrId) }] }
    : { name: String(nameOrId) };

  const custom = await JobType.findOne(query);
  if (custom) return custom;

  return getSystemJobTypeByName(String(nameOrId));
};

export const getClientByJob = async (job) => {
  if (!job) return null;
  if (job.client_id) {
    const direct = await Client.findById(job.client_id).catch(() => null);
    if (direct) return direct;
  }
  if (job.client_name) {
    return Client.findOne({ name: job.client_name }).catch(() => null);
  }
  return null;
};

export const getEmbeddedComponentForAllocation = (job, workComponentKey) => {
  if (!job?.job_type_entries?.length || !workComponentKey) return null;

  const normalizedKey = normalizeWorkComponentKey(workComponentKey);

  for (const entry of job.job_type_entries) {
    if (!entry.work_components?.length) continue;
    const entryService = normalizeWorkComponentService(entry.job_type_name || '');

    for (const comp of entry.work_components) {
      const compService = normalizeWorkComponentService(comp.service || entryService || 'general');
      const compKey = normalizeWorkComponentKey(compService, comp.role || comp.name || 'unknown');
      if (compKey === normalizedKey) {
        return { component: comp, entryFee: Number(entry.fee || 0) };
      }
    }
  }
  return null;
};

const getJobTypeConfigForAllocation = async (job, workComponentKey = null) => {
  if (!job) return null;

  const normalizedKey = workComponentKey ? normalizeWorkComponentKey(workComponentKey) : null;
  const [service] = normalizedKey ? normalizedKey.split(':') : [];

  if (job.job_type_entries?.length > 0) {
    for (const entry of job.job_type_entries) {
      if (!entry.job_type_id) continue;
      const config = await getJobTypeConfig(entry.job_type_id);
      if (!config) continue;
      if (!service) return config;
      const configService = normalizeWorkComponentService(config.name || config.service || '');
      if (configService === service) return config;
      if (normalizedKey && config.work_components?.length) {
        const match = config.work_components.find((c) =>
          normalizeWorkComponentKey(c.service || 'general', c.role || c.name || 'unknown') === normalizedKey,
        );
        if (match) return config;
      }
    }
    const firstEntry = job.job_type_entries[0];
    if (firstEntry?.job_type_id) return getJobTypeConfig(firstEntry.job_type_id);
    return null;
  }

  return null;
};

export const getRoleSplitForRole = (client, role) => {
  const normalizedRole = String(role || '').trim();
  const match = client?.role_fee_splits?.find((row) => row.role === normalizedRole) || null;
  return {
    percentage: Number(match?.percentage || 100),
    hourly_rate_override: match?.hourly_rate_override === null || match?.hourly_rate_override === undefined
      ? null
      : Number(match.hourly_rate_override),
  };
};

export const getJobTypeWeightForRole = (jobTypeConfig, role) => {
  const components = jobTypeConfig?.work_components || [];
  const normalizedRole = String(role || '').trim();
  const roleComponents = components.filter((component) => component.role === normalizedRole);
  const relevant = roleComponents.length > 0 ? roleComponents : components;
  if (relevant.length === 0) {
    return { percentage: 100, hours_multiplier: 1 };
  }

  const totalPercentage = relevant.reduce((acc, component) => acc + Number(component.percentage || 0), 0);
  const weightedMultiplier = totalPercentage > 0
    ? relevant.reduce(
      (acc, component) => acc + ((Number(component.percentage || 0) / totalPercentage) * Number(component.hours_multiplier || 1)),
      0,
    )
    : 1;

  return {
    percentage: totalPercentage || 100,
    hours_multiplier: weightedMultiplier || 1,
  };
};

export const calculateAllocationMetrics = async ({ job, staff, requestedPercentage, workComponentKey = null }) => {
  const [client, jobTypeConfig] = await Promise.all([
    getClientByJob(job),
    getJobTypeConfigForAllocation(job, workComponentKey),
  ]);

  const roleSplit = getRoleSplitForRole(client, staff?.role);

  // When an explicit work_component_key is supplied (e.g. 'payroll:Accountant'),
  // derive the recommended percentage from the embedded component's share of the total job fee.
  let recommendedPercentage = 100;
  let matchedComponent = null;
  if (workComponentKey) {
    const embedded = getEmbeddedComponentForAllocation(job, workComponentKey);
    if (embedded) {
      matchedComponent = embedded.component;
      const effectiveTotalFee = Number(job.pricing_override ?? job.job_fee ?? 0);
      const serviceFee = Number(embedded.entryFee || effectiveTotalFee);
      const compFee = (serviceFee * Number(embedded.component.percentage || 0)) / 100;
      recommendedPercentage = effectiveTotalFee > 0
        ? Math.min(100, Math.max(0.01, round((compFee / effectiveTotalFee) * 100, 2)))
        : Math.min(100, Math.max(0.01, Number(embedded.component.percentage || 100)));
    }
  }
  if (!matchedComponent) {
    const jobTypeWeight = getJobTypeWeightForRole(jobTypeConfig, staff?.role);
    recommendedPercentage = Math.min(100, Math.max(1, round((roleSplit.percentage * jobTypeWeight.percentage) / 100, 2)));
  }

  // When workComponentKey is provided and a percentage is explicitly requested,
  // interpret the requested percentage as relative to the component share
  // (e.g., 100% means full component share, 50% means half of component share).
  // Convert to absolute job percentage for storage and validation.
  let effectivePercentage;
  if (requestedPercentage === undefined || requestedPercentage === null || requestedPercentage === '') {
    effectivePercentage = recommendedPercentage;
  } else if (workComponentKey && matchedComponent) {
    // Absolute mode: requestedPercentage is direct % of job
    const relativePct = Number(requestedPercentage);
    effectivePercentage = round(relativePct, 2);
    if (relativePct > 0) {
      effectivePercentage = Math.max(0.01, effectivePercentage);
    }
  } else {
    // Absolute mode: requestedPercentage is direct % of job
    effectivePercentage = Number(requestedPercentage);
  }
  const effectiveJobFee = Number(job.pricing_override ?? job.job_fee ?? 0);
  const allocatedFee = (effectiveJobFee * effectivePercentage) / 100;
  const hourlyRate = Number(roleSplit.hourly_rate_override ?? staff?.hourly_rate ?? 0);
  const calculatedHours = hourlyRate > 0 ? allocatedFee / hourlyRate : 0;
  const productivityFactor = Number(staff?.productivity_factor || 1) || 1;

  // hours_multiplier from the matched embedded component, or use job type weight
  let hoursMultiplier = 1;
  if (matchedComponent) {
    hoursMultiplier = Number(matchedComponent.hours_multiplier || 1);
  } else {
    hoursMultiplier = Number(getJobTypeWeightForRole(jobTypeConfig, staff?.role).hours_multiplier || 1);
  }

  const adjustedHours = productivityFactor > 0
    ? (calculatedHours / productivityFactor) * hoursMultiplier
    : calculatedHours;

  return {
    client,
    jobTypeConfig,
    percentage: round(effectivePercentage, 2),
    allocated_fee: round(allocatedFee, 2),
    calculated_hours: round(calculatedHours, 2),
    adjusted_hours: round(adjustedHours, 2),
    calculation_details: {
      effective_job_fee: round(effectiveJobFee, 2),
      recommended_percentage: round(recommendedPercentage, 2),
      applied_client_split_percentage: round(roleSplit.percentage, 2),
      work_component_key: workComponentKey || null,
      component_hours_multiplier: round(hoursMultiplier, 3),
      effective_hourly_rate: round(hourlyRate, 2),
    },
  };
};

const dateRangeForMonth = (month) => {
  const [year, monthNumber] = monthValue(month).split('-').map(Number);
  return {
    start: new Date(Date.UTC(year, monthNumber - 1, 1)),
    end: new Date(Date.UTC(year, monthNumber, 0)),
  };
};

export const getBusinessDatesForMonth = (month) => {
  const { start, end } = dateRangeForMonth(month);
  const dates = [];
  const cursor = new Date(start);

  while (cursor <= end) {
    const day = cursor.getUTCDay();
    if (day !== 0 && day !== 6) {
      dates.push(cursor.toISOString().slice(0, 10));
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return dates;
};

export const calculateCalendarSummary = (month, calendar, defaultDailyHours = 8) => {
  const businessDates = new Set(getBusinessDatesForMonth(month));
  const holidays = new Set((calendar?.holidays || []).map((item) => item.date));
  const extraWorkingDays = new Set(calendar?.extra_working_days || []);

  for (const holiday of holidays) {
    businessDates.delete(holiday);
  }
  for (const extraDate of extraWorkingDays) {
    businessDates.add(extraDate);
  }

  const workingDays = [...businessDates].sort();
  const dailyCapacityHours = Number(calendar?.daily_capacity_hours || defaultDailyHours || 8);
  const workingDaysOverride = calendar?.working_days_override != null
    ? Number(calendar.working_days_override)
    : null;
  const workingDaysCount = workingDaysOverride != null && Number.isFinite(workingDaysOverride)
    ? Math.max(0, Math.floor(workingDaysOverride))
    : workingDays.length;
  return {
    month: monthValue(month),
    working_days_count: workingDaysCount,
    working_days: workingDays,
    holidays: [...holidays].sort(),
    extra_working_days: [...extraWorkingDays].sort(),
    daily_capacity_hours: round(dailyCapacityHours, 2),
    capacity_hours: round(workingDaysCount * dailyCapacityHours, 2),
  };
};

export const ensureSettings = async (orgId = null) => {
  if (orgId) {
    let settings = await Setting.findOne({ organisation_id: orgId });
    if (!settings) settings = await Setting.create({ organisation_id: orgId });
    return settings;
  }

  let settings = await Setting.findOne({}).sort({ createdAt: 1 });
  if (!settings) settings = await Setting.create({});
  return settings;
};

export const getZaHolidayConfigsForMonth = (month) => {
  const monthKey = monthValue(month);
  const year = Number(monthKey.slice(0, 4));
  const list = SA_PUBLIC_HOLIDAYS_BY_YEAR[year] || [];
  return list
    .filter((h) => String(h.date || '').startsWith(`${monthKey}-`))
    .map((h) => ({ date: h.date, label: h.name || null }));
};

export const ensureCalendarForMonth = async (month, orgId = null) => {
  const monthKey = monthValue(month);
  const settings = await ensureSettings(orgId);

  let calendar = null;
  if (orgId) {
    calendar = await WorkingDayCalendar.findOne({ month: monthKey, organisation_id: orgId });
    if (!calendar) {
      calendar = await WorkingDayCalendar.findOne({ month: monthKey, organisation_id: null });
    }
  } else {
    calendar = await WorkingDayCalendar.findOne({ month: monthKey, organisation_id: null });
  }

  const defaultDailyHours = Number(settings.default_working_hours || 160) / 20 || 8;
  const holiday_configs = calendar?.holidays?.length ? calendar.holidays : getZaHolidayConfigsForMonth(monthKey);

  const effectiveCalendar = calendar
    ? { ...calendar.toObject(), holidays: holiday_configs }
    : { month: monthKey, daily_capacity_hours: defaultDailyHours, holidays: holiday_configs, extra_working_days: [] };

  return {
    settings,
    calendar,
    holiday_configs,
    summary: calculateCalendarSummary(monthKey, effectiveCalendar, defaultDailyHours),
  };
};

export const buildSnapshotPayload = ({ month, staffRows, jobRows, overUnderRows, calendarSummary }) => ({
  month: monthValue(month),
  generated_at: new Date(),
  summary: {
    working_days_count: calendarSummary.working_days_count,
    capacity_hours: calendarSummary.capacity_hours,
    total_staff: staffRows.length,
    total_jobs: jobRows.length,
    total_over_under_fee_variance: round(overUnderRows.reduce((acc, row) => acc + Number(row.fee_variance || 0), 0), 2),
    total_over_under_hours_variance: round(overUnderRows.reduce((acc, row) => acc + Number(row.hours_variance || 0), 0), 2),
  },
  staff_capacity: staffRows,
  jobs: jobRows,
  over_under: overUnderRows,
});

export const upsertMonthlySnapshot = async (payload, orgId) => MonthlySnapshot.findOneAndUpdate(
  { month: payload.month, organisation_id: orgId ?? payload.organisation_id },
  payload,
  { upsert: true, new: true, runValidators: true },
);
