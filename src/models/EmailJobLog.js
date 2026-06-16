import mongoose from 'mongoose';

const { Schema } = mongoose;

const emailJobLogSchema = new Schema(
  {
    provider: { type: String, default: 'qstash', index: true },
    message_id: { type: String, required: true, index: true, unique: true },
    job_type: { type: String, required: true, index: true },
    payload: { type: Schema.Types.Mixed, default: null },
    status: {
      type: String,
      required: true,
      enum: ['queued', 'processing', 'sent', 'failed'],
      default: 'queued',
      index: true,
    },
    attempts_made: { type: Number, default: 0 },
    max_attempts: { type: Number, default: 0 },
    failed_reason: { type: String, default: null },
    stacktrace: { type: [String], default: [] },
    dispatched_at: { type: Date, default: null },
    finished_at: { type: Date, default: null },
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
    collection: 'email_job_logs',
  }
);

emailJobLogSchema.index({ status: 1, updated_at: -1 });

const EmailJobLog = mongoose.model('EmailJobLog', emailJobLogSchema);

export default EmailJobLog;