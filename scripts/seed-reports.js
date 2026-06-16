#!/usr/bin/env node

import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import Client from '../src/models/Client.js';
import Department from '../src/models/Department.js';
import Job from '../src/models/Job.js';
import JobType from '../src/models/JobType.js';
import Setting from '../src/models/Setting.js';
import Staff from '../src/models/Staff.js';
import Allocation from '../src/models/Allocation.js';
import TimeEntry from '../src/models/TimeEntry.js';
import WorkingDayCalendar from '../src/models/WorkingDayCalendar.js';
import { appendAllocationSnapshotVersion } from '../src/services/allocationSnapshotService.js';

dotenv.config();

const PROFILES = {
  minimal: {
    clients: 20,
    activeStaff: 12,
    inactiveStaff: 2,
    jobs: 48,
    months: ['2026-01', '2026-04'],
  },
  ideal: {
    clients: 54,
    activeStaff: 22,
    inactiveStaff: 4,
    jobs: 180,
    months: ['2025-11', '2025-12', '2026-01', '2026-02', '2026-03', '2026-04'],
  },
};

const ROLES = [
  'Partner',
  'Director',
  'Manager',
  'Reviewer',
  'Senior Accountant',
  'Accountant',
  'Junior Accountant',
  'Bookkeeper',
];

const INDUSTRIES = [
  'Retail',
  'Construction',
  'Healthcare',
  'Technology',
  'Agriculture',
  'Manufacturing',
  'Hospitality',
  'Professional Services',
];

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const parseCsv = (content) => {
  const lines = String(content || '').trim().split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map((h) => h.trim());

  return lines.slice(1).map((line) => {
    const cells = line.split(',').map((c) => c.trim());
    const row = {};
    headers.forEach((h, i) => {
      row[h] = cells[i] ?? '';
    });
    return row;
  });
};

const readSeedCsv = async (filename) => {
  const absolute = path.join(__dirname, filename);
  const raw = await readFile(absolute, 'utf8');
  return parseCsv(raw);
};

const requireSeedRows = (rows, filename) => {
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error(`Seed source ${filename} is empty. Please provide at least one row.`);
  }
  return rows;
};

const round = (n, p = 2) => Number((Number(n) || 0).toFixed(p));
const toIsoDate = (d) => d.toISOString().slice(0, 10);

const nowUtc = () => new Date();
const monthFromDate = (d) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;

const monthLastDay = (month) => {
  const [year, monthNumber] = month.split('-').map(Number);
  return new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
};

const utcDate = (month, day, hour = 9) => {
  const [year, monthNumber] = month.split('-').map(Number);
  return new Date(Date.UTC(year, monthNumber - 1, day, hour, 0, 0, 0));
};

const normalizeMonthsToPast = (months = []) => {
  const currentMonth = monthFromDate(nowUtc());
  const unique = [...new Set((months || []).filter(Boolean))];
  const filtered = unique
    .filter((m) => /^\d{4}-\d{2}$/.test(m) && m <= currentMonth)
    .sort();

  return filtered.length ? filtered : [currentMonth];
};

const maxDayForSeedMonth = (month, now = nowUtc()) => {
  const currentMonth = monthFromDate(now);
  if (month < currentMonth) return monthLastDay(month);
  if (month === currentMonth) return Math.max(1, now.getUTCDate());
  return 0;
};

const randomPastDateInMonth = (month, rng, { minHour = 8, maxHour = 17 } = {}) => {
  const now = nowUtc();
  const currentMonth = monthFromDate(now);
  const dayMax = maxDayForSeedMonth(month, now);
  const day = ri(rng, 1, Math.max(1, dayMax));

  let hour = ri(rng, minHour, maxHour);
  let minute = ri(rng, 0, 59);

  if (month === currentMonth && day === now.getUTCDate()) {
    const latestHour = now.getUTCHours();
    const lowerHour = Math.min(minHour, latestHour);
    hour = ri(rng, lowerHour, latestHour);
    minute = hour === latestHour ? ri(rng, 0, now.getUTCMinutes()) : ri(rng, 0, 59);
  }

  const [year, monthNumber] = month.split('-').map(Number);
  const candidate = new Date(Date.UTC(year, monthNumber - 1, day, hour, minute, 0, 0));
  return candidate.getTime() > now.getTime() ? new Date(now.getTime() - (5 * 60 * 1000)) : candidate;
};

const hashSeed = (text) => {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
};

const createRng = (seedText) => {
  let state = hashSeed(seedText || 'reports-seed');
  return () => {
    state = (Math.imul(1664525, state) + 1013904223) >>> 0;
    return state / 4294967296;
  };
};

const ri = (rng, min, max) => Math.floor(rng() * (max - min + 1)) + min;
const rf = (rng, min, max) => min + (max - min) * rng();
const pick = (rng, arr) => arr[Math.floor(rng() * arr.length)];

const parseArgs = (argv) => {
  const options = {
    profile: 'minimal',
    tag: 'RPT_MIN_2026Q2',
    months: null,
    primaryMonth: '2026-04',
    cleanupTags: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--cleanup-tags') options.cleanupTags = true;
    else if (arg === '--profile' && argv[i + 1]) options.profile = argv[++i];
    else if (arg.startsWith('--profile=')) options.profile = arg.split('=')[1];
    else if (arg === '--tag' && argv[i + 1]) options.tag = argv[++i];
    else if (arg.startsWith('--tag=')) options.tag = arg.split('=')[1];
    else if (arg === '--months' && argv[i + 1]) {
      options.months = argv[++i].split(',').map((x) => x.trim()).filter(Boolean);
    } else if (arg.startsWith('--months=')) {
      options.months = arg.split('=')[1].split(',').map((x) => x.trim()).filter(Boolean);
    } else if (arg === '--primary-month' && argv[i + 1]) options.primaryMonth = argv[++i];
    else if (arg.startsWith('--primary-month=')) options.primaryMonth = arg.split('=')[1];
  }

  return options;
};

const escapeRx = (v) => v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const cleanupByTag = async (tag) => {
  const rx = new RegExp(escapeRx(tag), 'i');
  const [te, al, jobs, clients, staff] = await Promise.all([
    TimeEntry.deleteMany({ description: rx }),
    Allocation.deleteMany({ notes: rx }),
    Job.deleteMany({ name: rx }),
    Client.deleteMany({ name: rx }),
    Staff.deleteMany({ $or: [{ name: rx }, { email: rx }] }),
  ]);

  console.log(`Tagged cleanup complete (${tag}) -> time_entries=${te.deletedCount}, allocations=${al.deletedCount}, jobs=${jobs.deletedCount}, clients=${clients.deletedCount}, staff=${staff.deletedCount}`);
};

const seedSettings = async () => {
  const existing = await Setting.findOne({}).sort({ createdAt: 1 });
  if (existing) return existing;
  return Setting.create({
    firm_name: 'Brendmo Chartered Accountants',
    tagline: 'Workflow Planner',
    currency: 'ZAR',
    currency_symbol: 'R',
    default_working_hours: 160,
    primary_color: '#3B82F6',
    secondary_color: '#10B981',
    accent_color: '#8B5CF6',
  });
};

const seedDepartments = async () => {
  const rows = [
    { name: 'Payroll', code: 'PAY', description: 'Payroll processing and compliance.', color: '#3B82F6', is_active: true },
    { name: 'Management Accounts', code: 'MA', description: 'Management accounts.', color: '#8B5CF6', is_active: true },
    { name: 'Tax', code: 'TAX', description: 'Tax services.', color: '#F59E0B', is_active: true },
    { name: 'Audit', code: 'AUD', description: 'Audit engagements.', color: '#10B981', is_active: true },
    { name: 'Advisory', code: 'ADV', description: 'Advisory and consulting.', color: '#0EA5E9', is_active: true },
    { name: 'Admin', code: 'ADM', description: 'Administration.', color: '#6B7280', is_active: false },
  ];

  for (const row of rows) {
    await Department.findOneAndUpdate(
      { code: row.code },
      { ...row, supervisor_id: null },
      { upsert: true, new: true, runValidators: true },
    );
  }

  return Department.find({}).sort({ code: 1 });
};

const seedJobTypes = async () => {
  const rows = [
    {
      name: 'Payroll',
      description: 'Monthly payroll processing service.',
      work_components: [
        { name: 'P: Reviewer', service: 'payroll', role: 'Reviewer', percentage: 15, hours_multiplier: 1 },
        { name: 'P: Accountant', service: 'payroll', role: 'Accountant', percentage: 85, hours_multiplier: 1 },
      ],
    },
    {
      name: 'Management Accounts',
      description: 'Monthly/quarterly management accounts.',
      work_components: [
        { name: 'MA: Bookkeeper', service: 'ma', role: 'Bookkeeper', percentage: 50, hours_multiplier: 1 },
        { name: 'MA: Accountant', service: 'ma', role: 'Accountant', percentage: 35, hours_multiplier: 1 },
        { name: 'MA: Reviewer', service: 'ma', role: 'Reviewer', percentage: 15, hours_multiplier: 1 },
      ],
    },
    {
      name: 'Audit',
      description: 'Audit engagements and review.',
      work_components: [
        { name: 'AUD: Reviewer', service: 'general', role: 'Reviewer', percentage: 35, hours_multiplier: 1 },
        { name: 'AUD: Accountant', service: 'general', role: 'Accountant', percentage: 65, hours_multiplier: 1 },
      ],
    },
    {
      name: 'Tax Compliance',
      description: 'Tax filing and compliance.',
      work_components: [
        { name: 'TAX: Senior', service: 'general', role: 'Senior Accountant', percentage: 40, hours_multiplier: 1 },
        { name: 'TAX: Accountant', service: 'general', role: 'Accountant', percentage: 60, hours_multiplier: 1 },
      ],
    },
  ];

  for (const row of rows) {
    await JobType.findOneAndUpdate(
      { name: row.name },
      { ...row, is_active: true, is_system: false },
      { upsert: true, new: true, runValidators: true },
    );
  }

  return JobType.find({ is_active: true }).sort({ name: 1 });
};

const seedCalendars = async (months) => {
  for (const month of months) {
    const lastDay = monthLastDay(month);
    await WorkingDayCalendar.findOneAndUpdate(
      { month },
      {
        month,
        daily_capacity_hours: 8,
        holidays: [
          { date: `${month}-${String(Math.min(5, lastDay)).padStart(2, '0')}`, label: 'Public Holiday' },
          { date: `${month}-${String(Math.min(18, lastDay)).padStart(2, '0')}`, label: 'Public Holiday' },
        ],
        extra_working_days: [`${month}-${String(Math.min(27, lastDay)).padStart(2, '0')}`],
        notes: `Report seed calendar ${month}`,
      },
      { upsert: true, new: true, runValidators: true },
    );
  }
};

const seedClients = async ({ count, tag, rng }) => {
  const base = requireSeedRows(await readSeedCsv('client.csv'), 'client.csv');

  const docs = [];
  for (let i = 1; i <= count; i += 1) {
    const tpl = base[(i - 1) % base.length];
    const cycle = Math.floor((i - 1) / base.length);
    const nameSuffix = cycle > 0 ? ` Branch ${cycle + 1}` : '';

    const emailRaw = String(tpl.email || '').toLowerCase();
    const [localPart, domain = 'example.co.za'] = emailRaw.includes('@')
      ? emailRaw.split('@')
      : [`client${i}`, 'example.co.za'];

    docs.push({
      name: `${tag} ${tpl.name || `Client ${String(i).padStart(2, '0')}`}${nameSuffix}`,
      contact_person: tpl.contact_person || `Contact ${i}`,
      email: `${localPart}+${tag.toLowerCase()}${i}@${domain}`,
      phone: tpl.phone || `+27 10 555 ${String(1000 + i).slice(-4)}`,
      address: tpl.address || null,
      industry: tpl.industry || pick(rng, INDUSTRIES),
      notes: `${tpl.notes || 'Seeded for reports testing'} | ${tag}`,
      role_fee_splits: [
        { role: 'Reviewer', percentage: 15, hourly_rate_override: null },
        { role: 'Accountant', percentage: 55, hourly_rate_override: null },
        { role: 'Bookkeeper', percentage: 30, hourly_rate_override: null },
      ],
      is_active: true,
    });
  }

  await Client.insertMany(docs, { ordered: true });
  return Client.find({ name: new RegExp(`^${escapeRx(tag)}`) }).sort({ name: 1 });
};

const seedStaff = async ({ activeCount, inactiveCount, tag, departments, rng }) => {
  const templates = requireSeedRows(await readSeedCsv('stuff.csv'), 'stuff.csv');

  const activeDepartments = departments.filter((d) => d.is_active);
  const byDeptName = new Map(activeDepartments.map((d) => [String(d.name || '').toLowerCase(), d]));
  const baseRate = {
    Partner: 1400,
    Director: 1200,
    Manager: 950,
    Reviewer: 800,
    'Senior Accountant': 700,
    Accountant: 580,
    'Junior Accountant': 420,
    Bookkeeper: 360,
  };

  const rows = [];
  const total = activeCount + inactiveCount;

  for (let i = 0; i < total; i += 1) {
    const template = templates.length ? templates[i % templates.length] : null;
    const templateRole = String(template?.role || '').trim();
    const normalizedRole = templateRole.toLowerCase() === 'auditor' ? 'Reviewer' : templateRole;
    const role = normalizedRole || ROLES[i % ROLES.length];

    const deptFromTemplate = byDeptName.get(String(template?.department_name || '').toLowerCase());
    const department = deptFromTemplate || activeDepartments[i % activeDepartments.length];
    const isInactive = i >= activeCount;

    const cycle = templates.length ? Math.floor(i / templates.length) : 0;
    const staffName = template?.name || `Staff ${String(i + 1).padStart(2, '0')}`;

    const emailRaw = String(template?.email || '').toLowerCase();
    const [localPart, domain = 'firm.co.za'] = emailRaw.includes('@')
      ? emailRaw.split('@')
      : [`staff${i + 1}`, 'firm.co.za'];

    rows.push({
      name: cycle > 0 ? `${tag} ${staffName} ${cycle + 1}` : `${tag} ${staffName}`,
      email: `${localPart}+${tag.toLowerCase()}${i + 1}@${domain}`,
      passwordHash: '$2a$10$4X4UGqn6v1WwD4tXLJYkdujF6fM3byLESp6vDvNfLjY9U7U3kY4nW',
      role,
      access_level: template?.access_level || (i === 0 ? 'Admin' : 'Standard'),
      hourly_rate: round((Number(template?.hourly_rate) || baseRate[role] || 550) * rf(rng, 0.93, 1.07), 2),
      available_hours_per_month: Math.max(120, Number(template?.available_hours_per_month) || ri(rng, 145, 180)),
      productivity_factor: round(Math.max(0.7, Math.min(1.2, Number(template?.productivity_factor) || rf(rng, 0.75, 1.05))), 2),
      annual_fee_budget: Number(template?.annual_fee_budget) || ri(rng, 600000, 1800000),
      annual_budgeted_hours: Number(template?.annual_budgeted_hours) || ri(rng, 1300, 2200),
      department_id: String(department._id),
      department_ids: [String(department._id)],
      phone: `+27 82 555 ${String(1000 + i).slice(-4)}`,
      is_active: !isInactive,
      is_archived: false,
      can_delete: true,
    });
  }

  await Staff.insertMany(rows, { ordered: true });
  return Staff.find({ name: new RegExp(`^${escapeRx(tag)}\\b`, 'i') }).sort({ name: 1 });
};

const seedJobs = async ({ count, tag, clients, jobTypes, months, rng }) => {
  const payroll = jobTypes.find((x) => x.name === 'Payroll') || jobTypes[0];
  const ma = jobTypes.find((x) => x.name === 'Management Accounts') || jobTypes[0];

  const docs = [];
  for (let i = 0; i < count; i += 1) {
    const client = clients[i % clients.length];
    const month = months[i % months.length];
    const submissionDate = randomPastDateInMonth(month, rng, { minHour: 8, maxHour: 14 });
    const mode = i % 6;

    const hasPayroll = mode === 0 || mode === 2 || mode === 3;
    const hasMa = mode === 1 || mode === 2 || mode === 4;

    const payrollAmount = hasPayroll
      ? (mode === 2 ? ri(rng, 1500, 14000) : ri(rng, 2200, 19000))
      : null;
    const managementAmount = hasMa
      ? (mode === 2 ? ri(rng, 1800, 22000) : ri(rng, 4500, 32000))
      : null;

    const serviceTotal = Number(payrollAmount || 0) + Number(managementAmount || 0);
    const advisoryAddon = mode === 5 ? ri(rng, 2500, 12000) : 0;
    const computedJobFee = serviceTotal > 0 ? serviceTotal : advisoryAddon;
    const jobFee = Math.max(1500, round(computedJobFee, 2));

    const jobType = {
      payroll: { id: hasPayroll ? (payroll?._id || null) : null, amount: payrollAmount },
      management_accounts: { id: hasMa ? (ma?._id || null) : null, amount: managementAmount },
    };

    const labels = [];
    if (hasPayroll) labels.push('Payroll');
    if (hasMa) labels.push('Management Accounts');
    const jobTypeLabel = labels.join(' & ') || 'Advisory';
    const status = i % 3 === 0 ? 'Pending' : i % 3 === 1 ? 'Doing' : 'Completed';

    let deadline = null;
    if (i % 3 === 1 || i % 3 === 2) {
      const offsetDays = i % 3 === 1 ? ri(rng, 1, 6) : ri(rng, 7, 20);
      const base = new Date(submissionDate.getTime() + (offsetDays * 24 * 60 * 60 * 1000));
      const now = nowUtc();
      deadline = base.getTime() > now.getTime() ? now : base;
    }

    docs.push({
      name: `${tag} Job ${String(i + 1).padStart(3, '0')}`,
      client_id: client._id,
      client_name: client.name,
      job_type: jobType,
      job_type_label: jobTypeLabel,
      job_fee: jobFee,
      pricing_override: i % 5 === 0 ? round(jobFee * rf(rng, 0.97, 1.06), 2) : null,
      budgeted_wip: round(jobFee * rf(rng, 0.1, 0.45), 2),
      estimated_hours: ri(rng, 15, 160),
      minimum_role: pick(rng, ['Bookkeeper', 'Accountant', 'Senior Accountant', 'Reviewer']),
      priority: pick(rng, ['Low', 'Medium', 'High', 'Critical']),
      deadline,
      submission_date: submissionDate,
      status,
      description: `Seeded report test job ${i + 1} for ${tag}`,
      financial_year: '2026',
      department_id: null,
      is_recurring: i % 4 === 0,
      recurrence_type: i % 4 === 0 ? 'monthly' : null,
      recurrence_start_date: i % 4 === 0 ? `${month}-01` : null,
      recurrence_end_date: null,
      is_retainer: i % 6 === 0,
      retainer_fee: i % 6 === 0 ? round(jobFee * 0.5, 2) : null,
      retainer_start_date: i % 6 === 0 ? `${month}-01` : null,
      retainer_end_date: null,
    });
  }

  await Job.insertMany(docs, { ordered: true });
  return Job.find({ name: new RegExp(`^${escapeRx(tag)}`) }).sort({ name: 1 });
};

const buildTargetHours = (staffCount, scale = 1) => {
  const high = Math.max(2, Math.floor(staffCount * 0.2));
  const low = Math.max(3, Math.floor(staffCount * 0.25));
  const out = [];

  for (let i = 0; i < staffCount; i += 1) {
    if (i < high) out.push(Math.round((180 + (i * 7)) * scale));
    else if (i >= (staffCount - low)) out.push(Math.round((24 + ((i % 4) * 6)) * scale));
    else out.push(Math.round((95 + ((i % 6) * 10)) * scale));
  }

  return out;
};

const staffActualMultiplier = (index, staffCount) => {
  const high = Math.max(2, Math.floor(staffCount * 0.2));
  const medium = Math.max(3, Math.floor(staffCount * 0.25));
  if (index < high) return 1.42;
  if (index < high + medium) return 1.22;
  return 0.92;
};

const createAllocations = ({ months, primaryMonth, jobs, staff, tag, rng }) => {
  const activeStaff = staff.filter((s) => s.is_active && !s.is_archived);
  const rows = [];

  for (const month of months) {
    const scale = month === primaryMonth ? 1 : round(rf(rng, 0.75, 1.05), 2);
    const targets = buildTargetHours(activeStaff.length, scale);

    for (let staffIndex = 0; staffIndex < activeStaff.length; staffIndex += 1) {
      const member = activeStaff[staffIndex];
      let remaining = targets[staffIndex];
      let slots = ri(rng, 3, 6);

      while (slots > 0 && remaining > 5) {
        const job = jobs[ri(rng, 0, jobs.length - 1)];
        const isLast = slots === 1;
        const chunk = isLast ? remaining : Math.max(6, round(remaining * rf(rng, 0.18, 0.42), 2));
        const adjustedHours = Math.max(5, round(Math.min(remaining, chunk), 2));
        const calculatedHours = round(adjustedHours / Math.max(0.55, Number(member.productivity_factor || 1)), 2);

        const baseFee = adjustedHours * Number(member.hourly_rate || 0) * Number(member.productivity_factor || 1);
        const allocatedFee = round(baseFee * rf(rng, 1.02, 1.18), 2);
        const percentage = Math.max(0.5, Math.min(99.5, round((allocatedFee / Math.max(1, Number(job.job_fee || 1))) * 100, 2)));

        const workflowStatus = month === primaryMonth
          ? (rng() < 0.35 ? 'Completed' : rng() < 0.75 ? 'Doing' : 'Pending')
          : (rng() < 0.55 ? 'Completed' : rng() < 0.82 ? 'Doing' : 'Pending');

        const startedAt = workflowStatus === 'Doing' || workflowStatus === 'Completed'
          ? randomPastDateInMonth(month, rng, { minHour: 8, maxHour: 11 })
          : null;
        const completedAt = workflowStatus === 'Completed' && startedAt
          ? new Date(Math.min(nowUtc().getTime(), startedAt.getTime() + (ri(rng, 1, 14) * 60 * 60 * 1000)))
          : null;

        rows.push({
          job_id: job._id,
          staff_id: member._id,
          percentage,
          allocated_fee: allocatedFee,
          calculated_hours: calculatedHours,
          adjusted_hours: adjustedHours,
          month,
          notes: `${tag} allocation ${month}`,
          is_reallocated: false,
          workflow_status: workflowStatus,
          completed_percentage: workflowStatus === 'Completed' ? 100 : workflowStatus === 'Doing' ? ri(rng, 20, 80) : ri(rng, 0, 20),
          started_at: startedAt,
          started_by: startedAt ? member._id : null,
          started_timezone: startedAt ? 'Africa/Johannesburg' : null,
          completed_at: completedAt,
          completed_by: completedAt ? member._id : null,
          completed_timezone: completedAt ? 'Africa/Johannesburg' : null,
          status: 'active',
          is_auto_generated: false,
        });

        remaining = round(remaining - adjustedHours, 2);
        slots -= 1;
      }
    }
  }

  return rows;
};

const syncJobStatusesFromAllocations = async ({ jobs, allocations, primaryMonth }) => {
  const statusUpdates = [];

  for (const job of jobs) {
    const jobId = String(job._id);
    const jobAllocs = allocations.filter((a) => String(a.job_id) === jobId && a.month === primaryMonth);
    if (!jobAllocs.length) continue;

    const allCompleted = jobAllocs.every((a) => a.workflow_status === 'Completed');
    const anyStarted = jobAllocs.some((a) => a.workflow_status === 'Doing' || a.workflow_status === 'Completed');
    const status = allCompleted ? 'Completed' : (anyStarted ? 'Doing' : 'Pending');

    if (status !== job.status) {
      statusUpdates.push(Job.updateOne({ _id: job._id }, { $set: { status } }));
    }
  }

  if (statusUpdates.length) {
    await Promise.all(statusUpdates);
  }
};

const appendSnapshotsForAllocations = async ({ allocations, jobs, staff }) => {
  const jobMap = new Map(jobs.map((j) => [String(j._id), j]));
  const staffMap = new Map(staff.map((s) => [String(s._id), s]));

  for (const allocation of allocations) {
    const state = allocation.workflow_status === 'Completed' ? 'completed' : 'draft';
    await appendAllocationSnapshotVersion({
      allocation,
      state,
      reason: 'seed_reports_dataset',
      job: jobMap.get(String(allocation.job_id)) || null,
      staff: staffMap.get(String(allocation.staff_id)) || null,
      monthScoped: false,
      force: true,
    });
  }
};

const createTimeEntriesForAllocation = ({ allocation, staffIndex, staffCount, primaryMonth, tag, rng }) => {
  const multiplier = allocation.month === primaryMonth
    ? staffActualMultiplier(staffIndex, staffCount)
    : rf(rng, 0.85, 1.12);

  const totalActual = round(Number(allocation.adjusted_hours || 0) * multiplier * rf(rng, 0.95, 1.05), 2);
  const entriesCount = ri(rng, 2, 5);
  const rows = [];
  let remaining = totalActual;
  const maxDay = monthLastDay(allocation.month);

  for (let e = 0; e < entriesCount; e += 1) {
    const isLast = e === entriesCount - 1;
    const chunkHours = isLast
      ? Math.max(0.5, round(remaining, 2))
      : Math.max(0.5, round(remaining * rf(rng, 0.2, 0.45), 2));

    const start = randomPastDateInMonth(allocation.month, rng, { minHour: 8, maxHour: 11 });
    const maxHoursRemaining = Math.max(0.25, (nowUtc().getTime() - start.getTime()) / (60 * 60 * 1000));
    const safeHours = Math.min(chunkHours, maxHoursRemaining);
    rows.push({
      allocation_id: allocation._id,
      staff_id: allocation.staff_id,
      job_id: allocation.job_id,
      start_time: start,
      end_time: new Date(start.getTime() + (safeHours * 60 * 60 * 1000)),
      date: toIsoDate(start),
      hours_worked: safeHours,
      description: `${tag} time log ${allocation.month}`,
    });

    remaining = round(remaining - safeHours, 2);
  }

  return rows;
};

const seedAllocationsAndTimeEntries = async ({ months, primaryMonth, jobs, staff, tag, rng }) => {
  const activeStaff = staff.filter((s) => s.is_active && !s.is_archived);
  const staffIndexMap = new Map(activeStaff.map((s, i) => [String(s._id), i]));

  const allocationsToInsert = createAllocations({ months, primaryMonth, jobs, staff, tag, rng });
  const inserted = await Allocation.insertMany(allocationsToInsert, { ordered: true });

  const primaryCovered = new Set(inserted.filter((a) => a.month === primaryMonth).map((a) => String(a.job_id)));
  const uncoveredJobs = jobs.filter((job) => !primaryCovered.has(String(job._id)));

  let forced = [];
  if (uncoveredJobs.length) {
    const forcedRows = [];
    const forcedUpperIndex = Math.max(0, activeStaff.length - Math.max(3, Math.floor(activeStaff.length * 0.25)) - 1);
    for (const job of uncoveredJobs) {
      const member = activeStaff[ri(rng, 0, forcedUpperIndex)] || pick(rng, activeStaff);
      const adjustedHours = ri(rng, 8, 24);
      const allocatedFee = round(adjustedHours * Number(member.hourly_rate || 0) * Number(member.productivity_factor || 1) * 1.08, 2);
      forcedRows.push({
        job_id: job._id,
        staff_id: member._id,
        percentage: Math.max(0.5, Math.min(80, round((allocatedFee / Math.max(1, Number(job.job_fee || 1))) * 100, 2))),
        allocated_fee: allocatedFee,
        calculated_hours: round(adjustedHours / Math.max(0.6, Number(member.productivity_factor || 1)), 2),
        adjusted_hours: adjustedHours,
        month: primaryMonth,
        notes: `${tag} forced primary coverage`,
        workflow_status: 'Doing',
        completed_percentage: ri(rng, 10, 65),
        started_at: randomPastDateInMonth(primaryMonth, rng, { minHour: 8, maxHour: 10 }),
        started_by: member._id,
        started_timezone: 'Africa/Johannesburg',
        status: 'active',
      });
    }
    forced = await Allocation.insertMany(forcedRows, { ordered: true });
  }

  const allAllocations = inserted.concat(forced);

  await appendSnapshotsForAllocations({ allocations: allAllocations, jobs, staff: activeStaff });
  await syncJobStatusesFromAllocations({ jobs, allocations: allAllocations, primaryMonth });

  const timeEntries = [];

  for (const allocation of allAllocations) {
    const staffIndex = staffIndexMap.get(String(allocation.staff_id)) ?? 0;
    timeEntries.push(
      ...createTimeEntriesForAllocation({
        allocation,
        staffIndex,
        staffCount: activeStaff.length,
        primaryMonth,
        tag,
        rng,
      }),
    );
  }

  await TimeEntry.insertMany(timeEntries, { ordered: false });

  return {
    allocationsCount: await Allocation.countDocuments({ notes: new RegExp(escapeRx(tag), 'i') }),
    timeEntriesCount: await TimeEntry.countDocuments({ description: new RegExp(escapeRx(tag), 'i') }),
  };
};

const logReadinessSummary = async ({ tag, primaryMonth }) => {
  const staff = await Staff.find({
    is_active: true,
    is_archived: { $ne: true },
    name: new RegExp(`^${escapeRx(tag)}\\b`, 'i'),
  });
  const jobs = await Job.find({ name: new RegExp(`^${escapeRx(tag)}`) });
  const allocations = await Allocation.find({ month: primaryMonth, notes: new RegExp(escapeRx(tag), 'i') });
  const timeEntries = await TimeEntry.find({ description: new RegExp(escapeRx(tag), 'i'), date: new RegExp(`^${escapeRx(primaryMonth)}`) });

  const allocByStaff = new Map();
  for (const allocation of allocations) {
    const key = String(allocation.staff_id);
    allocByStaff.set(key, (allocByStaff.get(key) || 0) + Number(allocation.adjusted_hours || 0));
  }

  const actualByAlloc = new Map();
  for (const timeEntry of timeEntries) {
    const key = String(timeEntry.allocation_id);
    actualByAlloc.set(key, (actualByAlloc.get(key) || 0) + Number(timeEntry.hours_worked || 0));
  }

  let highRisk = 0;
  let mediumRisk = 0;
  let lowRisk = 0;
  let overloaded = 0;
  let underutilized = 0;
  let optimal = 0;

  for (const member of staff) {
    const budgeted = Number(allocByStaff.get(String(member._id)) || 0);
    const allocIds = allocations.filter((a) => String(a.staff_id) === String(member._id)).map((a) => String(a._id));
    const actual = allocIds.reduce((sum, id) => sum + Number(actualByAlloc.get(id) || 0), 0);

    const overtime = Math.max(0, actual - budgeted);
    const riskPct = budgeted > 0 ? (overtime / budgeted) * 100 : 0;
    if (riskPct > 30) highRisk += 1;
    else if (riskPct > 15) mediumRisk += 1;
    else lowRisk += 1;

    const capacity = Number(member.available_hours_per_month || 160);
    const utilization = capacity > 0 ? (budgeted / capacity) * 100 : 0;
    if (utilization > 100) overloaded += 1;
    else if (utilization < 50) underutilized += 1;
    else optimal += 1;
  }

  const jobsWithVariance = jobs.map((job) => {
    const jobAllocs = allocations.filter((a) => String(a.job_id) === String(job._id));
    const budgeted = jobAllocs.reduce((sum, a) => sum + Number(a.adjusted_hours || 0), 0);
    const actual = jobAllocs.reduce((sum, a) => sum + Number(actualByAlloc.get(String(a._id)) || 0), 0);
    const variancePct = budgeted > 0 ? ((actual - budgeted) / budgeted) * 100 : 0;
    return {
      name: job.name,
      status: job.status,
      fee: Number(job.job_fee || 0),
      budgeted: round(budgeted, 2),
      actual: round(actual, 2),
      variancePct: round(variancePct, 1),
      deadline: job.deadline,
    };
  });

  const overBudget = jobsWithVariance.filter((j) => j.variancePct > 0).length;
  const qualityExceptions = jobsWithVariance.filter((j) => j.variancePct > 20).length;
  const late = jobsWithVariance.filter((j) => j.deadline && new Date(j.deadline).getTime() < Date.now()).length;
  const noDeadline = jobsWithVariance.filter((j) => !j.deadline).length;

  console.log('\n=== REPORT TEST DATA SUMMARY ===');
  console.log(`Primary month: ${primaryMonth}`);
  console.log(`Staff(active): ${staff.length}, Jobs: ${jobs.length}, Allocations(${primaryMonth}): ${allocations.length}, TimeEntries(${primaryMonth}): ${timeEntries.length}`);
  console.log(`Capacity bands -> overloaded=${overloaded}, optimal=${optimal}, underutilized=${underutilized}`);
  console.log(`Overtime risk -> high=${highRisk}, medium=${mediumRisk}, low=${lowRisk}`);
  console.log(`Variance -> overBudgetJobs=${overBudget}, qualityExceptions(>20%)=${qualityExceptions}`);
  console.log(`Turnaround -> late=${late}, noDeadline=${noDeadline}`);

  console.log('\nSample jobs:');
  for (const row of jobsWithVariance.slice(0, 10)) {
    console.log(`- ${row.name} | status=${row.status} | budgeted=${row.budgeted}h | actual=${row.actual}h | variance=${row.variancePct}% | fee=${row.fee}`);
  }
};

async function run() {
  if (!process.env.MONGO_URL) {
    throw new Error('Missing MONGO_URL in environment.');
  }

  const options = parseArgs(process.argv.slice(2));
  const profile = PROFILES[options.profile];
  if (!profile) throw new Error(`Invalid --profile: ${options.profile}. Use minimal or ideal.`);

  const months = options.months?.length ? options.months : profile.months;
  const normalizedMonths = normalizeMonthsToPast(months);
  const primaryMonth = normalizedMonths.includes(options.primaryMonth)
    ? options.primaryMonth
    : normalizedMonths[normalizedMonths.length - 1];
  const tag = options.tag || (options.profile === 'ideal' ? 'RPT_IDEAL_2026Q2' : 'RPT_MIN_2026Q2');
  const rng = createRng(`${tag}:${options.profile}:${normalizedMonths.join('|')}`);

  console.log(`Seeding reports data | profile=${options.profile} | tag=${tag} | months=${normalizedMonths.join(',')} | primaryMonth=${primaryMonth}`);
  await mongoose.connect(process.env.MONGO_URL);
  console.log('Connected to MongoDB');

  try {
    if (options.cleanupTags) {
      await cleanupByTag(tag);
    }

    await seedSettings();
    const departments = await seedDepartments();
    const jobTypes = await seedJobTypes();
    await seedCalendars(normalizedMonths);

    const clients = await seedClients({ count: profile.clients, tag, rng });
    const staff = await seedStaff({ activeCount: profile.activeStaff, inactiveCount: profile.inactiveStaff, tag, departments, rng });
    const jobs = await seedJobs({ count: profile.jobs, tag, clients, jobTypes, months: normalizedMonths, rng });
    const work = await seedAllocationsAndTimeEntries({ months: normalizedMonths, primaryMonth, jobs, staff, tag, rng });

    console.log('\n=== INSERT SUMMARY ===');
    console.log(`Departments: ${departments.length}`);
    console.log(`Job Types: ${jobTypes.length}`);
    console.log(`Clients (${tag}): ${clients.length}`);
    console.log(`Staff (${tag}): ${staff.length}`);
    console.log(`Jobs (${tag}): ${jobs.length}`);
    console.log(`Allocations (${tag}): ${work.allocationsCount}`);
    console.log(`Time entries (${tag}): ${work.timeEntriesCount}`);

    await logReadinessSummary({ tag, primaryMonth });
    console.log('\nReports seed completed successfully.');
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
  }
}

run().catch((error) => {
  console.error(error?.stack || error?.message || error);
  process.exit(1);
});
