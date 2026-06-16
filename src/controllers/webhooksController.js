import crypto from 'node:crypto';
import Allocation from '../models/Allocation.js';
import Job from '../models/Job.js';
import Staff from '../models/Staff.js';
import TimeEntry from '../models/TimeEntry.js';
import Webhook from '../models/Webhook.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { serializeDocument, serializeList } from '../utils/serialize.js';
import { toObjectId } from '../utils/objectId.js';

export const exportForPowerBi = asyncHandler(async (req, res) => {
  const report_type = String(req.query.report_type || 'all');
  const month = String(req.query.month || new Date().toISOString().slice(0, 7));
  const orgId = req.user.organisation_id;

  const [jobs, staff, allocations] = await Promise.all([
    Job.find({ organisation_id: orgId }),
    Staff.find({ is_active: true, is_archived: { $ne: true }, organisation_id: orgId }),
    Allocation.find({ month, organisation_id: orgId }),
  ]);
  const allocIds = allocations.map((a) => a._id);
  const timeEntries = allocIds.length ? await TimeEntry.find({ allocation_id: { $in: allocIds } }) : [];

  const data = {
    month,
    totals: {
      jobs: jobs.length,
      active_staff: staff.length,
      allocations: allocations.length,
      time_entries: timeEntries.length,
    },
  };

  return res.json({
    export_type: 'power_bi',
    report_type,
    exported_at: new Date().toISOString(),
    data,
  });
});

export const exportForSage = asyncHandler(async (req, res) => {
  const orgId = req.user.organisation_id;
  const [jobs, staff] = await Promise.all([
    Job.find({ organisation_id: orgId }),
    Staff.find({ is_active: true, organisation_id: orgId }),
  ]);
  const jobIds = jobs.map((j) => j._id);
  const timeEntries = jobIds.length ? await TimeEntry.find({ job_id: { $in: jobIds } }) : [];

  const jobsMap = new Map(jobs.map((j) => [j._id.toString(), j]));
  const staffMap = new Map(staff.map((s) => [s._id.toString(), s]));

  const billable_entries = timeEntries
    .map((e) => {
      const job = jobsMap.get(e.job_id?.toString());
      const employee = staffMap.get(e.staff_id?.toString());
      if (!job || !employee) return null;

      const rate = Number(employee.hourly_rate || 0);
      return {
        Date: e.date,
        Client: job.client_name,
        Reference: job.name,
        Employee: employee.name,
        Hours: Number(e.hours_worked || 0),
        Rate: rate,
        Amount: Number((Number(e.hours_worked || 0) * rate).toFixed(2)),
      };
    })
    .filter(Boolean);

  return res.json({
    export_type: 'sage_accounting',
    exported_at: new Date().toISOString(),
    record_count: billable_entries.length,
    billable_entries,
  });
});

export const registerWebhook = asyncHandler(async (req, res) => {
  const { url, event_types = [], secret } = req.body || {};
  if (!url || !Array.isArray(event_types)) {
    return res.status(400).json({ detail: 'url and event_types[] are required' });
  }

  const created = await Webhook.create({
    url: String(url),
    event_types,
    secret: secret || crypto.randomBytes(16).toString('hex'),
    is_active: true,
    organisation_id: req.user.organisation_id,
  });

  return res.status(201).json(serializeDocument(created));
});

export const listWebhooks = asyncHandler(async (req, res) => {
  const rows = await Webhook.find({ is_active: true, organisation_id: req.user.organisation_id }).sort({ created_at: -1 });
  return res.json(serializeList(rows));
});

export const deleteWebhook = asyncHandler(async (req, res) => {
  const _id = toObjectId(req.params.webhook_id, 'webhook_id');
  const existing = await Webhook.findById(_id);
  if (!existing) return res.status(404).json({ detail: 'Webhook not found' });
  if (String(existing.organisation_id) !== String(req.user.organisation_id)) {
    return res.status(403).json({ detail: 'Access denied' });
  }
  await Webhook.findByIdAndUpdate(_id, { is_active: false });
  return res.json({ message: 'Webhook deleted', id: _id.toString(), _id: _id.toString() });
});
