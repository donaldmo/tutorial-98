import mongoose from 'mongoose';

const { Schema } = mongoose;

/**
 * Admin — a standalone auth entity with elevated access to an Organisation.
 *
 * role 'owner'  = the firm / account owner (created on registration or seed).
 * role 'admin'  = additional admins invited via Settings.
 *
 * Admins are NOT Staff. They have their own credentials and auth flows.
 */
const adminSchema = new Schema(
  {
    organisation_id: {
      type: Schema.Types.ObjectId,
      ref: 'Organisation',
      required: true,
      index: true,
    },
    orgSession: {
      type: Schema.Types.ObjectId,
      ref: 'Organisation',
      default: null,
      index: true,
    },
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    name: {
      type: String,
      default: null,
    },
    phone: {
      type: String,
      default: null,
    },
    profile_picture_url: { type: String, default: null },

    // ── Credentials ──────────────────────────────────────────────────────────
    passwordHash: { type: String, default: null },

    // ── Account state ─────────────────────────────────────────────────────────
    is_active: { type: Boolean, default: false },
    mustChangePassword: { type: Boolean, default: false },
    show_onboarding: { type: Boolean, default: true },

    // ── Email verification ────────────────────────────────────────────────────
    email_verified_at: { type: Date, default: null },
    email_verification_required: { type: Boolean, default: true },
    email_verification_last_sent_at: { type: Date, default: null },
    email_verification_last_error: { type: String, default: null },
    email_verification_last_error_at: { type: Date, default: null },

    // ── Membership role ───────────────────────────────────────────────────────
    role: {
      type: String,
      required: true,
      enum: ['owner', 'admin', 'supervisor'],
      default: 'admin',
    },
    status: {
      type: String,
      required: true,
      enum: ['active', 'invited', 'revoked'],
      default: 'active',
    },

    // ── Display role title (Partner, Director, Manager, Senior Accountant) ───
    role_title: { type: String, default: null },

    // ── Invite tracking ───────────────────────────────────────────────────────
    /** The Admin doc (_id) that sent this invite */
    invited_by_admin_id: {
      type: Schema.Types.ObjectId,
      ref: 'Admin',
      default: null,
    },
    invited_at: { type: Date, default: null },
    accepted_at: { type: Date, default: null },
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
    collection: 'admins',
  }
);

adminSchema.index({ organisation_id: 1, status: 1 });
adminSchema.index({ organisation_id: 1, role: 1, status: 1 });
adminSchema.index({ email: 1, status: 1 });
adminSchema.index({ organisation_id: 1, email: 1 }, { unique: true });

const Admin = mongoose.model('Admin', adminSchema);

export default Admin;
