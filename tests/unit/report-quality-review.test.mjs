import { strict as assert } from 'assert';
import test from 'node:test';
import mongoose from 'mongoose';

import Allocation from '../../src/models/Allocation.js';
import Job from '../../src/models/Job.js';
import Staff from '../../src/models/Staff.js';
import TimeEntry from '../../src/models/TimeEntry.js';
import { reportQualityReview } from '../../src/controllers/reportsController.js';

const cleanupOrgData = async (orgId) => {
  await Promise.all([
    TimeEntry.deleteMany({ organisation_id: orgId }),
    Allocation.deleteMany({ organisation_id: orgId }),
    Job.deleteMany({ organisation_id: orgId }),
    Staff.deleteMany({ organisation_id: orgId }),
  ]);
};

const invokeQualityReview = async (req) => new Promise((resolve, reject) => {
  reportQualityReview(
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

test.describe('reportQualityReview', () => {
  test('uses selected-month exceptions over 30 percent, sets training recommendations, and resolves inactive assigned staff', async (t) => {
    let openedConnection = false;
    if (mongoose.connection.readyState === 0) {
      try {
        await mongoose.connect(process.env.MONGODB_TEST_URI || 'mongodb://localhost:27017/test', {
          serverSelectionTimeoutMS: 1000,
        });
        openedConnection = true;
      } catch {
        t.skip('MongoDB is not available for quality review integration coverage');
        return;
      }
    }

    const orgId = new mongoose.Types.ObjectId();

    try {
      const [activeStaff, inactiveStaff, thresholdStaff] = await Staff.create([
        {
          name: 'Active Review Staff',
          email: `quality.active.${Date.now()}@example.com`,
          organisation_id: orgId,
          role: 'Manager',
          is_active: true,
          is_archived: false,
        },
        {
          name: 'Inactive Review Staff',
          email: `quality.inactive.${Date.now()}@example.com`,
          organisation_id: orgId,
          role: 'Senior Accountant',
          is_active: false,
          is_archived: false,
        },
        {
          name: 'Threshold Staff',
          email: `quality.threshold.${Date.now()}@example.com`,
          organisation_id: orgId,
          role: 'Accountant',
          is_active: true,
          is_archived: false,
        },
      ]);

      const [activeJob, inactiveJob, thresholdJob, julyJob] = await Job.create([
        {
          name: 'Active Exception Job',
          client_name: 'Client One',
          organisation_id: orgId,
          status: 'In Progress',
          job_fee: 1000,
        },
        {
          name: 'Inactive Exception Job',
          client_name: 'Client Two',
          organisation_id: orgId,
          status: 'In Progress',
          job_fee: 900,
        },
        {
          name: 'Threshold Job',
          client_name: 'Client Three',
          organisation_id: orgId,
          status: 'Pending',
          job_fee: 800,
        },
        {
          name: 'July Job',
          client_name: 'Client Four',
          organisation_id: orgId,
          status: 'Pending',
          job_fee: 700,
        },
      ]);

      const [activeAllocation, inactiveAllocation, thresholdAllocation, julyAllocation] = await Allocation.create([
        {
          job_id: activeJob._id,
          staff_id: activeStaff._id,
          percentage: 100,
          allocated_fee: 300,
          calculated_hours: 10,
          adjusted_hours: 10,
          month: '2026-06',
          workflow_status: 'Doing',
          organisation_id: orgId,
        },
        {
          job_id: inactiveJob._id,
          staff_id: inactiveStaff._id,
          percentage: 100,
          allocated_fee: 250,
          calculated_hours: 10,
          adjusted_hours: 10,
          month: '2026-06',
          workflow_status: 'Doing',
          organisation_id: orgId,
        },
        {
          job_id: thresholdJob._id,
          staff_id: thresholdStaff._id,
          percentage: 100,
          allocated_fee: 200,
          calculated_hours: 10,
          adjusted_hours: 10,
          month: '2026-06',
          workflow_status: 'Pending',
          organisation_id: orgId,
        },
        {
          job_id: julyJob._id,
          staff_id: activeStaff._id,
          percentage: 100,
          allocated_fee: 150,
          calculated_hours: 10,
          adjusted_hours: 10,
          month: '2026-07',
          workflow_status: 'Pending',
          organisation_id: orgId,
        },
      ]);

      await TimeEntry.create([
        {
          allocation_id: activeAllocation._id,
          staff_id: activeStaff._id,
          job_id: activeJob._id,
          start_time: new Date('2026-06-05T08:00:00Z'),
          end_time: new Date('2026-06-05T22:00:00Z'),
          date: '2026-06-05',
          hours_worked: 14,
          description: '40 percent over',
          organisation_id: orgId,
        },
        {
          allocation_id: inactiveAllocation._id,
          staff_id: inactiveStaff._id,
          job_id: inactiveJob._id,
          start_time: new Date('2026-06-10T08:00:00Z'),
          end_time: new Date('2026-06-10T00:00:00Z'),
          date: '2026-06-10',
          hours_worked: 16,
          description: '60 percent over',
          organisation_id: orgId,
        },
        {
          allocation_id: thresholdAllocation._id,
          staff_id: thresholdStaff._id,
          job_id: thresholdJob._id,
          start_time: new Date('2026-06-12T08:00:00Z'),
          end_time: new Date('2026-06-12T21:00:00Z'),
          date: '2026-06-12',
          hours_worked: 13,
          description: 'Exactly 30 percent over',
          organisation_id: orgId,
        },
        {
          allocation_id: julyAllocation._id,
          staff_id: activeStaff._id,
          job_id: julyJob._id,
          start_time: new Date('2026-07-02T08:00:00Z'),
          end_time: new Date('2026-07-02T23:00:00Z'),
          date: '2026-07-02',
          hours_worked: 15,
          description: 'Outside selected month',
          organisation_id: orgId,
        },
      ]);

      const report = await invokeQualityReview({
        query: { month: '2026-06' },
        user: { organisation_id: orgId },
      });

      assert.equal(report.report_name, 'Quality Review Exceptions Report');
      assert.equal(report.summary.total_exceptions, 2);
      assert.equal(report.summary.staff_with_issues, 2);
      assert.equal(report.summary.avg_variance, 50);
      assert.equal(report.exceptions.length, 2);
      assert.equal(report.staff_insights.length, 2);

      const activeException = report.exceptions.find((row) => row.job_id === activeJob._id.toString());
      assert.ok(activeException, 'Expected active staff exception');
      assert.equal(activeException.staff_name, 'Active Review Staff');
      assert.equal(activeException.variance_percentage, 40);
      assert.equal(activeException.exception_type, 'Significant Over-Budget');
      assert.equal(activeException.training_recommendation, 'Process optimization');
      assert.equal(activeException.issue, 'Significant Over-Budget - Process optimization');

      const inactiveException = report.exceptions.find((row) => row.job_id === inactiveJob._id.toString());
      assert.ok(inactiveException, 'Expected inactive staff exception');
      assert.equal(inactiveException.staff_name, 'Inactive Review Staff');
      assert.equal(inactiveException.variance_percentage, 60);
      assert.equal(inactiveException.training_recommendation, 'Time estimation and task management');

      const activeStaffInsight = report.staff_insights.find((row) => row.staff_id === activeStaff._id.toString());
      assert.ok(activeStaffInsight, 'Expected active staff insight');
      assert.equal(activeStaffInsight.staff_name, 'Active Review Staff');
      assert.equal(activeStaffInsight.exception_count, 1);
      assert.equal(activeStaffInsight.average_variance_percentage, 40);
      assert.equal(activeStaffInsight.max_variance_percentage, 40);
      assert.equal(activeStaffInsight.training_recommendation, 'Process optimization');

      const inactiveStaffInsight = report.staff_insights.find((row) => row.staff_id === inactiveStaff._id.toString());
      assert.ok(inactiveStaffInsight, 'Expected inactive staff insight');
      assert.equal(inactiveStaffInsight.staff_name, 'Inactive Review Staff');
      assert.equal(inactiveStaffInsight.exception_count, 1);
      assert.equal(inactiveStaffInsight.average_variance_percentage, 60);
      assert.equal(inactiveStaffInsight.max_variance_percentage, 60);
      assert.equal(inactiveStaffInsight.training_recommendation, 'Time estimation and task management');

      assert.equal(
        report.exceptions.find((row) => row.job_id === thresholdJob._id.toString()),
        undefined,
        'Exactly 30 percent over should not be flagged',
      );
      assert.equal(
        report.exceptions.find((row) => row.job_id === julyJob._id.toString()),
        undefined,
        'Outside selected month should be excluded',
      );
    } finally {
      await cleanupOrgData(orgId);
      if (openedConnection && mongoose.connection.readyState !== 0) {
        await mongoose.connection.close();
      }
    }
  });
});
