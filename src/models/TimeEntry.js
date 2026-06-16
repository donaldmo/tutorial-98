import mongoose from 'mongoose';

const { Schema } = mongoose;

const timeEntrySchema = new Schema(
  {
    allocation_id: { type: Schema.Types.ObjectId, ref: 'Allocation', required: true, index: true },
    staff_id: { type: Schema.Types.ObjectId, ref: 'Staff', required: true, index: true },
    job_id: { type: Schema.Types.ObjectId, ref: 'Job', required: true, index: true },
    start_time: { type: Date, required: true, index: true },
    end_time: { type: Date, required: true, index: true },
    date: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
    hours_worked: { type: Number, required: true, min: 0.01 },
    description: { type: String, required: true, minlength: 5 },
    organisation_id: { type: Schema.Types.ObjectId, ref: 'Organisation', default: null, index: true },
    created_by: { type: Schema.Types.ObjectId, ref: 'Staff', default: null },
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: false },
    collection: 'time_entries',
  }
);

timeEntrySchema.index({ allocation_id: 1, date: 1 });
timeEntrySchema.index({ allocation_id: 1, start_time: -1 });
timeEntrySchema.index({ staff_id: 1, date: 1 });
timeEntrySchema.index({ job_id: 1, date: 1 });
// Group 4 – Task 4.1: standalone date index for month-prefix filter in loadCommon()
timeEntrySchema.index({ date: 1 });

const TimeEntry = mongoose.model('TimeEntry', timeEntrySchema);

export default TimeEntry;
