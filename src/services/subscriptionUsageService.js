import Admin from '../models/Admin.js';
import Organisation from '../models/Organisation.js';
import {
  countActiveOrganisationsForEmail,
  countAdminSeatsForOrganisation,
  countPlanResourceUsage,
  getPlanLimits,
} from './planLimitService.js';
import { getSaasPlans } from '../config/saasPlans.js';

const buildMetric = (used, limit) => {
  const unlimited = Number(limit) < 0;
  return {
    used,
    limit,
    remaining: unlimited ? -1 : Math.max(0, Number(limit || 0) - Number(used || 0)),
    percent_used: unlimited || Number(limit || 0) === 0
      ? null
      : Math.min(100, Math.round((Number(used || 0) / Number(limit || 0)) * 100)),
  };
};

export async function buildSubscriptionUsageSnapshot(organisationId, { fallbackEmail = null } = {}) {
  if (!organisationId) {
    const error = new Error('Organisation context is required');
    error.status = 400;
    throw error;
  }

  const organisation = await Organisation.findById(organisationId).lean();
  if (!organisation) {
    const error = new Error('Organisation not found');
    error.status = 404;
    throw error;
  }

  const plan = organisation.plan || 'free';
  const [limits, staffUsed, clientsUsed, jobsUsed, adminUsed, ownerAdmin, availablePlans] = await Promise.all([
    getPlanLimits(plan),
    countPlanResourceUsage('users', organisation._id),
    countPlanResourceUsage('clients', organisation._id),
    countPlanResourceUsage('jobs', organisation._id),
    countAdminSeatsForOrganisation(organisation._id),
    Admin.findOne({
      organisation_id: organisation._id,
      role: 'owner',
      status: 'active',
    }).select('email').lean(),
    getSaasPlans(),
  ]);

  const ownerEmail = String(ownerAdmin?.email || fallbackEmail || '').toLowerCase().trim() || null;
  const organisationsUsed = ownerEmail ? await countActiveOrganisationsForEmail(ownerEmail) : 0;

  const staffMetric = buildMetric(Number(staffUsed || 0), Number(limits.max_users ?? 0));
  const clientsMetric = buildMetric(Number(clientsUsed || 0), Number(limits.max_clients ?? 0));
  const jobsMetric = buildMetric(Number(jobsUsed || 0), Number(limits.max_jobs ?? 0));
  const adminsMetric = buildMetric(Number(adminUsed || 0), Number(limits.max_admins_per_organisation ?? 0));
  const organisationsMetric = buildMetric(Number(organisationsUsed || 0), Number(limits.max_organisations_per_owner_email ?? 0));
  const currentPlan = availablePlans.find((candidate) => candidate.id === plan) || null;

  return {
    plan,
    current_plan: currentPlan,
    limits: {
      max_users: staffMetric.limit,
      max_clients: clientsMetric.limit,
      max_jobs: jobsMetric.limit,
      max_admins_per_organisation: adminsMetric.limit,
      max_organisations_per_owner_email: organisationsMetric.limit,
    },
    usage: {
      staff: staffMetric.used,
      clients: clientsMetric.used,
      jobs: jobsMetric.used,
      admins: adminsMetric.used,
      organisations: organisationsMetric.used,
    },
    remaining: {
      staff: staffMetric.remaining,
      clients: clientsMetric.remaining,
      jobs: jobsMetric.remaining,
      admins: adminsMetric.remaining,
      organisations: organisationsMetric.remaining,
    },
    percent_used: {
      staff: staffMetric.percent_used,
      clients: clientsMetric.percent_used,
      jobs: jobsMetric.percent_used,
      admins: adminsMetric.percent_used,
      organisations: organisationsMetric.percent_used,
    },
    owner_email: ownerEmail,
    as_of: new Date().toISOString(),
  };
}
