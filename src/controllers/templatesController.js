import Template from '../models/Template.js';
import Job from '../models/Job.js';
import Organisation from '../models/Organisation.js';
import { checkPlanLimit } from '../services/planLimitService.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { toObjectId } from '../utils/objectId.js';
import { serializeDocument, serializeList } from '../utils/serialize.js';
import {
  getBuiltInTemplates,
  installBuiltInTemplate,
  uninstallBuiltInTemplate,
  isBuiltInTemplateInstalled,
} from '../services/builtinTemplatesService.js';

const PRIORITIES = new Set(['Low', 'Medium', 'High', 'Critical']);

const sanitizeTemplatePayload = (body = {}) => {
  const payload = {
    name: String(body.name || '').trim(),
    industry: String(body.industry || '').trim(),
    job_type: String(body.job_type || '').trim(),
    default_fee: Number(body.default_fee),
    estimated_hours: body.estimated_hours === undefined || body.estimated_hours === null || body.estimated_hours === ''
      ? null
      : Number(body.estimated_hours),
    minimum_role: body.minimum_role ? String(body.minimum_role).trim() : null,
    default_priority: String(body.default_priority || 'Medium').trim(),
    description: body.description ? String(body.description).trim() : null,
  };

  return payload;
};

const validateTemplatePayload = (payload) => {
  if (!payload.name) return 'name is required';
  if (!payload.industry) return 'industry is required';
  if (!payload.job_type) return 'job_type is required';
  if (!Number.isFinite(payload.default_fee) || payload.default_fee < 0) return 'default_fee must be a non-negative number';
  if (payload.estimated_hours !== null && (!Number.isFinite(payload.estimated_hours) || payload.estimated_hours < 0)) {
    return 'estimated_hours must be a non-negative number';
  }
  if (!PRIORITIES.has(payload.default_priority)) return 'default_priority is invalid';
  return null;
};

const mapBuiltInTemplate = (template, installedEntry) => ({
  id: `builtin:${template.key}`,
  key: template.key,
  name: template.name,
  industry: template.industry,
  description: template.description,
  version: template.version,
  is_builtin: true,
  installed: Boolean(installedEntry),
  installed_at: installedEntry?.installed_at || null,
  default_priority: null,
  job_type: null,
  default_fee: null,
  estimated_hours: null,
  minimum_role: null,
  setup: template.setup || null,
});

export const listTemplates = asyncHandler(async (req, res) => {
  const organisationId = req.user.organisation_id;

  const [builtIns, customTemplates, organisation] = await Promise.all([
    getBuiltInTemplates(),
    Template.find({ organisation_id: organisationId }).sort({ createdAt: -1, name: 1 }),
    Organisation.findById(organisationId).select('installed_templates').lean(),
  ]);

  if (!organisation) {
    console.warn(`[templates] listTemplates: organisation not found for user=${req.user?._id || 'unknown'} organisation_id=${organisationId}`);
  }

  const installedEntries = Array.isArray(organisation?.installed_templates) ? organisation.installed_templates : [];

  const builtInTemplates = builtIns.map((template) => {
    const installedEntry = installedEntries.find((entry) => String(entry?.key || '').toLowerCase() === template.key);
    return mapBuiltInTemplate(template, installedEntry);
  });

  return res.json({
    built_in_templates: builtInTemplates,
    custom_templates: serializeList(customTemplates),
  });
});

export const createTemplate = asyncHandler(async (req, res) => {
  const payload = sanitizeTemplatePayload(req.body || {});
  const validationError = validateTemplatePayload(payload);
  if (validationError) return res.status(400).json({ detail: validationError });

  const existing = await Template.findOne({
    organisation_id: req.user.organisation_id,
    name: payload.name,
  });
  if (existing) {
    return res.status(409).json({ detail: 'A template with this name already exists' });
  }

  const created = await Template.create({
    ...payload,
    is_builtin: false,
    builtin_key: null,
    organisation_id: req.user.organisation_id,
    created_by: req.user._id,
  });

  return res.status(201).json(serializeDocument(created));
});

export const updateTemplate = asyncHandler(async (req, res) => {
  const templateId = toObjectId(req.params.template_id, 'template_id');
  const payload = sanitizeTemplatePayload(req.body || {});
  const validationError = validateTemplatePayload(payload);
  if (validationError) return res.status(400).json({ detail: validationError });

  const existing = await Template.findById(templateId);
  if (!existing) return res.status(404).json({ detail: 'Template not found' });
  if (String(existing.organisation_id) !== String(req.user.organisation_id)) {
    return res.status(403).json({ detail: 'Access denied' });
  }

  const duplicate = await Template.findOne({
    organisation_id: req.user.organisation_id,
    name: payload.name,
    _id: { $ne: templateId },
  });
  if (duplicate) {
    return res.status(409).json({ detail: 'A template with this name already exists' });
  }

  const updated = await Template.findByIdAndUpdate(templateId, payload, { new: true, runValidators: true });
  return res.json(serializeDocument(updated));
});

export const deleteTemplate = asyncHandler(async (req, res) => {
  const templateId = toObjectId(req.params.template_id, 'template_id');
  const existing = await Template.findById(templateId);
  if (!existing) return res.status(404).json({ detail: 'Template not found' });
  if (String(existing.organisation_id) !== String(req.user.organisation_id)) {
    return res.status(403).json({ detail: 'Access denied' });
  }

  await Template.findByIdAndDelete(templateId);
  return res.json({ message: 'Template deleted', id: templateId.toString(), _id: templateId.toString() });
});

export const createJobFromTemplate = asyncHandler(async (req, res) => {
  const templateId = toObjectId(req.params.template_id, 'template_id');
  const template = await Template.findById(templateId);
  if (!template) return res.status(404).json({ detail: 'Template not found' });
  if (String(template.organisation_id) !== String(req.user.organisation_id)) {
    return res.status(403).json({ detail: 'Access denied' });
  }

  const clientName = String(req.query.client_name || '').trim();
  if (!clientName) {
    return res.status(400).json({ detail: 'client_name query param is required' });
  }

  const jobFeeValue = req.query.job_fee === undefined || req.query.job_fee === ''
    ? Number(template.default_fee)
    : Number(req.query.job_fee);

  if (!Number.isFinite(jobFeeValue) || jobFeeValue < 0) {
    return res.status(400).json({ detail: 'job_fee must be a non-negative number' });
  }

  const withinLimit = await checkPlanLimit(req, res, 'jobs');
  if (!withinLimit) return;

  let deadline = null;
  if (req.query.deadline) {
    deadline = new Date(req.query.deadline);
    if (Number.isNaN(deadline.getTime())) {
      return res.status(400).json({ detail: 'deadline must be a valid date' });
    }
  }

  const created = await Job.create({
    name: template.name,
    client_name: clientName,
    job_type_label: template.job_type,
    job_fee: jobFeeValue,
    estimated_hours: template.estimated_hours,
    minimum_role: template.minimum_role,
    priority: template.default_priority,
    description: template.description,
    deadline,
    status: 'Pending',
    financial_year: String(new Date().getUTCFullYear()),
    organisation_id: req.user.organisation_id,
    created_by: req.user._id,
  });

  return res.status(201).json(serializeDocument(created));
});

export const installBuiltInTemplateController = asyncHandler(async (req, res) => {
  const templateKey = String(req.params.template_key || '').trim().toLowerCase();
  if (!templateKey) {
    return res.status(400).json({ detail: 'template_key is required' });
  }

  const organisation = await Organisation.findById(req.user.organisation_id).select('installed_templates').lean();
  const isInstalled = isBuiltInTemplateInstalled(organisation, templateKey);

  try {
    if (isInstalled) {
      const result = await uninstallBuiltInTemplate({
        organisationId: req.user.organisation_id,
        templateKey,
      });

      return res.status(200).json({
        action: 'uninstalled',
        message: 'Built-in template uninstalled successfully',
        template: {
          key: result.key,
          name: result.name,
          industry: result.industry,
        },
      });
    }

    const result = await installBuiltInTemplate({
      organisationId: req.user.organisation_id,
      adminId: req.user._id,
      templateKey,
    });

    if (result.alreadyInstalled) {
      return res.status(200).json({
        action: 'installed',
        message: 'Built-in template already installed',
        template: {
          key: result.key,
          name: result.name,
          industry: result.industry,
          installed_at: result.installed_at,
        },
      });
    }

    return res.status(201).json({
      action: 'installed',
      message: 'Built-in template installed successfully',
      template: {
        key: result.key,
        name: result.name,
        industry: result.industry,
        installed_at: result.installed_at,
      },
      seeded: result.seeded,
    });
  } catch (error) {
    if (error?.status) {
      return res.status(error.status).json({ detail: error.message });
    }
    throw error;
  }
});
