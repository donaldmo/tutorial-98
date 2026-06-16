import mongoose from 'mongoose';

const { Schema } = mongoose;

const jobTemplateSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    job_type: { type: String, required: true, trim: true },
    job_type_entries: [{
      job_type_id: { type: Schema.Types.ObjectId, ref: 'JobType', default: null },
      job_type_name: { type: String, default: '' },
      fee: { type: Number, default: 0, min: 0 },
      work_components: [{
        name: { type: String, default: '' },
        service: { type: String, default: 'general' },
        role: { type: String, default: null },
        percentage: { type: Number, default: 0 },
        hours_multiplier: { type: Number, default: 1 },
      }],
    }],
    default_fee: { type: Number, required: true, min: 0 },
    estimated_hours: { type: Number, default: null, min: 0 },
    minimum_role: { type: String, default: null, trim: true },
    default_priority: {
      type: String,
      enum: ['Low', 'Medium', 'High', 'Critical'],
      default: 'Medium',
    },
    description: { type: String, default: null, trim: true },
    department_id: { type: String, default: null, trim: true },
    is_recurring: { type: Boolean, default: false },
    month_range: { type: String, enum: ['calendar', 'rolling'], default: null },
    template_kind: {
      type: String,
      enum: ['system', 'custom'],
      default: 'custom',
    },
    is_editable: { type: Boolean, default: true },
    source_template_id: { type: Schema.Types.ObjectId, ref: 'JobTemplate', default: null },
    seed_key: { type: String, trim: true, default: undefined },
    sort_order: { type: Number, default: null },
    organisation_id: { type: Schema.Types.ObjectId, ref: 'Organisation', required: true, index: true },
    created_by: { type: Schema.Types.ObjectId, default: null },
  },
  {
    timestamps: true,
    collection: 'job_templates',
  }
);

jobTemplateSchema.index({ organisation_id: 1, name: 1 }, { unique: true });
jobTemplateSchema.index({ organisation_id: 1, seed_key: 1 }, { unique: true, sparse: true });
jobTemplateSchema.index({ organisation_id: 1, sort_order: 1, createdAt: -1 });

const JobTemplate = mongoose.model('JobTemplate', jobTemplateSchema);

export default JobTemplate;
