import mongoose from 'mongoose';

const { Schema } = mongoose;

const superAdminSchema = new Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    name: { type: String, required: true },
    password_hash: { type: String, required: true },
    is_active: { type: Boolean, default: true },
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: false },
    collection: 'super_admins',
  }
);

const SuperAdmin = mongoose.model('SuperAdmin', superAdminSchema);

export default SuperAdmin;
