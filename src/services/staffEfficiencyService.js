import Staff from '../models/Staff.js';
import Allocation from '../models/Allocation.js';
import { toObjectId } from '../utils/objectId.js';
import { asyncHandler } from '../utils/asyncHandler.js';

export const updateStaffEfficiency = async (staffId, jobBudgetedHours, jobLoggedHours, organisationId) => {
  const staff = await Staff.findOne({ 
    _id: staffId, 
    organisation_id: organisationId 
  });
  
  if (!staff) throw new Error('Staff member not found in this organization');
  
  // Verify organization match
  if (String(staff.organisation_id) !== String(organisationId)) {
    throw new Error('Organization mismatch in staff efficiency update');
  }
  
  // Update staff efficiency with weighted average
  await staff.updateEfficiencyFromJob(jobBudgetedHours, jobLoggedHours, null, organisationId);
  
  return {
    staff_id: staffId,
    cumulative_efficiency: staff.efficiency_tracking.cumulative_efficiency,
    total_budgeted_hours: staff.efficiency_tracking.total_budgeted_hours,
    total_logged_hours: staff.efficiency_tracking.total_logged_hours,
    last_updated_at: staff.efficiency_tracking.last_updated_at,
  };
};

export const getStaffEfficiencyHistory = async (staffId, organisationId, limit = 50) => {
  const staff = await Staff.findOne({ 
    _id: staffId, 
    organisation_id: organisationId 
  })
    .select('name role efficiency_tracking');
  
  if (!staff) throw new Error('Staff member not found in this organization');
  
  // Verify organization match
  if (String(staff.organisation_id) !== String(organisationId)) {
    throw new Error('Organization mismatch in staff efficiency retrieval');
  }
  
  return {
    staff_id: staffId,
    name: staff.name,
    role: staff.role,
    current_efficiency: staff.efficiency_tracking?.cumulative_efficiency || null,
    total_budgeted_hours: staff.efficiency_tracking?.total_budgeted_hours || 0,
    total_logged_hours: staff.efficiency_tracking?.total_logged_hours || 0,
    last_updated_at: staff.efficiency_tracking?.last_updated_at || null,
    recent_completions: (staff.efficiency_tracking?.efficiency_history || [])
      .slice(-limit)
      .reverse()
  };
};

export const getOrganisationStaffEfficiency = async (organisationId) => {
  const staffMembers = await Staff.find({ 
    organisation_id: organisationId,
    is_active: true,
    is_archived: false
  }).select('name role efficiency_tracking');
  
  return staffMembers.map(staff => ({
    staff_id: staff._id.toString(),
    name: staff.name,
    role: staff.role,
    current_efficiency: staff.efficiency_tracking?.cumulative_efficiency || null,
    total_budgeted_hours: staff.efficiency_tracking?.total_budgeted_hours || 0,
    total_logged_hours: staff.efficiency_tracking?.total_logged_hours || 0,
    last_updated_at: staff.efficiency_tracking?.last_updated_at || null,
    efficiency_status: staff.efficiency_tracking?.cumulative_efficiency ? 
      (staff.efficiency_tracking.cumulative_efficiency >= 100 ? 'Excellent' :
       staff.efficiency_tracking.cumulative_efficiency >= 80 ? 'Good' : 'Needs Improvement') : 'No Data'
  }));
};