import mongoose from 'mongoose';

const { Schema } = mongoose;

const paystackPlanMappingSchema = new Schema(
  {
    local_plan_key: { type: String, required: true },
    interval: { type: String, required: true, enum: ['monthly', 'annual'] },
    plan_code: { type: String, default: null },
  },
  { _id: false }
);

const saasPlanBillingSchema = new Schema(
  {
    provider: { type: String, default: null },
    paystack: {
      monthly: { type: paystackPlanMappingSchema, default: null },
      annual: { type: paystackPlanMappingSchema, default: null },
    },
  },
  { _id: false }
);

const saasPlanSchema = new Schema(
  {
    id:            { type: String, required: true, unique: true },
    name:          { type: String, required: true },
    max_users:     { type: Number, required: true },
    max_clients:   { type: Number, required: true },
    max_jobs:      { type: Number, required: true },
    max_admins_per_organisation: { type: Number, required: true },
    max_organisations_per_owner_email: { type: Number, required: true },
    recommended:   { type: Boolean, required: true, default: false },
    features:      { type: [String], required: true, default: [] },
    price_monthly: { type: Number, required: true },
    price_annual:  { type: Number, required: true },
    billing:       { type: saasPlanBillingSchema, default: () => ({ provider: null, paystack: { monthly: null, annual: null } }) },
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
    collection: 'saas_plans',
  }
);

const SaasPlan = mongoose.model('SaasPlan', saasPlanSchema);

export default SaasPlan;
