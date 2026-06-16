import SaasPlan from '../models/SaasPlan.js';
import { getSaasPlans } from '../config/saasPlans.js';

const mergeBillingMapping = (configuredPlan = {}, existingPlan = {}) => {
  const configuredMonthly = configuredPlan.billing?.paystack?.monthly || null;
  const configuredAnnual = configuredPlan.billing?.paystack?.annual || null;
  const existingMonthly = existingPlan.billing?.paystack?.monthly || null;
  const existingAnnual = existingPlan.billing?.paystack?.annual || null;

  return {
    provider: configuredPlan.billing?.provider ?? existingPlan.billing?.provider ?? null,
    paystack: {
      monthly: configuredMonthly
        ? {
            ...configuredMonthly,
            plan_code: configuredMonthly.plan_code ?? existingMonthly?.plan_code ?? null,
          }
        : existingMonthly,
      annual: configuredAnnual
        ? {
            ...configuredAnnual,
            plan_code: configuredAnnual.plan_code ?? existingAnnual?.plan_code ?? null,
          }
        : existingAnnual,
    },
  };
};

const syncSaasPlansFromConfig = async () => {
  const plans = await getSaasPlans();
  for (const plan of plans) {
    const existingPlan = await SaasPlan.findOne({ id: plan.id }).lean();
    await SaasPlan.updateOne(
      { id: plan.id },
      {
        $set: {
          ...plan,
          billing: mergeBillingMapping(plan, existingPlan || {}),
        },
      },
      { upsert: true }
    );
  }
};

/**
 * Query the saas_plans collection and return a keyed map:
 *   { free: {...}, starter: {...}, professional: {...}, enterprise: {...} }
 */
export const getSaasPlansMap = async () => {
  await syncSaasPlansFromConfig();
  const plans = await SaasPlan.find({}).lean();
  return Object.fromEntries(plans.map((p) => [p.id, p]));
};
