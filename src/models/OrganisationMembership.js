import mongoose from 'mongoose';

const { Schema } = mongoose;

const organisationMembershipSchema = new Schema(
  {
    organisation_id: { type: Schema.Types.ObjectId, ref: 'Organisation', required: true, index: true },
    staff_id: { type: Schema.Types.ObjectId, ref: 'Staff', required: true, index: true },
    role: { type: String, required: true, default: 'member', enum: ['owner', 'admin', 'member'] },
    invited_by_staff_id: { type: Schema.Types.ObjectId, ref: 'Staff', default: null },
    accepted_at: { type: Date, default: null },
    revoked_at: { type: Date, default: null },
    status: { type: String, required: true, default: 'active', enum: ['active', 'revoked'], index: true },
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
    collection: 'organisation_memberships',
  }
);

organisationMembershipSchema.index({ organisation_id: 1, staff_id: 1, role: 1 }, { unique: true });
organisationMembershipSchema.index({ organisation_id: 1, status: 1, role: 1 });

const OrganisationMembership = mongoose.model('OrganisationMembership', organisationMembershipSchema);

export default OrganisationMembership;
