import mongoose from 'mongoose';

const { Schema } = mongoose;

const monthlySnapshotSchema = new Schema(
  {
    month: { type: String, required: true, match: /^\d{4}-\d{2}$/ },
    summary: { type: Schema.Types.Mixed, default: {} },
    staff_capacity: { type: [Schema.Types.Mixed], default: [] },
    jobs: { type: [Schema.Types.Mixed], default: [] },
    over_under: { type: [Schema.Types.Mixed], default: [] },
    generated_at: { type: Date, default: Date.now },
    organisation_id: { type: Schema.Types.ObjectId, ref: 'Organisation', index: true },
  },
  {
    timestamps: true,
    collection: 'monthly_snapshots',
  }
);

monthlySnapshotSchema.index({ month: 1, organisation_id: 1 }, { unique: true });

const MonthlySnapshot = mongoose.model('MonthlySnapshot', monthlySnapshotSchema);

export default MonthlySnapshot;