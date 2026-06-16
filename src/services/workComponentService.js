/**
 * workComponentService.js
 *
 * Group 3 – Task 3.1: Job-Type Work Component Split Rules
 *
 * Provides helpers to retrieve work component configurations per job type
 * and to apply a component-level split to a given fee / hours total.
 * Delegates job-type resolution to planningService so both system presets
 * and custom DB-persisted job types are covered.
 */

import mongoose from 'mongoose';
import JobType from '../models/JobType.js';
import Allocation from '../models/Allocation.js';
import Job from '../models/Job.js';
import { getSystemJobTypeByName, normalizeWorkComponentKey, normalizeWorkComponentService, round } from './planningService.js';

/**
 * Retrieve the work_components array for a given job type name or id.
 * Returns an empty array when the job type is not found.
 *
 * @param {string} jobTypeNameOrId
 * @returns {Promise<Array<{name:string, role:string|null, percentage:number, hours_multiplier:number}>>}
 */
export const getWorkComponents = async (jobTypeNameOrId, embeddedComponents = null) => {
  if (embeddedComponents != null) return embeddedComponents;
  if (!jobTypeNameOrId) return [];
  const key = String(jobTypeNameOrId);

  // Resolve via DB: use ObjectId lookup when the input is a valid ObjectId,
  // otherwise find by name — avoids a Mongoose CastError on plain name strings.
  let config = mongoose.Types.ObjectId.isValid(key)
    ? await JobType.findById(key)
    : await JobType.findOne({ name: key });

  // Fall back to built-in system presets (no DB hit needed).
  if (!config) config = getSystemJobTypeByName(key);

  return config?.work_components || [];
};

/**
 * Apply a work-component split to a total fee and total hours value.
 *
 * Each component's fee is proportional to its percentage share.
 * Each component's hours are further scaled by its hours_multiplier.
 *
 * When the job type has no components, returns a single "General" row
 * covering 100 % of the budget.
 *
 * @param {string} jobTypeNameOrId
 * @param {number} totalFee
 * @param {number} totalHours
 * @returns {Promise<Array<{name, role, percentage, hours_multiplier, allocated_fee, allocated_hours}>>}
 */
export const applyWorkComponentSplit = async (jobTypeNameOrId, totalFee = 0, totalHours = 0, embeddedComponents = null) => {
  const components = await getWorkComponents(jobTypeNameOrId, embeddedComponents);

  if (!components.length) {
    return [
      {
        name: 'General',
        role: null,
        percentage: 100,
        hours_multiplier: 1,
        allocated_fee: round(Number(totalFee)),
        allocated_hours: round(Number(totalHours)),
      },
    ];
  }

  // Normalise percentages so they always sum to 100 (handles misconfigured data).
  const rawTotal = components.reduce((acc, c) => acc + Number(c.percentage || 0), 0) || 100;

  return components.map((c) => {
    const normalizedPct = (Number(c.percentage || 0) / rawTotal) * 100;
    const multiplier = Number(c.hours_multiplier || 1);

    return {
      name: c.name,
      role: c.role || null,
      percentage: round(normalizedPct, 2),
      hours_multiplier: round(multiplier, 3),
      allocated_fee: round((Number(totalFee) * normalizedPct) / 100),
      allocated_hours: round(((Number(totalHours) * normalizedPct) / 100) * multiplier),
    };
  });
};

/**
 * Return the effective weight (percentage + hours_multiplier) that a specific
 * staff role carries inside a job type's work components.
 *
 * Used internally by calculateAllocationMetrics in planningService but exposed
 * here so controllers can surface it directly to callers.
 *
 * @param {string} jobTypeNameOrId
 * @param {string} role
 * @returns {Promise<{percentage:number, hours_multiplier:number, components: Array}>}
 */
export const getRoleWeightForJobType = async (jobTypeNameOrId, role) => {
  // getWorkComponents already performs the safe name-or-ObjectId lookup.
  const components = await getWorkComponents(jobTypeNameOrId);
  const normalizedRole = String(role || '').trim();
  const roleComponents = components.filter((c) => c.role === normalizedRole);
  const relevant = roleComponents.length > 0 ? roleComponents : components;

  if (!relevant.length) {
    return { percentage: 100, hours_multiplier: 1, components: [] };
  }

  const totalPct = relevant.reduce((acc, c) => acc + Number(c.percentage || 0), 0);
  const weightedMultiplier =
    totalPct > 0
      ? relevant.reduce(
          (acc, c) =>
            acc + ((Number(c.percentage || 0) / totalPct) * Number(c.hours_multiplier || 1)),
          0,
        )
      : 1;

  return {
    percentage: round(totalPct || 100, 2),
    hours_multiplier: round(weightedMultiplier || 1, 3),
    components: relevant.map((c) => ({
      name: c.name,
      role: c.role || null,
      percentage: round(Number(c.percentage || 0), 2),
      hours_multiplier: round(Number(c.hours_multiplier || 1), 3),
    })),
  };
};
// ─── Allocation Coverage & Validation ────────────────────────────────────────

const ALLOCATION_TOLERANCE = 0.5; // ±0.5% accepted for floating-point rounding

/**
 * Resolve the work-components required for a job, accounting for the fact that
 * a Job may have multiple service types (payroll + management_accounts) each
 * pointing to a different JobType record.
 *
 * Returns a flat array of { role, requiredPercentage } objects where roles that
 * appear in more than one service type are combined proportionally.
 *
 * @param {import('../models/Job.js').default} job  Mongoose Job document
 * @returns {Promise<Array<{ role: string, requiredPercentage: number }>>}
 */
const resolveRequiredRoles = async (job) => {
  const effectiveFee = Number(job.pricing_override ?? job.job_fee) || 0;
  if (!effectiveFee) return [];

  const serviceContributions = {};

  const entryService = (entry) => normalizeWorkComponentService(entry.job_type_name || 'general');

  for (const entry of (job.job_type_entries || [])) {
    const components = entry.work_components || [];
    if (!components.length) continue;

    const rawTotal = components.reduce((s, c) => s + Number(c.percentage || 0), 0) || 100;

    for (const comp of components) {
      const svc = normalizeWorkComponentService(comp.service || entryService(entry) || 'general');
      const key = normalizeWorkComponentKey(svc, comp.role || comp.name || 'unknown');
      const normalizedPct = (Number(comp.percentage || 0) / rawTotal);

      if (!serviceContributions[key]) {
        serviceContributions[key] = { pct: 0, service: svc, role: comp.role || null, name: comp.name || key };
      }
      serviceContributions[key].pct += normalizedPct;
    }
  }

  const totalPct = Object.values(serviceContributions).reduce((s, d) => s + d.pct, 0) || 1;
  return Object.entries(serviceContributions)
    .filter(([, data]) => data.pct > 0)
    .map(([key, data]) => ({
      key,
      service: data.service,
      role: data.role,
      name: data.name,
      requiredPercentage: round((data.pct / totalPct) * 100, 2),
    }));
};

/**
 * Compute current allocation coverage for a job.
 *
 * @param {string|import('mongoose').Types.ObjectId} jobId
 * @returns {Promise<{
 *   requiredRoles: Array<{ role: string, requiredPercentage: number }>,
 *   allocatedRoles: Array<{ role: string, allocatedPercentage: number, withinTolerance: boolean, staff: string[] }>,
 *   missingRoles: string[],
 *   isComplete: boolean
 * }>}
 */
export const getAllocationCoverage = async (jobId, options = {}) => {
  const month = options?.month ? String(options.month) : null;
  const allocationQuery = { job_id: jobId, status: 'active' };
  if (month) allocationQuery.month = month;

  const [job, allocations] = await Promise.all([
    Job.findById(jobId),
    Allocation.find(allocationQuery).populate('staff_id', 'name role'),
  ]);

  if (!job) return { requiredRoles: [], allocatedRoles: [], missingRoles: [], isComplete: false, customAllocations: [] };

  const requiredComponents = await resolveRequiredRoles(job);

  // Separate custom allocations from job-defined ones
  const jobDefinedAllocations = allocations.filter((a) => !a.custom_component);
  const customAllocations = allocations.filter((a) => a.custom_component);

  // Aggregate job-defined allocations by their stored work_component_key
  const keyMap = {};
  for (const alloc of jobDefinedAllocations) {
    let matchKey = alloc.work_component_key || '__unassigned__';
    if (matchKey !== '__unassigned__') {
      matchKey = normalizeWorkComponentKey(matchKey);
    }
    if (!keyMap[matchKey]) keyMap[matchKey] = { totalPct: 0, staffBreakdown: [] };
    const allocPct = Number(alloc.percentage || 0);
    keyMap[matchKey].totalPct += allocPct;
    if (alloc.staff_id?.name) {
      const existing = keyMap[matchKey].staffBreakdown.find((s) => s.name === alloc.staff_id.name);
      if (existing) existing.percentage += allocPct;
      else keyMap[matchKey].staffBreakdown.push({ name: alloc.staff_id.name, percentage: round(allocPct, 2) });
    }
  }

  const requiredRoles = requiredComponents.map((r) => ({
    ...r,
    label: r.name || r.role || r.key,
  }));

  const allocatedRoles = Object.entries(keyMap)
    .filter(([key]) => key !== '__unassigned__')
    .map(([key, data]) => {
      const req = requiredComponents.find((r) => r.key === key);
      const requiredPct = req?.requiredPercentage ?? 0;
      const diff = Math.abs(round(data.totalPct, 2) - requiredPct);
      return {
        key,
        service: req?.service || null,
        role: req?.role || key,
        label: req?.name || req?.role || key,
        allocatedPercentage: round(data.totalPct, 2),
        withinTolerance: requiredPct > 0 && diff <= ALLOCATION_TOLERANCE,
        staffDetails: data.staffBreakdown.map((s) => ({ ...s, percentage: round(s.percentage, 2) })),
        staff: data.staffBreakdown.map((s) => s.name),
      };
    });

  const missingRoles = requiredComponents
    .filter((r) => {
      const allocated = keyMap[r.key];
      if (!allocated) return true;
      return Math.abs(round(allocated.totalPct, 2) - r.requiredPercentage) > ALLOCATION_TOLERANCE;
    })
    .map((r) => r.name || r.role || r.key);

  const isComplete = requiredComponents.length > 0 && missingRoles.length === 0;

  return {
    requiredRoles,
    allocatedRoles,
    missingRoles,
    isComplete,
    customAllocations: customAllocations.map((a) => ({
      component_label: a.component_label || a.work_component_key || 'Custom',
      component_service: a.component_service || null,
      component_role: a.component_role || null,
      allocated_fee: Number(a.allocated_fee || 0),
      percentage: Number(a.percentage || 0),
      staff: [a.staff_id?.name || 'Unknown'],
      staff_id: a.staff_id?._id || a.staff_id,
    })),
  };
};

/**
 * Validate whether adding / modifying an allocation will keep the job's
 * per-role totals within the work-component split rules.
 *
 * @param {object} opts
 * @param {string}  opts.jobId
 * @param {string}  opts.staffRole        Role of the staff being allocated
 * @param {number}  opts.newPercentage    Percentage being set for this allocation
 * @param {string}  [opts.excludeAllocationId]  Allocation being updated (exclude from sum)
 * @returns {Promise<{ valid: boolean, errors: string[], warnings: string[] }>}
 */
export const validateAllocationMatchesWorkComponents = async ({
  jobId,
  newPercentage,
  month = null,
  excludeAllocationId = null,
  explicitComponentKey = null,
}) => {
  const errors = [];
  const warnings = [];

  const job = await Job.findById(jobId);
  if (!job) {
    errors.push('Job not found.');
    return { valid: false, errors, warnings };
  }

  const requiredComponents = await resolveRequiredRoles(job);
  // If no work-component rules are defined, skip enforcement.
  if (!requiredComponents.length) return { valid: true, errors, warnings };

  // A work component must always be explicitly selected.
  if (!explicitComponentKey) {
    errors.push('A work component must be selected before allocating.');
    return { valid: false, errors, warnings };
  }

  const normalizedKey = normalizeWorkComponentKey(explicitComponentKey);
  // Percentage limit enforcement removed — any percentage is accepted
  return { valid: true, errors, warnings };
};

export const validateAllocationTotalPercentage = async ({
  jobId,
  month,
  newPercentage,
  excludeAllocationId = null,
}) => {
  const errors = [];
  const warnings = [];

  const targetMonth = String(month || '').trim();
  if (!targetMonth) {
    errors.push('month is required for total allocation validation.');
    return { valid: false, errors, warnings };
  }

  const query = { job_id: jobId, status: 'active', month: targetMonth };
  if (excludeAllocationId) query._id = { $ne: excludeAllocationId };

  const existingAllocations = await Allocation.find(query).select('percentage');
  const currentTotal = round(
    existingAllocations.reduce((sum, a) => sum + Number(a.percentage || 0), 0),
    2,
  );
  const projectedTotal = round(currentTotal + Number(newPercentage || 0), 2);

  if (projectedTotal > 100) {
    errors.push(
      `Total allocations for this job in ${targetMonth} would be ${projectedTotal.toFixed(2)}%, ` +
      `which exceeds the 100.00% limit. Current total: ${currentTotal.toFixed(2)}%.`
    );
  }

  return { valid: errors.length === 0, errors, warnings, currentTotal, projectedTotal };
};

/**
 * Derive and persist workflow status for a job from allocation component lifecycle.
 *
 * Rules:
 * - On Hold: if manually set — never auto-override.
 * - Completed: all required components have at least one completed allocation.
 * - In Progress: not completed, but at least one allocation is Doing/Completed.
 * - Otherwise: let updateAllocationStatus handle Pending/Partially/Fully Allocated.
 *
 * @param {string|import('mongoose').Types.ObjectId} jobId
 * @returns {Promise<string|null>}
 */
export const syncJobWorkflowStatus = async (jobId) => {
  const [job, allocations] = await Promise.all([
    Job.findById(jobId),
    Allocation.find({ job_id: jobId, status: 'active' }).lean(),
  ]);

  if (!job) return null;

  // Don't auto-override On Hold
  if (job.status === 'On Hold' || job.status === 'Completed') return job.status;

  const requiredComponents = await resolveRequiredRoles(job);
  const componentCompletion = {};

  for (const alloc of allocations) {
    if (!alloc.work_component_key) continue;
    const key = normalizeWorkComponentKey(alloc.work_component_key);
    if (!componentCompletion[key]) componentCompletion[key] = false;
    if (alloc.workflow_status === 'Completed') componentCompletion[key] = true;
  }

  let nextStatus = job.status; // preserve Pending/Partially/Fully Allocated
  const hasWorkStarted = allocations.some((a) => a.workflow_status === 'Doing' || a.workflow_status === 'Completed');

  if (requiredComponents.length > 0) {
    const allRequiredComplete = requiredComponents.every((r) => componentCompletion[r.key] === true);
    if (allRequiredComplete) nextStatus = 'Completed';
    else if (hasWorkStarted) nextStatus = 'In Progress';
  } else if (allocations.length > 0) {
    nextStatus = allocations.every((a) => a.workflow_status === 'Completed') ? 'Completed' : (hasWorkStarted ? 'In Progress' : nextStatus);
  }

  if (job.status !== nextStatus) {
    job.status = nextStatus;
    await job.save();
  }

  return nextStatus;
};
