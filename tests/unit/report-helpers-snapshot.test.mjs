import { strict as assert } from 'assert';
import test from 'node:test';
import mongoose from 'mongoose';

import Allocation from '../../src/models/Allocation.js';
import Department from '../../src/models/Department.js';
import Job from '../../src/models/Job.js';
import OrganisationMembership from '../../src/models/OrganisationMembership.js';
import Staff from '../../src/models/Staff.js';
import TimeEntry from '../../src/models/TimeEntry.js';
import { buildEfficiencySnapshot } from '../../src/services/reportHelpers.js';

const cleanupOrgData = async (orgId) => {
  await Promise.all([
    TimeEntry.deleteMany({ organisation_id: orgId }),
    Allocation.deleteMany({ organisation_id: orgId }),
    Job.deleteMany({ organisation_id: orgId }),
    Department.deleteMany({ organisation_id: orgId }),
    OrganisationMembership.deleteMany({ organisation_id: orgId }),
    Staff.deleteMany({ organisation_id: orgId }),
  ]);
};

test.describe('buildEfficiencySnapshot staff scope', () => {
  test('includes inactive assigned staff and keeps archived staff excluded', async (t) => {
    let openedConnection = false;
    if (mongoose.connection.readyState === 0) {
      try {
        await mongoose.connect(process.env.MONGODB_TEST_URI || 'mongodb://localhost:27017/test', {
          serverSelectionTimeoutMS: 1000,
        });
        openedConnection = true;
      } catch {
        t.skip('MongoDB is not available for snapshot integration coverage');
        return;
      }
    }

    const orgId = new mongoose.Types.ObjectId();

    try {
      const taxDepartment = await Department.create({
        name: 'Tax',
        code: `TX${String(Date.now()).slice(-3)}`,
        organisation_id: orgId,
      });

      const inactiveAssignedStaff = await Staff.create({
        name: 'Pending Assignee',
        email: `pending.${Date.now()}@example.com`,
        organisation_id: orgId,
        role: 'Accountant',
        hourly_rate: 500,
        department_id: String(taxDepartment._id),
        department_ids: [String(taxDepartment._id)],
        is_active: false,
        is_archived: false,
      });

      await Staff.create({
        name: 'Archived Assignee',
        email: `archived.${Date.now()}@example.com`,
        organisation_id: orgId,
        role: 'Accountant',
        hourly_rate: 400,
        is_active: false,
        is_archived: true,
      });

      const job = await Job.create({
        name: 'June Tax Work',
        client_name: 'Innovateher',
        job_fee: 5000,
        department_id: String(taxDepartment._id),
        organisation_id: orgId,
      });

      const allocation = await Allocation.create({
        job_id: job._id,
        staff_id: inactiveAssignedStaff._id,
        percentage: 100,
        allocated_fee: 5000,
        calculated_hours: 13.39,
        adjusted_hours: 13.39,
        month: '2026-06',
        organisation_id: orgId,
      });

      await TimeEntry.create({
        allocation_id: allocation._id,
        staff_id: inactiveAssignedStaff._id,
        job_id: job._id,
        start_time: new Date('2026-06-10T08:00:00Z'),
        end_time: new Date('2026-06-10T15:00:00Z'),
        date: '2026-06-10',
        hours_worked: 7,
        description: 'Worked on June tax allocation',
        organisation_id: orgId,
      });

      const snapshot = await buildEfficiencySnapshot(orgId, { month: '2026-06' });

      const staffRow = snapshot.staff.find((row) => row.staff_id === inactiveAssignedStaff._id.toString());
      assert.ok(staffRow, 'Expected inactive assigned staff to appear in efficiency staff rows');
      assert.equal(staffRow.budgeted_hours, 13.39);
      assert.equal(staffRow.actual_hours, 7);

      const archivedRow = snapshot.staff.find((row) => row.name === 'Archived Assignee');
      assert.equal(archivedRow, undefined);

      const departmentRow = snapshot.departments.find(
        (row) => row.department_id === taxDepartment._id.toString(),
      );
      assert.ok(departmentRow, 'Expected tax department row to exist');
      assert.equal(departmentRow.staff_count, 1);
    } finally {
      await cleanupOrgData(orgId);
      if (openedConnection && mongoose.connection.readyState !== 0) {
        await mongoose.connection.close();
      }
    }
  });
});
