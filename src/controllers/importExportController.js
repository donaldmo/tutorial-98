import Job from '../models/Job.js';
import JobType from '../models/JobType.js';
import Client from '../models/Client.js';
import Staff from '../models/Staff.js';
import Department from '../models/Department.js';
import OrganisationMembership from '../models/OrganisationMembership.js';
import { enqueueStaffWelcomeEmailJob } from '../jobs/emailQueue.js';
import { checkPlanLimitByOrganisationId } from '../services/planLimitService.js';
import { ensureStaffMembership } from '../services/staffMembershipService.js';
import { hashPassword } from '../utils/password.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { serializeList } from '../utils/serialize.js';
import { nameToCode, normalizeWorkComponents } from '../services/planningService.js';
import { getRecurringPayloadError, reconcileRecurringMonthEntries } from './jobsController.js';

const toCsv = (rows) => {
  if (!rows.length) return '';
  const headers = Object.keys(rows[0]);
  const escape = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;
  const lines = [headers.join(',')];
  for (const row of rows) {
    lines.push(headers.map((h) => escape(row[h])).join(','));
  }
  return lines.join('\n');
};

export const getJobsImportTemplate = asyncHandler(async (_req, res) => {
  const headers = ['name', 'client_name', 'job_type', 'job_fee', 'priority', 'deadline', 'description'];
  return res.json({
    format: 'json-or-csv',
    headers,
    sample: {
      name: 'VAT Returns - Q1',
      client_name: 'ABC Pty Ltd',
      job_type: 'VAT Returns & Reconciliation',
      job_fee: 15000,
      priority: 'Medium',
      deadline: '2026-12-31T00:00:00.000Z',
      description: 'Quarterly VAT return',
    },
  });
});

export const bulkImportJobs = asyncHandler(async (req, res) => {
  const { jobs } = req.body || {};
  if (!Array.isArray(jobs) || jobs.length === 0) {
    return res.status(400).json({ detail: 'jobs array is required' });
  }

  const orgId = req.user?.organisation_id;
  if (!orgId) {
    return res.status(403).json({ detail: 'Organisation context is required' });
  }

  const importSettings = req.body.import_settings || {};
  const frequency = importSettings.frequency || 'once-off';

  if (frequency === 'recurring') {
    const recurringError = getRecurringPayloadError({
      is_recurring: true,
      recurrence_type: importSettings.recurrence_type,
      recurrence_start_date: importSettings.recurrence_start_date,
      recurrence_end_date: importSettings.recurrence_end_date,
    });
    if (recurringError) {
      return res.status(400).json({ detail: recurringError });
    }
    const day = Number(importSettings.deadline_day);
    if (!Number.isInteger(day) || day < 1 || day > 31) {
      return res.status(400).json({ detail: 'deadline_day must be between 1 and 31' });
    }
  }

  const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const parseDate = (value) => {
    if (!value) return null;
    const dt = new Date(value);
    return Number.isNaN(dt.getTime()) ? null : dt;
  };

  // Build client name lookup map (case-insensitive)
  const uniqueClientNames = Array.from(new Set(
    jobs
      .map((j) => String(j?.client_name || '').trim())
      .filter(Boolean)
      .map((name) => name.toLowerCase())
  ));

  const clientNameMap = new Map();
  await Promise.all(uniqueClientNames.map(async (lowerName) => {
    // Try exact match first, then substring match
    let found = await Client.findOne(
      {
        organisation_id: orgId,
        name: { $regex: `^${escapeRegex(lowerName)}$`, $options: 'i' },
      },
      { _id: 1, name: 1 }
    ).lean();
    if (!found) {
      found = await Client.findOne(
        {
          organisation_id: orgId,
          name: { $regex: escapeRegex(lowerName), $options: 'i' },
        },
        { _id: 1, name: 1 }
      ).lean();
    }
    if (found) clientNameMap.set(lowerName, found);
  }));

  // Resolve job_type names to JobType documents
  const uniqueJobTypeNames = Array.from(new Set(
    jobs.map((j) => String(j?.job_type || '').trim()).filter(Boolean)
  ));

  const jobTypeMap = new Map();
  if (uniqueJobTypeNames.length > 0) {
    const foundTypes = await JobType.find({
      organisation_id: orgId,
      name: { $in: uniqueJobTypeNames },
    }).lean();
    // Also try case-insensitive for unmatched names
    const lowerNameMatches = uniqueJobTypeNames.filter(
      (name) => !foundTypes.some((jt) => jt.name.toLowerCase() === name.toLowerCase())
    );
    if (lowerNameMatches.length > 0) {
      const regexMatches = await JobType.find({
        organisation_id: orgId,
        name: { $in: lowerNameMatches.map((n) => new RegExp(`^${escapeRegex(n)}$`, 'i')) },
      }).lean();
      regexMatches.forEach((jt) => {
        if (!foundTypes.some((f) => String(f._id) === String(jt._id))) {
          foundTypes.push(jt);
        }
      });
    }
    foundTypes.forEach((jt) => {
      jobTypeMap.set(jt.name.toLowerCase(), jt);
    });
  }

  // Pre-compute recurring month entries if recurring
  let sharedRecurringEntries = [];
  if (frequency === 'recurring') {
    const { nextEntries } = reconcileRecurringMonthEntries(
      importSettings.recurrence_type,
      importSettings.recurrence_start_date,
      importSettings.recurrence_end_date,
      [],
      Number(importSettings.deadline_day),
    );
    sharedRecurringEntries = nextEntries;
  }

  const candidates = [];
  const errors = [];

  jobs.forEach((j, index) => {
    const row = index + 1;
    const rowErrors = [];

    const name = String(j?.name || '').trim();
    const clientNameInput = String(j?.client_name || '').trim();
    const clientLookupKey = clientNameInput.toLowerCase();
    const matchedClient = clientNameMap.get(clientLookupKey);

    const jobTypeName = String(j?.job_type || '').trim();
    const jobFee = Number(j?.job_fee) || 0;
    const deadline = j?.deadline && frequency !== 'recurring' ? parseDate(j.deadline) : null;
    const statusRaw = String(j?.status || '').trim();
    const status = statusRaw === 'In Progress' ? 'Doing' : (statusRaw || 'Pending');

    if (!name) rowErrors.push('name is required');
    if (!clientNameInput) rowErrors.push('client_name is required');
    if (!jobTypeName) rowErrors.push('job_type is required');
    if (j?.deadline && frequency !== 'recurring' && !deadline) rowErrors.push('deadline must be a valid date');
    if (!matchedClient && clientNameInput) {
      rowErrors.push('client_name not found in your organisation');
    }
    if (!['Pending', 'Doing', 'Completed'].includes(status)) {
      rowErrors.push('status must be one of Pending, Doing, Completed');
    }

    if (rowErrors.length) {
      errors.push({ row, reasons: rowErrors });
      return;
    }

    // Build job_type_entries — single entry per row
    const matchedType = jobTypeMap.get(jobTypeName.toLowerCase());
    const jobTypeEntries = [{
      job_type_id: matchedType?._id || null,
      job_type_name: matchedType?.name || jobTypeName,
      fee: jobFee,
      work_components: matchedType?.work_components || [],
    }];

    const payload = {
      name,
      client_id: matchedClient._id,
      client_name: matchedClient.name,
      job_type_entries: jobTypeEntries,
      job_fee: jobFee,
      priority: j?.priority || 'Medium',
      deadline: frequency === 'recurring' ? null : deadline,
      description: j?.description || null,
      financial_year: j?.financial_year || String(new Date().getUTCFullYear()),
      status,
      organisation_id: orgId,
      created_by: req.user?._id || null,
    };

    if (frequency === 'recurring') {
      payload.is_recurring = true;
      payload.recurrence_type = importSettings.recurrence_type;
      payload.recurrence_start_date = importSettings.recurrence_start_date;
      payload.recurrence_end_date = importSettings.recurrence_end_date;
      payload.deadline_day = Number(importSettings.deadline_day);
      payload.recurring_month_entries = sharedRecurringEntries;
    }

    candidates.push({ row, payload });
  });

  if (!candidates.length) {
    return res.status(400).json({
      detail: 'No valid job records provided',
      imported_count: 0,
      inserted_count: 0,
      skipped_count: jobs.length,
      errors,
      records: [],
    });
  }

  // Check plan limit
  const canImportJobs = await checkPlanLimitByOrganisationId(res, orgId, 'jobs', {
    increment: candidates.length,
    detailPrefix: 'This job import would exceed your current plan limit. Please upgrade to import more jobs.',
  });
  if (!canImportJobs) return;

  let created = [];
  try {
    created = await Job.insertMany(candidates.map((item) => item.payload), { ordered: false });
  } catch (error) {
    created = Array.isArray(error?.insertedDocs) ? error.insertedDocs : [];
    if (Array.isArray(error?.writeErrors)) {
      error.writeErrors.forEach((writeError) => {
        const failedInputIndex = writeError?.index;
        const source = candidates[failedInputIndex];
        if (!source) return;
        const reason = writeError?.errmsg || writeError?.message || 'database write failed';
        errors.push({ row: source.row, reasons: [reason] });
      });
    } else {
      throw error;
    }
  }

  const importedCount = created.length;
  const skippedCount = Math.max(0, jobs.length - importedCount);

  return res.status(201).json({
    message: 'Jobs imported',
    imported_count: importedCount,
    inserted_count: importedCount,
    skipped_count: skippedCount,
    error_count: errors.length,
    errors,
    records: serializeList(created),
  });
});

export const exportJobsCsv = asyncHandler(async (req, res) => {
  const month = req.query.month ? String(req.query.month) : null;
  const orgId = req.user.organisation_id;
  const query = { organisation_id: orgId, ...(month ? { createdAt: { $gte: new Date(`${month}-01T00:00:00.000Z`) } } : {}) };
  const jobs = await Job.find(query).sort({ createdAt: -1 });

  const rows = jobs.map((j) => ({
    _id: j._id.toString(),
    id: j._id.toString(),
    name: j.name,
    client_name: j.client_name,
    job_type: j.job_type_label || '',
    job_fee: Number(j.job_fee || 0),
    status: j.status,
    priority: j.priority,
    financial_year: j.financial_year,
  }));

  const csv = toCsv(rows);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="jobs-export.csv"');
  return res.status(200).send(csv);
});

export const getStaffImportTemplate = asyncHandler(async (_req, res) => {
  const headers = [
    'name', 'email', 'role', 'access_level', 'hourly_rate',
    'available_hours_per_month', 'productivity_factor',
    'annual_fee_budget', 'annual_budgeted_hours', 'department_name',
  ];
  return res.json({
    format: 'json-or-csv',
    headers,
    sample: {
      name: 'Jane Smith',
      email: 'jane.smith@firm.co.za',
      role: 'Accountant',
      access_level: 'Standard',
      hourly_rate: 500,
      available_hours_per_month: 160,
      productivity_factor: 0.85,
      annual_fee_budget: 500000,
      annual_budgeted_hours: 1000,
      department_name: 'Management Accounts',
    },
  });
});

export const bulkImportStaff = asyncHandler(async (req, res) => {
  const { staff } = req.body || {};
  if (!Array.isArray(staff) || staff.length === 0) {
    return res.status(400).json({ detail: 'staff array is required' });
  }

  const orgId = req.user.organisation_id;

  // Build case-insensitive department name → _id map
  const departments = await Department.find({ organisation_id: orgId }, { name: 1 }).lean();
  if (!departments.length) {
    return res.status(400).json({
      detail: 'No departments found for your organisation. Add a department first, then import staff.',
      action: 'add_department_first',
    });
  }

  // Hash default password once
  const passwordHash = await hashPassword(process.env.STAFF_IMPORT_DEFAULT_PASSWORD || 'ChangeMe123!');

  const deptMap = new Map(departments.map((d) => [d.name.toLowerCase(), d._id.toString()]));

  const normalizedRows = staff.map((row) => {
    const departmentKey = String(row.department_name || '').toLowerCase().trim();
    const departmentId = deptMap.get(departmentKey) || null;
    return {
      raw: row,
      email: String(row.email || '').toLowerCase().trim(),
      name: String(row.name || '').trim(),
      departmentId,
    };
  });

  const withDepartment = normalizedRows.filter((row) => row.departmentId);
  const withEmail = withDepartment.filter((row) => row.email);

  // Keep one row per email so repeated rows in a file do not create duplicate key writes.
  const uniqueByEmail = new Map();
  for (const row of withEmail) {
    if (!uniqueByEmail.has(row.email)) {
      uniqueByEmail.set(row.email, row);
    }
  }

  const candidateRows = Array.from(uniqueByEmail.values());
  const candidateEmails = candidateRows.map((row) => row.email);
  const invalid_department_count = normalizedRows.length - withDepartment.length;
  const missing_email_count = withDepartment.length - withEmail.length;
  const duplicate_in_file_count = withEmail.length - candidateRows.length;

  const existingGlobal = await Staff.find({ email: { $in: candidateEmails } });
  const existingByEmail = new Map(existingGlobal.map((record) => [record.email, record]));
  const existingMembershipStaffIds = await OrganisationMembership.distinct('staff_id', {
    organisation_id: orgId,
    status: 'active',
    staff_id: { $in: existingGlobal.map((record) => record._id) },
  });
  const activeMembershipIds = new Set(existingMembershipStaffIds.map((id) => String(id)));

  const seatDemandCount = candidateRows.reduce((count, row) => {
    const existing = existingByEmail.get(row.email);
    if (existing) {
      return count + (activeMembershipIds.has(String(existing._id)) ? 0 : 1);
    }
    return count + (row.name ? 1 : 0);
  }, 0);

  const canImportStaff = await checkPlanLimitByOrganisationId(res, orgId, 'users', {
    increment: seatDemandCount,
    detailPrefix: 'This staff import would exceed your current plan limit. Please upgrade to add more team members.',
  });
  if (!canImportStaff) return;

  const linkedById = new Map();
  const createdRecords = [];
  let missing_name_count = 0;
  let already_exists_count = 0;

  for (const row of candidateRows) {
    const existing = existingByEmail.get(row.email);

    if (existing) {
      const membershipResult = await ensureStaffMembership({
        organisationId: orgId,
        staffId: existing._id,
        role: 'member',
      });
      if (membershipResult.status === 'already_active') {
        already_exists_count += 1;
      } else {
        linkedById.set(String(existing._id), existing);
      }
      continue;
    }

    if (!row.name) {
      missing_name_count += 1;
      continue;
    }

    try {
      const created = await Staff.create({
        name: row.name,
        email: row.email,
        passwordHash,
        role: row.raw.role || 'Accountant',
        access_level: row.raw.access_level || 'Standard',
        hourly_rate: Number(row.raw.hourly_rate) || 0,
        available_hours_per_month: Number(row.raw.available_hours_per_month) || 160,
        productivity_factor: Number(row.raw.productivity_factor) || 0.8,
        efficiency: Number(row.raw.efficiency) || 1,
        annual_fee_budget: Number(row.raw.annual_fee_budget) || 0,
        annual_budgeted_hours: Number(row.raw.annual_budgeted_hours) || 0,
        department_id: row.departmentId,
        department_ids: [row.departmentId],
        is_active: false,
        invitation_status: 'pending',
        accepted_at: null,
        is_archived: false,
        can_delete: true,
        mustChangePassword: true,
        organisation_id: orgId,
        created_by: req.user?._id || null,
      });

      await ensureStaffMembership({
        organisationId: orgId,
        staffId: created._id,
        role: 'member',
      });

      createdRecords.push(created);
    } catch (error) {
      if (error?.code !== 11000) {
        throw error;
      }

      // Handle races where another request creates the same email after pre-check.
      const racedExisting = await Staff.findOne({ email: row.email });
      if (!racedExisting) {
        throw error;
      }

      const membershipResult = await ensureStaffMembership({
        organisationId: orgId,
        staffId: racedExisting._id,
        role: 'member',
      });
      if (membershipResult.status === 'already_active') {
        already_exists_count += 1;
      } else {
        linkedById.set(String(racedExisting._id), racedExisting);
      }
    }
  }

  const linkedRecords = Array.from(linkedById.values());
  const imported_count = createdRecords.length + linkedRecords.length;
  const skipped_count = staff.length - imported_count;
  const skipped_reasons = {
    already_exists: already_exists_count,
    missing_name: missing_name_count,
    missing_email: missing_email_count,
    invalid_department: invalid_department_count,
    duplicate_in_file: duplicate_in_file_count,
  };
  const allCandidatesAlreadyExist =
    candidateRows.length > 0 &&
    already_exists_count === candidateRows.length &&
    imported_count === 0;

  if (!imported_count) {
    if (allCandidatesAlreadyExist) {
      return res.status(400).json({
        detail: 'All staff in this file already exist in your organisation.',
        reason: 'all_already_exist',
        skipped_count,
        already_exists_count,
        skipped_reasons,
      });
    }

    return res.status(400).json({
      detail: 'No staff records could be imported. Check required fields and department names.',
      reason: 'no_importable_rows',
      skipped_count,
      already_exists_count,
      skipped_reasons,
    });
  }

  const emailQueueResults = await Promise.allSettled(
    createdRecords.map((record) => enqueueStaffWelcomeEmailJob({
      staffId: record._id,
      organisationId: orgId,
      password: process.env.STAFF_IMPORT_DEFAULT_PASSWORD || 'ChangeMe123!',
    }))
  );

  let email_queued_count = 0;
  const emailFailureOps = [];

  emailQueueResults.forEach((result, index) => {
    if (result.status === 'fulfilled') {
      email_queued_count += 1;
      return;
    }

    const failedStaff = createdRecords[index];
    const emailError = result.reason?.message || 'Failed to queue welcome email';
    console.warn(`[bulkImportStaff] Failed to queue welcome email for ${failedStaff?.email || 'unknown'}: ${emailError}`);

    if (failedStaff?._id) {
      emailFailureOps.push({
        updateOne: {
          filter: { _id: failedStaff._id },
          update: {
            $set: {
              welcome_email_error: emailError,
              welcome_email_error_at: new Date(),
            },
          },
        },
      });
    }
  });

  if (emailFailureOps.length) {
    await Staff.bulkWrite(emailFailureOps, { ordered: false });
  }

  return res.status(201).json({
    message:
      already_exists_count > 0
        ? `Imported ${imported_count} staff. ${already_exists_count} already existed in your organisation and were skipped.`
        : 'Staff imported',
    imported_count,
    created_new_count: createdRecords.length,
    linked_existing_count: linkedRecords.length,
    skipped_count,
    already_exists_count,
    skipped_reasons,
    email_queued_count,
    email_failed_count: createdRecords.length - email_queued_count,
    records: serializeList([...createdRecords, ...linkedRecords]),
  });
});

export const getJobTypesImportTemplate = asyncHandler(async (_req, res) => {
  const headers = ['name', 'description', 'component_name', 'role', 'percentage', 'hours_multiplier'];
  return res.json({
    format: 'json-or-csv',
    headers,
    sample: {
      name: 'Tax Advisory',
      description: 'Tax compliance and advisory services.',
      component_name: 'TA: Manager',
      role: 'Manager',
      percentage: 100,
      hours_multiplier: 1,
    },
  });
});

export const bulkImportJobTypes = asyncHandler(async (req, res) => {
  const { job_types } = req.body || {};
  if (!Array.isArray(job_types) || job_types.length === 0) {
    return res.status(400).json({ detail: 'job_types array is required' });
  }

  const orgId = req.user?.organisation_id;
  if (!orgId) {
    return res.status(403).json({ detail: 'Organisation context is required' });
  }

  const created = [];
  const errors = [];
  let skippedCount = 0;

  for (const jt of job_types) {
    const name = String(jt?.name || '').trim();
    if (!name) {
      skippedCount += 1;
      continue;
    }

    const code = nameToCode(name);

    const existing = await JobType.findOne({ code, organisation_id: orgId });
    if (existing) {
      skippedCount += 1;
      errors.push({ name, reason: 'Job type with this code already exists' });
      continue;
    }

    try {
      const doc = await JobType.create({
        name,
        code,
        description: jt?.description || null,
        work_components: normalizeWorkComponents(jt?.work_components || []),
        is_system: false,
        organisation_id: orgId,
        created_by: req.user?._id || null,
      });
      created.push(doc);
    } catch (err) {
      skippedCount += 1;
      errors.push({ name, reason: err?.message || 'Failed to create' });
    }
  }

  return res.status(201).json({
    message: `${created.length} job type${created.length !== 1 ? 's' : ''} imported`,
    imported_count: created.length,
    skipped_count: skippedCount,
    errors,
    records: serializeList(created),
  });
});
