import { strict as assert } from 'assert';
import test from 'node:test';
import mongoose from 'mongoose';

import Allocation from '../../src/models/Allocation.js';
import Department from '../../src/models/Department.js';
import Job from '../../src/models/Job.js';
import Staff from '../../src/models/Staff.js';
import TimeEntry from '../../src/models/TimeEntry.js';
import { reportTeamProductivity } from '../../src/controllers/reportsController.js';

const cleanupOrgData = async (orgId) => {
  await Promise.all([
    TimeEntry.deleteMany({ organisation_id: orgId }),
    Allocation.deleteMany({ organisation_id: orgId }),
    Job.deleteMany({ organisation_id: orgId }),
    Staff.deleteMany({ organisation_id: orgId }),
    Department.deleteMany({ organisation_id: orgId }),
  ]);
};

const invokeTeamProductivity = async (req) => new Promise((resolve, reject) => {
  reportTeamProductivity(
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

test.describe('reportTeamProductivity', () => {
  test('builds department team scorecards with capped adherence and turnaround-based on-time delivery', async (t) => {
    let openedConnection = false;
    if (mongoose.connection.readyState === 0) {
      try {
        await mongoose.connect(process.env.MONGODB_TEST_URI || 'mongodb://localhost:27017/test', {
          serverSelectionTimeoutMS: 1000,
        });
        openedConnection = true;
      } catch {
        t.skip('MongoDB is not available for team productivity integration coverage');
        return;
      }
    }

    const orgId = new mongoose.Types.ObjectId();

    try {
      const [taxDepartment, auditDepartment] = await Department.create([
        {
          name: 'Tax',
          code: 'TAX',
          organisation_id: orgId,
          is_active: true,
        },
        {
          name: 'Audit',
          code: 'AUD',
          organisation_id: orgId,
          is_active: true,
        },
      ]);

      const [taxStaff, auditStaff] = await Staff.create([
        {
          name: 'Tax Staff',
          email: `tax.staff.${Date.now()}@example.com`,
          organisation_id: orgId,
          role: 'Accountant',
          department_id: taxDepartment._id.toString(),
          is_active: true,
          is_archived: false,
        },
        {
          name: 'Audit Staff',
          email: `audit.staff.${Date.now()}@example.com`,
          organisation_id: orgId,
          role: 'Manager',
          department_id: auditDepartment._id.toString(),
          is_active: true,
          is_archived: false,
        },
      ]);

      const [onTimeJob, lateJob, assumedDeadlineJob, julyJob] = await Job.create([
        {
          name: 'On Time Tax Job',
          client_name: 'Client One',
          organisation_id: orgId,
          status: 'Pending',
          job_fee: 1000,
          deadline: new Date('2026-06-15T00:00:00Z'),
        },
        {
          name: 'Late Tax Job',
          client_name: 'Client Two',
          organisation_id: orgId,
          status: 'Pending',
          job_fee: 1000,
          deadline: new Date('2026-06-12T00:00:00Z'),
        },
        {
          name: 'Audit No Deadline Job',
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
          job_fee: 400,
          deadline: new Date('2026-07-15T00:00:00Z'),
        },
      ]);

      const [taxAllocationOne, taxAllocationTwo, auditAllocation, julyAllocation] = await Allocation.create([
        {
          job_id: onTimeJob._id,
          staff_id: taxStaff._id,
          percentage: 100,
          allocated_fee: 400,
          calculated_hours: 4,
          adjusted_hours: 4,
          month: '2026-06',
          workflow_status: 'Pending',
          created_at: new Date('2026-06-10T09:00:00Z'),
          organisation_id: orgId,
        },
        {
          job_id: lateJob._id,
          staff_id: taxStaff._id,
          percentage: 100,
          allocated_fee: 600,
          calculated_hours: 6,
          adjusted_hours: 6,
          month: '2026-06',
          workflow_status: 'Pending',
          created_at: new Date('2026-06-20T09:00:00Z'),
          organisation_id: orgId,
        },
        {
          job_id: assumedDeadlineJob._id,
          staff_id: auditStaff._id,
          percentage: 100,
          allocated_fee: 400,
          calculated_hours: 4,
          adjusted_hours: 4,
          month: '2026-06',
          workflow_status: 'Pending',
          created_at: new Date('2026-06-20T09:00:00Z'),
          organisation_id: orgId,
        },
        {
          job_id: julyJob._id,
          staff_id: auditStaff._id,
          percentage: 100,
          allocated_fee: 400,
          calculated_hours: 5,
          adjusted_hours: 5,
          month: '2026-07',
          workflow_status: 'Pending',
          created_at: new Date('2026-07-10T09:00:00Z'),
          organisation_id: orgId,
        },
      ]);

      await TimeEntry.create([
        {
          allocation_id: taxAllocationOne._id,
          staff_id: taxStaff._id,
          job_id: onTimeJob._id,
          start_time: new Date('2026-06-11T08:00:00Z'),
          end_time: new Date('2026-06-11T10:00:00Z'),
          date: '2026-06-11',
          hours_worked: 2,
          description: 'Tax work',
          billable: true,
          organisation_id: orgId,
        },
        {
          allocation_id: taxAllocationTwo._id,
          staff_id: taxStaff._id,
          job_id: lateJob._id,
          start_time: new Date('2026-06-21T08:00:00Z'),
          end_time: new Date('2026-06-21T10:00:00Z'),
          date: '2026-06-21',
          hours_worked: 2,
          description: 'Late tax work',
          billable: true,
          organisation_id: orgId,
        },
        {
          allocation_id: auditAllocation._id,
          staff_id: auditStaff._id,
          job_id: assumedDeadlineJob._id,
          start_time: new Date('2026-06-20T08:00:00Z'),
          end_time: new Date('2026-06-20T12:00:00Z'),
          date: '2026-06-20',
          hours_worked: 4,
          description: 'Audit work',
          billable: true,
          organisation_id: orgId,
        },
        {
          allocation_id: julyAllocation._id,
          staff_id: auditStaff._id,
          job_id: julyJob._id,
          start_time: new Date('2026-07-10T08:00:00Z'),
          end_time: new Date('2026-07-10T10:00:00Z'),
          date: '2026-07-10',
          hours_worked: 2,
          description: 'July work',
          billable: true,
          organisation_id: orgId,
        },
      ]);

      const report = await invokeTeamProductivity({
        query: { month: '2026-06' },
        user: { organisation_id: orgId },
      });

      assert.equal(report.report_name, 'Team Productivity & Efficiency Scorecard');
      assert.equal(report.month, '2026-06');
      assert.equal(report.summary.team_size, 2);
      assert.equal(report.summary.jobs_assigned, 3);
      assert.equal(report.summary.budget_adherence, 125);
      assert.equal(report.summary.on_time_delivery, 75);
      assert.equal(report.teams.length, 2);

      const taxTeam = report.teams.find((team) => team.department_name === 'Tax');
      assert.ok(taxTeam, 'Expected Tax team row');
      assert.equal(taxTeam.team_size, 1);
      assert.equal(taxTeam.jobs_assigned, 2);
      assert.equal(taxTeam.budgeted_hours, 10);
      assert.equal(taxTeam.actual_hours, 4);
      assert.equal(taxTeam.budget_adherence, 150);
      assert.equal(taxTeam.on_time_delivery, 50);
      assert.equal(taxTeam.efficiency_score, 110);

      const auditTeam = report.teams.find((team) => team.department_name === 'Audit');
      assert.ok(auditTeam, 'Expected Audit team row');
      assert.equal(auditTeam.team_size, 1);
      assert.equal(auditTeam.jobs_assigned, 1);
      assert.equal(auditTeam.budgeted_hours, 4);
      assert.equal(auditTeam.actual_hours, 4);
      assert.equal(auditTeam.budget_adherence, 100);
      assert.equal(auditTeam.on_time_delivery, 100);
      assert.equal(auditTeam.efficiency_score, 100);

      const filteredReport = await invokeTeamProductivity({
        query: { month: '2026-06', department_id: auditDepartment._id.toString() },
        user: { organisation_id: orgId },
      });

      assert.equal(filteredReport.teams.length, 1);
      assert.equal(filteredReport.teams[0].department_name, 'Audit');
    } finally {
      await cleanupOrgData(orgId);
      if (openedConnection && mongoose.connection.readyState !== 0) {
        await mongoose.connection.close();
      }
    }
  });
});
