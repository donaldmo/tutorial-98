import Department from '../models/Department.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { toObjectId } from '../utils/objectId.js';
import { serializeDocument, serializeList } from '../utils/serialize.js';
import { parsePagination, buildPaginationMeta } from '../utils/pagination.js'; // Group 4 – Task 4.2

const normalizeDepartmentPayload = (body = {}) => {
  const payload = {};

  if (body.name !== undefined) {
    payload.name = String(body.name || '').trim();
  }

  if (body.code !== undefined) {
    payload.code = String(body.code || '').trim().toUpperCase();
  }

  if (body.description !== undefined) {
    payload.description = body.description || null;
  }

  if (body.color !== undefined) {
    payload.color = body.color;
  }

  if (body.is_active !== undefined) {
    payload.is_active = body.is_active;
  }

  if (body.supervisor_id !== undefined) {
    payload.supervisor_id = body.supervisor_id ? toObjectId(body.supervisor_id, 'supervisor_id') : null;
  }

  return payload;
};

export const listDepartments = asyncHandler(async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query);
  const organisationFilter = { organisation_id: req.user.organisation_id };
  const [records, total] = await Promise.all([
    Department.find(organisationFilter).sort({ createdAt: -1 }).skip(skip).limit(limit),
    Department.countDocuments(organisationFilter),
  ]);
  res.json({ data: serializeList(records), pagination: buildPaginationMeta(total, page, limit) });
});

export const getDepartmentById = asyncHandler(async (req, res) => {
  const _id = toObjectId(req.params.dept_id, 'dept_id');
  const record = await Department.findById(_id);
  if (!record) return res.status(404).json({ detail: 'Department not found' });
  if (String(record.organisation_id) !== String(req.user.organisation_id)) {
    return res.status(403).json({ detail: 'Access denied' });
  }
  return res.json(serializeDocument(record));
});

export const createDepartment = asyncHandler(async (req, res) => {
  const payload = normalizeDepartmentPayload(req.body || {});
  if (!payload.name) {
    return res.status(400).json({ detail: 'name is required' });
  }

  if (!payload.code) {
    return res.status(400).json({ detail: 'code is required' });
  }

  const created = await Department.create({ ...payload, organisation_id: req.user.organisation_id, created_by: req.user._id });
  return res.status(201).json(serializeDocument(created));
});

export const updateDepartment = asyncHandler(async (req, res) => {
  const _id = toObjectId(req.params.dept_id, 'dept_id');
  const body = normalizeDepartmentPayload(req.body || {});

  const existing = await Department.findById(_id);
  if (!existing) return res.status(404).json({ detail: 'Department not found' });
  if (String(existing.organisation_id) !== String(req.user.organisation_id)) {
    return res.status(403).json({ detail: 'Access denied' });
  }

  const updated = await Department.findByIdAndUpdate(_id, body, { new: true, runValidators: true });
  if (!updated) return res.status(404).json({ detail: 'Department not found' });

  return res.json(serializeDocument(updated));
});

export const deleteDepartment = asyncHandler(async (req, res) => {
  const _id = toObjectId(req.params.dept_id, 'dept_id');
  const deleted = await Department.findByIdAndDelete(_id);
  if (!deleted) return res.status(404).json({ detail: 'Department not found' });

  return res.json({ message: 'Department deleted', id: _id.toString(), _id: _id.toString() });
});
