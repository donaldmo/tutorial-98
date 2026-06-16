import mongoose from 'mongoose';

const { Schema } = mongoose;

const systemTemplateSchema = new Schema(
  {
    key: { type: String, required: true, trim: true, lowercase: true, unique: true, index: true },
    name: { type: String, required: true, trim: true },
    industry: { type: String, required: true, trim: true },
    description: { type: String, default: null, trim: true },
    version: { type: String, default: '1.0.0', trim: true },
    setup: {
      seed_order: { type: [String], default: ['departments', 'job_types'] },
      departments: { type: [Schema.Types.Mixed], default: [] },
      job_types: { type: [Schema.Types.Mixed], default: [] },
    },
  },
  {
    timestamps: true,
    collection: 'system_templates',
  }
);

const SystemTemplate = mongoose.model('SystemTemplate', systemTemplateSchema);

export default SystemTemplate;
