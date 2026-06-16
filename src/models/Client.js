import mongoose from 'mongoose';

const { Schema } = mongoose;

const roleFeeSplitSchema = new Schema(
  {
    role: { type: String, required: true, trim: true },
    percentage: { type: Number, required: true, min: 0, max: 100 },
    hourly_rate_override: { type: Number, default: null, min: 0 },
  },
  { _id: false }
);

const clientSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    contact_person: { type: String, default: null, trim: true },
    email: { type: String, default: null, trim: true, lowercase: true },
    phone: { type: String, default: null, trim: true },
    address: { type: String, default: null },
    industry: { type: String, required: true, trim: true },
    notes: { type: String, default: null },
    role_fee_splits: { type: [roleFeeSplitSchema], default: [] },
    is_active: { type: Boolean, default: true },
    organisation_id: { type: Schema.Types.ObjectId, ref: 'Organisation', default: null, index: true },
    created_by: { type: Schema.Types.ObjectId, ref: 'Staff', default: null },
  },
  {
    timestamps: true,
    collection: 'clients',
  }
);

clientSchema.index({ organisation_id: 1, name: 1 }, { unique: true, sparse: true });
clientSchema.index(
  { organisation_id: 1, email: 1 },
  { unique: true, partialFilterExpression: { email: { $type: 'string' } } },
);
clientSchema.index({ is_active: 1, name: 1 });

const Client = mongoose.model('Client', clientSchema);

export default Client;