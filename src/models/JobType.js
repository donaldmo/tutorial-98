import mongoose from 'mongoose';

const { Schema } = mongoose;

const workComponentSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    service: { type: String, enum: ['payroll', 'ma', 'once_off', 'general'], default: 'general' },
    role: { type: String, default: null, trim: true },
    percentage: { type: Number, required: true, min: 0, max: 100 },
    hours_multiplier: { type: Number, default: 1, min: 0 },
  },
  { _id: false }
);

const jobTypeSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    description: { type: String, default: null },
    code: { type: String, required: true, trim: true, uppercase: true },
    work_components: { type: [workComponentSchema], default: [] },
    is_active: { type: Boolean, default: true },
    is_system: { type: Boolean, default: false },
    organisation_id: { type: Schema.Types.ObjectId, ref: 'Organisation', default: null, index: true },
    created_by: { type: Schema.Types.ObjectId, ref: 'Staff', default: null },
  },
  {
    timestamps: true,
    collection: 'job_types',
  }
);

jobTypeSchema.index({ organisation_id: 1, code: 1 }, { unique: true, sparse: true });
jobTypeSchema.index({ organisation_id: 1, name: 1 }, { unique: true, sparse: true });
jobTypeSchema.index({ is_active: 1, is_system: 1, name: 1 });

const JobType = mongoose.model('JobType', jobTypeSchema);

export default JobType;