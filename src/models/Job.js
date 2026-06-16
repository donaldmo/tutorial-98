import mongoose from 'mongoose';

const { Schema } = mongoose;

const jobSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    client_id: { type: Schema.Types.ObjectId, ref: 'Client', default: null, index: true },
    client_name: { type: String, required: true, trim: true },
    // Flexible job type entries — embedded snapshot, sole source of truth for required coverage
    job_type_entries: [{
      job_type_id: { type: Schema.Types.ObjectId, ref: 'JobType' },
      job_type_name: { type: String, default: '' },
      fee: { type: Number, min: 0 },
      work_components: [{
        name: { type: String },
        service: { type: String, default: 'general' },
        role: { type: String, default: null },
        percentage: { type: Number, default: 0 },
        hours_multiplier: { type: Number, default: 1 },
      }],
    }],
    job_fee: { type: Number, required: true, min: 0 },
    pricing_override: { type: Number, default: null, min: 0 },
    budgeted_wip: { type: Number, default: 0, min: 0 },
    estimated_hours: { type: Number, default: null },
    minimum_role: { type: String, default: null },
    priority: { type: String, default: 'Medium' },
    deadline: { type: Date, default: null },
    deadline_day: { type: Number, default: null, min: 1, max: 31 },
    submission_date: { type: Date, default: null },
    status: {
      type: String,
      enum: ['Pending', 'Partially Allocated', 'Fully Allocated', 'In Progress', 'Completed', 'On Hold'],
      default: 'Pending',
    },
    description: { type: String, default: null },
    financial_year: { type: String, default: () => String(new Date().getUTCFullYear()) },
    department_id: { type: String, default: null },
    is_recurring: { type: Boolean, default: false },
    month_range: { type: String, enum: ['calendar', 'rolling'], default: null },
    recurrence_type: { type: String, default: null },
    recurrence_start_date: { type: String, default: null },
    recurrence_end_date: { type: String, default: null },
    is_retainer: { type: Boolean, default: false },
    recurring_month_entries: [{
      month: { type: Number, required: true },
      year: { type: Number, required: true },
      deadline: { type: Date, default: null },
      status: {
        type: String,
        enum: ['Pending', 'Partially Allocated', 'Fully Allocated', 'In Progress', 'Completed', 'On Hold'],
        default: 'Pending',
      },
    }],
    retainer_fee: { type: Number, default: null },
    retainer_start_date: { type: String, default: null },
    retainer_end_date: { type: String, default: null },
    total_allocated_percentage: { type: Number, default: 0 },
    monthly_allocations: {
      type: Map,
      of: {
        allocated_percentage: { type: Number, default: 0 },
        status: {
          type: String,
          enum: ['Pending', 'Partially Allocated', 'Fully Allocated'],
          default: 'Pending',
        },
      },
      default: {},
    },
    efficiency_metrics: {
      current_efficiency: { type: Number, default: null, min: 0, max: 100 },
      last_calculated_at: { type: Date, default: null },
      total_budgeted_hours: { type: Number, default: 0 },
      total_logged_hours: { type: Number, default: 0 },
      efficiency_history: [{
        calculated_at: { type: Date },
        efficiency_percentage: { type: Number },
        total_budgeted_hours: { type: Number },
        total_logged_hours: { type: Number },
        completed_by: { type: Schema.Types.ObjectId, ref: 'Staff' }
      }]
    },
    organisation_id: { type: Schema.Types.ObjectId, ref: 'Organisation', default: null, index: true },
    created_by: { type: Schema.Types.ObjectId, ref: 'Staff', default: null },
  },
  {
    timestamps: true,
    collection: 'jobs',
  }
);

/**
 * Recompute unified status from the job's total_allocated_percentage.
 * Call this after any allocation create / update / delete that touches this job.
 *
 * Logic:
 *   - total_allocated_percentage >= 100 → Fully Allocated
 *   - total_allocated_percentage > 0    → Partially Allocated
 *   - Otherwise                         → Pending
 *
 * Note: Workflow status (In Progress / Completed) is handled by syncJobWorkflowStatus.
 * On Hold is set manually via PATCH /:job_id/status.
 */
jobSchema.methods.updateAllocationStatus = async function () {
  if (this.status === 'On Hold' || this.status === 'Completed') return this.status;

  let newStatus = 'Pending';
  if (this.total_allocated_percentage >= 100) {
    newStatus = 'Fully Allocated';
  } else if (this.total_allocated_percentage > 0) {
    newStatus = 'Partially Allocated';
  }

  if (this.status !== newStatus) {
    this.status = newStatus;
    await this.save();
  }
  return this.status;
};

// Add efficiency calculation methods
jobSchema.methods.calculateEfficiency = function () {
  const totalBudgeted = this.allocations?.reduce((sum, alloc) => sum + (alloc.adjusted_hours || 0), 0) || 0;
  const totalLogged = this.allocations?.reduce((sum, alloc) => sum + (alloc.total_logged_hours || 0), 0) || 0;
  const efficiency = totalBudgeted > 0 ? (totalLogged / totalBudgeted) * 100 : 0;
  
  return {
    current_efficiency: efficiency,
    total_budgeted_hours: totalBudgeted,
    total_logged_hours: totalLogged,
  };
};

jobSchema.methods.updateEfficiency = function (efficiencyData, completedBy) {
  const newEfficiency = efficiencyData.current_efficiency;
  const lastEfficiency = this.efficiency_metrics?.current_efficiency;
  
  // Only add to history if efficiency changed significantly or first calculation
  const shouldAddToHistory = !lastEfficiency || Math.abs(newEfficiency - lastEfficiency) > 1;
  
  if (shouldAddToHistory) {
    this.efficiency_metrics = {
      current_efficiency: newEfficiency,
      last_calculated_at: new Date(),
      total_budgeted_hours: efficiencyData.total_budgeted_hours,
      total_logged_hours: efficiencyData.total_logged_hours,
      efficiency_history: [...(this.efficiency_metrics?.efficiency_history || []), {
        calculated_at: new Date(),
        efficiency_percentage: newEfficiency,
        total_budgeted_hours: efficiencyData.total_budgeted_hours,
        total_logged_hours: efficiencyData.total_logged_hours,
        completed_by: completedBy
      }]
    };
  }
  
  return this.save();
};

jobSchema.index({ status: 1, deadline: 1 });

jobSchema.index({ client_id: 1, status: 1 });
jobSchema.index({ submission_date: 1, status: 1 });
// Group 4 – Task 4.1: text index replaces in-query regex for keyword search
jobSchema.index({ name: 'text', client_name: 'text' });

const Job = mongoose.model('Job', jobSchema);

export default Job;
