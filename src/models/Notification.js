import mongoose from 'mongoose';

const { Schema } = mongoose;

const notificationSchema = new Schema(
  {
    user_id: { type: Schema.Types.ObjectId, ref: 'Staff', required: true, index: true },
    organisation_id: { type: Schema.Types.ObjectId, ref: 'Organisation', required: true, index: true },
    type: { 
      type: String, 
      enum: ['allocation_assigned', 'allocation_accepted', 'allocation_reassigned', 'allocation_component_completed', 'system_update', 'deadline_approaching', 'overdue_job'],
      required: true,
      index: true
    },
    title: { type: String, required: true },
    message: { type: String, required: true },
    related_job_id: { type: Schema.Types.ObjectId, ref: 'Job', default: null, index: true },
    related_allocation_id: { type: Schema.Types.ObjectId, ref: 'Allocation', default: null, index: true },
    is_read: { type: Boolean, default: false, index: true },
    read_at: { type: Date, default: null },
    created_at: { type: Date, default: Date.now },
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: false },
    collection: 'notifications',
  }
);

notificationSchema.index({ user_id: 1, is_read: 1, created_at: -1 });
notificationSchema.index({ organisation_id: 1, created_at: -1 });

const Notification = mongoose.model('Notification', notificationSchema);

export default Notification;
