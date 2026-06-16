import mongoose from 'mongoose';

const { Schema } = mongoose;

const webhookSchema = new Schema(
  {
    url: { type: String, required: true, trim: true },
    event_types: { type: [String], default: [] },
    secret: { type: String, required: true },
    is_active: { type: Boolean, default: true },
    organisation_id: { type: Schema.Types.ObjectId, ref: 'Organisation', index: true },
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: true },
    collection: 'webhooks',
  }
);

webhookSchema.index({ is_active: 1, created_at: -1 });

const Webhook = mongoose.model('Webhook', webhookSchema);

export default Webhook;
