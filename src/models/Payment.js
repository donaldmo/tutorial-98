import mongoose from 'mongoose';

const { Schema } = mongoose;

const paymentPaystackSchema = new Schema(
  {
    customer_code: { type: String, default: null },
    plan_code: { type: String, default: null },
    subscription_code: { type: String, default: null },
    invoice_code: { type: String, default: null },
    email_token: { type: String, default: null },
    transaction_id: { type: Number, default: null },
    reference: { type: String, default: null },
    access_code: { type: String, default: null },
    authorization_code: { type: String, default: null },
    authorization_signature: { type: String, default: null },
    gateway_response: { type: String, default: null },
    channel: { type: String, default: null },
    fees: { type: Number, default: null },
    paid_at: { type: Date, default: null },
    renewal_reference: { type: String, default: null },
    renewal_due_at: { type: Date, default: null },
    renewal_status: { type: String, default: null },
    webhook_event: { type: String, default: null },
    success_email_sent_at: { type: Date, default: null },
    success_email_message_id: { type: String, default: null },
    metadata: { type: Schema.Types.Mixed, default: null },
  },
  { _id: false }
);

const paymentSchema = new Schema(
  {
    organisation_id: { type: Schema.Types.ObjectId, ref: 'Organisation', required: true, index: true },
    amount: { type: Number, required: true, min: 0 },
    currency: { type: String, default: 'ZAR' },
    status: { type: String, required: true, default: 'pending', enum: ['pending', 'completed', 'failed', 'refunded'] },
    payment_method: { type: String, default: 'payfast' },
    payfast_payment_id: { type: String, default: null },
    description: { type: String, default: null },
    plan: { type: String, default: null },
    billing_cycle: { type: String, default: 'monthly', enum: ['monthly', 'annual'] },
    amount_gross: { type: Number, default: 0 },
    amount_fee: { type: Number, default: 0 },
    amount_net: { type: Number, default: 0 },
    completed_at: { type: Date, default: null },
    paystack: { type: paymentPaystackSchema, default: () => ({}) },
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: false },
    collection: 'payments',
  }
);

paymentSchema.index({ status: 1, created_at: -1 });

const Payment = mongoose.model('Payment', paymentSchema);

export default Payment;
