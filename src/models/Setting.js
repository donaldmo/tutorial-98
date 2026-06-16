import mongoose from 'mongoose';

const { Schema } = mongoose;

const emailConfigSchema = new Schema(
  {
    host: { type: String, default: null },
    port: { type: Number, default: 587 },
    secure: { type: Boolean, default: false },
    user: { type: String, default: null },
    encryptedPassword: { type: String, default: null },
    fromName: { type: String, default: null },
    fromAddress: { type: String, default: null },
    enabled: { type: Boolean, default: false },
  },
  { _id: false }
);

const settingSchema = new Schema(
  {
    organisation_id: { type: Schema.Types.ObjectId, ref: 'Organisation', required: true, unique: true, index: true },
    firm_name: { type: String, default: 'Brendmo Chartered Accountants' },
    tagline: { type: String, default: 'Workflow Planner' },
    currency: { type: String, default: 'ZAR' },
    currency_symbol: { type: String, default: 'R' },
    default_working_hours: { type: Number, default: 160 },
    logo_url: { type: String, default: null },
    primary_color: { type: String, default: null },
    secondary_color: { type: String, default: null },
    accent_color: { type: String, default: null },
    company_address: { type: String, default: null },
    company_phone: { type: String, default: null },
    company_email: { type: String, default: null },
    company_website: { type: String, default: null },
    tax_registration_number: { type: String, default: null },
    emailConfig: { type: emailConfigSchema, default: () => ({}) },
  },
  {
    timestamps: true,
    collection: 'settings',
  }
);

const Setting = mongoose.model('Setting', settingSchema);

export default Setting;