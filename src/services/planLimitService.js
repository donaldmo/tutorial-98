/**
 * planLimitService.js
 *
 * Enforces per-plan resource limits defined in the JSON-backed SaaS plan source.
 * Each guard loads the organisation from the authenticated user's organisation_id,
 * resolves the active plan limits, counts existing documents, and throws
 * a 403 response if the limit would be exceeded.
 *
 * Usage:
 *   await checkPlanLimit(req, res, 'users')    // inside createStaff
 *   await checkPlanLimit(req, res, 'clients')  // inside createClient
 *   await checkPlanLimit(req, res, 'jobs')     // inside createJob
 *
 * Returns true  → limit not exceeded, caller may proceed.
 * Returns false → limit exceeded, 403 already sent, caller must return.
 */

import mongoose from 'mongoose';
import Client from '../models/Client.js';
import Job from '../models/Job.js';
import Admin from '../models/Admin.js';
import Organisation from '../models/Organisation.js';
import OrganisationMembership from '../models/OrganisationMembership.js';
import { getSaasPlansMap } from '../utils/saasPlansDb.js';

const { Types } = mongoose;

// Maps resource key → metadata and counting strategy
const RESOURCE_MAP = {
  users: {
    limitKey: 'max_users',
    label: 'staff members',
  },
  clients: {
    Model: Client,
    limitKey: 'max_clients',
    label: 'clients',
  },
  jobs: {
    Model: Job,
    limitKey: 'max_jobs',
    label: 'jobs',
  },
};

const normalizedEmail = (email = '') => String(email).toLowerCase().trim();
const toObjectId = (value) => (Types.ObjectId.isValid(String(value || '')) ? new Types.ObjectId(String(value)) : null);

const sendPlanLimitExceeded = ({
  res,
  plan,
  resource,
  label,
  limit,
  current,
  detailPrefix = null,
}) => {
  res.status(403).json({
    detail: detailPrefix
      || `Your ${plan} plan allows a maximum of ${limit} ${label}. Please upgrade to add more.`,
    code: 'PLAN_LIMIT_EXCEEDED',
    resource,
    limit,
    current,
    plan,
  });
  return false;
};

const sendPlanLimitConfigError = (res, detail, status = 400) => {
  res.status(status).json({ detail });
  return false;
};

const getOrganisationForEnforcement = async (organisationId) => {
  if (!organisationId) return null;
  return Organisation.findById(organisationId).lean();
};

const countActiveStaffSeatsForOrganisation = async (organisationId) => {
  const objectId = toObjectId(organisationId);
  if (!objectId) return 0;

  const [result] = await OrganisationMembership.aggregate([
    {
      $match: {
        organisation_id: objectId,
        status: 'active',
      },
    },
    {
      $lookup: {
        from: 'staff',
        localField: 'staff_id',
        foreignField: '_id',
        as: 'staff',
      },
    },
    { $unwind: '$staff' },
    {
      $match: {
        'staff.is_archived': { $ne: true },
      },
    },
    {
      $group: {
        _id: '$staff_id',
      },
    },
    {
      $count: 'count',
    },
  ]);

  return Number(result?.count || 0);
};

export async function countPlanResourceUsage(resource, organisationId) {
  const config = RESOURCE_MAP[resource];
  if (!config) return null;

  if (resource === 'users') {
    return countActiveStaffSeatsForOrganisation(organisationId);
  }

  return config.Model.countDocuments({ organisation_id: String(organisationId) });
}

/**
 * Resolve the plan limits object for a given plan key.
 * Falls back to 'free' limits if the plan is unrecognised.
 *
 * @param {string} plan
 * @returns {{ max_users: number, max_clients: number, max_jobs: number, ... }}
 */
export async function getPlanLimits(plan) {
  const plans = await getSaasPlansMap();
  return plans[plan] ?? plans.free ?? {};
}

export async function getOrganisationPlanLimits(organisationId) {
  if (!organisationId) return {};
  const organisation = await Organisation.findById(organisationId).lean();
  if (!organisation) return {};
  return getPlanLimits(organisation.plan);
}

export const countAdminSeatsForOrganisation = (organisationId) =>
  Admin.countDocuments({
    organisation_id: organisationId,
    status: { $in: ['active', 'invited'] },
  });

export async function checkAdminSeatLimitByOrganisationId(res, organisationId) {
  if (!organisationId) return true;

  const organisation = await Organisation.findById(organisationId).lean();
  if (!organisation) return true;

  const limits = await getPlanLimits(organisation.plan);
  const max = limits.max_admins_per_organisation;
  if (max < 0) return true;

  const current = await countAdminSeatsForOrganisation(organisationId);
  if (current >= max) {
    return sendPlanLimitExceeded({
      res,
      plan: organisation.plan,
      resource: 'admins',
      label: 'admin seats',
      limit: max,
      current,
      detailPrefix: `Your ${organisation.plan} plan allows a maximum of ${max} admin seat${max === 1 ? '' : 's'} per organisation. Please upgrade to add more admins.`,
    });
  }

  return true;
}

export async function countActiveOrganisationsForEmail(email) {
  const organisationIds = await Admin.distinct('organisation_id', {
    email: normalizedEmail(email),
    status: 'active',
  });
  return organisationIds.length;
}

export async function checkOrganisationLimitForEmailAndPlan(res, email, plan) {
  const limits = await getPlanLimits(plan);
  const max = limits.max_organisations_per_owner_email;
  if (max < 0) return true;

  const current = await countActiveOrganisationsForEmail(email);
  if (current >= max) {
    return sendPlanLimitExceeded({
      res,
      plan,
      resource: 'organisations',
      label: 'organisations',
      limit: max,
      current,
      detailPrefix: `Your ${plan} plan allows a maximum of ${max} organisation${max === 1 ? '' : 's'} for the same owner email. Please upgrade to create more organisations.`,
    });
  }

  return true;
}

export async function checkPlanLimitByOrganisationId(
  res,
  organisationId,
  resource,
  { increment = 1, detailPrefix = null } = {},
) {
  const config = RESOURCE_MAP[resource];
  if (!config) {
    return sendPlanLimitConfigError(res, `Unsupported plan limit resource: ${resource}`, 500);
  }

  if (!organisationId) {
    return sendPlanLimitConfigError(res, 'Organisation context is required', 403);
  }

  const organisation = await getOrganisationForEnforcement(organisationId);
  if (!organisation) {
    return sendPlanLimitConfigError(res, 'Organisation not found', 404);
  }

  const limits = await getPlanLimits(organisation.plan);
  const max = limits[config.limitKey];
  if (max < 0) return true;

  const normalizedIncrement = Number.isFinite(Number(increment)) ? Math.max(0, Number(increment)) : 1;
  if (normalizedIncrement === 0) return true;

  const current = await countPlanResourceUsage(resource, organisationId);
  const projected = current + normalizedIncrement;

  if (projected > max) {
    return sendPlanLimitExceeded({
      res,
      plan: organisation.plan,
      resource,
      label: config.label,
      limit: max,
      current,
      detailPrefix,
    });
  }

  return true;
}

/**
 * Check whether an organisation has room to create one more resource.
 *
 * @param {import('express').Request}  req
 * @param {import('express').Response} res
 * @param {'users'|'clients'|'jobs'}   resource
 * @param {{ increment?: number, detailPrefix?: string }=} options
 * @returns {Promise<boolean>}  true = OK to proceed, false = limit hit (response already sent)
 */
export async function checkPlanLimit(req, res, resource, options = {}) {
  return checkPlanLimitByOrganisationId(res, req.user?.organisation_id, resource, options);
}
