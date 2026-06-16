import { strict as assert } from 'assert';
import test from 'node:test';
import mongoose from 'mongoose';
import Staff from '../../src/models/Staff.js';
import { updateStaffEfficiency, getStaffEfficiencyHistory, getOrganisationStaffEfficiency } from '../../src/services/staffEfficiencyService.js';

test.describe('Staff Efficiency Service - Organization Isolation Tests', () => {
  let org1, org2, staff1, staff2;

  test.beforeAll(async () => {
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
  });

  test.afterAll(async () => {
    await mongoose.connection.close();
  });

  test.beforeEach(async () => {
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

  test('should update staff efficiency for correct organization', async () => {
    const result = await updateStaffEfficiency(
      staff1._id,
      100, // jobBudgetedHours
      80,  // jobLoggedHours
      org1  // organisationId
    );

    assert.equal(result.staff_id, staff1._id.toString());
    assert.equal(result.cumulative_efficiency, 80); // 80/100 * 100
    assert.equal(result.total_budgeted_hours, 100);
    assert.equal(result.total_logged_hours, 80);

    // Verify staff record in database
    const updatedStaff = await Staff.findById(staff1._id);
    assert.equal(updatedStaff.efficiency_tracking.total_budgeted_hours, 100);
    assert.equal(updatedStaff.efficiency_tracking.total_logged_hours, 80);
    assert.equal(updatedStaff.efficiency_tracking.cumulative_efficiency, 80);
  });

  test('should throw error for organization mismatch', async () => {
    await assert.rejects(
      async () => {
        await updateStaffEfficiency(
          staff1._id,
          100,
          80,
          org2  // Wrong organization
        );
      },
      /Organization mismatch in staff efficiency update/
    );
  });

  test('should throw error for staff not found in organization', async () => {
    await assert.rejects(
      async () => {
        await updateStaffEfficiency(
          new mongoose.Types.ObjectId(), // Non-existent staff
          100,
          80,
          org1
        );
      },
      /Staff member not found in this organization/
    );
  });

  test('should handle multiple efficiency updates with weighted average', async () => {
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
    assert.equal(result.total_budgeted_hours, 150); // 100 + 50
    assert.equal(result.total_logged_hours, 125); // 80 + 45
    assert.equal(result.current_efficiency, 83.33); // 125/150 * 100 = 83.33
  });

  test('should return staff efficiency history for correct organization', async () => {
    // First update to create history
    await updateStaffEfficiency(
      staff1._id,
      100,
      80,
      org1
    );

    const result = await getStaffEfficiencyHistory(staff1._id, org1);
    
    assert.equal(result.staff_id, staff1._id.toString());
    assert.equal(result.name, 'John Doe');
    assert.equal(result.role, 'Accountant');
    assert.equal(result.current_efficiency, 80);
    assert.equal(result.total_budgeted_hours, 100);
    assert.equal(result.total_logged_hours, 80);
    assert.ok(result.last_updated_at);
    assert.equal(result.recent_completations.length, 1);
  });

  test('should throw error for organization mismatch when retrieving history', async () => {
    await assert.rejects(
      async () => {
        await getStaffEfficiencyHistory(
          staff1._id,
          org2  // Wrong organization
        );
      },
      /Organization mismatch in staff efficiency retrieval/
    );
  });

  test('should return efficiency status correctly', async () => {
    // Test Excellent performance (>= 100%)
    await updateStaffEfficiency(
      staff1._id,
      100,
      120,
      org1
    );

    let result = await getStaffEfficiencyHistory(staff1._id, org1);
    assert.equal(result.current_efficiency, 120);

    // Test Good performance (>= 80% and < 100%)
    await Staff.findByIdAndUpdate(staff1._id, {
      $set: { 'efficiency_tracking.cumulative_efficiency': 85 }
    });
    
    result = await getStaffEfficiencyHistory(staff1._id, org1);
    assert.equal(result.current_efficiency, 85);

    // Test Needs Improvement (< 80%)
    await Staff.findByIdAndUpdate(staff1._id, {
      $set: { 'efficiency_tracking.cumulative_efficiency': 75 }
    });

    result = await getStaffEfficiencyHistory(staff1._id, org1);
    assert.equal(result.current_efficiency, 75);
  });

  test('should handle staff with no efficiency data', async () => {
    const result = await getStaffEfficiencyHistory(staff1._id, org1);
    
    assert.equal(result.current_efficiency, null);
    assert.equal(result.total_budgeted_hours, 0);
    assert.equal(result.total_logged_hours, 0);
    assert.equal(result.last_updated_at, null);
    assert.equal(result.recent_completations.length, 0);
  });

  test('should return efficiency overview for correct organization only', async () => {
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
    assert.equal(org1Result.length, 1);
    assert.equal(org1Result[0].staff_id, staff1._id.toString());
    assert.equal(org1Result[0].current_efficiency, 90);
    assert.equal(org1Result[0].efficiency_status, 'Good');

    // Get org2 efficiency
    const org2Result = await getOrganisationStaffEfficiency(org2);
    assert.equal(org2Result.length, 1);
    assert.equal(org2Result[0].staff_id, staff2._id.toString());
    assert.equal(org2Result[0].current_efficiency, 80);
    assert.equal(org2Result[0].efficiency_status, 'Good');

    // Verify data isolation - org1 should not see org2 staff
    assert.equal(org1Result.find(s => s.staff_id === staff2._id.toString()), undefined);
    assert.equal(org2Result.find(s => s.staff_id === staff1._id.toString()), undefined);
  });

  test('should filter out inactive and archived staff', async () => {
    // Archive staff1
    await Staff.findByIdAndUpdate(staff1._id, {
      $set: { is_archived: true }
    });

    // Inactivate staff2
    await Staff.findByIdAndUpdate(staff2._id, {
      $set: { is_active: false }
    });

    const result = await getOrganisationStaffEfficiency(org1);
    assert.equal(result.length, 0); // No active, non-archived staff in org1
  });

  test('should handle edge case of zero budgeted hours', async () => {
    const result = await updateStaffEfficiency(
      staff1._id,
      0,   // Zero budgeted hours
      0,   // Zero logged hours
      org1
    );

    assert.equal(result.cumulative_efficiency, 0); // 0/0 * 100 = 0
    assert.equal(result.total_budgeted_hours, 0);
    assert.equal(result.total_logged_hours, 0);
  });

  test('should handle very large numbers gracefully', async () => {
    const result = await updateStaffEfficiency(
      staff1._id,
      1000000, // Large budgeted hours
      800000,  // Large logged hours
      org1
    );

    assert.equal(result.cumulative_efficiency, 80); // 800000/1000000 * 100 = 80
    assert.equal(result.total_budgeted_hours, 1000000);
    assert.equal(result.total_logged_hours, 800000);
  });
});