import { strict as assert } from 'assert';
import test from 'node:test';
import mongoose from 'mongoose';

import Allocation from '../../src/models/Allocation.js';
import Job from '../../src/models/Job.js';
import OrganisationMembership from '../../src/models/OrganisationMembership.js';
import Staff from '../../src/models/Staff.js';
import TimeEntry from '../../src/models/TimeEntry.js';
import WorkingDayCalendar from '../../src/models/WorkingDayCalendar.js';
import { buildUtilizationProductivityReport } from '../../src/services/reportHelpers.js';

const cleanupOrgData = async (orgId) => {
  await Promise.all([
    TimeEntry.deleteMany({ organisation_id: orgId }),
    Allocation.deleteMany({ organisation_id: orgId }),
    Job.deleteMany({ organisation_id: orgId }),
    WorkingDayCalendar.deleteMany({ organisation_id: orgId }),
    OrganisationMembership.deleteMany({ organisation_id: orgId }),
    Staff.deleteMany({ organisation_id: orgId }),
  ]);
};

test.describe('buildUtilizationProductivityReport', () => {
  test('aggregates monthly available, allocated, and actual hours per staff member', async (t) => {
    let openedConnection = false;
    if (mongoose.connection.readyState === 0) {
      try {
        await mongoose.connect(process.env.MONGODB_TEST_URI || 'mongodb://localhost:27017/test', {
          serverSelectionTimeoutMS: 1000,
        });
        openedConnection = true;
      } catch {
        t.skip('MongoDB is not available for utilization report integration coverage');
        return;
      }
    }

    const orgId = new mongoose.Types.ObjectId();

    try {
      const assignedStaff = await Staff.create({
        name: 'Utilization User',
        email: `util.${Date.now()}@example.com`,
        organisation_id: orgId,
        role: 'Manager',
        is_active: false,
        is_archived: false,
        available_hours_per_month: 120,
        hours_per_day: 8,
        productivity_factor: 0.8,
      });

      const fallbackStaff = await Staff.create({
        name: 'Annual Budget User',
        email: `annual.${Date.now()}@example.com`,
        organisation_id: orgId,
        role: 'Accountant',
        is_active: false,
        is_archived: false,
        available_hours_per_month: 0,
        hours_per_day: 6,
        productivity_factor: 0.5,
        annual_budgeted_hours: 1200,
      });

      await Staff.create({
        name: 'Archived User',
        email: `archived-util.${Date.now()}@example.com`,
        organisation_id: orgId,
        role: 'Accountant',
        is_active: false,
        is_archived: true,
        available_hours_per_month: 90,
      });

      await WorkingDayCalendar.create({
        organisation_id: orgId,
        month: '2026-06',
        daily_capacity_hours: 8,
        working_days_override: 21,
        holidays: [],
        extra_working_days: [],
      });

      const job = await Job.create({
        name: 'June Utilization Job',
        client_name: 'Client One',
        job_fee: 10000,
        organisation_id: orgId,
      });

      const allocation = await Allocation.create({
        job_id: job._id,
        staff_id: assignedStaff._id,
        percentage: 100,
        allocated_fee: 10000,
        calculated_hours: 20,
        adjusted_hours: 20,
        month: '2026-06',
        organisation_id: orgId,
      });

      await TimeEntry.create({
        allocation_id: allocation._id,
        staff_id: assignedStaff._id,
        job_id: job._id,
        start_time: new Date('2026-06-03T08:00:00Z'),
        end_time: new Date('2026-06-03T18:00:00Z'),
        date: '2026-06-03',
        hours_worked: 10,
        description: 'Worked on utilization report allocation',
        organisation_id: orgId,
      });

      await TimeEntry.create({
        allocation_id: allocation._id,
        staff_id: assignedStaff._id,
        job_id: job._id,
        start_time: new Date('2026-07-03T08:00:00Z'),
        end_time: new Date('2026-07-03T10:00:00Z'),
        date: '2026-07-03',
        hours_worked: 2,
        description: 'Should not count for June report',
        organisation_id: orgId,
      });

      const report = await buildUtilizationProductivityReport(orgId, { month: '2026-06' });

      const assignedRow = report.staff_breakdown.find((row) => row.staff_id === assignedStaff._id.toString());
      assert.ok(assignedRow, 'Expected assigned staff to appear in the utilization report');
      assert.equal(assignedRow.available_hours, 134.4);
      assert.equal(assignedRow.allocated_hours, 20);
      assert.equal(assignedRow.actual_hours, 10);
      assert.equal(assignedRow.utilization_percentage, 14.9);
      assert.equal(assignedRow.productivity_percentage, 50);

      const fallbackRow = report.staff_breakdown.find((row) => row.staff_id === fallbackStaff._id.toString());
      assert.ok(fallbackRow, 'Expected fallback staff to appear in the utilization report');
      assert.equal(fallbackRow.available_hours, 63);
      assert.equal(fallbackRow.allocated_hours, 0);
      assert.equal(fallbackRow.actual_hours, 0);

      assert.equal(report.summary.available_hours, 197.4);
      assert.equal(report.summary.allocated_hours, 20);
      assert.equal(report.summary.actual_hours, 10);
      assert.equal(report.summary.utilization, 10.1);
      assert.equal(report.summary.productivity, 50);

      const archivedRow = report.staff_breakdown.find((row) => row.staff_name === 'Archived User');
      assert.equal(archivedRow, undefined);
    } finally {
      await cleanupOrgData(orgId);
      if (openedConnection && mongoose.connection.readyState !== 0) {
        await mongoose.connection.close();
      }
    }
  });
});
