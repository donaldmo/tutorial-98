import mongoose from 'mongoose';

const { Schema } = mongoose;

const allocationSchema = new Schema(
  {
    job_id: { type: Schema.Types.ObjectId, ref: 'Job', required: true, index: true },
    staff_id: { type: Schema.Types.ObjectId, ref: 'Staff', required: true, index: true },
    percentage: { type: Number, required: true, min: 0.01, max: 100, default: 100 },
    allocated_fee: { type: Number, required: true, min: 0 },
    calculated_hours: { type: Number, required: true, min: 0 },
    adjusted_hours: { type: Number, required: true, min: 0 },
    month: { type: String, required: true, match: /^\d{4}-\d{2}$/ },
    notes: { type: String, default: null },
    is_reallocated: { type: Boolean, default: false },
    reallocated_from_id: { type: Schema.Types.ObjectId, ref: 'Allocation', default: null },
    reallocated_to_id: { type: Schema.Types.ObjectId, ref: 'Allocation', default: null },
    reallocation_reason: { type: String, default: null },
    reallocated_at: { type: Date, default: null },
    is_auto_generated: { type: Boolean, default: false },
    source_allocation_id: { type: Schema.Types.ObjectId, ref: 'Allocation', default: null },
    is_over_capacity: { type: Boolean, default: false, index: true },
    over_capacity_utilization_percentage: { type: Number, default: null, min: 0 },
    over_capacity_projected_hours: { type: Number, default: null, min: 0 },
    over_capacity_effective_capacity_hours: { type: Number, default: null, min: 0 },
    over_capacity_threshold: { type: Number, default: 90, min: 0 },
    status: { type: String, default: 'active' },
    completed_percentage: { type: Number, default: 0, min: 0, max: 100 },
    work_component_key: { type: String, default: null },
    custom_component: { type: Boolean, default: false },
    component_label: { type: String, default: null },
    component_service: { type: String, default: null },
    component_role: { type: String, default: null },
    workflow_status: { type: String, enum: ['Pending', 'Doing', 'Completed'], default: 'Pending', index: true },
    started_at: { type: Date, default: null },
    started_by: { type: Schema.Types.ObjectId, ref: 'Staff', default: null },
    started_timezone: { type: String, default: null },
    completed_at: { type: Date, default: null },
    completed_by: { type: Schema.Types.ObjectId, ref: 'Staff', default: null },
    completed_timezone: { type: String, default: null },
    assigned_to_started_minutes: { type: Number, default: null, min: 0 },
    started_to_completed_minutes: { type: Number, default: null, min: 0 },
    snapshot_current_version: { type: Number, default: 0, min: 0 },
    last_completed_snapshot_version: { type: Number, default: 0, min: 0 },
    snapshot_current: { type: Schema.Types.Mixed, default: null },
    snapshot_versions: { type: [Schema.Types.Mixed], default: [] },
    organisation_id: { type: Schema.Types.ObjectId, ref: 'Organisation', required: true, index: true },
    created_by: { type: Schema.Types.ObjectId, ref: 'Staff', default: null },
    review_rating: { type: Number, default: null, min: 1, max: 5 },
    review_comments: { type: String, default: null },
    reviewed_at: { type: Date, default: null },
    reviewed_by: { type: Schema.Types.ObjectId, ref: 'Staff', default: null },
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: false },
    collection: 'allocations',
  }
);

allocationSchema.index({ month: 1, staff_id: 1 });
allocationSchema.index({ month: 1, job_id: 1 });
allocationSchema.index({ status: 1, month: 1 });
allocationSchema.index({ organisation_id: 1, month: 1, is_over_capacity: 1 });
allocationSchema.index({ staff_id: 1, month: 1, is_over_capacity: 1 });

const Allocation = mongoose.model('Allocation', allocationSchema);

export default Allocation;
