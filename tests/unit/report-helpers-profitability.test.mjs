import { strict as assert } from 'assert';
import test from 'node:test';
import mongoose from 'mongoose';

import Allocation from '../../src/models/Allocation.js';
import Job from '../../src/models/Job.js';
import Staff from '../../src/models/Staff.js';
import TimeEntry from '../../src/models/TimeEntry.js';
import { buildFirmProfitabilityReport } from '../../src/services/reportHelpers.js';

const cleanupOrgData = async (orgId) => {
  await Promise.all([
    TimeEntry.deleteMany({ organisation_id: orgId }),
    Allocation.deleteMany({ organisation_id: orgId }),
    Job.deleteMany({ organisation_id: orgId }),
    Staff.deleteMany({ organisation_id: orgId }),
  ]);
};

test.describe('buildFirmProfitabilityReport', () => {
  test('uses effective fee, budgeted-hours labor cost, and service-line grouping', async (t) => {
    let openedConnection = false;
    if (mongoose.connection.readyState === 0) {
      try {
        await mongoose.connect(process.env.MONGODB_TEST_URI || 'mongodb://localhost:27017/test', {
          serverSelectionTimeoutMS: 1000,
        });
        openedConnection = true;
      } catch {
        t.skip('MongoDB is not available for firm profitability integration coverage');
        return;
      }
    }

    const orgId = new mongoose.Types.ObjectId();

    try {
      const staffMember = await Staff.create({
        name: 'Profit Staff',
        email: `profit.${Date.now()}@example.com`,
        organisation_id: orgId,
        role: 'Accountant',
        hourly_rate: 100,
        is_archived: false,
      });

      const auditJob = await Job.create({
        name: 'Audit Job',
        client_name: 'Client One',
        organisation_id: orgId,
        status: 'In Progress',
        job_fee: 1000,
        pricing_override: 1500,
        job_type_entries: [{ job_type_name: 'Audit', fee: 1500, work_components: [] }],
      });

      const fallbackJob = await Job.create({
        name: 'Fallback Job',
        client_name: 'Client Two',
        organisation_id: orgId,
        status: 'Partially Allocated',
        job_fee: 500,
      });

      const auditAllocation = await Allocation.create({
        job_id: auditJob._id,
        staff_id: staffMember._id,
        percentage: 100,
        allocated_fee: 300,
        calculated_hours: 4,
        adjusted_hours: 4,
        month: '2026-06',
        workflow_status: 'Doing',
        organisation_id: orgId,
      });

      await Allocation.create({
        job_id: fallbackJob._id,
        staff_id: staffMember._id,
        percentage: 100,
        allocated_fee: 100,
        calculated_hours: 2,
        adjusted_hours: 2,
        month: '2026-06',
        workflow_status: 'Pending',
        organisation_id: orgId,
      });

      await TimeEntry.create({
        allocation_id: auditAllocation._id,
        staff_id: staffMember._id,
        job_id: auditJob._id,
        start_time: new Date('2026-06-05T08:00:00Z'),
        end_time: new Date('2026-06-05T10:00:00Z'),
        date: '2026-06-05',
        hours_worked: 2,
        description: 'Audit work',
        organisation_id: orgId,
      });

      await TimeEntry.create({
        allocation_id: auditAllocation._id,
        staff_id: staffMember._id,
        job_id: auditJob._id,
        start_time: new Date('2026-07-05T08:00:00Z'),
        end_time: new Date('2026-07-05T10:00:00Z'),
        date: '2026-07-05',
        hours_worked: 2,
        description: 'Outside selected month',
        organisation_id: orgId,
      });

      const report = await buildFirmProfitabilityReport(orgId, { month: '2026-06' });

      assert.equal(report.month, '2026-06');
      assert.equal(report.summary.total_revenue, 2000);
      assert.equal(report.summary.total_labor_cost, 300);
      assert.equal(report.summary.total_gross_margin, 1700);
      assert.equal(report.summary.margin_percentage, 85);

      const auditRow = report.jobs.find((row) => row.job_id === auditJob._id.toString());
      assert.ok(auditRow, 'Expected audit job row');
      assert.equal(auditRow.service_line, 'Audit');
      assert.equal(auditRow.revenue, 1500);
      assert.equal(auditRow.actual_hours, 2);
      assert.equal(auditRow.labor_cost, 200);
      assert.equal(auditRow.gross_margin, 1300);
      assert.equal(auditRow.margin_percentage, 86.7);

      const fallbackRow = report.jobs.find((row) => row.job_id === fallbackJob._id.toString());
      assert.ok(fallbackRow, 'Expected fallback job row');
      assert.equal(fallbackRow.service_line, 'Other');
      assert.equal(fallbackRow.revenue, 500);
      assert.equal(fallbackRow.actual_hours, 0);
      assert.equal(fallbackRow.labor_cost, 100);
      assert.equal(fallbackRow.gross_margin, 400);
      assert.equal(fallbackRow.margin_percentage, 80);

      const auditServiceLine = report.service_lines.find((row) => row.service_line === 'Audit');
      assert.ok(auditServiceLine, 'Expected Audit service line');
      assert.equal(auditServiceLine.revenue, 1500);
      assert.equal(auditServiceLine.labor_cost, 200);
      assert.equal(auditServiceLine.gross_margin, 1300);
      assert.equal(auditServiceLine.job_count, 1);

      const otherServiceLine = report.service_lines.find((row) => row.service_line === 'Other');
      assert.ok(otherServiceLine, 'Expected Other service line');
      assert.equal(otherServiceLine.revenue, 500);
      assert.equal(otherServiceLine.labor_cost, 100);
      assert.equal(otherServiceLine.gross_margin, 400);
      assert.equal(otherServiceLine.job_count, 1);
    } finally {
      await cleanupOrgData(orgId);
      if (openedConnection && mongoose.connection.readyState !== 0) {
        await mongoose.connection.close();
      }
    }
  });
});
