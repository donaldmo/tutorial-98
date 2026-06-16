#!/usr/bin/env node

import dotenv from 'dotenv';
import mongoose from 'mongoose';

import Job from '../src/models/Job.js';
import Staff from '../src/models/Staff.js';
import Allocation from '../src/models/Allocation.js';
import TimeEntry from '../src/models/TimeEntry.js';

dotenv.config();

const round = (n, p = 2) => Number((Number(n) || 0).toFixed(p));
const fail = (msg) => {
  console.error(`❌ ${msg}`);
  process.exit(1);
};
const pass = (msg) => console.log(`✅ ${msg}`);
const escapeRx = (v) => v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const parseArgs = (argv) => {
  const options = {
    tag: 'RPT_MIN_2026Q2',
    primaryMonth: '2026-04',
    minJobs: 20,
    minStaff: 8,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--tag' && argv[i + 1]) options.tag = argv[++i];
    else if (arg.startsWith('--tag=')) options.tag = arg.split('=')[1];
    else if (arg === '--primary-month' && argv[i + 1]) options.primaryMonth = argv[++i];
    else if (arg.startsWith('--primary-month=')) options.primaryMonth = arg.split('=')[1];
    else if (arg === '--min-jobs' && argv[i + 1]) options.minJobs = Number(argv[++i]);
    else if (arg.startsWith('--min-jobs=')) options.minJobs = Number(arg.split('=')[1]);
    else if (arg === '--min-staff' && argv[i + 1]) options.minStaff = Number(argv[++i]);
    else if (arg.startsWith('--min-staff=')) options.minStaff = Number(arg.split('=')[1]);
  }

  return options;
};

async function run() {
  if (!process.env.MONGO_URL) fail('Missing MONGO_URL in environment.');

  const options = parseArgs(process.argv.slice(2));
  const tagEscaped = escapeRx(options.tag);

  await mongoose.connect(process.env.MONGO_URL);

  try {
    const jobs = await Job.find({ name: new RegExp(`^${tagEscaped}`, 'i') });
    const staff = await Staff.find({ name: new RegExp(`^${escapeRx(options.tag)}\\b`, 'i') });
    const activeStaff = staff.filter((s) => s.is_active && !s.is_archived);
    const allocations = await Allocation.find({
      month: options.primaryMonth,
      notes: new RegExp(tagEscaped, 'i'),
    });
    const timeEntries = await TimeEntry.find({
      description: new RegExp(tagEscaped, 'i'),
      date: new RegExp(`^${escapeRx(options.primaryMonth)}`),
    });

    if (jobs.length < options.minJobs) fail(`Not enough jobs. Found ${jobs.length}, expected >= ${options.minJobs}`);
    pass(`Jobs count OK: ${jobs.length}`);

    if (activeStaff.length < options.minStaff) fail(`Not enough active staff. Found ${activeStaff.length}, expected >= ${options.minStaff}`);
    pass(`Active staff count OK: ${activeStaff.length}`);

    if (!allocations.length) fail(`No allocations found for ${options.primaryMonth}.`);
    if (!timeEntries.length) fail(`No time entries found for ${options.primaryMonth}.`);
    pass(`Allocations/time entries present for ${options.primaryMonth}`);

    const allocByStaff = new Map();
    const allocByJob = new Map();
    for (const allocation of allocations) {
      allocByStaff.set(String(allocation.staff_id), (allocByStaff.get(String(allocation.staff_id)) || 0) + Number(allocation.adjusted_hours || 0));
      allocByJob.set(String(allocation.job_id), (allocByJob.get(String(allocation.job_id)) || 0) + Number(allocation.adjusted_hours || 0));
    }

    const actualByAlloc = new Map();
    for (const timeEntry of timeEntries) {
      actualByAlloc.set(String(timeEntry.allocation_id), (actualByAlloc.get(String(timeEntry.allocation_id)) || 0) + Number(timeEntry.hours_worked || 0));
    }

    let overloaded = 0;
    let underutilized = 0;
    let optimal = 0;

    let highRisk = 0;
    let mediumRisk = 0;
    let lowRisk = 0;

    for (const member of activeStaff) {
      const budgeted = Number(allocByStaff.get(String(member._id)) || 0);
      const memberAllocIds = allocations
        .filter((a) => String(a.staff_id) === String(member._id))
        .map((a) => String(a._id));
      const actual = memberAllocIds.reduce((sum, id) => sum + Number(actualByAlloc.get(id) || 0), 0);

      const capacity = Number(member.available_hours_per_month || 160);
      const utilization = capacity > 0 ? (budgeted / capacity) * 100 : 0;

      if (utilization > 100) overloaded += 1;
      else if (utilization < 50) underutilized += 1;
      else optimal += 1;

      const overtime = Math.max(0, actual - budgeted);
      const riskPct = budgeted > 0 ? (overtime / budgeted) * 100 : 0;

      if (riskPct > 30) highRisk += 1;
      else if (riskPct > 15) mediumRisk += 1;
      else lowRisk += 1;
    }

    if (!overloaded || !underutilized) {
      fail(`Capacity distribution weak. overloaded=${overloaded}, underutilized=${underutilized}`);
    }
    pass(`Capacity distribution OK: overloaded=${overloaded}, optimal=${optimal}, underutilized=${underutilized}`);

    if (!highRisk || !mediumRisk || !lowRisk) {
      fail(`Risk distribution weak. high=${highRisk}, medium=${mediumRisk}, low=${lowRisk}`);
    }
    pass(`Risk distribution OK: high=${highRisk}, medium=${mediumRisk}, low=${lowRisk}`);

    const actualByJob = new Map();
    for (const allocation of allocations) {
      const jobKey = String(allocation.job_id);
      actualByJob.set(jobKey, (actualByJob.get(jobKey) || 0) + Number(actualByAlloc.get(String(allocation._id)) || 0));
    }

    let overBudgetJobs = 0;
    let qualityExceptions = 0;
    for (const [jobId, budgeted] of allocByJob.entries()) {
      const actual = Number(actualByJob.get(jobId) || 0);
      const variancePct = budgeted > 0 ? ((actual - budgeted) / budgeted) * 100 : 0;
      if (variancePct > 0) overBudgetJobs += 1;
      if (variancePct > 20) qualityExceptions += 1;
    }

    if (!overBudgetJobs) fail('No over-budget jobs found.');
    if (!qualityExceptions) fail('No quality exceptions (>20% variance) found.');
    pass(`Variance checks OK: overBudget=${overBudgetJobs}, qualityExceptions=${qualityExceptions}`);

    const statuses = new Set(jobs.map((job) => job.status));
    if (!statuses.has('Pending') || !statuses.has('Doing') || !statuses.has('Completed')) {
      fail(`Job status distribution incomplete. Found: ${Array.from(statuses).join(', ')}`);
    }
    pass('Job status distribution includes Pending/Doing/Completed');

    const late = jobs.filter((j) => j.deadline && new Date(j.deadline).getTime() < Date.now()).length;
    const noDeadline = jobs.filter((j) => !j.deadline).length;
    if (!late || !noDeadline) fail(`Turnaround distribution weak. late=${late}, noDeadline=${noDeadline}`);
    pass(`Turnaround distribution OK: late=${late}, noDeadline=${noDeadline}`);

    console.log('\n--- Verification Summary ---');
    console.log(`tag=${options.tag}`);
    console.log(`primaryMonth=${options.primaryMonth}`);
    console.log(`jobs=${jobs.length}, activeStaff=${activeStaff.length}, allocations=${allocations.length}, timeEntries=${timeEntries.length}`);
    console.log(`capacity: overloaded=${overloaded}, optimal=${optimal}, underutilized=${underutilized}`);
    console.log(`risk: high=${highRisk}, medium=${mediumRisk}, low=${lowRisk}`);
    console.log(`variance: overBudget=${overBudgetJobs}, qualityExceptions=${qualityExceptions}`);
    console.log(`turnaround: late=${late}, noDeadline=${noDeadline}`);
    console.log(`avg alloc hours per job: ${round(allocations.reduce((s, a) => s + Number(a.adjusted_hours || 0), 0) / Math.max(1, allocByJob.size), 2)}`);
  } finally {
    await mongoose.disconnect();
  }
}

run().catch((error) => fail(error?.stack || error?.message || String(error)));
