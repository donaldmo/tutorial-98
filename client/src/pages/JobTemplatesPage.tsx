import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'

import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select'
import api from '@/services/api'
import { Icons, Modal, formatCurrency } from '@/components/workflow/shared'

type TemplateWorkComponent = {
  name?: string
  role?: string
  percentage?: number
  service?: string
  hours_multiplier?: number
}

type TemplateJobTypeEntry = {
  job_type_id?: string | { _id?: string } | null
  job_type_name?: string
  work_components?: TemplateWorkComponent[]
}

type JobTemplate = {
  id: string
  name: string
  job_type?: string
  job_type_entries?: TemplateJobTypeEntry[]
  default_fee: number
  estimated_hours?: number | null
  minimum_role?: string | null
  default_priority: string
  description?: string | null
  department_id?: string | null
  is_recurring?: boolean
  month_range?: string | null
  template_kind?: string
  is_system?: boolean
  is_editable?: boolean
}

type TemplateFormState = {
  name: string
  default_fee: string
  estimated_hours: string
  minimum_role: string
  default_priority: string
  description: string
  department_id: string
  frequency: 'once-off' | 'recurring'
  month_range: 'calendar' | 'rolling'
  jobTypeEntries: Array<{
    id: string
    work_components?: TemplateWorkComponent[]
  }>
}

const EMPTY_SELECT_VALUE = '__empty__'

const emptyTemplateForm = (): TemplateFormState => ({
  name: '',
  default_fee: '',
  estimated_hours: '',
  minimum_role: '',
  default_priority: 'Medium',
  description: '',
  department_id: '',
  frequency: 'once-off',
  month_range: 'calendar',
  jobTypeEntries: [{ id: '' }],
})

const priorityClass = (priority: string) => {
  const classes: Record<string, string> = {
    Critical: 'bg-red-100 text-red-700 border-red-200',
    High: 'bg-orange-100 text-orange-700 border-orange-200',
    Medium: 'bg-yellow-100 text-yellow-700 border-yellow-200',
    Low: 'bg-green-100 text-green-700 border-green-200',
  }
  return classes[priority] || 'bg-gray-100 text-gray-700 border-gray-200'
}

function resolveTemplateEntries(template: JobTemplate, allJobTypes: any[]) {
  const resolved = (template.job_type_entries || [])
    .map((entry) => {
      const rawId = entry.job_type_id && typeof entry.job_type_id === 'object' ? entry.job_type_id._id : entry.job_type_id
      const matched =
        allJobTypes.find((type: any) => (type.id ?? type._id) === rawId) ||
        allJobTypes.find((type: any) => String(type.name || '').trim() === String(entry.job_type_name || '').trim())

      return matched
        ? {
            id: matched.id ?? matched._id,
            work_components: Array.isArray(entry.work_components) ? entry.work_components.map((component) => ({ ...component })) : [],
          }
        : null
    })
    .filter(Boolean)

  if (resolved.length > 0) return resolved as TemplateFormState['jobTypeEntries']

  const fallback = allJobTypes.find((type: any) => String(type.name || '').trim() === String(template.job_type || '').trim())
  return fallback ? [{ id: fallback.id ?? fallback._id }] : [{ id: '' }]
}

export function JobTemplatesPage({ settings, enums, hidePageHeader = false, addTriggerKey }: any) {
  const navigate = useNavigate()
  const [templates, setTemplates] = useState<JobTemplate[]>([])
  const [jobTypesCatalog, setJobTypesCatalog] = useState<any>({ system_types: [], custom_types: [] })
  const [departments, setDepartments] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [editingTemplate, setEditingTemplate] = useState<JobTemplate | null>(null)
  const [formData, setFormData] = useState<TemplateFormState>(() => emptyTemplateForm())
  const [templateToDelete, setTemplateToDelete] = useState<JobTemplate | null>(null)
  const [deleteSubmitting, setDeleteSubmitting] = useState(false)
  const [cloningTemplateId, setCloningTemplateId] = useState('')
  const symbol = settings?.currency_symbol || 'R'

  const allJobTypes = useMemo(
    () => [...(jobTypesCatalog.system_types || []), ...(jobTypesCatalog.custom_types || [])],
    [jobTypesCatalog]
  )

  const systemTemplates = useMemo(
    () => templates.filter((template) => template.is_system || template.template_kind === 'system'),
    [templates]
  )

  const customTemplates = useMemo(
    () => templates.filter((template) => !(template.is_system || template.template_kind === 'system')),
    [templates]
  )

  const fetchTemplates = useCallback(async () => {
    try {
      setLoading(true)
      const [templatesRes, jobTypesRes, departmentsRes] = await Promise.all([
        api.get('/job-templates'),
        api.get('/job-types'),
        api.get('/departments'),
      ])
      setTemplates(Array.isArray(templatesRes.data) ? templatesRes.data : [])
      setJobTypesCatalog(jobTypesRes.data || { system_types: [], custom_types: [] })
      const departmentList = departmentsRes.data?.data || departmentsRes.data || []
      setDepartments(Array.isArray(departmentList) ? departmentList.filter((department: any) => department.is_active !== false) : [])
    } catch (error: any) {
      toast.error(error?.response?.data?.detail || 'Failed to load job templates')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchTemplates()
  }, [fetchTemplates])

  useEffect(() => {
    if (addTriggerKey && addTriggerKey > 0) {
      openCreateForm()
    }
  }, [addTriggerKey])

  const openCreateForm = () => {
    setEditingTemplate(null)
    setFormData(emptyTemplateForm())
    setShowForm(true)
  }

  const openEditForm = (template: JobTemplate) => {
    if (template.is_editable === false) return
    setEditingTemplate(template)
    setFormData({
      name: template.name || '',
      default_fee: template.default_fee === undefined || template.default_fee === null ? '' : String(template.default_fee),
      estimated_hours: template.estimated_hours === undefined || template.estimated_hours === null ? '' : String(template.estimated_hours),
      minimum_role: template.minimum_role || '',
      default_priority: template.default_priority || 'Medium',
      description: template.description || '',
      department_id: template.department_id || '',
      frequency: template.is_recurring ? 'recurring' : 'once-off',
      month_range: template.month_range === 'rolling' ? 'rolling' : 'calendar',
      jobTypeEntries: resolveTemplateEntries(template, allJobTypes),
    })
    setShowForm(true)
  }

  const distributionRows = useMemo(() => {
    const rows: Array<{ typeName: string; components: TemplateWorkComponent[]; total: number; entryIndex: number }> = []
    formData.jobTypeEntries.forEach((entry, entryIndex) => {
      if (!entry.id) return
      const matched = allJobTypes.find((type: any) => (type.id ?? type._id) === entry.id)
      if (!matched) return
      const components = entry.work_components || matched.work_components || []
      const total = components.reduce((sum: number, component: any) => sum + (Number(component.percentage) || 0), 0)
      rows.push({ typeName: matched.name, components, total, entryIndex })
    })
    return rows
  }, [allJobTypes, formData.jobTypeEntries])

  const handleTemplateSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    const validEntries = formData.jobTypeEntries.filter((entry) => entry.id)
    if (validEntries.length === 0) {
      toast.error('Please select at least one job type')
      return
    }

    const totals = validEntries.map((entry) =>
      (entry.work_components || []).reduce((sum, component) => sum + (Number(component.percentage) || 0), 0)
    )
    if (totals.some((total) => total > 100.01)) {
      toast.error("Each template job type's work components must not exceed 100%")
      return
    }

    const payload = {
      name: formData.name.trim(),
      default_fee: Number(formData.default_fee),
      estimated_hours: formData.estimated_hours ? Number(formData.estimated_hours) : null,
      minimum_role: formData.minimum_role || null,
      default_priority: formData.default_priority || 'Medium',
      description: formData.description || null,
      department_id: formData.department_id || null,
      is_recurring: formData.frequency === 'recurring',
      month_range: formData.frequency === 'recurring' ? formData.month_range : null,
      job_type_entries: validEntries.map((entry) => {
        const matched = allJobTypes.find((type: any) => (type.id ?? type._id) === entry.id)
        return {
          job_type_id: entry.id,
          job_type_name: matched?.name || '',
          work_components: (entry.work_components || []).map((component) => ({ ...component })),
        }
      }),
      job_type: allJobTypes.find((type: any) => (type.id ?? type._id) === validEntries[0]?.id)?.name || '',
    }

    setSaving(true)
    try {
      if (editingTemplate) {
        await api.put(`/job-templates/${editingTemplate.id}`, payload)
        toast.success('Job template updated')
      } else {
        await api.post('/job-templates', payload)
        toast.success('Job template created')
      }
      setShowForm(false)
      setEditingTemplate(null)
      setFormData(emptyTemplateForm())
      await fetchTemplates()
    } catch (error: any) {
      toast.error(error?.response?.data?.detail || 'Failed to save job template')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!templateToDelete) return
    setDeleteSubmitting(true)
    try {
      await api.delete(`/job-templates/${templateToDelete.id}`)
      toast.success('Job template deleted')
      setTemplateToDelete(null)
      await fetchTemplates()
    } catch (error: any) {
      toast.error(error?.response?.data?.detail || 'Failed to delete job template')
    } finally {
      setDeleteSubmitting(false)
    }
  }

  const handleClone = async (template: JobTemplate) => {
    setCloningTemplateId(template.id)
    try {
      await api.post(`/job-templates/${template.id}/clone`)
      toast.success('Template cloned')
      await fetchTemplates()
    } catch (error: any) {
      toast.error(error?.response?.data?.detail || 'Failed to clone template')
    } finally {
      setCloningTemplateId('')
    }
  }

  return (
    <div className="space-y-6" data-testid="job-templates-page">
      {!hidePageHeader && (
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Job Template Library</h2>
          <p className="mt-1 text-gray-500">Manage reusable system and custom job templates for the add-job flow</p>
        </div>
      )}

      {loading ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2, 3, 4, 5].map((item) => (
            <div key={item} className="h-48 animate-pulse rounded-xl border border-gray-100 bg-white" />
          ))}
        </div>
      ) : (
        <>
          <section className="space-y-3">
            <div>
              <h3 className="text-lg font-semibold text-gray-900">System Templates</h3>
              <p className="text-sm text-gray-500">Read-only baselines that can be cloned into custom templates</p>
            </div>
            {systemTemplates.length === 0 ? (
              <div className="rounded-xl border border-gray-100 bg-white p-6 text-sm text-gray-500">No system templates are available.</div>
            ) : (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                {systemTemplates.map((template) => (
                  <article key={template.id} className="overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm">
                    <div className="border-b border-gray-100 p-4 space-y-2">
                      <div className="flex items-start justify-between gap-3">
                        <h3 className="font-semibold text-gray-900">{template.name}</h3>
                        <span className="rounded-full border border-slate-200 bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">System</span>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${priorityClass(template.default_priority)}`}>
                          {template.default_priority}
                        </span>
                        <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs font-medium text-slate-600">Read only</span>
                      </div>
                    </div>
                    <div className="space-y-3 p-4 text-sm">
                      <div className="flex items-center justify-between gap-4">
                        <span className="text-gray-500">Job Types:</span>
                        <span className="text-right font-semibold text-gray-900">
                          {(template.job_type_entries || []).map((entry) => entry.job_type_name).filter(Boolean).join(', ') || template.job_type || '-'}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-4">
                        <span className="text-gray-500">Default Fee:</span>
                        <span className="text-right font-semibold text-green-600">{formatCurrency(template.default_fee, symbol)}</span>
                      </div>
                      <div className="flex items-center justify-between gap-4">
                        <span className="text-gray-500">Frequency:</span>
                        <span className="text-right font-semibold text-gray-900">{template.is_recurring ? 'Recurring' : 'Once Off'}</span>
                      </div>
                      <p className="border-t border-gray-100 pt-3 text-xs text-gray-500">
                        {template.description || 'No description provided.'}
                      </p>
                    </div>
                    <div className="flex items-center gap-3 border-t border-gray-100 bg-gray-50 p-3">
                      <button
                        type="button"
                        onClick={() => navigate(`/app/jobs/add?templateId=${encodeURIComponent(template.id)}`)}
                        className="flex-1 rounded-lg bg-green-600 px-3 py-2 text-sm font-medium text-white hover:bg-green-700"
                      >
                        Use Template
                      </button>
                      <button
                        type="button"
                        onClick={() => handleClone(template)}
                        disabled={cloningTemplateId === template.id}
                        className="rounded-lg px-3 py-2 text-sm font-medium text-indigo-600 hover:bg-white disabled:opacity-50"
                      >
                        {cloningTemplateId === template.id ? 'Cloning...' : 'Clone'}
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>

          <section className="space-y-3">
            <div>
              <h3 className="text-lg font-semibold text-gray-900">Custom Templates</h3>
              <p className="text-sm text-gray-500">Editable reusable templates for your team’s add-job flow</p>
            </div>
            {customTemplates.length === 0 ? (
              <div className="rounded-xl border border-gray-100 bg-white p-8 text-center shadow-sm">
                <h3 className="text-lg font-semibold text-gray-900">No custom templates yet</h3>
                <p className="mt-2 text-sm text-gray-500">Create a custom template or clone a system template to start from a baseline.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                {customTemplates.map((template) => (
                  <article key={template.id} className="overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm">
                    <div className="border-b border-gray-100 p-4 space-y-2">
                      <div className="flex items-start justify-between gap-3">
                        <h3 className="font-semibold text-gray-900">{template.name}</h3>
                        <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">Custom</span>
                      </div>
                      <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${priorityClass(template.default_priority)}`}>
                        {template.default_priority}
                      </span>
                    </div>
                    <div className="space-y-3 p-4 text-sm">
                      <div className="flex items-center justify-between gap-4">
                        <span className="text-gray-500">Job Types:</span>
                        <span className="text-right font-semibold text-gray-900">
                          {(template.job_type_entries || []).map((entry) => entry.job_type_name).filter(Boolean).join(', ') || template.job_type || '-'}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-4">
                        <span className="text-gray-500">Default Fee:</span>
                        <span className="text-right font-semibold text-green-600">{formatCurrency(template.default_fee, symbol)}</span>
                      </div>
                      <div className="flex items-center justify-between gap-4">
                        <span className="text-gray-500">Frequency:</span>
                        <span className="text-right font-semibold text-gray-900">{template.is_recurring ? 'Recurring' : 'Once Off'}</span>
                      </div>
                      <p className="border-t border-gray-100 pt-3 text-xs text-gray-500">
                        {template.description || 'No description provided.'}
                      </p>
                    </div>
                    <div className="flex items-center gap-3 border-t border-gray-100 bg-gray-50 p-3">
                      <button
                        type="button"
                        onClick={() => navigate(`/app/jobs/add?templateId=${encodeURIComponent(template.id)}`)}
                        className="flex-1 rounded-lg bg-green-600 px-3 py-2 text-sm font-medium text-white hover:bg-green-700"
                      >
                        Use Template
                      </button>
                      <button
                        type="button"
                        onClick={() => openEditForm(template)}
                        className="rounded-lg p-2 text-gray-500 hover:bg-white hover:text-blue-600"
                        aria-label={`Edit ${template.name}`}
                        title="Edit template"
                      >
                        <Icons.Edit />
                      </button>
                      <button
                        type="button"
                        onClick={() => setTemplateToDelete(template)}
                        className="rounded-lg p-2 text-gray-500 hover:bg-white hover:text-red-600"
                        aria-label={`Delete ${template.name}`}
                        title="Delete template"
                      >
                        <Icons.Trash />
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        </>
      )}

      <Modal isOpen={showForm} onClose={() => !saving && setShowForm(false)} title={editingTemplate ? 'Edit Custom Template' : 'Create Custom Template'} size="md">
        <form onSubmit={handleTemplateSubmit} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Template Name *</label>
              <input
                type="text"
                required
                value={formData.name}
                onChange={(event) => setFormData({ ...formData, name: event.target.value })}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder="e.g., Monthly VAT Return"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Default Fee ({symbol}) *</label>
              <input
                type="number"
                required
                min="0"
                step="0.01"
                value={formData.default_fee}
                onChange={(event) => setFormData({ ...formData, default_fee: event.target.value })}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Estimated Hours</label>
              <input
                type="number"
                min="0"
                step="0.1"
                value={formData.estimated_hours}
                onChange={(event) => setFormData({ ...formData, estimated_hours: event.target.value })}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Priority</label>
              <select
                value={formData.default_priority}
                onChange={(event) => setFormData({ ...formData, default_priority: event.target.value })}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                {(enums?.priorities || ['Low', 'Medium', 'High', 'Critical']).map((priority: string) => (
                  <option key={priority} value={priority}>{priority}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Minimum Role</label>
              <select
                value={formData.minimum_role}
                onChange={(event) => setFormData({ ...formData, minimum_role: event.target.value })}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="">Any</option>
                {(enums?.roles || []).map((role: string) => <option key={role} value={role}>{role}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Department</label>
              <select
                value={formData.department_id}
                onChange={(event) => setFormData({ ...formData, department_id: event.target.value })}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="">No department</option>
                {departments.map((department: any) => (
                  <option key={department.id} value={department.id}>{department.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Frequency</label>
              <select
                value={formData.frequency}
                onChange={(event) => setFormData({ ...formData, frequency: event.target.value as 'once-off' | 'recurring' })}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="once-off">Once Off</option>
                <option value="recurring">Recurring</option>
              </select>
            </div>
          </div>

          {formData.frequency === 'recurring' && (
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Month Range</label>
              <select
                value={formData.month_range}
                onChange={(event) => setFormData({ ...formData, month_range: event.target.value as 'calendar' | 'rolling' })}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="calendar">Calendar Year</option>
                <option value="rolling">Rolling 12 Months</option>
              </select>
            </div>
          )}

          <div className="border border-gray-200 rounded-xl overflow-hidden">
            <div className="bg-gray-50 px-4 py-2 border-b border-gray-200">
              <p className="text-sm font-semibold text-gray-700">Job Types</p>
            </div>
            <div className="p-3 grid grid-cols-1 md:grid-cols-2 gap-2">
              {formData.jobTypeEntries.map((entry, index) => (
                <div key={index} className="flex items-center gap-2 p-2 bg-gray-50 rounded-lg">
                  <div className="flex-1">
                    <Select
                      value={entry.id || EMPTY_SELECT_VALUE}
                      onValueChange={(value: string) => {
                        const nextEntries = [...formData.jobTypeEntries]
                        const nextId = value === EMPTY_SELECT_VALUE ? '' : value
                        const matched = allJobTypes.find((type: any) => (type.id ?? type._id) === nextId)
                        nextEntries[index] = {
                          ...nextEntries[index],
                          id: nextId,
                          work_components: matched?.work_components?.length
                            ? matched.work_components.map((component: any) => ({ ...component }))
                            : nextEntries[index].work_components || [],
                        }
                        setFormData({ ...formData, jobTypeEntries: nextEntries })
                      }}
                    >
                      <SelectTrigger className="w-full px-2.5 py-1 border border-gray-200 rounded text-sm text-left h-8">
                        <span className={entry.id ? 'truncate text-gray-900' : 'truncate text-gray-400'}>
                          {allJobTypes.find((type: any) => (type.id ?? type._id) === entry.id)?.name || 'Select job type...'}
                        </span>
                      </SelectTrigger>
                      <SelectContent className="bg-white text-gray-700 border border-gray-200">
                        <SelectItem value={EMPTY_SELECT_VALUE}>Select job type...</SelectItem>
                        {allJobTypes.map((type: any) => (
                          <SelectItem key={type.id ?? type._id} value={type.id ?? type._id} textValue={type.name}>
                            <div className="flex items-center gap-2">
                              <span>{type.name}</span>
                              {type.is_system && (
                                <span className="text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">System</span>
                              )}
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {formData.jobTypeEntries.length > 1 && (
                    <button
                      type="button"
                      onClick={() => setFormData({ ...formData, jobTypeEntries: formData.jobTypeEntries.filter((_, rowIndex) => rowIndex !== index) })}
                      className="p-1 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors shrink-0"
                      title="Remove job type"
                    >
                      <Icons.Trash />
                    </button>
                  )}
                </div>
              ))}
              <button
                type="button"
                onClick={() => setFormData({ ...formData, jobTypeEntries: [...formData.jobTypeEntries, { id: '' }] })}
                className="col-span-full w-full py-1.5 border-2 border-dashed border-gray-200 rounded-lg text-sm text-gray-500 hover:border-blue-300 hover:text-blue-600 transition-colors"
              >
                + Add Job Type
              </button>
            </div>
          </div>

          <div className="border border-gray-200 rounded-xl overflow-hidden">
            <div className="bg-gray-50 px-4 py-2 border-b border-gray-200">
              <p className="text-sm font-semibold text-gray-700">Work Allocation Defaults</p>
            </div>
            {distributionRows.length === 0 ? (
              <div className="px-4 py-6 text-center text-sm text-gray-400">Select job types to set work allocation defaults</div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 p-3">
                {distributionRows.map((row, rowIndex) => (
                  <div key={`${row.typeName}-${rowIndex}`} className="border border-gray-200 rounded-lg overflow-hidden">
                    <div className="flex items-center justify-between px-3 py-1.5 bg-gray-50 border-b border-gray-100">
                      <span className="font-semibold text-sm text-gray-800">{row.typeName}</span>
                      <span className={`text-xs font-medium ${row.total > 100 ? 'text-red-500' : 'text-gray-500'}`}>
                        {row.total.toFixed(1)}%
                      </span>
                    </div>
                    <div className="divide-y divide-gray-50">
                      {row.components.map((component, componentIndex) => (
                        <div key={componentIndex} className="flex items-center justify-between px-4 py-2 text-sm gap-3">
                          <select
                            value={component.role || component.name || ''}
                            onChange={(event) => {
                              const nextEntries = [...formData.jobTypeEntries]
                              const nextComponents = [...(nextEntries[row.entryIndex].work_components || [])]
                              nextComponents[componentIndex] = { ...nextComponents[componentIndex], role: event.target.value, name: event.target.value }
                              nextEntries[row.entryIndex] = { ...nextEntries[row.entryIndex], work_components: nextComponents }
                              setFormData({ ...formData, jobTypeEntries: nextEntries })
                            }}
                            className="w-40 rounded border border-gray-200 px-2 py-1"
                          >
                            <option value="Any">Any</option>
                            {(enums?.roles || []).map((role: string) => (
                              <option key={role} value={role}>{role}</option>
                            ))}
                          </select>
                          <div className="flex items-center gap-2">
                            <input
                              type="number"
                              min="0"
                              step="0.1"
                              value={component.percentage ?? 0}
                              onChange={(event) => {
                                const nextEntries = [...formData.jobTypeEntries]
                                const nextComponents = [...(nextEntries[row.entryIndex].work_components || [])]
                                nextComponents[componentIndex] = {
                                  ...nextComponents[componentIndex],
                                  percentage: parseFloat(event.target.value) || 0,
                                }
                                nextEntries[row.entryIndex] = { ...nextEntries[row.entryIndex], work_components: nextComponents }
                                setFormData({ ...formData, jobTypeEntries: nextEntries })
                              }}
                              className="w-20 rounded border border-gray-200 px-2 py-1 text-right"
                            />
                            <span className="text-xs text-gray-400">%</span>
                          </div>
                        </div>
                      ))}
                      <button
                        type="button"
                        onClick={() => {
                          const nextEntries = [...formData.jobTypeEntries]
                          const nextComponents = [...(nextEntries[row.entryIndex].work_components || [])]
                          nextComponents.push({ name: '', role: '', percentage: 0, hours_multiplier: 1 })
                          nextEntries[row.entryIndex] = { ...nextEntries[row.entryIndex], work_components: nextComponents }
                          setFormData({ ...formData, jobTypeEntries: nextEntries })
                        }}
                        className="w-full py-1.5 text-xs text-gray-500 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                      >
                        Add Component
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Description</label>
            <textarea
              value={formData.description}
              onChange={(event) => setFormData({ ...formData, description: event.target.value })}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              rows={3}
              placeholder="Template description..."
            />
          </div>
          <button
            type="submit"
            disabled={saving}
            className="w-full rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:bg-gray-300"
          >
            {saving ? 'Saving...' : editingTemplate ? 'Update Custom Template' : 'Create Custom Template'}
          </button>
        </form>
      </Modal>

      <Modal isOpen={!!templateToDelete} onClose={() => !deleteSubmitting && setTemplateToDelete(null)} title="Delete Job Template">
        <div className="space-y-4">
          <div className="rounded-xl border border-red-100 bg-red-50 p-3 text-sm text-red-900">
            Delete {templateToDelete?.name || 'this job template'}? This action cannot be undone.
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setTemplateToDelete(null)}
              disabled={deleteSubmitting}
              className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleDelete}
              disabled={deleteSubmitting}
              className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:bg-gray-300"
            >
              {deleteSubmitting ? 'Deleting...' : 'Delete Template'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
