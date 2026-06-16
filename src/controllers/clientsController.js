import Client from '../models/Client.js';
import Admin from '../models/Admin.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { toObjectId } from '../utils/objectId.js';
import { checkPlanLimit } from '../services/planLimitService.js';
import { parsePagination, buildPaginationMeta } from '../utils/pagination.js';
import { serializeDocument, serializeList } from '../utils/serialize.js';
import { normalizeSplitRows, sanitizeName } from '../services/planningService.js';
import {
  calculateFeeSplit,
  validateFeeSplitPercentages,
} from '../services/feeConfigService.js';

const normalizeEmail = (value) => {
  const normalized = String(value || '').trim().toLowerCase();
  return normalized || null;
};

const sanitizeClientPayload = (body = {}) => ({
  name: sanitizeName(body.name),
  contact_person: body.contact_person || null,
  email: normalizeEmail(body.email),
  phone: body.phone || null,
  address: body.address || null,
  industry: body.industry || null,
  notes: body.notes || null,
  role_fee_splits: normalizeSplitRows(body.role_fee_splits),
  is_active: body.is_active !== false,
});

const buildClientEmailConflictDetail = (scope) => {
  if (scope === 'client') return 'A client with this email already exists in your organisation';
  return 'This email is already used by an organisation admin';
};

const findClientEmailConflict = async ({ email, organisationId, excludedClientId = null }) => {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) return null;

  const clientQuery = { email: normalizedEmail, organisation_id: organisationId };
  if (excludedClientId) {
    clientQuery._id = { $ne: excludedClientId };
  }

  const conflictingClient = await Client.findOne(clientQuery).select('_id').lean();
  if (conflictingClient) {
    return { scope: 'client', detail: buildClientEmailConflictDetail('client') };
  }

  const conflictingAdmin = await Admin.findOne({
    email: normalizedEmail,
    organisation_id: organisationId,
  }).select('_id').lean();

  if (conflictingAdmin) {
    return { scope: 'admin', detail: buildClientEmailConflictDetail('admin') };
  }

  return null;
};

export const listClients = asyncHandler(async (req, res) => {
  const query = { organisation_id: req.user.organisation_id };
  if (String(req.query.active_only || '').toLowerCase() === 'true') {
    query.is_active = true;
  }
  if (req.query.search) {
    const escaped = req.query.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    query.$or = [
      { name: { $regex: escaped, $options: 'i' } },
      { contact_person: { $regex: escaped, $options: 'i' } },
      { email: { $regex: escaped, $options: 'i' } },
      { industry: { $regex: escaped, $options: 'i' } },
    ];
  }

  const { page, limit, skip } = parsePagination(req.query);
  const [records, total] = await Promise.all([
    Client.find(query).sort({ name: 1, createdAt: -1 }).skip(skip).limit(limit),
    Client.countDocuments(query),
  ]);
  return res.json({ data: serializeList(records), pagination: buildPaginationMeta(total, page, limit) });
});

export const getClientById = asyncHandler(async (req, res) => {
  const _id = toObjectId(req.params.client_id, 'client_id');
  const record = await Client.findById(_id);
  if (!record) return res.status(404).json({ detail: 'Client not found' });
  if (String(record.organisation_id) !== String(req.user.organisation_id)) {
    return res.status(403).json({ detail: 'Access denied' });
  }
  return res.json(serializeDocument(record));
});

export const createClient = asyncHandler(async (req, res) => {
  const body = sanitizeClientPayload(req.body || {});
  if (!body.name) {
    return res.status(400).json({ detail: 'name is required' });
  }
  if (!body.industry) {
    return res.status(400).json({ detail: 'industry is required' });
  }

  const withinLimit = await checkPlanLimit(req, res, 'clients');
  if (!withinLimit) return;

  const existing = await Client.findOne({ name: body.name, organisation_id: req.user.organisation_id });
  if (existing) {
    return res.status(409).json({ detail: 'A client with this name already exists' });
  }

  const emailConflict = await findClientEmailConflict({
    email: body.email,
    organisationId: req.user.organisation_id,
  });
  if (emailConflict) {
    return res.status(409).json({ detail: emailConflict.detail });
  }

  const created = await Client.create({ ...body, organisation_id: req.user.organisation_id, created_by: req.user._id });

  return res.status(201).json(serializeDocument(created));
});

export const updateClient = asyncHandler(async (req, res) => {
  const _id = toObjectId(req.params.client_id, 'client_id');
  const body = sanitizeClientPayload(req.body || {});
  if (!body.name) {
    return res.status(400).json({ detail: 'name is required' });
  }
  if (!body.industry) {
    return res.status(400).json({ detail: 'industry is required' });
  }

  const existing = await Client.findById(_id);
  if (!existing) return res.status(404).json({ detail: 'Client not found' });
  if (String(existing.organisation_id) !== String(req.user.organisation_id)) {
    return res.status(403).json({ detail: 'Access denied' });
  }

  const duplicate = await Client.findOne({ name: body.name, _id: { $ne: _id }, organisation_id: req.user.organisation_id });
  if (duplicate) {
    return res.status(409).json({ detail: 'A client with this name already exists' });
  }

  const emailConflict = await findClientEmailConflict({
    email: body.email,
    organisationId: req.user.organisation_id,
    excludedClientId: _id,
  });
  if (emailConflict) {
    return res.status(409).json({ detail: emailConflict.detail });
  }

  const updated = await Client.findByIdAndUpdate(_id, body, { new: true, runValidators: true });
  if (!updated) return res.status(404).json({ detail: 'Client not found' });
  return res.json(serializeDocument(updated));
});

export const deleteClient = asyncHandler(async (req, res) => {
  const _id = toObjectId(req.params.client_id, 'client_id');
  const existing = await Client.findById(_id);
  if (!existing) return res.status(404).json({ detail: 'Client not found' });
  if (String(existing.organisation_id) !== String(req.user.organisation_id)) {
    return res.status(403).json({ detail: 'Access denied' });
  }
  const updated = await Client.findByIdAndUpdate(_id, { is_active: false }, { new: true });
  if (!updated) return res.status(404).json({ detail: 'Client not found' });
  return res.json({ message: 'Client deactivated', id: updated._id.toString(), _id: updated._id.toString() });
});

export const importClients = asyncHandler(async (req, res) => {
  const rows = Array.isArray(req.body?.clients) ? req.body.clients : [];
  let importedCount = 0;
  const errors = [];

  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    if (!row?.name) {
      errors.push({ row: index + 2, error: 'Missing client name' });
      continue;
    }

    try {
      const normalizedName = sanitizeName(row.name);
      const normalizedEmail = normalizeEmail(row.email);
      const existingByName = await Client.findOne({
        name: normalizedName,
        organisation_id: req.user.organisation_id,
      }).select('_id').lean();

      const emailConflict = await findClientEmailConflict({
        email: normalizedEmail,
        organisationId: req.user.organisation_id,
        excludedClientId: existingByName?._id || null,
      });

      if (emailConflict) {
        errors.push({ row: index + 2, error: emailConflict.detail });
        continue;
      }

      await Client.findOneAndUpdate(
        { name: normalizedName, organisation_id: req.user.organisation_id },
        {
          ...row,
          name: normalizedName,
          email: normalizedEmail,
          is_active: true,
          role_fee_splits: normalizeSplitRows(row.role_fee_splits),
          organisation_id: req.user.organisation_id,
          created_by: req.user._id,
        },
        { upsert: true, new: true, runValidators: true },
      );
      importedCount += 1;
    } catch (error) {
      errors.push({ row: index + 2, error: error.message });
    }
  }

  return res.json({
    message: `Imported ${importedCount} clients`,
    imported_count: importedCount,
    error_count: errors.length,
    errors,
  });
});

// ─── Fee-config handlers (Group 3 – Task 3.2) ────────────────────────────────

export const getClientFeeConfig = asyncHandler(async (req, res) => {
  const _id = toObjectId(req.params.client_id, 'client_id');
  const client = await Client.findById(_id);
  if (!client) return res.status(404).json({ detail: 'Client not found' });
  return res.json({ role_fee_splits: client.role_fee_splits ?? [] });
});

export const updateClientFeeConfig = asyncHandler(async (req, res) => {
  const _id = toObjectId(req.params.client_id, 'client_id');
  const splits = normalizeSplitRows(req.body?.role_fee_splits);

  const validation = validateFeeSplitPercentages(splits);
  if (!validation.valid) {
    return res.status(400).json({ detail: validation.message });
  }

  const updated = await Client.findByIdAndUpdate(
    _id,
    { role_fee_splits: splits },
    { new: true, runValidators: true },
  );
  if (!updated) return res.status(404).json({ detail: 'Client not found' });
  return res.json({ role_fee_splits: updated.role_fee_splits });
});

export const previewClientFeeSplit = asyncHandler(async (req, res) => {
  const _id = toObjectId(req.params.client_id, 'client_id');
  const totalFee = Number(req.body?.total_fee ?? 0);

  if (Number.isNaN(totalFee) || totalFee < 0) {
    return res.status(400).json({ detail: 'total_fee must be a non-negative number' });
  }

  const breakdown = await calculateFeeSplit(_id, totalFee);
  if (!breakdown.length) return res.status(404).json({ detail: 'Client not found' });
  return res.json({ total_fee: totalFee, breakdown });
});