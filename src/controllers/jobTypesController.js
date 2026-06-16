import JobType from '../models/JobType.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { toObjectId } from '../utils/objectId.js';
import { serializeDocument, serializeList } from '../utils/serialize.js';
import {
  nameToCode,
  normalizeWorkComponents,
  sanitizeName,
} from '../services/planningService.js';

const sanitizeJobTypePayload = (body = {}) => {
  const name = sanitizeName(body.name);
  return {
    name,
    code: nameToCode(name),
    description: body.description || null,
    is_active: body.is_active !== false,
    work_components: normalizeWorkComponents(body.work_components),
  };
};

export const listJobTypes = asyncHandler(async (req, res) => {
  const [systemTypes, customTypes] = await Promise.all([
    JobType.find({ organisation_id: req.user.organisation_id, is_system: true }).sort({ name: 1 }),
    JobType.find({ organisation_id: req.user.organisation_id, is_system: false }).sort({ createdAt: -1, name: 1 }),
  ]);
  return res.json({
    system_types: serializeList(systemTypes),
    custom_types: serializeList(customTypes),
  });
});

export const createJobType = asyncHandler(async (req, res) => {
  const body = sanitizeJobTypePayload(req.body || {});
  if (!body.name) {
    return res.status(400).json({ detail: 'name is required' });
  }

  const existing = await JobType.findOne({ code: body.code, organisation_id: req.user.organisation_id });
  if (existing) {
    return res.status(409).json({ detail: 'A job type with this code already exists' });
  }

  const created = await JobType.create({
    ...body,
    is_system: false,
    organisation_id: req.user.organisation_id,
    created_by: req.user._id,
  });

  return res.status(201).json(serializeDocument(created));
});

export const updateJobType = asyncHandler(async (req, res) => {
  const _id = toObjectId(req.params.job_type_id, 'job_type_id');
  const body = sanitizeJobTypePayload(req.body || {});
  if (!body.name) {
    return res.status(400).json({ detail: 'name is required' });
  }

  const existing = await JobType.findById(_id);
  if (!existing) return res.status(404).json({ detail: 'Job type not found' });
  if (String(existing.organisation_id) !== String(req.user.organisation_id)) {
    return res.status(403).json({ detail: 'Access denied' });
  }
  if (existing.is_system) {
    return res.status(403).json({ detail: 'System job types cannot be edited' });
  }

  const duplicate = await JobType.findOne({ code: body.code, _id: { $ne: _id }, organisation_id: req.user.organisation_id });
  if (duplicate) {
    return res.status(409).json({ detail: 'A job type with this code already exists' });
  }

  const updated = await JobType.findByIdAndUpdate(
    _id,
    {
      name: body.name,
      code: body.code,
      description: body.description,
      is_active: body.is_active,
      work_components: body.work_components,
    },
    { new: true, runValidators: true },
  );
  if (!updated) return res.status(404).json({ detail: 'Job type not found' });
  return res.json(serializeDocument(updated));
});

export const deleteJobType = asyncHandler(async (req, res) => {
  const _id = toObjectId(req.params.job_type_id, 'job_type_id');
  const existing = await JobType.findById(_id);
  if (!existing) return res.status(404).json({ detail: 'Job type not found' });
  if (String(existing.organisation_id) !== String(req.user.organisation_id)) {
    return res.status(403).json({ detail: 'Access denied' });
  }
  if (existing.is_system) {
    return res.status(403).json({ detail: 'System job types cannot be deleted' });
  }
  const deleted = await JobType.findByIdAndDelete(_id);
  if (!deleted) return res.status(404).json({ detail: 'Job type not found' });
  return res.json({ message: 'Job type deleted', id: deleted._id.toString(), _id: deleted._id.toString() });
});