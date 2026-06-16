import mongoose from 'mongoose';

const { Schema } = mongoose;

const authorizationRequestSchema = new Schema(
  {
    allocation_id: { type: Schema.Types.ObjectId, ref: 'Allocation', default: null, index: true },
    job_id: { type: Schema.Types.ObjectId, ref: 'Job', required: true, index: true },
    staff_id: { type: Schema.Types.ObjectId, ref: 'Staff', required: true, index: true },
    requested_by: { type: Schema.Types.ObjectId, ref: 'Staff', required: true, index: true },
    department_id: { type: Schema.Types.ObjectId, ref: 'Department', default: null, index: true },
    reason: { type: String, required: true },
    percentage_requested: { type: Number, required: true, min: 0.01, max: 100 },
    status: { type: String, default: 'Pending', enum: ['Pending', 'Approved', 'Rejected', 'Overridden'] },
    reviewed_by: { type: Schema.Types.ObjectId, ref: 'Staff', default: null },
    review_notes: { type: String, default: null },
    reviewed_at: { type: Date, default: null },
    organisation_id: { type: Schema.Types.ObjectId, ref: 'Organisation', index: true, default: null },
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: false },
    collection: 'authorization_requests',
  }
);

const AuthorizationRequest = mongoose.model('AuthorizationRequest', authorizationRequestSchema);

export default AuthorizationRequest;
