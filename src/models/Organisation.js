import mongoose from 'mongoose';

const { Schema } = mongoose;

const paystackCustomerSchema = new Schema(
  {
    customer_code: { type: String, default: null },
    email: { type: String, default: null },
    integration: { type: Number, default: null },
    customer_id: { type: Number, default: null },
    identified_at: { type: Date, default: null },
  },
  { _id: false }
);

const paystackSubscriptionSchema = new Schema(
  {
    subscription_code: { type: String, default: null },
    email_token: { type: String, default: null },
    plan_code: { type: String, default: null },
    paystack_id: { type: Number, default: null },
    integration: { type: Number, default: null },
    open_invoice: { type: String, default: null },
    manage_link: { type: String, default: null },
    manage_link_generated_at: { type: Date, default: null },
    manage_link_sent_at: { type: Date, default: null },
    last_synced_at: { type: Date, default: null },
    billing_cycle: { type: String, default: null, enum: ['monthly', 'annual', null] },
    status: { type: String, default: null },
    authorization_code: { type: String, default: null },
    authorization_signature: { type: String, default: null },
    authorization_last4: { type: String, default: null },
    authorization_exp_month: { type: String, default: null },
    authorization_exp_year: { type: String, default: null },
    authorization_card_type: { type: String, default: null },
    authorization_bank: { type: String, default: null },
    subscribed_at: { type: Date, default: null },
    cancel_requested_at: { type: Date, default: null },
    cancelled_at: { type: Date, default: null },
    next_renewal_at: { type: Date, default: null },
  },
  { _id: false }
);

const paystackTransactionSchema = new Schema(
  {
    transaction_id: { type: Number, default: null },
    reference: { type: String, default: null },
    access_code: { type: String, default: null },
    status: { type: String, default: null },
    amount: { type: Number, default: null },
    currency: { type: String, default: null },
    gateway_response: { type: String, default: null },
    channel: { type: String, default: null },
    fees: { type: Number, default: null },
    paid_at: { type: Date, default: null },
    metadata: { type: Schema.Types.Mixed, default: null },
  },
  { _id: false }
);

const paystackRenewalSchema = new Schema(
  {
    status: { type: String, default: null },
    next_charge_at: { type: Date, default: null },
    last_attempt_at: { type: Date, default: null },
    last_success_at: { type: Date, default: null },
    last_failed_at: { type: Date, default: null },
    cancel_at_period_end: { type: Boolean, default: false },
    warning: { type: String, default: null },
    failure_code: { type: String, default: null },
    failure_message: { type: String, default: null },
  },
  { _id: false }
);

const organisationPaystackSchema = new Schema(
  {
    customer: { type: paystackCustomerSchema, default: () => ({}) },
    subscription: { type: paystackSubscriptionSchema, default: () => ({}) },
    transaction: { type: paystackTransactionSchema, default: () => ({}) },
    renewal: { type: paystackRenewalSchema, default: () => ({}) },
  },
  { _id: false }
);

const installedTemplateSchema = new Schema(
  {
    key: { type: String, required: true, trim: true, lowercase: true },
    name: { type: String, required: true, trim: true },
    industry: { type: String, required: true, trim: true },
    version: { type: String, default: '1.0.0' },
    installed_at: { type: Date, default: Date.now },
    installed_by: { type: Schema.Types.ObjectId, ref: 'Admin', default: null },
  },
  { _id: false }
);

const organisationSchema = new Schema(
  {
    firm_name:   { type: String, required: true, trim: true },
    subdomain:   { type: String, required: true, unique: true, index: true },
    email:       { type: String, required: true, unique: false, lowercase: true, trim: true, index: true },
    phone:       { type: String, default: null },
    status:      { type: String, default: 'pending', enum: ['pending', 'active', 'suspended', 'cancelled'] },

    /** Billing plan slug — must match a SaasPlan.id value */
    plan:         { type: String, default: 'free' },
    /** FK to saas_plans collection — set on registration / seed */
    saas_plan_id: { type: Schema.Types.ObjectId, ref: 'SaasPlan', default: null },

    subscription_status:  { type: String, default: 'trial', enum: ['trial', 'active', 'past_due', 'cancelled', 'expired'] },
    trial_ends_at:        { type: Date, default: null },
    subscription_ends_at: { type: Date, default: null },
    billing_provider:     { type: String, default: null },
    payfast_token:        { type: String, default: null },
    paystack:             { type: organisationPaystackSchema, default: () => ({}) },

    logo_base64:     { type: String, default: null },
    tagline:         { type: String, default: null },
    currency_symbol: { type: String, default: 'R' },
    installed_templates: { type: [installedTemplateSchema], default: [] },
    job_templates_seeded_at: { type: Date, default: null },
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
    collection: 'organisations',
  }
);

organisationSchema.index({ status: 1, plan: 1 });

const Organisation = mongoose.model('Organisation', organisationSchema);

export default Organisation;
