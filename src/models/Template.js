import mongoose from 'mongoose';

const { Schema } = mongoose;

const templateSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    industry: { type: String, required: true, trim: true },
    job_type: { type: String, required: true, trim: true },
    default_fee: { type: Number, required: true, min: 0 },
    estimated_hours: { type: Number, default: null, min: 0 },
    minimum_role: { type: String, default: null, trim: true },
    default_priority: {
      type: String,
      enum: ['Low', 'Medium', 'High', 'Critical'],
      default: 'Medium',
    },
    description: { type: String, default: null },
    is_builtin: { type: Boolean, default: false },
    builtin_key: { type: String, default: null, trim: true },
    organisation_id: { type: Schema.Types.ObjectId, ref: 'Organisation', default: null, index: true },
    created_by: { type: Schema.Types.ObjectId, ref: 'Staff', default: null },
  },
  {
    timestamps: true,
    collection: 'templates',
  }
);

templateSchema.index({ organisation_id: 1, name: 1 }, { unique: true, sparse: true });
templateSchema.index({ organisation_id: 1, builtin_key: 1 }, { unique: true, sparse: true });
templateSchema.index({ organisation_id: 1, industry: 1 });

const Template = mongoose.model('Template', templateSchema);

export default Template;
