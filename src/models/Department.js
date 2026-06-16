import mongoose from 'mongoose';

const { Schema } = mongoose;

const departmentSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    code: { type: String, required: true, trim: true, uppercase: true, maxlength: 5 },
    description: { type: String, default: null },
    color: { type: String, default: '#3B82F6' },
    supervisor_id: { type: Schema.Types.ObjectId, ref: 'Staff', default: null, index: true },
    is_active: { type: Boolean, default: true },
    organisation_id: { type: Schema.Types.ObjectId, ref: 'Organisation', default: null, index: true },
    created_by: { type: Schema.Types.ObjectId, ref: 'Staff', default: null },
  },
  {
    timestamps: true,
    collection: 'departments',
  }
);

// Group 4 – Task 4.1: active filter index
departmentSchema.index({ is_active: 1 });
departmentSchema.index({ organisation_id: 1, code: 1 }, { unique: true, sparse: true });

const Department = mongoose.model('Department', departmentSchema);

export default Department;
