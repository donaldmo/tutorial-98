import { strict as assert } from 'assert';
import test from 'node:test';
import mongoose from 'mongoose';
import Staff from '../../src/models/Staff.js';
import { updateStaffEfficiency } from '../../src/services/staffEfficiencyService.js';

test.describe('Staff Efficiency Integration Tests', () => {
  let org1, org2, staff1, staff2;

  test.beforeAll(async () => {
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
  });

  test.afterAll(async () => {
    await mongoose.connection.close();
  });

  test.beforeEach(async () => {
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

  test('should maintain organization isolation when updating staff efficiency', async () => {
    // Update staff1 efficiency directly
    await updateStaffEfficiency(
      staff1._id,
      100,
      80,
      org1
    );

    // Verify staff1 efficiency changed
    const staff1Updated = await Staff.findById(staff1._id);
    assert.equal(staff1Updated.efficiency_tracking.total_budgeted_hours, 100);
    assert.equal(staff1Updated.efficiency_tracking.total_logged_hours, 80);
    assert.equal(staff1Updated.efficiency_tracking.cumulative_efficiency, 80);

    // Verify staff2 efficiency unchanged (different organization)
    const staff2Updated = await Staff.findById(staff2._id);
    assert.equal(staff2Updated.efficiency_tracking.total_budgeted_hours, 0);
    assert.equal(staff2Updated.efficiency_tracking.total_logged_hours, 0);
    assert.equal(staff2Updated.efficiency_tracking.cumulative_efficiency, null);
  });

  test('should handle multiple efficiency updates with weighted averaging', async () => {
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
    assert.equal(staffUpdated.efficiency_tracking.total_budgeted_hours, 300); // 100 + 200
    assert.equal(staffUpdated.efficiency_tracking.total_logged_hours, 240); // 90 + 150
    assert.equal(staffUpdated.efficiency_tracking.cumulative_efficiency, 80); // 240/300 * 100 = 80

    // Verify efficiency history
    assert.equal(staffUpdated.efficiency_tracking.efficiency_history.length, 2);
    assert.equal(staffUpdated.efficiency_tracking.efficiency_history[0].efficiency_percentage, 90);
    assert.equal(staffUpdated.efficiency_tracking.efficiency_history[1].efficiency_percentage, 80);
  });

  test('should maintain organization integrity across all operations', async () => {
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

    assert.equal(org1Staff.efficiency_tracking.total_budgeted_hours, 100);
    assert.equal(org1Staff.efficiency_tracking.total_logged_hours, 95);
    assert.equal(org1Staff.efficiency_tracking.cumulative_efficiency, 95);

    assert.equal(org2Staff.efficiency_tracking.total_budgeted_hours, 80);
    assert.equal(org2Staff.efficiency_tracking.total_logged_hours, 64);
    assert.equal(org2Staff.efficiency_tracking.cumulative_efficiency, 80);

    // Verify no cross-contamination
    assert.notEqual(
      org1Staff.efficiency_tracking.total_budgeted_hours,
      org2Staff.efficiency_tracking.total_budgeted_hours
    );
    assert.notEqual(
      org1Staff.efficiency_tracking.total_logged_hours,
      org2Staff.efficiency_tracking.total_logged_hours
    );
  });

  test('should handle partial completions and incremental updates', async () => {
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
    assert.equal(staffUpdated.efficiency_tracking.total_budgeted_hours, 80); // 50 + 30
    assert.equal(staffUpdated.efficiency_tracking.total_logged_hours, 67); // 40 + 27
    assert.equal(staffUpdated.efficiency_tracking.cumulative_efficiency, 83.75); // 67/80 * 100 = 83.75

    // Verify efficiency history contains all entries
    assert.equal(staffUpdated.efficiency_tracking.efficiency_history.length, 2);
    assert.equal(staffUpdated.efficiency_tracking.efficiency_history[0].efficiency_percentage, 80); // 40/50 * 100
    assert.equal(staffUpdated.efficiency_tracking.efficiency_history[1].efficiency_percentage, 83.75); // 67/80 * 100
  });

  test('should handle organization with no staff', async () => {
    const org3 = new mongoose.Types.ObjectId();
    const result = await getOrganisationStaffEfficiency(org3);
    assert.equal(result.length, 0);
  });

  test('should return efficiency status categories correctly', async () => {
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

    assert.equal(excellent.length, 0); // 95% is Good, not Excellent
    assert.equal(good.length, 2); // staff1 (90%) and staff3 (95%)
    assert.equal(needsImprovement.length, 1); // staff4 (75%)
    assert.equal(noData.length, 1); // staff5 (no data)
  });
});