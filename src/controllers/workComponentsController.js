/**
 * workComponentsController.js
 *
 * Group 3 – Task 3.1: Job-Type Work Component Split Rules
 *
 * Exposes read-only and preview endpoints for work component rules.
 * Mutation of work components happens through the /job-types CRUD endpoints.
 */

import { asyncHandler } from '../utils/asyncHandler.js';
import {
  applyWorkComponentSplit,
  getWorkComponents,
  getRoleWeightForJobType,
} from '../services/workComponentService.js';

/**
 * GET /work-components?job_type=<name>
 *
 * Returns the raw work component configuration for a job type (system or custom).
 * Useful for clients that want to display or validate component rules before
 * creating an allocation.
 */
export const getWorkComponentRules = asyncHandler(async (req, res) => {
  const jobType = String(req.query.job_type || '').trim();
  if (!jobType) {
    return res.status(400).json({ detail: 'job_type query parameter is required' });
  }

  const components = await getWorkComponents(jobType);
  const totalPercentage = components.reduce((acc, c) => acc + Number(c.percentage || 0), 0);

  return res.json({
    job_type: jobType,
    component_count: components.length,
    total_percentage: totalPercentage,
    work_components: components,
  });
});

/**
 * GET /work-components/role-weight?job_type=<name>&role=<role>
 *
 * Returns the effective percentage + hours_multiplier that a specific role
 * carries inside a job type's work component configuration.
 * Used by the frontend to surface "recommended allocation %" before
 * an allocation is saved.
 */
export const getRoleWeight = asyncHandler(async (req, res) => {
  const jobType = String(req.query.job_type || '').trim();
  const role = String(req.query.role || '').trim();

  if (!jobType) {
    return res.status(400).json({ detail: 'job_type query parameter is required' });
  }
  if (!role) {
    return res.status(400).json({ detail: 'role query parameter is required' });
  }

  const weight = await getRoleWeightForJobType(jobType, role);
  return res.json({ job_type: jobType, role, ...weight });
});

/**
 * POST /work-components/preview
 * Body: { job_type, job_fee, total_hours }
 *
 * Returns a breakdown of how the fee and hours are distributed across all
 * work components for the specified job type.
 */
export const previewWorkComponentSplit = asyncHandler(async (req, res) => {
  const { job_type, job_fee = 0, total_hours = 0 } = req.body || {};

  if (!job_type) {
    return res.status(400).json({ detail: 'job_type is required' });
  }

  const fee = Number(job_fee);
  const hours = Number(total_hours);

  if (Number.isNaN(fee) || fee < 0) {
    return res.status(400).json({ detail: 'job_fee must be a non-negative number' });
  }
  if (Number.isNaN(hours) || hours < 0) {
    return res.status(400).json({ detail: 'total_hours must be a non-negative number' });
  }

  const breakdown = await applyWorkComponentSplit(job_type, fee, hours);

  return res.json({
    job_type,
    job_fee: fee,
    total_hours: hours,
    component_count: breakdown.length,
    total_percentage: breakdown.reduce((acc, c) => acc + Number(c.percentage || 0), 0),
    breakdown,
  });
});
