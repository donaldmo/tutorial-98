import { strict as assert } from 'assert';
import test from 'node:test';
import mongoose from 'mongoose';

import Allocation from '../../src/models/Allocation.js';
import Department from '../../src/models/Department.js';
import Job from '../../src/models/Job.js';
import Staff from '../../src/models/Staff.js';
import { reportRevenuePerEmployee } from '../../src/controllers/reportsController.js';

const cleanupOrgData = async (orgId) => {
  await Promise.all([
    Allocation.deleteMany({ organisation_id: orgId }),
    Job.deleteMany({ organisation_id: orgId }),
    Staff.deleteMany({ organisation_id: orgId }),
    Department.deleteMany({ organisation_id: orgId }),
  ]);
};

const invokeRevenuePerEmployee = async (req) => new Promise((resolve, reject) => {
  reportRevenuePerEmployee(
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

test.describe('reportRevenuePerEmployee', () => {
  test('uses allocated fees, 50 percent cost ratio, department team rollups, and month scoping', async (t) => {
    let openedConnection = false;
    if (mongoose.connection.readyState === 0) {
      try {
        await mongoose.connect(process.env.MONGODB_TEST_URI || 'mongodb://localhost:27017/test', {
          serverSelectionTimeoutMS: 1000,
        });
        openedConnection = true;
      } catch {
        t.skip('MongoDB is not available for revenue per employee integration coverage');
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

      const alice = await Staff.create({
        name: 'Alice Audit',
        email: `alice.${Date.now()}@example.com`,
        organisation_id: orgId,
        role: 'Manager',
        hourly_rate: 100,
        department_id: auditDepartment._id.toString(),
        is_active: true,
        is_archived: false,
      });

      const brian = await Staff.create({
        name: 'Brian Review',
        email: `brian.${Date.now()}@example.com`,
        organisation_id: orgId,
        role: 'Accountant',
        hourly_rate: 120,
        department_id: auditDepartment._id.toString(),
        is_active: true,
        is_archived: false,
      });

      const cara = await Staff.create({
        name: 'Cara Unassigned',
        email: `cara.${Date.now()}@example.com`,
        organisation_id: orgId,
        role: 'Junior Accountant',
        hourly_rate: 0,
        is_active: true,
        is_archived: false,
      });

      const [jobOne, jobTwo, jobThree, julyJob] = await Job.create([
        {
          name: 'June Audit',
          client_name: 'Client One',
          organisation_id: orgId,
          status: 'In Progress',
          job_fee: 1000,
        },
        {
          name: 'June Review',
          client_name: 'Client Two',
          organisation_id: orgId,
          status: 'Pending',
          job_fee: 500,
        },
        {
          name: 'June Support',
          client_name: 'Client Three',
          organisation_id: orgId,
          status: 'Pending',
          job_fee: 200,
        },
        {
          name: 'July Work',
          client_name: 'Client Four',
          organisation_id: orgId,
          status: 'Pending',
          job_fee: 999,
        },
      ]);

      await Allocation.create([
        {
          job_id: jobOne._id,
          staff_id: alice._id,
          percentage: 100,
          allocated_fee: 1000,
          calculated_hours: 10,
          adjusted_hours: 10,
          month: '2026-06',
          workflow_status: 'Doing',
          organisation_id: orgId,
        },
        {
          job_id: jobTwo._id,
          staff_id: brian._id,
          percentage: 100,
          allocated_fee: 500,
          calculated_hours: 5,
          adjusted_hours: 5,
          month: '2026-06',
          workflow_status: 'Pending',
          organisation_id: orgId,
        },
        {
          job_id: jobThree._id,
          staff_id: cara._id,
          percentage: 100,
          allocated_fee: 200,
          calculated_hours: 4,
          adjusted_hours: 4,
          month: '2026-06',
          workflow_status: 'Pending',
          organisation_id: orgId,
        },
        {
          job_id: julyJob._id,
          staff_id: alice._id,
          percentage: 100,
          allocated_fee: 999,
          calculated_hours: 9,
          adjusted_hours: 9,
          month: '2026-07',
          workflow_status: 'Pending',
          organisation_id: orgId,
        },
      ]);

      const report = await invokeRevenuePerEmployee({
        query: { month: '2026-06' },
        user: { organisation_id: orgId },
      });

      assert.equal(report.report_name, 'Revenue per Employee / per Team');
      assert.equal(report.month, '2026-06');
      assert.equal(report.summary.total_allocated_revenue, 1700);
      assert.equal(report.summary.total_estimated_cost, 900);
      assert.equal(report.summary.total_net_contribution, 800);
      assert.equal(report.summary.total_staff, 3);
      assert.equal(report.summary.total_teams, 2);
      assert.equal(report.summary.average_revenue_per_head, 566.67);

      const aliceRow = report.staff.find((row) => row.staff_id === alice._id.toString());
      assert.ok(aliceRow, 'Expected Alice staff row');
      assert.equal(aliceRow.department_name, 'Audit');
      assert.equal(aliceRow.allocated_hours, 10);
      assert.equal(aliceRow.allocated_revenue, 1000);
      assert.equal(aliceRow.estimated_cost, 500);
      assert.equal(aliceRow.net_contribution, 500);

      const caraRow = report.staff.find((row) => row.staff_id === cara._id.toString());
      assert.ok(caraRow, 'Expected Cara staff row');
      assert.equal(caraRow.department_name, 'Unassigned');
      assert.equal(caraRow.allocated_revenue, 200);
      assert.equal(caraRow.estimated_cost, 100);
      assert.equal(caraRow.net_contribution, 100);

      const auditTeam = report.teams.find((row) => row.department_name === 'Audit');
      assert.ok(auditTeam, 'Expected Audit team row');
      assert.equal(auditTeam.staff_count, 2);
      assert.equal(auditTeam.allocated_revenue, 1500);
      assert.equal(auditTeam.estimated_cost, 800);
      assert.equal(auditTeam.net_contribution, 700);
      assert.equal(auditTeam.revenue_per_head, 750);

      const unassignedTeam = report.teams.find((row) => row.department_name === 'Unassigned');
      assert.ok(unassignedTeam, 'Expected Unassigned team row');
      assert.equal(unassignedTeam.staff_count, 1);
      assert.equal(unassignedTeam.allocated_revenue, 200);
      assert.equal(unassignedTeam.estimated_cost, 100);
      assert.equal(unassignedTeam.net_contribution, 100);
      assert.equal(unassignedTeam.revenue_per_head, 200);
    } finally {
      await cleanupOrgData(orgId);
      if (openedConnection && mongoose.connection.readyState !== 0) {
        await mongoose.connection.close();
      }
    }
  });

  test('includes assigned inactive staff so department rollups do not fall back to Unassigned', async (t) => {
    let openedConnection = false;
    if (mongoose.connection.readyState === 0) {
      try {
        await mongoose.connect(process.env.MONGODB_TEST_URI || 'mongodb://localhost:27017/test', {
          serverSelectionTimeoutMS: 1000,
        });
        openedConnection = true;
      } catch {
        t.skip('MongoDB is not available for revenue per employee integration coverage');
        return;
      }
    }

    const orgId = new mongoose.Types.ObjectId();

    try {
      const taxDepartment = await Department.create({
        name: 'Tax',
        code: 'TAX',
        organisation_id: orgId,
        is_active: true,
      });

      const inactiveStaff = await Staff.create({
        name: 'Inactive Tax Staff',
        email: `inactive.tax.${Date.now()}@example.com`,
        organisation_id: orgId,
        role: 'Accountant',
        hourly_rate: 150,
        department_id: taxDepartment._id.toString(),
        is_active: false,
        is_archived: false,
      });

      const taxJob = await Job.create({
        name: 'Tax Return',
        client_name: 'Client Five',
        organisation_id: orgId,
        status: 'Pending',
        job_fee: 600,
      });

      await Allocation.create({
        job_id: taxJob._id,
        staff_id: inactiveStaff._id,
        percentage: 100,
        allocated_fee: 600,
        calculated_hours: 4,
        adjusted_hours: 4,
        month: '2026-06',
        workflow_status: 'Pending',
        organisation_id: orgId,
      });

      const report = await invokeRevenuePerEmployee({
        query: { month: '2026-06' },
        user: { organisation_id: orgId },
      });

      const staffRow = report.staff.find((row) => row.staff_id === inactiveStaff._id.toString());
      assert.ok(staffRow, 'Expected inactive assigned staff row');
      assert.equal(staffRow.staff_name, 'Inactive Tax Staff');
      assert.equal(staffRow.department_name, 'Tax');

      const teamRow = report.teams.find((row) => row.department_name === 'Tax');
      assert.ok(teamRow, 'Expected Tax team row');
      assert.equal(teamRow.staff_count, 1);
      assert.equal(teamRow.allocated_revenue, 600);
    } finally {
      await cleanupOrgData(orgId);
      if (openedConnection && mongoose.connection.readyState !== 0) {
        await mongoose.connection.close();
      }
    }
  });
});
