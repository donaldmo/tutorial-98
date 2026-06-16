import Job from '../models/Job.js';
import JobTemplate from '../models/JobTemplate.js';
import JobType from '../models/JobType.js';
import Organisation from '../models/Organisation.js';
import { checkPlanLimit } from '../services/planLimitService.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { toObjectId } from '../utils/objectId.js';
import { serializeDocument, serializeList } from '../utils/serialize.js';
import { normalizeJobPayload } from './jobsController.js';

const PRIORITIES = new Set(['Low', 'Medium', 'High', 'Critical']);
const TEMPLATE_KINDS = new Set(['system', 'custom']);

const cloneWorkComponents = (components = []) =>
  (Array.isArray(components) ? components : []).map((component = {}) => ({
    name: String(component.name || component.role || '').trim(),
    service: String(component.service || 'general').trim() || 'general',
    role: component.role ? String(component.role).trim() : null,
    percentage: Number(component.percentage || 0),
    hours_multiplier: Number(component.hours_multiplier || 1),
  }));

const DEFAULT_JOB_TEMPLATES = [
  {
    seed_key: 'monthly-vat-return',
    name: 'Monthly VAT Return',
    job_type: 'VAT Returns & Reconciliation',
    default_fee: 8500,
    estimated_hours: 12,
    minimum_role: 'Accountant',
    default_priority: 'High',
    description: 'Standard monthly VAT return preparation and submission',
    is_recurring: true,
    month_range: 'calendar',
  },
  {
    seed_key: 'annual-tax-compliance',
    name: 'Annual Tax Compliance',
    job_type: 'Tax Compliance',
    default_fee: 25000,
    estimated_hours: 40,
    minimum_role: 'Senior Accountant',
    default_priority: 'High',
    description: 'Annual tax compliance and returns',
    is_recurring: false,
    month_range: null,
  },
  {
    seed_key: 'monthly-bookkeeping',
    name: 'Monthly Bookkeeping',
    job_type: 'Bookkeeping',
    default_fee: 5000,
    estimated_hours: 16,
    minimum_role: 'Junior Accountant',
    default_priority: 'Medium',
    description: 'Monthly bookkeeping and reconciliation',
    is_recurring: true,
    month_range: 'calendar',
  },
  {
    seed_key: 'cipc-annual-return',
    name: 'CIPC Annual Return',
    job_type: 'CIPC Annual Returns',
    default_fee: 2500,
    estimated_hours: 4,
    minimum_role: 'Accountant',
    default_priority: 'Medium',
    description: 'CIPC annual return filing',
    is_recurring: false,
    month_range: null,
  },
  {
    seed_key: 'statutory-audit',
    name: 'Statutory Audit',
    job_type: 'Statutory Audit',
    default_fee: 150000,
    estimated_hours: 200,
    minimum_role: 'Manager',
    default_priority: 'Critical',
    description: 'Full statutory audit engagement',
    is_recurring: false,
    month_range: null,
  },
  {
    seed_key: 'payroll-processing',
    name: 'Payroll Processing',
    job_type: 'Payroll Processing',
    default_fee: 3500,
    estimated_hours: 8,
    minimum_role: 'Accountant',
    default_priority: 'High',
    description: 'Monthly payroll processing',
    is_recurring: true,
    month_range: 'calendar',
  },
];

const getPrimaryJobTypeName = (payload = {}) => {
  if (payload.job_type) return String(payload.job_type).trim();
  const first = (payload.job_type_entries || []).find((entry) => String(entry?.job_type_name || '').trim());
  return String(first?.job_type_name || '').trim();
};

const serializeJobTemplate = (template) => {
  const raw = serializeDocument(template);
  const jobTypeEntries = Array.isArray(raw?.job_type_entries) ? raw.job_type_entries : [];
  const primaryJobType = getPrimaryJobTypeName({
    job_type: raw?.job_type,
    job_type_entries: jobTypeEntries,
  });

  return {
    ...raw,
    job_type: primaryJobType,
    job_type_entries: jobTypeEntries,
    template_kind: raw?.template_kind || 'custom',
    is_editable: raw?.is_editable !== false,
    is_system: (raw?.template_kind || 'custom') === 'system',
  };
};

const sortTemplates = (templates = []) =>
  templates.sort((a, b) => {
    const aSystem = a.template_kind === 'system' ? 0 : 1;
    const bSystem = b.template_kind === 'system' ? 0 : 1;
    if (aSystem !== bSystem) return aSystem - bSystem;

    const aOrder = Number.isFinite(Number(a.sort_order)) ? Number(a.sort_order) : Number.MAX_SAFE_INTEGER;
    const bOrder = Number.isFinite(Number(b.sort_order)) ? Number(b.sort_order) : Number.MAX_SAFE_INTEGER;
    if (aOrder !== bOrder) return aOrder - bOrder;

    const aCreatedAt = new Date(a.createdAt || 0).getTime();
    const bCreatedAt = new Date(b.createdAt || 0).getTime();
    if (aCreatedAt !== bCreatedAt) return bCreatedAt - aCreatedAt;

    return String(a.name || '').localeCompare(String(b.name || ''));
  });

const sanitizeJobTemplatePayload = async (body = {}) => {
  const defaultFeeInput =
    body.default_fee !== undefined && body.default_fee !== null && body.default_fee !== ''
      ? body.default_fee
      : body.service_fee;

  const isRecurring = body.is_recurring === true || body.is_recurring === 'true';
  const normalizedJobShape = await normalizeJobPayload({
    service_fee: defaultFeeInput,
    job_types: Array.isArray(body.job_types) ? body.job_types : undefined,
    job_type_entries: Array.isArray(body.job_type_entries) ? body.job_type_entries : undefined,
    job_type_entries_input: Array.isArray(body.job_type_entries_input) ? body.job_type_entries_input : undefined,
    is_recurring: isRecurring,
    month_range: body.month_range || null,
  });

  const payload = {
    name: String(body.name || '').trim(),
    job_type_entries: Array.isArray(normalizedJobShape.job_type_entries) ? normalizedJobShape.job_type_entries : [],
    default_fee: Number(defaultFeeInput),
    estimated_hours:
      body.estimated_hours === undefined || body.estimated_hours === null || body.estimated_hours === ''
        ? null
        : Number(body.estimated_hours),
    minimum_role: body.minimum_role ? String(body.minimum_role).trim() : null,
    default_priority: String(body.default_priority || 'Medium').trim(),
    description: body.description ? String(body.description).trim() : null,
    department_id: body.department_id ? String(body.department_id).trim() : null,
    is_recurring: isRecurring,
    month_range: isRecurring && body.month_range ? String(body.month_range).trim() : null,
    template_kind: String(body.template_kind || 'custom').trim(),
    is_editable: body.is_editable === undefined ? true : body.is_editable === true || body.is_editable === 'true',
  };

  payload.job_type = getPrimaryJobTypeName({
    job_type: body.job_type,
    job_type_entries: payload.job_type_entries,
  });

  return payload;
};

const validateTemplateEntries = (entries = []) => {
  for (const entry of entries) {
    const hasIdentifier = String(entry?.job_type_name || '').trim() || entry?.job_type_id;
    if (!hasIdentifier) return 'Each template job type entry must include a job type';

    const components = Array.isArray(entry?.work_components) ? entry.work_components : [];
    const total = components.reduce((sum, component) => sum + (Number(component?.percentage) || 0), 0);
    if (total > 100.01) {
      return "Each template job type's work components must not exceed 100%";
    }
  }

  return null;
};

const validateJobTemplatePayload = (payload) => {
  if (!payload.name) return 'name is required';
  if (!payload.job_type && (!Array.isArray(payload.job_type_entries) || payload.job_type_entries.length === 0)) {
    return 'job_type is required';
  }
  if (!Number.isFinite(payload.default_fee) || payload.default_fee < 0) return 'default_fee must be a non-negative number';
  if (payload.estimated_hours !== null && (!Number.isFinite(payload.estimated_hours) || payload.estimated_hours < 0)) {
    return 'estimated_hours must be a non-negative number';
  }
  if (!PRIORITIES.has(payload.default_priority)) return 'default_priority is invalid';
  if (!TEMPLATE_KINDS.has(payload.template_kind)) return 'template_kind is invalid';
  if (payload.is_recurring && !payload.month_range) return 'month_range is required for recurring templates';
  if (!payload.is_recurring) payload.month_range = null;

  return validateTemplateEntries(payload.job_type_entries || []);
};

const buildTemplateSeedPayload = async (definition, organisationId) => {
  const jobType = await JobType.findOne({
    organisation_id: organisationId,
    name: definition.job_type,
  }).lean();

  return {
    name: definition.name,
    job_type: definition.job_type,
    job_type_entries: [
      {
        job_type_id: jobType?._id || null,
        job_type_name: definition.job_type,
        fee: 0,
        work_components: cloneWorkComponents(jobType?.work_components || []),
      },
    ],
    default_fee: Number(definition.default_fee),
    estimated_hours: definition.estimated_hours ?? null,
    minimum_role: definition.minimum_role || null,
    default_priority: definition.default_priority || 'Medium',
    description: definition.description || null,
    department_id: definition.department_id || null,
    is_recurring: definition.is_recurring === true,
    month_range: definition.is_recurring ? definition.month_range || 'calendar' : null,
    template_kind: 'system',
    is_editable: false,
    seed_key: definition.seed_key,
  };
};

const ensureDefaultJobTemplates = async (organisationId, createdBy) => {
  await Organisation.updateOne(
    { _id: organisationId, job_templates_seeded_at: null },
    { $set: { job_templates_seeded_at: new Date() } }
  );

  for (const [index, template] of DEFAULT_JOB_TEMPLATES.entries()) {
    const syncedTemplate = await buildTemplateSeedPayload(template, organisationId);

    try {
      await JobTemplate.updateOne(
        { organisation_id: organisationId, seed_key: template.seed_key },
        {
          $set: {
            ...syncedTemplate,
            sort_order: index,
          },
          $setOnInsert: {
            organisation_id: organisationId,
            created_by: createdBy || null,
          },
        },
        { upsert: true, runValidators: true }
      );
    } catch (error) {
      if (error?.code !== 11000) throw error;
    }
  }
};

const getOrganisationTemplate = async (templateId, organisationId) => {
  const template = await JobTemplate.findById(templateId);
  if (!template) return { template: null, error: { status: 404, detail: 'Job template not found' } };
  if (String(template.organisation_id) !== String(organisationId)) {
    return { template: null, error: { status: 403, detail: 'Access denied' } };
  }
  return { template, error: null };
};

const buildJobPayloadFromTemplate = async (template, input = {}) => {
  const clientName = String(input.client_name || '').trim();
  if (!clientName) {
    return { payload: null, error: 'client_name is required' };
  }

  const jobFeeValue =
    input.job_fee === undefined || input.job_fee === '' ? Number(template.default_fee) : Number(input.job_fee);
  if (!Number.isFinite(jobFeeValue) || jobFeeValue < 0) {
    return { payload: null, error: 'job_fee must be a non-negative number' };
  }

  if (input.deadline) {
    const deadline = new Date(input.deadline);
    if (Number.isNaN(deadline.getTime())) {
      return { payload: null, error: 'deadline must be a valid date' };
    }
  }

  const normalized = await normalizeJobPayload({
    name: String(template.name || '').trim(),
    client_name: clientName,
    service_fee: jobFeeValue,
    job_type_entries: Array.isArray(template.job_type_entries) ? template.job_type_entries : [],
    minimum_role: template.minimum_role,
    deadline: input.deadline || null,
    department_id: template.department_id || null,
    is_recurring: template.is_recurring === true,
    month_range: template.is_recurring ? template.month_range || 'calendar' : null,
    estimated_hours: template.estimated_hours ?? null,
    priority: template.default_priority || 'Medium',
    description: template.description || null,
  });

  return {
    payload: {
      ...normalized,
      status: 'Pending',
      financial_year: String(new Date().getUTCFullYear()),
    },
    error: null,
  };
};

export const listJobTemplates = asyncHandler(async (req, res) => {
  await ensureDefaultJobTemplates(req.user.organisation_id, req.user._id);

  const templates = await JobTemplate.find({ organisation_id: req.user.organisation_id });
  return res.json(sortTemplates(serializeList(templates)).map(serializeJobTemplate));
});

export const createJobTemplate = asyncHandler(async (req, res) => {
  const payload = await sanitizeJobTemplatePayload(req.body || {});
  payload.template_kind = 'custom';
  payload.is_editable = true;

  const validationError = validateJobTemplatePayload(payload);
  if (validationError) return res.status(400).json({ detail: validationError });

  const existing = await JobTemplate.findOne({
    organisation_id: req.user.organisation_id,
    name: payload.name,
  });
  if (existing) {
    return res.status(409).json({ detail: 'A job template with this name already exists' });
  }

  const created = await JobTemplate.create({
    ...payload,
    seed_key: undefined,
    sort_order: null,
    source_template_id: null,
    organisation_id: req.user.organisation_id,
    created_by: req.user._id,
  });

  return res.status(201).json(serializeJobTemplate(created));
});

export const updateJobTemplate = asyncHandler(async (req, res) => {
  const templateId = toObjectId(req.params.job_template_id, 'job_template_id');
  const { template, error } = await getOrganisationTemplate(templateId, req.user.organisation_id);
  if (error) return res.status(error.status).json({ detail: error.detail });
  if (template.is_editable === false || template.template_kind === 'system') {
    return res.status(422).json({ detail: 'System job templates are read only. Clone the template to customise it.' });
  }

  const payload = await sanitizeJobTemplatePayload(req.body || {});
  payload.template_kind = 'custom';
  payload.is_editable = true;

  const validationError = validateJobTemplatePayload(payload);
  if (validationError) return res.status(400).json({ detail: validationError });

  const duplicate = await JobTemplate.findOne({
    organisation_id: req.user.organisation_id,
    name: payload.name,
    _id: { $ne: template._id },
  });
  if (duplicate) {
    return res.status(409).json({ detail: 'A job template with this name already exists' });
  }

  const updated = await JobTemplate.findByIdAndUpdate(
    template._id,
    { ...payload, source_template_id: template.source_template_id || null },
    { new: true, runValidators: true }
  );
  return res.json(serializeJobTemplate(updated));
});

export const cloneJobTemplate = asyncHandler(async (req, res) => {
  const templateId = toObjectId(req.params.job_template_id, 'job_template_id');
  const { template, error } = await getOrganisationTemplate(templateId, req.user.organisation_id);
  if (error) return res.status(error.status).json({ detail: error.detail });

  const cloneName = `${template.name} Copy`;
  const existingClone = await JobTemplate.findOne({
    organisation_id: req.user.organisation_id,
    name: cloneName,
  });
  const finalName = existingClone ? `${template.name} Copy ${Date.now()}` : cloneName;

  const created = await JobTemplate.create({
    name: finalName,
    job_type: template.job_type,
    job_type_entries: Array.isArray(template.job_type_entries)
      ? template.job_type_entries.map((entry = {}) => ({
          job_type_id: entry.job_type_id || null,
          job_type_name: String(entry.job_type_name || '').trim(),
          fee: Number(entry.fee || 0),
          work_components: cloneWorkComponents(entry.work_components || []),
        }))
      : [],
    default_fee: Number(template.default_fee || 0),
    estimated_hours: template.estimated_hours ?? null,
    minimum_role: template.minimum_role || null,
    default_priority: template.default_priority || 'Medium',
    description: template.description || null,
    department_id: template.department_id || null,
    is_recurring: template.is_recurring === true,
    month_range: template.is_recurring ? template.month_range || 'calendar' : null,
    template_kind: 'custom',
    is_editable: true,
    source_template_id: template._id,
    seed_key: undefined,
    sort_order: null,
    organisation_id: req.user.organisation_id,
    created_by: req.user._id,
  });

  return res.status(201).json(serializeJobTemplate(created));
});

export const deleteJobTemplate = asyncHandler(async (req, res) => {
  const templateId = toObjectId(req.params.job_template_id, 'job_template_id');
  const { template, error } = await getOrganisationTemplate(templateId, req.user.organisation_id);
  if (error) return res.status(error.status).json({ detail: error.detail });
  if (template.is_editable === false || template.template_kind === 'system') {
    return res.status(422).json({ detail: 'System job templates cannot be deleted' });
  }

  await JobTemplate.findByIdAndDelete(template._id);
  return res.json({ message: 'Job template deleted', id: template._id.toString(), _id: template._id.toString() });
});

export const createJobFromJobTemplate = asyncHandler(async (req, res) => {
  const templateId = toObjectId(req.params.job_template_id, 'job_template_id');
  const { template, error } = await getOrganisationTemplate(templateId, req.user.organisation_id);
  if (error) return res.status(error.status).json({ detail: error.detail });

  const withinLimit = await checkPlanLimit(req, res, 'jobs');
  if (!withinLimit) return;

  const { payload, error: payloadError } = await buildJobPayloadFromTemplate(template, {
    ...(req.query || {}),
    ...(req.body || {}),
  });
  if (payloadError) return res.status(400).json({ detail: payloadError });

  const created = await Job.create({
    ...payload,
    organisation_id: req.user.organisation_id,
    created_by: req.user._id,
  });

  const serialized = serializeDocument(created);
  return res.status(201).json({
    ...serialized,
    job_type_label: getPrimaryJobTypeName({ job_type_entries: serialized.job_type_entries || [] }) || 'General',
  });
});
