import { strict as assert } from 'assert';
import test from 'node:test';
import mongoose from 'mongoose';

import Allocation from '../../src/models/Allocation.js';
import Job from '../../src/models/Job.js';
import Staff from '../../src/models/Staff.js';
import TimeEntry from '../../src/models/TimeEntry.js';
import { reportActualVsBudgeted } from '../../src/controllers/reportsController.js';

const cleanupOrgData = async (orgId) => {
  await Promise.all([
    TimeEntry.deleteMany({ organisation_id: orgId }),
    Allocation.deleteMany({ organisation_id: orgId }),
    Job.deleteMany({ organisation_id: orgId }),
    Staff.deleteMany({ organisation_id: orgId }),
  ]);
};

const invokeActualVsBudgeted = async (req) => new Promise((resolve, reject) => {
  reportActualVsBudgeted(
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

test.describe('reportActualVsBudgeted', () => {
  test('uses all selected-month jobs and all logged hours to build job variance rows', async (t) => {
    let openedConnection = false;
    if (mongoose.connection.readyState === 0) {
      try {
        await mongoose.connect(process.env.MONGODB_TEST_URI || 'mongodb://localhost:27017/test', {
          serverSelectionTimeoutMS: 1000,
        });
        openedConnection = true;
      } catch {
        t.skip('MongoDB is not available for actual vs budgeted integration coverage');
        return;
      }
    }

    const orgId = new mongoose.Types.ObjectId();

    try {
      const staffMember = await Staff.create({
        name: 'Budget Staff',
        email: `budget.${Date.now()}@example.com`,
        organisation_id: orgId,
        role: 'Accountant',
        is_active: true,
        is_archived: false,
      });

      const [jobOne, jobTwo, julyJob] = await Job.create([
        {
          name: 'June Over Budget Job',
          client_name: 'Client One',
          organisation_id: orgId,
          status: 'In Progress',
          job_fee: 1000,
        },
        {
          name: 'June On Track Job',
          client_name: 'Client Two',
          organisation_id: orgId,
          status: 'Pending',
          job_fee: 500,
        },
        {
          name: 'July Job',
          client_name: 'Client Three',
          organisation_id: orgId,
          status: 'Pending',
          job_fee: 300,
        },
      ]);

      const [jobOneAllocation, jobTwoAllocation] = await Allocation.create([
        {
          job_id: jobOne._id,
          staff_id: staffMember._id,
          percentage: 100,
          allocated_fee: 300,
          calculated_hours: 5,
          adjusted_hours: 5,
          month: '2026-06',
          workflow_status: 'Pending',
          organisation_id: orgId,
        },
        {
          job_id: jobTwo._id,
          staff_id: staffMember._id,
          percentage: 100,
          allocated_fee: 200,
          calculated_hours: 8,
          adjusted_hours: 8,
          month: '2026-06',
          workflow_status: 'Completed',
          organisation_id: orgId,
        },
        {
          job_id: julyJob._id,
          staff_id: staffMember._id,
          percentage: 100,
          allocated_fee: 100,
          calculated_hours: 4,
          adjusted_hours: 4,
          month: '2026-07',
          workflow_status: 'Pending',
          organisation_id: orgId,
        },
      ]);

      await TimeEntry.create([
        {
          allocation_id: jobOneAllocation._id,
          staff_id: staffMember._id,
          job_id: jobOne._id,
          start_time: new Date('2026-06-05T08:00:00Z'),
          end_time: new Date('2026-06-05T14:00:00Z'),
          date: '2026-06-05',
          hours_worked: 6,
          description: 'June work',
          billable: false,
          organisation_id: orgId,
        },
        {
          allocation_id: jobTwoAllocation._id,
          staff_id: staffMember._id,
          job_id: jobTwo._id,
          start_time: new Date('2026-06-10T08:00:00Z'),
          end_time: new Date('2026-06-10T12:00:00Z'),
          date: '2026-06-10',
          hours_worked: 4,
          description: 'June work',
          billable: true,
          organisation_id: orgId,
        },
        {
          allocation_id: jobOneAllocation._id,
          staff_id: staffMember._id,
          job_id: jobOne._id,
          start_time: new Date('2026-07-05T08:00:00Z'),
          end_time: new Date('2026-07-05T10:00:00Z'),
          date: '2026-07-05',
          hours_worked: 2,
          description: 'Outside selected month',
          organisation_id: orgId,
        },
      ]);

      const report = await invokeActualVsBudgeted({
        query: { month: '2026-06' },
        user: { organisation_id: orgId },
      });

      assert.equal(report.report_name, 'Actual vs. Budgeted Hours (Firm View)');
      assert.equal(report.month, '2026-06');
      assert.equal(report.summary.budgeted_hours, 13);
      assert.equal(report.summary.actual_hours, 10);
      assert.equal(report.summary.efficiency_gap, -3);
      assert.equal(report.summary.jobs_over_budget, 1);
      assert.equal(report.jobs.length, 2);

      const overBudgetRow = report.jobs.find((row) => row.job_id === jobOne._id.toString());
      assert.ok(overBudgetRow, 'Expected over-budget job row');
      assert.equal(overBudgetRow.client_name, 'Client One');
      assert.equal(overBudgetRow.budgeted_hours, 5);
      assert.equal(overBudgetRow.actual_hours, 6);
      assert.equal(overBudgetRow.variance_hours, 1);
      assert.equal(overBudgetRow.variance_percentage, 20);
      assert.equal(overBudgetRow.status, 'Over Budget');

      const onTrackRow = report.jobs.find((row) => row.job_id === jobTwo._id.toString());
      assert.ok(onTrackRow, 'Expected on-track job row');
      assert.equal(onTrackRow.client_name, 'Client Two');
      assert.equal(onTrackRow.budgeted_hours, 8);
      assert.equal(onTrackRow.actual_hours, 4);
      assert.equal(onTrackRow.variance_hours, -4);
      assert.equal(onTrackRow.variance_percentage, -50);
      assert.equal(onTrackRow.status, 'On Track');

      assert.equal(
        report.jobs.find((row) => row.job_id === julyJob._id.toString()),
        undefined,
        'Jobs without selected-month allocations should be excluded',
      );
    } finally {
      await cleanupOrgData(orgId);
      if (openedConnection && mongoose.connection.readyState !== 0) {
        await mongoose.connection.close();
      }
    }
  });
});
