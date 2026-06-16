import mongoose from 'mongoose';

const { Schema } = mongoose;

const staffSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
    passwordHash: { type: String },
    // Legacy field from Python backend
    password_hash: { type: String },

    role: { type: String, default: 'Accountant' },
    access_level: { type: String, default: 'Standard' },

    hourly_rate: { type: Number, default: 0 },
    hours_per_day: { type: Number, default: 8 },
    available_hours_per_month: { type: Number, default: 160 },
    productivity_factor: { type: Number, default: 0.8 },
    efficiency: { type: Number, default: 1 },
    productivity_factor_history: [{
      date: { type: Date, default: Date.now },
      productivity_factor: { type: Number },
      cumulative_efficiency: { type: Number },
      total_budgeted_hours: { type: Number },
      total_logged_hours: { type: Number },
      source: { type: String, enum: ['auto', 'manual'], default: 'auto' },
    }],

    annual_fee_budget: { type: Number, default: 0 },
    annual_budgeted_hours: { type: Number, default: 0 },

    manager_id: { type: String, default: null },
    supervisor_ids: { type: [String], default: [] },
    department_ids: { type: [String], default: [] },
    department_id: { type: String, default: null },

    phone: { type: String, default: null },
    profile_picture_url: { type: String, default: null },
    organisation_id: { type: Schema.Types.ObjectId, ref: 'Organisation', default: null, index: true },
    orgSession: { type: Schema.Types.ObjectId, ref: 'Organisation', default: null, index: true },
    created_by: { type: Schema.Types.ObjectId, ref: 'Staff', default: null },
    email_verified_at: { type: Date, default: null },
    email_verification_required: { type: Boolean, default: false },
    email_verification_last_sent_at: { type: Date, default: null },
    email_verification_last_error: { type: String, default: null },
    email_verification_last_error_at: { type: Date, default: null },
    is_active: { type: Boolean, default: false },
    is_archived: { type: Boolean, default: false },
    invitation_status: { type: String, default: 'pending', enum: ['pending', 'accepted'] },
    accepted_at: { type: Date, default: null },
    can_delete: { type: Boolean, default: true },
    mustChangePassword: { type: Boolean, default: false },
    welcome_email_sent_at: { type: Date, default: null },
    welcome_email_error: { type: String, default: null },
    welcome_email_error_at: { type: Date, default: null },
    efficiency_tracking: {
      cumulative_efficiency: { type: Number, default: null, min: 0, max: 100 },
      total_budgeted_hours: { type: Number, default: 0 },
      total_logged_hours: { type: Number, default: 0 },
      last_updated_at: { type: Date, default: null },
      efficiency_history: [{
        date: { type: Date },
        efficiency_percentage: { type: Number },
        total_budgeted_hours: { type: Number },
        total_logged_hours: { type: Number },
        job_id: { type: Schema.Types.ObjectId, ref: 'Job' }
      }]
    },
  },
  {
    timestamps: true,
    collection: 'staff',
  }
);

// Group 4 – Task 4.1: indexes for common filter predicates
staffSchema.index({ is_active: 1, is_archived: 1 }); // analytics: active non-archived staff
staffSchema.index({ role: 1 });                       // role-based capacity queries
staffSchema.index({ department_id: 1 });              // department drill-down

staffSchema.methods.toApiJSON = function toApiJSON() {
  const ret = this.toObject();
  const objectId = this._id.toString();
  ret._id = objectId;
  ret.id = objectId;
  delete ret.passwordHash;
  delete ret.password_hash;
  return ret;
};

// Add efficiency calculation methods
staffSchema.methods.calculateCumulativeEfficiency = function () {
  const totalBudgeted = this.efficiency_tracking?.total_budgeted_hours || 0;
  const totalLogged = this.efficiency_tracking?.total_logged_hours || 0;
  const efficiency = totalBudgeted > 0 ? (totalLogged / totalBudgeted) * 100 : 0;
  
  return {
    cumulative_efficiency: efficiency,
    total_budgeted_hours: totalBudgeted,
    total_logged_hours: totalLogged,
  };
};

staffSchema.methods.updateEfficiencyFromJob = function (jobBudgetedHours, jobLoggedHours, jobId, organisationId) {
  // Ensure we're working with the correct organization's data
  if (String(this.organisation_id) !== String(organisationId)) {
    throw new Error('Organization mismatch in staff efficiency update');
  }
  
  const newTotalBudgeted = (this.efficiency_tracking?.total_budgeted_hours || 0) + jobBudgetedHours;
  const newTotalLogged = (this.efficiency_tracking?.total_logged_hours || 0) + jobLoggedHours;
  const newEfficiency = newTotalBudgeted > 0 ? (newTotalLogged / newTotalBudgeted) * 100 : 0;
  const cappedEfficiency = Math.min(100, newEfficiency);
  const newProductivityFactor = Math.min(1.0, cappedEfficiency / 100);
  
  // Build history entry
  const historyEntry = {
    date: new Date(),
    productivity_factor: newProductivityFactor,
    cumulative_efficiency: cappedEfficiency,
    total_budgeted_hours: newTotalBudgeted,
    total_logged_hours: newTotalLogged,
    source: 'auto',
  };
  
  let pfHistory = [...(this.productivity_factor_history || []), historyEntry];
  if (newProductivityFactor >= 1.0) {
    pfHistory = [historyEntry];
  }
  
  // Update productivity factor
  this.productivity_factor = newProductivityFactor;
  this.productivity_factor_history = pfHistory;
  
  // Update efficiency tracking
  this.efficiency_tracking = {
    cumulative_efficiency: cappedEfficiency,
    total_budgeted_hours: newTotalBudgeted,
    total_logged_hours: newTotalLogged,
    last_updated_at: new Date(),
    efficiency_history: [...(this.efficiency_tracking?.efficiency_history || []), {
      date: new Date(),
      efficiency_percentage: cappedEfficiency,
      total_budgeted_hours: newTotalBudgeted,
      total_logged_hours: newTotalLogged,
      job_id: jobId
    }]
  };
  
  return this.save();
};

const Staff = mongoose.model('Staff', staffSchema);

export default Staff;
