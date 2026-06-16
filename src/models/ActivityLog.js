import mongoose from 'mongoose';

const { Schema } = mongoose;

const activityLogSchema = new Schema(
  {
    action: { type: String, required: true, index: true },
    organisation_id: { type: Schema.Types.ObjectId, ref: 'Organisation', default: null },
    firm_name: { type: String, default: null },
    performed_by: { type: String, default: 'super_admin' },
    metadata: { type: Schema.Types.Mixed, default: {} },
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: false },
    collection: 'activity_logs',
  }
);

activityLogSchema.index({ created_at: -1 });

const ActivityLog = mongoose.model('ActivityLog', activityLogSchema);

export default ActivityLog;
