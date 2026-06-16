import { createRequire } from 'module';
import Department from '../models/Department.js';
import JobType from '../models/JobType.js';
import Organisation from '../models/Organisation.js';
import SystemTemplate from '../models/SystemTemplate.js';
import { DEFAULT_DEPARTMENTS } from '../utils/seedOrgDefaults.js';

const require = createRequire(import.meta.url);
const SYSTEM_JOB_TYPES = require('../utils/systemJobTypes.json');

const BUILTIN_TEMPLATES = [
  {
    key: 'accounting-firm',
    name: 'Accounting firm',
    industry: 'Accounting firm',
    description: 'Built-in setup for a modern accounting practice.',
    version: '1.0.0',
    seed: {
      departments: DEFAULT_DEPARTMENTS,
      job_types: SYSTEM_JOB_TYPES,
    },
  },
];

const normalizeKey = (value = '') => String(value).trim().toLowerCase();

const mapDefinitionToSetup = (template) => ({
  seed_order: ['departments', 'job_types'],
  departments: template.seed.departments.map((department) => ({
    name: department.name,
    code: department.code,
    description: department.description,
    color: department.color,
  })),
  job_types: template.seed.job_types.map((jobType) => ({
    name: jobType.name,
    description: jobType.description,
    work_components: Array.isArray(jobType.work_components)
      ? jobType.work_components.map((component) => ({
        name: component.name,
        role: component.role,
        percentage: component.percentage,
        service: component.service,
        hours_multiplier: component.hours_multiplier,
      }))
      : [],
  })),
});

const mapSystemTemplateDoc = (template) => ({
  key: normalizeKey(template.key),
  name: template.name,
  industry: template.industry,
  description: template.description,
  version: template.version,
  is_builtin: true,
  setup: template.setup || {
    seed_order: ['departments', 'job_types'],
    departments: [],
    job_types: [],
  },
});

const syncBuiltInTemplates = async () => {
  const ops = BUILTIN_TEMPLATES
    .map((template) => ({
      updateOne: {
        filter: { key: normalizeKey(template.key) },
        update: {
          $set: {
            name: template.name,
            industry: template.industry,
            description: template.description,
            version: template.version,
            setup: mapDefinitionToSetup(template),
          },
          $setOnInsert: {
            key: normalizeKey(template.key),
          },
        },
        upsert: true,
      },
    }));

  const writeResult = await SystemTemplate.bulkWrite(ops, { ordered: false });
  const created = Number(writeResult?.upsertedCount || 0);
  return { created, totalExpected: BUILTIN_TEMPLATES.length };
};

export const ensureBuiltInTemplatesAvailable = async ({ log = false } = {}) => {
  const result = await syncBuiltInTemplates();
  if (log) {
    const totalPersisted = await SystemTemplate.countDocuments({});
    if (result.created > 0) {
      console.log(
        `[seedTemplate] ✅ System Templates synced to DB (collection=system_templates, created=${result.created}, expected=${result.totalExpected}, persisted=${totalPersisted})`
      );
    } else {
      console.log(
        `[seedTemplate] ✅ System Templates synced to DB (collection=system_templates, already up to date, persisted=${totalPersisted})`
      );
    }
  }
  return result;
};

export const getBuiltInTemplates = async () => {
  await ensureBuiltInTemplatesAvailable();
  const templates = await SystemTemplate.find({}).sort({ name: 1, key: 1 }).lean();
  return templates.map(mapSystemTemplateDoc);
};

export const getBuiltInTemplateByKey = async (key) => {
  await ensureBuiltInTemplatesAvailable();
  const normalized = normalizeKey(key);
  const template = await SystemTemplate.findOne({ key: normalized }).lean();
  return template ? mapSystemTemplateDoc(template) : null;
};

export const isBuiltInTemplateInstalled = (organisation, templateKey) => {
  if (!organisation) return false;
  const normalized = normalizeKey(templateKey);
  const installs = Array.isArray(organisation.installed_templates) ? organisation.installed_templates : [];
  return installs.some((entry) => normalizeKey(entry?.key) === normalized);
};

export const installBuiltInTemplate = async ({ organisationId, adminId, templateKey }) => {
  const builtIn = await getBuiltInTemplateByKey(templateKey);
  if (!builtIn) {
    const error = new Error('Built-in template not found');
    error.status = 404;
    throw error;
  }

  const organisation = await Organisation.findById(organisationId);
  if (!organisation) {
    const error = new Error('Organisation not found');
    error.status = 404;
    throw error;
  }

  if (isBuiltInTemplateInstalled(organisation, builtIn.key)) {
    return {
      alreadyInstalled: true,
      key: builtIn.key,
      name: builtIn.name,
      industry: builtIn.industry,
      installed_at: organisation.installed_templates.find((entry) => normalizeKey(entry?.key) === builtIn.key)?.installed_at || null,
    };
  }

  const departmentsSeed = Array.isArray(builtIn.setup?.departments) ? builtIn.setup.departments : [];
  const jobTypesSeed = Array.isArray(builtIn.setup?.job_types) ? builtIn.setup.job_types : [];

  const departmentOps = departmentsSeed.map((department) => ({
    updateOne: {
      filter: { organisation_id: organisationId, code: department.code },
      update: {
        $setOnInsert: {
          ...department,
          organisation_id: organisationId,
          created_by: adminId,
          supervisor_id: null,
          is_active: true,
        },
      },
      upsert: true,
    },
  }));

  const jobTypeOps = jobTypesSeed.map((jobType) => ({
    updateOne: {
      filter: { organisation_id: organisationId, name: jobType.name },
      update: {
        $setOnInsert: {
          ...jobType,
          organisation_id: organisationId,
          created_by: adminId,
          is_active: true,
          is_system: false,
        },
      },
      upsert: true,
    },
  }));

  // Keep the same seed order as startup defaults: departments first, then job types.
  const departmentResult = departmentOps.length > 0
    ? await Department.bulkWrite(departmentOps, { ordered: false })
    : { upsertedCount: 0 };
  const jobTypeResult = jobTypeOps.length > 0
    ? await JobType.bulkWrite(jobTypeOps, { ordered: false })
    : { upsertedCount: 0 };

  const installEntry = {
    key: builtIn.key,
    name: builtIn.name,
    industry: builtIn.industry,
    version: builtIn.version,
    installed_at: new Date(),
    installed_by: adminId,
  };

  const updateResult = await Organisation.updateOne(
    {
      _id: organisationId,
      'installed_templates.key': { $ne: builtIn.key },
    },
    {
      $push: { installed_templates: installEntry },
    }
  );

  if (updateResult.modifiedCount === 0) {
    return {
      alreadyInstalled: true,
      key: builtIn.key,
      name: builtIn.name,
      industry: builtIn.industry,
      installed_at: null,
    };
  }

  return {
    alreadyInstalled: false,
    key: builtIn.key,
    name: builtIn.name,
    industry: builtIn.industry,
    installed_at: installEntry.installed_at,
    seeded: {
      departments_created: Number(departmentResult.upsertedCount || 0),
      job_types_created: Number(jobTypeResult.upsertedCount || 0),
    },
  };
};

export const uninstallBuiltInTemplate = async ({ organisationId, templateKey }) => {
  const builtIn = await getBuiltInTemplateByKey(templateKey);
  if (!builtIn) {
    const error = new Error('Built-in template not found');
    error.status = 404;
    throw error;
  }

  const organisation = await Organisation.findById(organisationId).select('installed_templates').lean();
  if (!organisation) {
    const error = new Error('Organisation not found');
    error.status = 404;
    throw error;
  }

  const wasInstalled = isBuiltInTemplateInstalled(organisation, builtIn.key);
  if (!wasInstalled) {
    return {
      wasInstalled: false,
      key: builtIn.key,
      name: builtIn.name,
      industry: builtIn.industry,
    };
  }

  await Organisation.updateOne(
    { _id: organisationId },
    { $pull: { installed_templates: { key: builtIn.key } } }
  );

  return {
    wasInstalled: true,
    key: builtIn.key,
    name: builtIn.name,
    industry: builtIn.industry,
  };
};
