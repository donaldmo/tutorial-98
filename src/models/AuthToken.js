import mongoose from 'mongoose';

const { Schema } = mongoose;

const authTokenSchema = new Schema(
  {
    token_kind: {
      type: String,
      required: true,
      enum: [
        'invite_admin',
        'invite_staff',
        'verify_email',
        'reset_password',
        'verify_pin',
        'reset_password_pin_admin',
        'reset_password_pin_staff',
      ],
      index: true,
    },
    jwt_id: { type: String, required: true, index: true },
    pin_hash: { type: String, default: null },
    attempt_count: { type: Number, default: 0 },
    max_attempts: { type: Number, default: null },
    staff_id: { type: Schema.Types.ObjectId, ref: 'Staff', default: null, index: true },
    admin_id: { type: Schema.Types.ObjectId, ref: 'Admin', default: null, index: true },
    organisation_id: { type: Schema.Types.ObjectId, ref: 'Organisation', default: null, index: true },
    email: { type: String, required: true, lowercase: true, trim: true, index: true },
    invite_role: { type: String, default: null, enum: ['owner', 'admin', 'supervisor', 'member', null] },
    role_title: { type: String, default: null },
    status: {
      type: String,
      required: true,
      default: 'active',
      enum: ['active', 'used', 'revoked', 'expired'],
      index: true,
    },
    issued_by_staff_id: { type: Schema.Types.ObjectId, ref: 'Staff', default: null },
    issued_by_admin_id: { type: Schema.Types.ObjectId, ref: 'Admin', default: null },
    expires_at: { type: Date, required: true, index: true },
    consumed_at: { type: Date, default: null },
    revoked_at: { type: Date, default: null },
    metadata: { type: Schema.Types.Mixed, default: null },
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
    collection: 'auth_tokens',
  }
);

authTokenSchema.index({ token_kind: 1, organisation_id: 1, email: 1, invite_role: 1, status: 1 });

authTokenSchema.pre('save', function normalizeEmail(next) {
  if (this.email) this.email = String(this.email).toLowerCase().trim();
  next();
});

const AuthToken = mongoose.model('AuthToken', authTokenSchema);

export default AuthToken;
