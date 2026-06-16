import { strict as assert } from 'assert';
import test from 'node:test';
import mongoose from 'mongoose';

import Allocation from '../../src/models/Allocation.js';
import Department from '../../src/models/Department.js';
import Job from '../../src/models/Job.js';
import Staff from '../../src/models/Staff.js';
import { reportCapacityPlanning } from '../../src/controllers/reportsController.js';

const cleanupOrgData = async (orgId) => {
  await Promise.all([
    Allocation.deleteMany({ organisation_id: orgId }),
    Job.deleteMany({ organisation_id: orgId }),
    Staff.deleteMany({ organisation_id: orgId }),
    Department.deleteMany({ organisation_id: orgId }),
  ]);
};

const invokeCapacityPlanning = async (req) => new Promise((resolve, reject) => {
  reportCapacityPlanning(
    req,
    {
      json(payload) {
        resolve(payload);
        return payload;
      },
    },
    reject,
  );
});

test.describe('reportCapacityPlanning', () => {
  test('uses month-scoped staff summaries, resolves departments, and includes inactive assigned staff', async (t) => {
    let openedConnection = false;
    if (mongoose.connection.readyState === 0) {
      try {
        await mongoose.connect(process.env.MONGODB_TEST_URI || 'mongodb://localhost:27017/test', {
          serverSelectionTimeoutMS: 1000,
        });
        openedConnection = true;
      } catch {
        t.skip('MongoDB is not available for capacity planning integration coverage');
        return;
      }
    }

    const orgId = new mongoose.Types.ObjectId();

    try {
      const auditDepartment = await Department.create({
        name: 'Audit',
        code: 'AUD',
        organisation_id: orgId,
        is_active: true,
      });

      const [overloadedStaff, optimalStaff, inactiveAssignedStaff] = await Staff.create([
        {
          name: 'Overloaded Audit',
          email: `capacity.overloaded.${Date.now()}@example.com`,
          organisation_id: orgId,
          role: 'Manager',
          department_id: auditDepartment._id.toString(),
          hours_per_day: 8,
          productivity_factor: 1,
          is_active: true,
          is_archived: false,
        },
        {
          name: 'Optimal Audit',
          email: `capacity.optimal.${Date.now()}@example.com`,
          organisation_id: orgId,
          role: 'Accountant',
          department_id: auditDepartment._id.toString(),
          hours_per_day: 8,
          productivity_factor: 1,
          is_active: true,
          is_archived: false,
        },
        {
          name: 'Inactive Assigned Tax',
          email: `capacity.inactive.${Date.now()}@example.com`,
          organisation_id: orgId,
          role: 'Senior Accountant',
          hours_per_day: 8,
          productivity_factor: 1,
          is_active: false,
          is_archived: false,
        },
      ]);

      const [overloadedJob, optimalJob, julyJob, inactiveJob] = await Job.create([
        {
          name: 'Overloaded June Job',
          client_name: 'Client One',
          organisation_id: orgId,
          status: 'In Progress',
          job_fee: 1000,
        },
        {
          name: 'Optimal June Job',
          client_name: 'Client Two',
          organisation_id: orgId,
          status: 'Pending',
          job_fee: 600,
        },
        {
          name: 'Optimal July Job',
          client_name: 'Client Three',
          organisation_id: orgId,
          status: 'Pending',
          job_fee: 400,
        },
        {
          name: 'Inactive Staff June Job',
          client_name: 'Client Four',
          organisation_id: orgId,
          status: 'Pending',
          job_fee: 300,
        },
      ]);

      await Allocation.create([
        {
          job_id: overloadedJob._id,
          staff_id: overloadedStaff._id,
          percentage: 100,
          allocated_fee: 1000,
          calculated_hours: 200,
          adjusted_hours: 200,
          month: '2026-06',
          workflow_status: 'Doing',
          organisation_id: orgId,
        },
        {
          job_id: optimalJob._id,
          staff_id: optimalStaff._id,
          percentage: 100,
          allocated_fee: 600,
          calculated_hours: 100,
          adjusted_hours: 100,
          month: '2026-06',
          workflow_status: 'Pending',
          organisation_id: orgId,
        },
        {
          job_id: julyJob._id,
          staff_id: optimalStaff._id,
          percentage: 100,
          allocated_fee: 400,
          calculated_hours: 20,
          adjusted_hours: 20,
          month: '2026-07',
          workflow_status: 'Pending',
          organisation_id: orgId,
        },
        {
          job_id: inactiveJob._id,
          staff_id: inactiveAssignedStaff._id,
          percentage: 100,
          allocated_fee: 300,
          calculated_hours: 40,
          adjusted_hours: 40,
          month: '2026-06',
          workflow_status: 'Pending',
          organisation_id: orgId,
        },
      ]);

      const report = await invokeCapacityPlanning({
        query: { month: '2026-06' },
        user: { organisation_id: orgId },
      });

      assert.equal(report.report_name, 'Capacity Planning Report');
      assert.equal(report.month, '2026-06');
      assert.equal(report.summary.total_staff, 3);
      assert.equal(report.summary.overloaded_count, 1);
      assert.equal(report.summary.underutilized_count, 1);
      assert.equal(report.summary.optimal_count, 1);
      assert.equal(report.staff.length, 3);

      const overloadedRow = report.staff.find((row) => row.staff_id === overloadedStaff._id.toString());
      assert.ok(overloadedRow, 'Expected overloaded staff row');
      assert.equal(overloadedRow.staff_name, 'Overloaded Audit');
      assert.equal(overloadedRow.department, 'Audit');
      assert.equal(overloadedRow.allocated_hours, 200);
      assert.equal(overloadedRow.status, 'Overloaded');
      assert.ok(overloadedRow.capacity_hours > 0, 'Expected positive monthly capacity');
      assert.equal(overloadedRow.remaining_hours, overloadedRow.capacity_hours - overloadedRow.allocated_hours);
      assert.equal(overloadedRow.utilization_percentage, Number(((200 / overloadedRow.capacity_hours) * 100).toFixed(1)));

      const optimalRow = report.staff.find((row) => row.staff_id === optimalStaff._id.toString());
      assert.ok(optimalRow, 'Expected optimal staff row');
      assert.equal(optimalRow.department, 'Audit');
      assert.equal(optimalRow.allocated_hours, 100, 'July allocations should not be included');
      assert.equal(optimalRow.status, 'Optimal');
      assert.equal(optimalRow.remaining_hours, optimalRow.capacity_hours - 100);
      assert.ok(optimalRow.utilization_percentage >= 50 && optimalRow.utilization_percentage <= 100);

      const inactiveRow = report.staff.find((row) => row.staff_id === inactiveAssignedStaff._id.toString());
      assert.ok(inactiveRow, 'Expected inactive assigned staff row');
      assert.equal(inactiveRow.staff_name, 'Inactive Assigned Tax');
      assert.equal(inactiveRow.department, 'Unassigned');
      assert.equal(inactiveRow.allocated_hours, 40);
      assert.equal(inactiveRow.status, 'Underutilized');
      assert.equal(inactiveRow.remaining_hours, inactiveRow.capacity_hours - 40);
    } finally {
      await cleanupOrgData(orgId);
      if (openedConnection && mongoose.connection.readyState !== 0) {
        await mongoose.connection.close();
      }
    }
  });
});
