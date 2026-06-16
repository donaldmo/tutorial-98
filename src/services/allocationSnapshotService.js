import Job from '../models/Job.js';
import Staff from '../models/Staff.js';

export const getUtcCurrentMonth = () => {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
};

export const isCurrentMonthValue = (month) => String(month || '') === getUtcCurrentMonth();

export const isCurrentMonthAllocation = (allocation) => {
  if (!allocation?.month) return false;
  return isCurrentMonthValue(allocation.month);
};

const normalizeDocId = (value) => value?._id?.toString?.() || value?.toString?.() || null;

const resolveJobAndStaff = async ({ allocation, job, staff }) => {
  const [resolvedJob, resolvedStaff] = await Promise.all([
    job || (allocation?.job_id ? Job.findById(allocation.job_id) : Promise.resolve(null)),
    staff || (allocation?.staff_id ? Staff.findById(allocation.staff_id) : Promise.resolve(null)),
  ]);

  return { resolvedJob, resolvedStaff };
};

const createSnapshotPayload = ({ allocation, job, staff, state, reason }) => ({
  captured_at: new Date(),
  state,
  reason,
  month: allocation?.month || null,
  allocation_id: normalizeDocId(allocation?._id),
  job_id: normalizeDocId(allocation?.job_id),
  staff_id: normalizeDocId(allocation?.staff_id),
  job_name: job?.name || null,
  client_name: job?.client_name || null,
  staff_name: staff?.name || null,
  staff_role: staff?.role || null,
  work_component_key: allocation?.work_component_key || null,
  percentage: Number(allocation?.percentage || 0),
  allocated_fee: Number(allocation?.allocated_fee || 0),
  calculated_hours: Number(allocation?.calculated_hours || 0),
  adjusted_hours: Number(allocation?.adjusted_hours || 0),
  completed_percentage: Number(allocation?.completed_percentage || 0),
  workflow_status: allocation?.workflow_status || 'Pending',
  hourly_rate: Number(staff?.hourly_rate || 0),
  productivity_factor: Number(staff?.productivity_factor || 1),
  job_fee: Number(job?.pricing_override ?? job?.job_fee ?? 0),
  allocation_status: job?.status || null,
  job_status: job?.status || null,
});

const getAllocationVersionPayloadByNumber = (allocation, version) => {
  const history = Array.isArray(allocation?.snapshot_versions) ? allocation.snapshot_versions : [];
  return history.find((entry) => Number(entry?.version || 0) === Number(version || 0))?.payload || null;
};

export const getEffectiveAllocationSnapshotPayload = (allocation, { requestedMonth: _requestedMonth = null } = {}) => {
  if (!allocation) return null;

  if (allocation.workflow_status === 'Completed') {
    return getAllocationVersionPayloadByNumber(allocation, allocation.last_completed_snapshot_version)
      || allocation.snapshot_current
      || null;
  }

  return allocation.snapshot_current || null;
};

export const getEffectiveAllocationView = (allocation, { requestedMonth = null } = {}) => {
  if (!allocation) return allocation;
  const base = typeof allocation.toObject === 'function' ? allocation.toObject() : { ...allocation };
  const payload = getEffectiveAllocationSnapshotPayload(allocation, { requestedMonth });
  if (!payload) return base;

  return {
    ...base,
    month: payload.month ?? base.month,
    percentage: Number(payload.percentage ?? base.percentage ?? 0),
    allocated_fee: Number(payload.allocated_fee ?? base.allocated_fee ?? 0),
    calculated_hours: Number(payload.calculated_hours ?? base.calculated_hours ?? 0),
    adjusted_hours: Number(payload.adjusted_hours ?? base.adjusted_hours ?? 0),
    completed_percentage: Number(payload.completed_percentage ?? base.completed_percentage ?? 0),
    workflow_status: payload.workflow_status || base.workflow_status,
    work_component_key: payload.work_component_key ?? base.work_component_key,
    staff_name: payload.staff_name ?? base.staff_name,
    staff_role: payload.staff_role ?? base.staff_role,
    hourly_rate: Number(payload.hourly_rate ?? base.hourly_rate ?? 0),
    job_name: payload.job_name ?? base.job_name,
    client_name: payload.client_name ?? base.client_name,
  };
};

export const appendAllocationSnapshotVersion = async ({
  allocation,
  state = 'draft',
  reason = 'manual_update',
  createdBy = null,
  job = null,
  staff = null,
  monthScoped = true,
  force = false,
}) => {
  if (!allocation) return null;
  if (monthScoped && !force && !isCurrentMonthAllocation(allocation)) {
    return allocation;
  }

  const { resolvedJob, resolvedStaff } = await resolveJobAndStaff({ allocation, job, staff });
  const version = Number(allocation.snapshot_current_version || 0) + 1;
  const payload = createSnapshotPayload({
    allocation,
    job: resolvedJob,
    staff: resolvedStaff,
    state,
    reason,
  });

  const snapshotVersion = {
    version,
    created_at: new Date(),
    created_by: normalizeDocId(createdBy),
    state,
    payload,
  };

  const history = Array.isArray(allocation.snapshot_versions) ? allocation.snapshot_versions : [];
  allocation.snapshot_versions = [...history, snapshotVersion];
  allocation.snapshot_current_version = version;
  allocation.snapshot_current = payload;
  if (state === 'completed') {
    allocation.last_completed_snapshot_version = version;
  }

  await allocation.save();
  return allocation;
};

export const appendDraftFromLastCompletedSnapshot = async ({
  allocation,
  reason = 'uncomplete_reopen',
  createdBy = null,
}) => {
  if (!allocation) return null;

  const history = Array.isArray(allocation.snapshot_versions) ? allocation.snapshot_versions : [];
  const lastCompletedVersion = Number(allocation.last_completed_snapshot_version || 0);
  const lastCompleted = history.find((entry) => Number(entry?.version || 0) === lastCompletedVersion);

  if (!lastCompleted?.payload) {
    return appendAllocationSnapshotVersion({
      allocation,
      state: 'draft',
      reason,
      createdBy,
      monthScoped: false,
      force: true,
    });
  }

  const version = Number(allocation.snapshot_current_version || 0) + 1;
  const payload = {
    ...lastCompleted.payload,
    captured_at: new Date(),
    state: 'draft',
    reason,
    workflow_status: allocation.workflow_status || 'Pending',
    completed_percentage: Number(allocation.completed_percentage || 0),
  };

  const snapshotVersion = {
    version,
    created_at: new Date(),
    created_by: normalizeDocId(createdBy),
    state: 'draft',
    payload,
  };

  allocation.snapshot_versions = [...history, snapshotVersion];
  allocation.snapshot_current_version = version;
  allocation.snapshot_current = payload;

  await allocation.save();
  return allocation;
};
