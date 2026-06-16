import Allocation from '../models/Allocation.js';
import Job from '../models/Job.js';
import TimeEntry from '../models/TimeEntry.js';
import { toObjectId } from '../utils/objectId.js';
import { serializeDocument } from '../utils/serialize.js';
import { asyncHandler } from '../utils/asyncHandler.js';

export const calculateJobEfficiency = async (jobId, organisationId) => {
  const job = await Job.findOne({ _id: jobId, organisation_id: organisationId });
  if (!job) throw new Error('Job not found in this organization');
  
  const allocations = await Allocation.find({ 
    job_id: jobId, 
    organisation_id: organisationId 
  });
  
  const budgeted = allocations.reduce((acc, a) => acc + Number(a.adjusted_hours || 0), 0);

  const allocationIds = allocations.map((a) => a._id).filter(Boolean);
  const timeAgg = allocationIds.length > 0
    ? await TimeEntry.aggregate([
        { $match: { allocation_id: { $in: allocationIds } } },
        { $group: { _id: null, total: { $sum: '$hours_worked' } } },
      ])
    : [];
  const actual = Number(timeAgg[0]?.total || 0);
  
  return {
    current_efficiency: budgeted > 0 ? (actual / budgeted) * 100 : 0,
    total_budgeted_hours: budgeted,
    total_logged_hours: actual,
  };
};

export const updateJobEfficiency = async (jobId, allocationId, organisationId) => {
  const job = await Job.findOne({ _id: jobId, organisation_id: organisationId });
  if (!job) throw new Error('Job not found in this organization');
  
  const efficiency = await calculateJobEfficiency(jobId, organisationId);
  
  await job.updateEfficiency(efficiency, null);
  
  return job.efficiency_metrics;
};

export const recordJobCompletionEfficiency = async (allocationId, completedBy, completedAt) => {
  const allocation = await Allocation.findById(allocationId);
  if (!allocation) throw new Error('Allocation not found');
  
  const jobId = allocation.job_id;
  const organisationId = allocation.organisation_id;
  
  const job = await Job.findOne({ _id: jobId, organisation_id: organisationId });
  if (!job) throw new Error('Job not found in this organization');
  
  const efficiency = await calculateJobEfficiency(jobId, organisationId);
  
  await job.updateEfficiency(efficiency, completedBy);
  
  return {
    job_id: jobId.toString(),
    current_efficiency: efficiency.current_efficiency,
    total_budgeted_hours: efficiency.total_budgeted_hours,
    total_logged_hours: efficiency.total_logged_hours,
    last_calculated_at: job.efficiency_metrics.last_calculated_at,
  };
};