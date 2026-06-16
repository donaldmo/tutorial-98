import mongoose from 'mongoose';
import Staff from '../models/Staff.js';
import Allocation from '../models/Allocation.js';
import TimeEntry from '../models/TimeEntry.js';
import { updateStaffEfficiency, getStaffEfficiencyHistory, getOrganisationStaffEfficiency } from '../services/staffEfficiencyService.js';

describe('Staff Efficiency Service - Organization Isolation Tests', () => {
  let org1, org2, staff1, staff2, job1, job2;

  beforeAll(async () => {
    // Connect to test database
    await mongoose.connect(process.env.MONGODB_TEST_URI || 'mongodb://localhost:27017/test');
    
    // Create test organizations
    org1 = new mongoose.Types.ObjectId();
    org2 = new mongoose.Types.ObjectId();
    
    // Create test staff members
    staff1 = await Staff.create({
      name: 'John Doe',
      email: 'john@org1.com',
      organisation_id: org1,
      is_active: true,
      is_archived: false,
      efficiency_tracking: {
        cumulative_efficiency: null,
        total_budgeted_hours: 0,
        total_logged_hours: 0,
        last_updated_at: null,
        efficiency_history: []
      }
    });

    staff2 = await Staff.create({
      name: 'Jane Smith', 
      email: 'jane@org2.com',
      organisation_id: org2,
      is_active: true,
      is_archived: false,
      efficiency_tracking: {
        cumulative_efficiency: null,
        total_budgeted_hours: 0,
        total_logged_hours: 0,
        last_updated_at: null,
        efficiency_history: []
      }
    });

    // Create test jobs
    job1 = new mongoose.Types.ObjectId();
    job2 = new mongoose.Types.ObjectId();
  });

  afterAll(async () => {
    await mongoose.connection.close();
  });

  beforeEach(async () => {
    // Reset efficiency tracking before each test
    await Staff.updateMany(
      { _id: { $in: [staff1._id, staff2._id] } },
      { 
        $set: {
          'efficiency_tracking.cumulative_efficiency': null,
          'efficiency_tracking.total_budgeted_hours': 0,
          'efficiency_tracking.total_logged_hours': 0,
          'efficiency_tracking.last_updated_at': null,
          'efficiency_tracking.efficiency_history': []
        }
      }
    );
  });

  describe('updateStaffEfficiency - Organization Isolation', () => {
    it('should update staff efficiency for correct organization', async () => {
      const result = await updateStaffEfficiency(
        staff1._id,
        100, // jobBudgetedHours
        80,  // jobLoggedHours
        org1  // organisationId
      );

      expect(result.staff_id).toBe(staff1._id.toString());
      expect(result.cumulative_efficiency).toBe(80); // 80/100 * 100
      expect(result.total_budgeted_hours).toBe(100);
      expect(result.total_logged_hours).toBe(80);

      // Verify staff record in database
      const updatedStaff = await Staff.findById(staff1._id);
      expect(updatedStaff.efficiency_tracking.total_budgeted_hours).toBe(100);
      expect(updatedStaff.efficiency_tracking.total_logged_hours).toBe(80);
      expect(updatedStaff.efficiency_tracking.cumulative_efficiency).toBe(80);
    });

    it('should throw error for organization mismatch', async () => {
      await expect(updateStaffEfficiency(
        staff1._id,
        100,
        80,
        org2  // Wrong organization
      )).rejects.toThrow('Organization mismatch in staff efficiency update');
    });

    it('should throw error for staff not found in organization', async () => {
      await expect(updateStaffEfficiency(
        new mongoose.Types.ObjectId(), // Non-existent staff
        100,
        80,
        org1
      )).rejects.toThrow('Staff member not found in this organization');
    });

    it('should handle multiple efficiency updates with weighted average', async () => {
      // First update
      await updateStaffEfficiency(
        staff1._id,
        100, // budgeted
        80,  // logged
        org1
      );

      // Second update with different values
      await updateStaffEfficiency(
        staff1._id,
        50,  // additional budgeted
        45,  // additional logged
        org1
      );

      const result = await getStaffEfficiencyHistory(staff1._id, org1);
      expect(result.total_budgeted_hours).toBe(150); // 100 + 50
      expect(result.total_logged_hours).toBe(125); // 80 + 45
      expect(result.current_efficiency).toBe(83.33); // 125/150 * 100 = 83.33
    });
  });

  describe('getStaffEfficiencyHistory - Organization Isolation', () => {
    it('should return staff efficiency history for correct organization', async () => {
      // First update to create history
      await updateStaffEfficiency(
        staff1._id,
        100,
        80,
        org1
      );

      const result = await getStaffEfficiencyHistory(staff1._id, org1);
      
      expect(result.staff_id).toBe(staff1._id.toString());
      expect(result.name).toBe('John Doe');
      expect(result.role).toBe('Accountant');
      expect(result.current_efficiency).toBe(80);
      expect(result.total_budgeted_hours).toBe(100);
      expect(result.total_logged_hours).toBe(80);
      expect(result.last_updated_at).toBeDefined();
      expect(result.recent_completations).toHaveLength(1);
    });

    it('should throw error for organization mismatch when retrieving history', async () => {
      await expect(getStaffEfficiencyHistory(
        staff1._id,
        org2  // Wrong organization
      )).rejects.toThrow('Organization mismatch in staff efficiency retrieval');
    });

    it('should return efficiency status correctly', async () => {
      // Test Excellent performance (>= 100%)
      await updateStaffEfficiency(
        staff1._id,
        100,
        120,
        org1
      );

      const result = await getStaffEfficiencyHistory(staff1._id, org1);
      expect(result.current_efficiency).toBe(120);

      // Test Good performance (>= 80% and < 100%)
      await Staff.findByIdAndUpdate(staff1._id, {
        $set: { 'efficiency_tracking.cumulative_efficiency': 85 }
      });
      
      const goodResult = await getStaffEfficiencyHistory(staff1._id, org1);
      expect(goodResult.current_efficiency).toBe(85);

      // Test Needs Improvement (< 80%)
      await Staff.findByIdAndUpdate(staff1._id, {
        $set: { 'efficiency_tracking.cumulative_efficiency': 75 }
      });

      const poorResult = await getStaffEfficiencyHistory(staff1._id, org1);
      expect(poorResult.current_efficiency).toBe(75);
    });

    it('should handle staff with no efficiency data', async () => {
      const result = await getStaffEfficiencyHistory(staff1._id, org1);
      
      expect(result.current_efficiency).toBeNull();
      expect(result.total_budgeted_hours).toBe(0);
      expect(result.total_logged_hours).toBe(0);
      expect(result.last_updated_at).toBeNull();
      expect(result.recent_completations).toHaveLength(0);
    });
  });

  describe('getOrganisationStaffEfficiency - Organization Isolation', () => {
    it('should return efficiency overview for correct organization only', async () => {
      // Update staff in org1
      await updateStaffEfficiency(
        staff1._id,
        100,
        90,
        org1
      );

      // Update staff in org2
      await updateStaffEfficiency(
        staff2._id,
        80,
        64,
        org2
      );

      // Get org1 efficiency
      const org1Result = await getOrganisationStaffEfficiency(org1);
      expect(org1Result).toHaveLength(1);
      expect(org1Result[0].staff_id).toBe(staff1._id.toString());
      expect(org1Result[0].current_efficiency).toBe(90);
      expect(org1Result[0].efficiency_status).toBe('Good');

      // Get org2 efficiency
      const org2Result = await getOrganisationStaffEfficiency(org2);
      expect(org2Result).toHaveLength(1);
      expect(org2Result[0].staff_id).toBe(staff2._id.toString());
      expect(org2Result[0].current_efficiency).toBe(80);
      expect(org2Result[0].efficiency_status).toBe('Good');

      // Verify data isolation - org1 should not see org2 staff
      expect(org1Result.find(s => s.staff_id === staff2._id.toString())).toBeUndefined();
      expect(org2Result.find(s => s.staff_id === staff1._id.toString())).toBeUndefined();
    });

    it('should filter out inactive and archived staff', async () => {
      // Archive staff1
      await Staff.findByIdAndUpdate(staff1._id, {
        $set: { is_archived: true }
      });

      // Inactivate staff2
      await Staff.findByIdAndUpdate(staff2._id, {
        $set: { is_active: false }
      });

      const result = await getOrganisationStaffEfficiency(org1);
      expect(result).toHaveLength(0); // No active, non-archived staff in org1
    });

    it('should return efficiency status categories correctly', async () => {
      // Create multiple staff with different efficiency levels
      const staff3 = await Staff.create({
        name: 'Bob Johnson',
        email: 'bob@org1.com',
        organisation_id: org1,
        is_active: true,
        is_archived: false,
        efficiency_tracking: {
          cumulative_efficiency: 95,
          total_budgeted_hours: 100,
          total_logged_hours: 95,
          last_updated_at: new Date(),
          efficiency_history: []
        }
      });

      const staff4 = await Staff.create({
        name: 'Alice Brown',
        email: 'alice@org1.com',
        organisation_id: org1,
        is_active: true,
        is_archived: false,
        efficiency_tracking: {
          cumulative_efficiency: 75,
          total_budgeted_hours: 80,
          total_logged_hours: 60,
          last_updated_at: new Date(),
          efficiency_history: []
        }
      });

      const staff5 = await Staff.create({
        name: 'Charlie Wilson',
        email: 'charlie@org1.com',
        organisation_id: org1,
        is_active: true,
        is_archived: false,
        efficiency_tracking: {
          cumulative_efficiency: null,
          total_budgeted_hours: 0,
          total_logged_hours: 0,
          last_updated_at: null,
          efficiency_history: []
        }
      });

      const result = await getOrganisationStaffEfficiency(org1);
      
      const excellent = result.filter(s => s.efficiency_status === 'Excellent');
      const good = result.filter(s => s.efficiency_status === 'Good');
      const needsImprovement = result.filter(s => s.efficiency_status === 'Needs Improvement');
      const noData = result.filter(s => s.efficiency_status === 'No Data');

      expect(excellent).toHaveLength(0); // 95% is Good, not Excellent
      expect(good).toHaveLength(2); // staff1 (90%) and staff3 (95%)
      expect(needsImprovement).toHaveLength(1); // staff4 (75%)
      expect(noData).toHaveLength(1); // staff5 (no data)
    });

    it('should handle organization with no staff', async () => {
      const org3 = new mongoose.Types.ObjectId();
      const result = await getOrganisationStaffEfficiency(org3);
      expect(result).toHaveLength(0);
    });
  });

  describe('Edge Cases and Error Handling', () => {
    it('should handle zero budgeted hours gracefully', async () => {
      const result = await updateStaffEfficiency(
        staff1._id,
        0,   // Zero budgeted hours
        0,   // Zero logged hours
        org1
      );

      expect(result.cumulative_efficiency).toBe(0); // 0/0 * 100 = 0
      expect(result.total_budgeted_hours).toBe(0);
      expect(result.total_logged_hours).toBe(0);
    });

    it('should handle negative hours gracefully (should not happen in real scenario)', async () => {
      const result = await updateStaffEfficiency(
        staff1._id,
        100,
        -20, // Negative logged hours (edge case)
        org1
      );

      expect(result.total_logged_hours).toBe(-20);
      expect(result.cumulative_efficiency).toBe(-20); // -20/100 * 100 = -20
    });

    it('should handle very large numbers gracefully', async () => {
      const result = await updateStaffEfficiency(
        staff1._id,
        1000000, // Large budgeted hours
        800000,  // Large logged hours
        org1
      );

      expect(result.cumulative_efficiency).toBe(80); // 800000/1000000 * 100 = 80
      expect(result.total_budgeted_hours).toBe(1000000);
      expect(result.total_logged_hours).toBe(800000);
    });
  });
});