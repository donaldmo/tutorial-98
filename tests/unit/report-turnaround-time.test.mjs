import { strict as assert } from 'assert';
import test from 'node:test';
import mongoose from 'mongoose';

import Allocation from '../../src/models/Allocation.js';
import Job from '../../src/models/Job.js';
import Staff from '../../src/models/Staff.js';
import { reportTurnaroundTime } from '../../src/controllers/reportsController.js';

const cleanupOrgData = async (orgId) => {
  await Promise.all([
    Allocation.deleteMany({ organisation_id: orgId }),
    Job.deleteMany({ organisation_id: orgId }),
    Staff.deleteMany({ organisation_id: orgId }),
  ]);
};

const invokeTurnaroundTime = async (req) => new Promise((resolve, reject) => {
  reportTurnaroundTime(
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

test.describe('reportTurnaroundTime', () => {
  test('uses allocation dates against explicit or assumed deadlines for selected-month jobs', async (t) => {
    let openedConnection = false;
    if (mongoose.connection.readyState === 0) {
      try {
        await mongoose.connect(process.env.MONGODB_TEST_URI || 'mongodb://localhost:27017/test', {
          serverSelectionTimeoutMS: 1000,
        });
        openedConnection = true;
      } catch {
        t.skip('MongoDB is not available for turnaround time integration coverage');
        return;
      }
    }

    const orgId = new mongoose.Types.ObjectId();

    try {
      const staffMember = await Staff.create({
        name: 'Turnaround Staff',
        email: `turnaround.${Date.now()}@example.com`,
        organisation_id: orgId,
        role: 'Accountant',
        is_active: true,
        is_archived: false,
      });

      const [completedJob, activeJob, julyJob] = await Job.create([
        {
          name: 'Completed Filing',
          client_name: 'Client One',
          organisation_id: orgId,
          status: 'Completed',
          job_fee: 1000,
          deadline: new Date('2026-05-20T00:00:00Z'),
        },
        {
          name: 'Active Review',
          client_name: 'Client Two',
          organisation_id: orgId,
          status: 'In Progress',
          job_fee: 500,
        },
        {
          name: 'July Job',
          client_name: 'Client Three',
          organisation_id: orgId,
          status: 'Pending',
          job_fee: 300,
          deadline: new Date('2026-07-20T00:00:00Z'),
        },
      ]);

      await Allocation.create([
        {
          job_id: completedJob._id,
          staff_id: staffMember._id,
          percentage: 100,
          allocated_fee: 300,
          calculated_hours: 5,
          adjusted_hours: 5,
          month: '2026-05',
          workflow_status: 'Completed',
          created_at: new Date('2026-05-18T10:00:00Z'),
          completed_at: new Date('2026-05-18T10:00:00Z'),
          organisation_id: orgId,
        },
        {
          job_id: activeJob._id,
          staff_id: staffMember._id,
          percentage: 100,
          allocated_fee: 200,
          calculated_hours: 4,
          adjusted_hours: 4,
          month: '2026-05',
          workflow_status: 'Doing',
          created_at: new Date('2026-05-28T09:00:00Z'),
          organisation_id: orgId,
        },
        {
          job_id: julyJob._id,
          staff_id: staffMember._id,
          percentage: 100,
          allocated_fee: 100,
          calculated_hours: 3,
          adjusted_hours: 3,
          month: '2026-07',
          workflow_status: 'Pending',
          organisation_id: orgId,
        },
      ]);

      const report = await invokeTurnaroundTime({
        query: { month: '2026-05' },
        user: { organisation_id: orgId },
      });

      assert.equal(report.report_name, 'Turnaround Time Performance');
      assert.equal(report.month, '2026-05');
      assert.equal(report.summary.total_jobs, 2);
      assert.equal(report.summary.on_time_count, 1);
      assert.equal(report.summary.late_count, 1);
      assert.equal(report.summary.on_time_rate, 50);

      const completedRow = report.jobs.find((row) => row.job_id === completedJob._id.toString());
      assert.ok(completedRow, 'Expected completed job row');
      assert.equal(completedRow.deadline_source, 'explicit');
      assert.equal(completedRow.comparison_date_source, 'allocation_created_at');
      assert.equal(completedRow.days_variance, -2);
      assert.equal(completedRow.performance, 'On Time');
      assert.equal(completedRow.status, 'Completed');

      const activeRow = report.jobs.find((row) => row.job_id === activeJob._id.toString());
      assert.ok(activeRow, 'Expected active job row');
      assert.equal(activeRow.deadline_source, 'assumed_25th');
      assert.equal(activeRow.comparison_date_source, 'allocation_created_at');
      assert.equal(activeRow.deadline.slice(0, 10), '2026-05-25');
      assert.equal(activeRow.days_variance, 3);
      assert.equal(activeRow.performance, 'Late');
      assert.equal(activeRow.status, 'In Progress');

      assert.equal(
        report.jobs.find((row) => row.job_id === julyJob._id.toString()),
        undefined,
        'Jobs outside the selected month should be excluded',
      );
    } finally {
      await cleanupOrgData(orgId);
      if (openedConnection && mongoose.connection.readyState !== 0) {
        await mongoose.connection.close();
      }
    }
  });
});
