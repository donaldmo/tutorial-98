import { strict as assert } from 'assert';
import test from 'node:test';
import mongoose from 'mongoose';

import Allocation from '../../src/models/Allocation.js';
import Job from '../../src/models/Job.js';
import Staff from '../../src/models/Staff.js';
import TimeEntry from '../../src/models/TimeEntry.js';
import { buildWipStatusReport } from '../../src/services/reportHelpers.js';

const cleanupOrgData = async (orgId) => {
  await Promise.all([
    TimeEntry.deleteMany({ organisation_id: orgId }),
    Allocation.deleteMany({ organisation_id: orgId }),
    Job.deleteMany({ organisation_id: orgId }),
    Staff.deleteMany({ organisation_id: orgId }),
  ]);
};

test.describe('buildWipStatusReport', () => {
  test('uses allocation percentage for progress and factors allocated work into active WIP', async (t) => {
    let openedConnection = false;
    if (mongoose.connection.readyState === 0) {
      try {
        await mongoose.connect(process.env.MONGODB_TEST_URI || 'mongodb://localhost:27017/test', {
          serverSelectionTimeoutMS: 1000,
        });
        openedConnection = true;
      } catch {
        t.skip('MongoDB is not available for WIP report integration coverage');
        return;
      }
    }

    const orgId = new mongoose.Types.ObjectId();

    try {
      const staffMember = await Staff.create({
        name: 'WIP Staff',
        email: `wip.${Date.now()}@example.com`,
        organisation_id: orgId,
        role: 'Accountant',
        is_archived: false,
      });

      const inProgressJob = await Job.create({
        name: 'In Progress WIP Job',
        client_name: 'Client One',
        organisation_id: orgId,
        status: 'In Progress',
        job_fee: 1000,
        pricing_override: 1500,
      });

      const fullyAllocatedJob = await Job.create({
        name: 'Fully Allocated WIP Job',
        client_name: 'Client Two',
        organisation_id: orgId,
        status: 'Fully Allocated',
        job_fee: 800,
      });

      const pendingJob = await Job.create({
        name: 'Pending WIP Job',
        client_name: 'Client Three',
        organisation_id: orgId,
        status: 'Partially Allocated',
        job_fee: 500,
      });

      const completedJob = await Job.create({
        name: 'Completed Job',
        client_name: 'Client Four',
        organisation_id: orgId,
        status: 'Completed',
        job_fee: 700,
      });

      const completedAllocationsJob = await Job.create({
        name: 'Completed Allocations Job',
        client_name: 'Client Five',
        organisation_id: orgId,
        status: 'In Progress',
        job_fee: 900,
      });

      const inProgressAllocation = await Allocation.create({
        job_id: inProgressJob._id,
        staff_id: staffMember._id,
        percentage: 100,
        allocated_fee: 600,
        calculated_hours: 10,
        adjusted_hours: 10,
        month: '2026-06',
        workflow_status: 'Doing',
        organisation_id: orgId,
      });

      await Allocation.create({
        job_id: fullyAllocatedJob._id,
        staff_id: staffMember._id,
        percentage: 50,
        allocated_fee: 250,
        calculated_hours: 5,
        adjusted_hours: 5,
        month: '2026-06',
        workflow_status: 'Pending',
        organisation_id: orgId,
      });

      await Allocation.create({
        job_id: pendingJob._id,
        staff_id: staffMember._id,
        percentage: 25,
        allocated_fee: 150,
        calculated_hours: 3,
        adjusted_hours: 3,
        month: '2026-06',
        workflow_status: 'Pending',
        organisation_id: orgId,
      });

      await Allocation.create({
        job_id: completedJob._id,
        staff_id: staffMember._id,
        percentage: 100,
        allocated_fee: 200,
        calculated_hours: 4,
        adjusted_hours: 4,
        month: '2026-06',
        workflow_status: 'Doing',
        organisation_id: orgId,
      });

      await Allocation.create({
        job_id: completedAllocationsJob._id,
        staff_id: staffMember._id,
        percentage: 100,
        allocated_fee: 300,
        calculated_hours: 6,
        adjusted_hours: 6,
        month: '2026-06',
        workflow_status: 'Completed',
        organisation_id: orgId,
      });

      await TimeEntry.create({
        allocation_id: inProgressAllocation._id,
        staff_id: staffMember._id,
        job_id: inProgressJob._id,
        start_time: new Date('2026-06-06T08:00:00Z'),
        end_time: new Date('2026-06-06T20:00:00Z'),
        date: '2026-06-06',
        hours_worked: 12,
        description: 'June WIP work',
        organisation_id: orgId,
      });

      await TimeEntry.create({
        allocation_id: inProgressAllocation._id,
        staff_id: staffMember._id,
        job_id: inProgressJob._id,
        start_time: new Date('2026-07-06T08:00:00Z'),
        end_time: new Date('2026-07-06T13:00:00Z'),
        date: '2026-07-06',
        hours_worked: 5,
        description: 'July work should not count in June',
        organisation_id: orgId,
      });

      const report = await buildWipStatusReport(orgId, { month: '2026-06' });

      assert.equal(report.month, '2026-06');
      assert.equal(report.summary.total_wip_jobs, 3);
      assert.equal(report.summary.jobs_in_progress, 1);
      assert.equal(report.summary.allocated_count, 1);
      assert.equal(report.summary.pending_count, 1);
      assert.equal(report.summary.total_wip_value, 762.5);

      const inProgressRow = report.jobs.find((row) => row.job_id === inProgressJob._id.toString());
      assert.ok(inProgressRow, 'Expected in-progress job row');
      assert.equal(inProgressRow.status, 'In Progress');
      assert.equal(inProgressRow.total_fee, 1500);
      assert.equal(inProgressRow.allocated_fee, 600);
      assert.equal(inProgressRow.budgeted_hours, 10);
      assert.equal(inProgressRow.actual_hours, 12);
      assert.equal(inProgressRow.progress_percentage, 100);
      assert.equal(inProgressRow.wip_value, 600);

      const allocatedRow = report.jobs.find((row) => row.job_id === fullyAllocatedJob._id.toString());
      assert.ok(allocatedRow, 'Expected fully allocated job row');
      assert.equal(allocatedRow.status, 'Fully Allocated');
      assert.equal(allocatedRow.progress_percentage, 50);
      assert.equal(allocatedRow.actual_hours, 0);
      assert.equal(allocatedRow.wip_value, 125);

      const pendingRow = report.jobs.find((row) => row.job_id === pendingJob._id.toString());
      assert.ok(pendingRow, 'Expected pending job row');
      assert.equal(pendingRow.status, 'Partially Allocated');
      assert.equal(pendingRow.status_bucket, 'Pending');
      assert.equal(pendingRow.progress_percentage, 25);
      assert.equal(pendingRow.actual_hours, 0);
      assert.equal(pendingRow.wip_value, 37.5);

      assert.equal(
        report.jobs.find((row) => row.job_id === completedJob._id.toString()),
        undefined,
        'Completed jobs should be excluded from active WIP',
      );
      assert.equal(
        report.jobs.find((row) => row.job_id === completedAllocationsJob._id.toString()),
        undefined,
        'Jobs whose month allocations are all completed should be excluded from active WIP',
      );
    } finally {
      await cleanupOrgData(orgId);
      if (openedConnection && mongoose.connection.readyState !== 0) {
        await mongoose.connection.close();
      }
    }
  });
});
