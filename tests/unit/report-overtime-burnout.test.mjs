import { strict as assert } from 'assert';
import test from 'node:test';
import mongoose from 'mongoose';

import Allocation from '../../src/models/Allocation.js';
import Job from '../../src/models/Job.js';
import Staff from '../../src/models/Staff.js';
import TimeEntry from '../../src/models/TimeEntry.js';
import { reportOvertimeBurnout } from '../../src/controllers/reportsController.js';

const cleanupOrgData = async (orgId) => {
  await Promise.all([
    TimeEntry.deleteMany({ organisation_id: orgId }),
    Allocation.deleteMany({ organisation_id: orgId }),
    Job.deleteMany({ organisation_id: orgId }),
    Staff.deleteMany({ organisation_id: orgId }),
  ]);
};

const invokeOvertimeBurnout = async (req) => new Promise((resolve, reject) => {
  reportOvertimeBurnout(
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

test.describe('reportOvertimeBurnout', () => {
  test('uses month-scoped hours, full risk rules, total overtime summary, and includes inactive assigned staff', async (t) => {
    let openedConnection = false;
    if (mongoose.connection.readyState === 0) {
      try {
        await mongoose.connect(process.env.MONGODB_TEST_URI || 'mongodb://localhost:27017/test', {
          serverSelectionTimeoutMS: 1000,
        });
        openedConnection = true;
      } catch {
        t.skip('MongoDB is not available for overtime burnout integration coverage');
        return;
      }
    }

    const orgId = new mongoose.Types.ObjectId();

    try {
      const [highStaff, mediumStaff, lowStaff, inactiveStaff] = await Staff.create([
        {
          name: 'High Risk Staff',
          email: `overtime.high.${Date.now()}@example.com`,
          organisation_id: orgId,
          role: 'Manager',
          is_active: true,
          is_archived: false,
        },
        {
          name: 'Medium Risk Staff',
          email: `overtime.medium.${Date.now()}@example.com`,
          organisation_id: orgId,
          role: 'Accountant',
          is_active: true,
          is_archived: false,
        },
        {
          name: 'Low Risk Staff',
          email: `overtime.low.${Date.now()}@example.com`,
          organisation_id: orgId,
          role: 'Accountant',
          is_active: true,
          is_archived: false,
        },
        {
          name: 'Inactive Assigned Staff',
          email: `overtime.inactive.${Date.now()}@example.com`,
          organisation_id: orgId,
          role: 'Senior Accountant',
          is_active: false,
          is_archived: false,
        },
      ]);

      const [highJob, mediumJob, lowJob, inactiveJob, julyJob] = await Job.create([
        {
          name: 'High Risk Job',
          client_name: 'Client One',
          organisation_id: orgId,
          status: 'In Progress',
          job_fee: 1000,
        },
        {
          name: 'Medium Risk Job',
          client_name: 'Client Two',
          organisation_id: orgId,
          status: 'In Progress',
          job_fee: 900,
        },
        {
          name: 'Low Risk Job',
          client_name: 'Client Three',
          organisation_id: orgId,
          status: 'Pending',
          job_fee: 800,
        },
        {
          name: 'Inactive Staff Job',
          client_name: 'Client Four',
          organisation_id: orgId,
          status: 'Pending',
          job_fee: 700,
        },
        {
          name: 'July Job',
          client_name: 'Client Five',
          organisation_id: orgId,
          status: 'Pending',
          job_fee: 600,
        },
      ]);

      const [highAllocation, mediumAllocation, lowAllocation, inactiveAllocation, julyAllocation] = await Allocation.create([
        {
          job_id: highJob._id,
          staff_id: highStaff._id,
          percentage: 100,
          allocated_fee: 300,
          calculated_hours: 10,
          adjusted_hours: 10,
          month: '2026-06',
          workflow_status: 'Doing',
          organisation_id: orgId,
        },
        {
          job_id: mediumJob._id,
          staff_id: mediumStaff._id,
          percentage: 100,
          allocated_fee: 250,
          calculated_hours: 10,
          adjusted_hours: 10,
          month: '2026-06',
          workflow_status: 'Doing',
          organisation_id: orgId,
        },
        {
          job_id: lowJob._id,
          staff_id: lowStaff._id,
          percentage: 100,
          allocated_fee: 200,
          calculated_hours: 10,
          adjusted_hours: 10,
          month: '2026-06',
          workflow_status: 'Pending',
          organisation_id: orgId,
        },
        {
          job_id: inactiveJob._id,
          staff_id: inactiveStaff._id,
          percentage: 100,
          allocated_fee: 150,
          calculated_hours: 0,
          adjusted_hours: 0,
          month: '2026-06',
          workflow_status: 'Pending',
          organisation_id: orgId,
        },
        {
          job_id: julyJob._id,
          staff_id: lowStaff._id,
          percentage: 100,
          allocated_fee: 100,
          calculated_hours: 5,
          adjusted_hours: 5,
          month: '2026-07',
          workflow_status: 'Pending',
          organisation_id: orgId,
        },
      ]);

      await TimeEntry.create([
        {
          allocation_id: highAllocation._id,
          staff_id: highStaff._id,
          job_id: highJob._id,
          start_time: new Date('2026-06-05T08:00:00Z'),
          end_time: new Date('2026-06-05T22:00:00Z'),
          date: '2026-06-05',
          hours_worked: 14,
          description: 'High risk work',
          organisation_id: orgId,
        },
        {
          allocation_id: mediumAllocation._id,
          staff_id: mediumStaff._id,
          job_id: mediumJob._id,
          start_time: new Date('2026-06-10T08:00:00Z'),
          end_time: new Date('2026-06-10T19:00:00Z'),
          date: '2026-06-10',
          hours_worked: 11,
          description: 'Medium risk work',
          organisation_id: orgId,
        },
        {
          allocation_id: lowAllocation._id,
          staff_id: lowStaff._id,
          job_id: lowJob._id,
          start_time: new Date('2026-06-12T08:00:00Z'),
          end_time: new Date('2026-06-12T18:00:00Z'),
          date: '2026-06-12',
          hours_worked: 10,
          description: 'On-plan work',
          organisation_id: orgId,
        },
        {
          allocation_id: inactiveAllocation._id,
          staff_id: inactiveStaff._id,
          job_id: inactiveJob._id,
          start_time: new Date('2026-06-14T08:00:00Z'),
          end_time: new Date('2026-06-14T10:00:00Z'),
          date: '2026-06-14',
          hours_worked: 2,
          description: 'Unplanned work',
          organisation_id: orgId,
        },
        {
          allocation_id: julyAllocation._id,
          staff_id: lowStaff._id,
          job_id: julyJob._id,
          start_time: new Date('2026-07-01T08:00:00Z'),
          end_time: new Date('2026-07-01T13:00:00Z'),
          date: '2026-07-01',
          hours_worked: 5,
          description: 'Outside selected month',
          organisation_id: orgId,
        },
      ]);

      const report = await invokeOvertimeBurnout({
        query: { month: '2026-06' },
        user: { organisation_id: orgId },
      });

      assert.equal(report.report_name, 'Overtime & Burnout Risk Tracker');
      assert.equal(report.month, '2026-06');
      assert.equal(report.summary.high_risk_count, 2);
      assert.equal(report.summary.medium_risk_count, 1);
      assert.equal(report.summary.low_risk_count, 1);
      assert.equal(report.summary.total_overtime, 7);
      assert.equal(report.staff.length, 4);

      const highRow = report.staff.find((row) => row.staff_id === highStaff._id.toString());
      assert.ok(highRow, 'Expected high-risk staff row');
      assert.equal(highRow.staff_name, 'High Risk Staff');
      assert.equal(highRow.budgeted_hours, 10);
      assert.equal(highRow.actual_hours, 14);
      assert.equal(highRow.overtime_hours, 4);
      assert.equal(highRow.overtime_percentage, 40);
      assert.equal(highRow.risk_level, 'High');

      const mediumRow = report.staff.find((row) => row.staff_id === mediumStaff._id.toString());
      assert.ok(mediumRow, 'Expected medium-risk staff row');
      assert.equal(mediumRow.budgeted_hours, 10);
      assert.equal(mediumRow.actual_hours, 11);
      assert.equal(mediumRow.overtime_hours, 1);
      assert.equal(mediumRow.overtime_percentage, 10);
      assert.equal(mediumRow.risk_level, 'Medium');

      const lowRow = report.staff.find((row) => row.staff_id === lowStaff._id.toString());
      assert.ok(lowRow, 'Expected low-risk staff row');
      assert.equal(lowRow.budgeted_hours, 10, 'July allocation should be excluded');
      assert.equal(lowRow.actual_hours, 10, 'July time entry should be excluded');
      assert.equal(lowRow.overtime_hours, 0);
      assert.equal(lowRow.overtime_percentage, 0);
      assert.equal(lowRow.risk_level, 'Low');

      const inactiveRow = report.staff.find((row) => row.staff_id === inactiveStaff._id.toString());
      assert.ok(inactiveRow, 'Expected inactive assigned staff row');
      assert.equal(inactiveRow.staff_name, 'Inactive Assigned Staff');
      assert.equal(inactiveRow.budgeted_hours, 0);
      assert.equal(inactiveRow.actual_hours, 2);
      assert.equal(inactiveRow.overtime_hours, 2);
      assert.equal(inactiveRow.overtime_percentage, 0);
      assert.equal(inactiveRow.risk_level, 'High');
    } finally {
      await cleanupOrgData(orgId);
      if (openedConnection && mongoose.connection.readyState !== 0) {
        await mongoose.connection.close();
      }
    }
  });
});
