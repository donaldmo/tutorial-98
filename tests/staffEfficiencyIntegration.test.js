import mongoose from 'mongoose';
import Staff from '../models/Staff.js';
import Allocation from '../models/Allocation.js';
import TimeEntry from '../models/TimeEntry.js';
import { completeAllocationComponent } from '../controllers/allocationsController.js';
import { updateStaffEfficiency } from '../services/staffEfficiencyService.js';

describe('Complete Staff Efficiency Integration Test', () => {
  let org1, org2, staff1, staff2, job1, job2, allocation1, allocation2;

  beforeAll(async () => {
    await mongoose.connect(process.env.MONGODB_TEST_URI || 'mongodb://localhost:27017/test');
    
    org1 = new mongoose.Types.ObjectId();
    org2 = new mongoose.Types.ObjectId();
    
    // Create test staff
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

    // Create test allocations
    const currentMonth = new Date().toISOString().slice(0, 7);
    
    allocation1 = await Allocation.create({
      staff_id: staff1._id,
      job_id: job1,
      organisation_id: org1,
      month: currentMonth,
      adjusted_hours: 100,
      workflow_status: 'Not Started',
      created_at: new Date(),
      organisation_id: org1
    });

    allocation2 = await Allocation.create({
      staff_id: staff2._id,
      job_id: job2,
      organisation_id: org2,
      month: currentMonth,
      adjusted_hours: 80,
      workflow_status: 'Not Started',
      created_at: new Date(),
      organisation_id: org2
    });
  });

  afterAll(async () => {
    await mongoose.connection.close();
  });

  beforeEach(async () => {
    // Reset efficiency tracking
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

  describe('End-to-End Staff Efficiency Flow', () => {
    it('should update staff efficiency when allocation is completed', async () => {
      // Mock request object
      const mockReq = {
        params: { allocation_id: allocation1._id },
        body: { completed_at: new Date().toISOString(), timezone: 'UTC' },
        user: {
          _id: new mongoose.Types.ObjectId(),
          organisation_id: org1
        }
      };

      const mockRes = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn()
      };

      // Mock helper functions
      jest.spyOn(Allocation, 'findById').mockResolvedValue(allocation1);
      jest.spyOn(Allocation, 'find').mockResolvedValue([]);
      jest.fn().mockResolvedValue({ ok: true });
      jest.fn().mockResolvedValue(true);
      jest.fn().mockResolvedValue(allocation1);
      jest.fn().mockResolvedValue(null);
      jest.fn().mockResolvedValue({ allocation: allocation1, job_status: 'Completed' });

      // Mock time tracking functions
      jest.fn().mockReturnValue(new Date());
      jest.fn().mockReturnValue(0);
      jest.fn().mockReturnValue(0);

      // Execute the controller function
      await completeAllocationComponent(mockReq, mockRes);

      // Verify staff efficiency was updated
      const updatedStaff = await Staff.findById(staff1._id);
      expect(updatedStaff.efficiency_tracking.total_budgeted_hours).toBe(100);
      expect(updatedStaff.efficiency_tracking.total_logged_hours).toBe(0); // No time entries yet
      expect(updatedStaff.efficiency_tracking.cumulative_efficiency).toBe(0);
    });

    it('should maintain organization isolation when updating staff efficiency', async () => {
      // Update staff1 efficiency directly
      await updateStaffEfficiency(
        staff1._id,
        100,
        80,
        org1
      );

      // Verify staff1 efficiency changed
      const staff1Updated = await Staff.findById(staff1._id);
      expect(staff1Updated.efficiency_tracking.total_budgeted_hours).toBe(100);
      expect(staff1Updated.efficiency_tracking.total_logged_hours).toBe(80);
      expect(staff1Updated.efficiency_tracking.cumulative_efficiency).toBe(80);

      // Verify staff2 efficiency unchanged (different organization)
      const staff2Updated = await Staff.findById(staff2._id);
      expect(staff2Updated.efficiency_tracking.total_budgeted_hours).toBe(0);
      expect(staff2Updated.efficiency_tracking.total_logged_hours).toBe(0);
      expect(staff2Updated.efficiency_tracking.cumulative_efficiency).toBeNull();
    });

    it('should handle multiple efficiency updates with weighted averaging', async () => {
      // First job completion
      await updateStaffEfficiency(
        staff1._id,
        100, // budgeted
        90,  // logged (90% efficiency)
        org1
      );

      // Second job completion with different efficiency
      await updateStaffEfficiency(
        staff1._id,
        200, // additional budgeted
        150, // additional logged (75% efficiency)
        org1
      );

      // Verify weighted average calculation
      const staffUpdated = await Staff.findById(staff1._id);
      expect(staffUpdated.efficiency_tracking.total_budgeted_hours).toBe(300); // 100 + 200
      expect(staffUpdated.efficiency_tracking.total_logged_hours).toBe(240); // 90 + 150
      expect(staffUpdated.efficiency_tracking.cumulative_efficiency).toBe(80); // 240/300 * 100 = 80

      // Verify efficiency history
      expect(staffUpdated.efficiency_tracking.efficiency_history).toHaveLength(2);
      expect(staffUpdated.efficiency_tracking.efficiency_history[0].efficiency_percentage).toBe(90);
      expect(staffUpdated.efficiency_tracking.efficiency_history[1].efficiency_percentage).toBe(80);
    });

    it('should handle time entries and actual logged hours', async () => {
      // Create time entries for allocation1
      await TimeEntry.create({
        allocation_id: allocation1._id,
        hours_worked: 85,
        date: new Date(),
        organisation_id: org1
      });

      // Update staff efficiency with actual logged hours
      await updateStaffEfficiency(
        staff1._id,
        allocation1.adjusted_hours,
        85, // Actual logged hours from time entries
        org1
      );

      const staffUpdated = await Staff.findById(staff1._id);
      expect(staffUpdated.efficiency_tracking.total_logged_hours).toBe(85);
      expect(staffUpdated.efficiency_tracking.cumulative_efficiency).toBe(85); // 85/100 * 100
    });

    it('should maintain organization integrity across all operations', async () => {
      // Update org1 staff
      await updateStaffEfficiency(
        staff1._id,
        100,
        95,
        org1
      );

      // Update org2 staff
      await updateStaffEfficiency(
        staff2._id,
        80,
        64,
        org2
      );

      // Verify both organizations have correct data
      const org1Staff = await Staff.findById(staff1._id);
      const org2Staff = await Staff.findById(staff2._id);

      expect(org1Staff.efficiency_tracking.total_budgeted_hours).toBe(100);
      expect(org1Staff.efficiency_tracking.total_logged_hours).toBe(95);
      expect(org1Staff.efficiency_tracking.cumulative_efficiency).toBe(95);

      expect(org2Staff.efficiency_tracking.total_budgeted_hours).toBe(80);
      expect(org2Staff.efficiency_tracking.total_logged_hours).toBe(64);
      expect(org2Staff.efficiency_tracking.cumulative_efficiency).toBe(80);

      // Verify no cross-contamination
      expect(org1Staff.efficiency_tracking.total_budgeted_hours).not.toBe(org2Staff.efficiency_tracking.total_budgeted_hours);
      expect(org1Staff.efficiency_tracking.total_logged_hours).not.toBe(org2Staff.efficiency_tracking.total_logged_hours);
    });

    it('should handle edge case of zero budgeted hours', async () => {
      // Create allocation with zero hours
      const zeroAllocation = await Allocation.create({
        staff_id: staff1._id,
        job_id: job1,
        organisation_id: org1,
        month: new Date().toISOString().slice(0, 7),
        adjusted_hours: 0,
        workflow_status: 'Not Started',
        created_at: new Date(),
        organisation_id: org1
      });

      // Update efficiency with zero budgeted hours
      await updateStaffEfficiency(
        staff1._id,
        0,
        0,
        org1
      );

      const staffUpdated = await Staff.findById(staff1._id);
      expect(staffUpdated.efficiency_tracking.total_budgeted_hours).toBe(0);
      expect(staffUpdated.efficiency_tracking.total_logged_hours).toBe(0);
      expect(staffUpdated.efficiency_tracking.cumulative_efficiency).toBe(0);
    });

    it('should handle partial completions and incremental updates', async () => {
      // First partial completion
      await updateStaffEfficiency(
        staff1._id,
        50,
        40,
        org1
      );

      // Second partial completion
      await updateStaffEfficiency(
        staff1._id,
        30,
        27,
        org1
      );

      // Verify incremental updates
      const staffUpdated = await Staff.findById(staff1._id);
      expect(staffUpdated.efficiency_tracking.total_budgeted_hours).toBe(80); // 50 + 30
      expect(staffUpdated.efficiency_tracking.total_logged_hours).toBe(67); // 40 + 27
      expect(staffUpdated.efficiency_tracking.cumulative_efficiency).toBe(83.75); // 67/80 * 100 = 83.75

      // Verify efficiency history contains all entries
      expect(staffUpdated.efficiency_tracking.efficiency_history).toHaveLength(2);
      expect(staffUpdated.efficiency_tracking.efficiency_history[0].efficiency_percentage).toBe(80); // 40/50 * 100
      expect(staffUpdated.efficiency_tracking.efficiency_history[1].efficiency_percentage).toBe(83.75); // 67/80 * 100
    });
  });

  describe('API Integration Tests', () => {
    it('should return correct staff efficiency via API endpoint', async () => {
      // Update staff efficiency first
      await updateStaffEfficiency(
        staff1._id,
        100,
        85,
        org1
      );

      // Mock API request
      const mockReq = {
        params: { staff_id: staff1._id },
        user: {
          _id: new mongoose.Types.ObjectId(),
          organisation_id: org1
        }
      };

      const mockRes = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn()
      };

      // Mock controller function
      jest.spyOn(Staff, 'findOne').mockResolvedValue(staff1);
      const { getStaffEfficiencyHistory } = await import('../services/staffEfficiencyService.js');
      jest.spyOn({ getStaffEfficiencyHistory }, 'getStaffEfficiencyHistory')
        .mockResolvedValue({
          staff_id: staff1._id.toString(),
          name: 'John Doe',
          role: 'Accountant',
          current_efficiency: 85,
          total_budgeted_hours: 100,
          total_logged_hours: 85,
          last_updated_at: new Date(),
          recent_completions: []
        });

      // Mock the controller
      const { getStaffEfficiency } = await import('../controllers/allocationsController.js');
      await getStaffEfficiency(mockReq, mockRes);

      // Verify API response
      expect(mockRes.json).toHaveBeenCalledWith({
        staff_id: staff1._id.toString(),
        name: 'John Doe',
        role: 'Accountant',
        efficiency_tracking: {
          staff_id: staff1._id.toString(),
          name: 'John Doe',
          role: 'Accountant',
          current_efficiency: 85,
          total_budgeted_hours: 100,
          total_logged_hours: 85,
          last_updated_at: expect.any(Date),
          recent_completations: []
        }
      });
    });

    it('should maintain organization isolation in API calls', async () => {
      // Try to access org2 staff from org1 context
      const mockReq = {
        params: { staff_id: staff2._id },
        user: {
          _id: new mongoose.Types.ObjectId(),
          organisation_id: org1 // Different organization
        }
      };

      const mockRes = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn()
      };

      // Mock Staff.findOne to return null (staff not found in org1)
      jest.spyOn(Staff, 'findOne').mockResolvedValue(null);

      const { getStaffEfficiency } = await import('../controllers/allocationsController.js');
      await getStaffEfficiency(mockReq, mockRes);

      // Verify access denied
      expect(mockRes.status).toHaveBeenCalledWith(404);
      expect(mockRes.json).toHaveBeenCalledWith({ detail: 'Staff member not found in this organization' });
    });
  });
});