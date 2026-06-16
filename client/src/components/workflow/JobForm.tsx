import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'

import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select'
import { SearchableClientSelect } from '@/components/common/SearchableClientSelect'
import api from '@/services/api'

interface JobFormProps {
  initialData?: any
  onSubmit: (payload: any) => Promise<void>
  onCancel: () => void
  symbol?: string
  enums?: any
  initialTemplateId?: string | null
}

type JobTemplateRecord = {
  id: string
  name: string
  job_type?: string
  job_type_entries?: Array<{
    job_type_id?: string | { _id?: string } | null
    job_type_name?: string
    fee?: number
    work_components?: Array<{
      name?: string
      role?: string
      percentage?: number
      service?: string
      hours_multiplier?: number
    }>
  }>
  default_fee?: number
  minimum_role?: string | null
  default_priority?: string
  description?: string | null
  department_id?: string | null
  is_recurring?: boolean
  month_range?: string | null
  template_kind?: string
  is_system?: boolean
  is_editable?: boolean
}

const RECURRENCE_OPTIONS = [
  { value: 'monthly', label: 'Monthly' },
  { value: 'bi-monthly', label: 'Bi-Monthly' },
  { value: 'quarterly', label: 'Quarterly' },
  { value: 'biannually', label: 'Biannually' },
  { value: 'annually', label: 'Annually' },
] as const

const EMPTY_FORM = {
  name: '',
  client_name: '',
  jobTypeEntries: [] as { id: string; fee: string; work_components?: any[]; _allocation_cleared?: boolean }[],
  minimum_role: '',
  priority: 'Medium',
  deadline_day: '',
  deadline_month: '',
  description: '',
  department_id: '',
  frequency: 'once-off',
  recurrence_type: '',
  recurrence_start_date: '',
  recurrence_end_date: '',
}

function buildDefaultRecurringFields() {
  const today = new Date()
  const year = today.getFullYear()
  const month = String(today.getMonth() + 1).padStart(2, '0')
  const day = String(today.getDate()).padStart(2, '0')
  return {
    recurrence_type: 'monthly',
    recurrence_start_date: `${year}-${month}-${day}`,
    recurrence_end_date: `${year}-${month}-${day}`,
  }
}

function toDateInputValue(value: any) {
  if (!value) return ''
  const datePart = String(value).split('T')[0]
  if (/^\d{4}-\d{2}-\d{2}$/.test(datePart)) return datePart
  if (/^\d{4}-\d{2}$/.test(datePart)) return `${datePart}-01`
  return ''
}

function buildEmptyForm(clientName = '') {
  return {
    ...EMPTY_FORM,
    client_name: clientName,
    jobTypeEntries: [{ id: '', fee: '' }],
  }
}

function initFormData(job: any) {
  if (!job) return buildEmptyForm()

  const entries: any[] = []

  // Primary: reconstruct from job_type_entries (flexible new format)
  const jte = job.job_type_entries || []
  if (jte.length > 0) {
    jte.forEach((entry: any) => {
      const id = entry.job_type_id?._id ?? entry.job_type_id
      if (id) {
        const obj: any = { id }
        obj.fee = entry.fee === undefined || entry.fee === null ? '' : String(entry.fee)
        if (entry.work_components?.length) {
          obj.work_components = entry.work_components.map((c: any) => ({ ...c }))
        }
        entries.push(obj)
      }
    })
  }

  // Final fallback: single entry from job_type_id + job_fee
  if (entries.length === 0) {
    const id = job.job_type_id?._id ?? job.job_type_id ?? ''
    entries.push({ id, fee: job.job_fee === undefined || job.job_fee === null ? '' : String(job.job_fee) })
  }

  const deadlineStr = job.deadline?.split('T')[0] || ''
  const deadlineDay = job.deadline_day || (deadlineStr ? parseInt(deadlineStr.split('-')[2], 10) : '')
  const deadlineMonth = deadlineStr ? deadlineStr.slice(0, 7) : ''

  return {
    name: job.name || '',
    client_name: job.client_name || '',
    jobTypeEntries: entries,
    minimum_role: job.minimum_role || '',
    priority: job.priority || 'Medium',
    deadline_day: deadlineDay ? String(deadlineDay) : '',
    deadline_month: deadlineMonth,
    description: job.description || '',
    department_id: job.department_id || '',
    frequency: job.is_recurring ? 'recurring' : 'once-off',
    recurrence_type: job.recurrence_type || (job.is_recurring ? 'monthly' : ''),
    recurrence_start_date: toDateInputValue(job.recurrence_start_date),
    recurrence_end_date: toDateInputValue(job.recurrence_end_date),
  }
}



const EMPTY_SELECT_VALUE = '__empty__'

function resolveTemplateEntries(template: JobTemplateRecord | null, allJobTypes: any[]) {
  if (!template) return []

  const entries = (template.job_type_entries || [])
    .map((entry: any) => {
      const rawId = entry.job_type_id?._id ?? entry.job_type_id ?? ''
      const matched =
        allJobTypes.find((type: any) => (type.id ?? type._id) === rawId) ||
        allJobTypes.find((type: any) => String(type.name || '').trim() === String(entry.job_type_name || '').trim())

      return {
        id: matched ? (matched.id ?? matched._id) : '',
        fee: entry.fee === undefined || entry.fee === null ? '' : String(entry.fee),
        work_components: Array.isArray(entry.work_components) ? entry.work_components.map((component: any) => ({ ...component })) : [],
      }
    })
    .filter((entry: any) => entry.id)

  if (entries.length > 0) return entries

  const fallback = allJobTypes.find((type: any) => String(type.name || '').trim() === String(template.job_type || '').trim())
  return fallback
    ? [{
        id: fallback.id ?? fallback._id,
        fee: template.default_fee === undefined || template.default_fee === null ? '' : String(template.default_fee),
      }]
    : []
}

function buildTemplateFormData(template: JobTemplateRecord, currentClientName: string, allJobTypes: any[]) {
  const entries = resolveTemplateEntries(template, allJobTypes)
  return {
    ...buildEmptyForm(currentClientName),
    name: template.name || '',
    jobTypeEntries: entries.length > 0 ? entries : [{ id: '', fee: '' }],
    minimum_role: template.minimum_role || '',
    priority: template.default_priority || 'Medium',
    description: template.description || '',
    department_id: template.department_id || '',
    frequency: template.is_recurring ? 'recurring' : 'once-off',
    ...(template.is_recurring ? buildDefaultRecurringFields() : {}),
  }
}

export function JobForm({ initialData, onSubmit, onCancel, symbol = 'R', enums, initialTemplateId = null }: JobFormProps) {
  const isEdit = !!initialData
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const location = useLocation()

  const [formData, setFormData] = useState(() => initFormData(initialData))
  const [jobTypesCatalog, setJobTypesCatalog] = useState<any>({ system_types: [], custom_types: [] })
  const [jobTemplates, setJobTemplates] = useState<JobTemplateRecord[]>([])
  const [selectedTemplateId, setSelectedTemplateId] = useState(initialTemplateId || '')
  const [appliedTemplateId, setAppliedTemplateId] = useState('')
  const [departments, setDepartments] = useState<any[]>([])
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    setFormData(initFormData(initialData))
  }, [initialData])

  useEffect(() => {
    setSelectedTemplateId(initialTemplateId || '')
    setAppliedTemplateId('')
  }, [initialTemplateId])

  useEffect(() => {
    const load = async () => {
      try {
        const [typesRes, deptRes] = await Promise.all([
          api.get('/job-types'),
          api.get('/departments'),
        ])
        setJobTypesCatalog(typesRes.data || { system_types: [], custom_types: [] })
        const deptData = deptRes.data?.data || deptRes.data || []
        setDepartments(Array.isArray(deptData) ? deptData.filter((d: any) => d.is_active !== false) : [])

        if (!isEdit) {
          try {
            const templatesRes = await api.get('/job-templates')
            setJobTemplates(Array.isArray(templatesRes.data) ? templatesRes.data : [])
          } catch (templateError) {
            console.error('JobForm: failed to load job templates', templateError)
          }
        }

        if (!isEdit) {
          const clientIdFromUrl = searchParams.get('clientId')
          if (clientIdFromUrl && !formData.client_name) {
            try {
              const res = await api.get(`/clients/${clientIdFromUrl}`)
              const client = res.data
              if (client?.name) {
                setFormData((prev) => {
                  if (prev.client_name) return prev
                  return { ...prev, client_name: client.name }
                })
              }
            } catch {
              // client not found, user can search manually
            }
          }
        }
      } catch (err) {
        console.error('JobForm: failed to load meta', err)
      }
    }
    load()
  }, [isEdit, searchParams])

  const allJobTypes = useMemo(() => {
    return [...(jobTypesCatalog.system_types || []), ...(jobTypesCatalog.custom_types || [])]
  }, [jobTypesCatalog])

  const selectedTemplate = useMemo(
    () => jobTemplates.find((template) => template.id === selectedTemplateId) || null,
    [jobTemplates, selectedTemplateId]
  )

  useEffect(() => {
    if (isEdit || !selectedTemplateId || !selectedTemplate || !allJobTypes.length) return
    if (appliedTemplateId === selectedTemplateId) return

    setFormData((prev: any) => buildTemplateFormData(selectedTemplate, prev.client_name || '', allJobTypes))
    setAppliedTemplateId(selectedTemplateId)
  }, [allJobTypes, appliedTemplateId, isEdit, selectedTemplate, selectedTemplateId])

  // Auto-populate work_components from template for entries that lack them (pre-migration jobs)
  useEffect(() => {
    if (!allJobTypes.length) return
    setFormData((prev) => {
      const needsUpdate = (prev.jobTypeEntries || []).some(
        (e: any) => e.id && !e._allocation_cleared && (!e.work_components || e.work_components.length === 0)
      )
      if (!needsUpdate) return prev
      const newEntries = (prev.jobTypeEntries || []).map((entry: any) => {
        if (entry.work_components?.length || entry._allocation_cleared || !entry.id) return entry
        const jt = allJobTypes.find((t: any) => (t.id ?? t._id) === entry.id)
        if (!jt?.work_components?.length) return entry
        return { ...entry, work_components: jt.work_components.map((c: any) => ({ ...c })) }
      })
      return { ...prev, jobTypeEntries: newEntries }
    })
  }, [allJobTypes])

  const totalJobFee = useMemo(
    () => (formData.jobTypeEntries || []).reduce((sum: number, entry: any) => sum + (parseFloat(entry.fee) || 0), 0),
    [formData.jobTypeEntries]
  )

  const distributionRows = useMemo(() => {
    const rows: any[] = []
    ;(formData.jobTypeEntries || []).forEach((entry: any) => {
      if (!entry.id) return
      const jt = allJobTypes.find((t: any) => (t.id ?? t._id) === entry.id)
      if (!jt) return
      const comps = entry.work_components || jt.work_components || []
      const typeName = jt.name || ''
      const entryFee = parseFloat(entry.fee) || 0
      comps.forEach((c: any) => {
        const compPct = Number(c.percentage || 0)
        const amount = entryFee * (compPct / 100)
        rows.push({
          label: `${typeName}: ${c.role || c.name}`,
          service: typeName,
          percentage: compPct,
          amount,
        })
      })
    })
    return rows
  }, [allJobTypes, formData.jobTypeEntries])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formData.client_name.trim()) {
      toast.error('Please select a client')
      return
    }

    const validEntries = (formData.jobTypeEntries || []).filter(
      (e: any) => e.id
    )
    if (validEntries.length === 0) {
      toast.error('Please select at least one job type')
      return
    }

    // Validate each entry has at least one work component
    const allHaveComponents = validEntries.every((e: any) => {
      if (e.work_components?.length) return true
      const jt = allJobTypes.find((t: any) => (t.id ?? t._id) === e.id)
      return jt?.work_components?.length > 0
    })
    if (!allHaveComponents) {
      toast.error('Each job type must have at least one work component')
      return
    }

    // Validate each job type's component percentages sum to 100% or less
    const anyHasComponents = validEntries.some((e: any) => e.work_components?.length)
    const typeCompTotals: number[] = []
    if (anyHasComponents) {
      validEntries.forEach((e: any) => {
        const comps = e.work_components || []
        const total = comps.reduce((s: number, c: any) => s + (Number(c.percentage) || 0), 0)
        typeCompTotals.push(total)
      })
      if (typeCompTotals.some((t: number) => t > 100.01)) {
        toast.error("Each job type's work components must not exceed 100%")
        return
      }
    }

    const hasNegativeFee = validEntries.some((entry: any) => (parseFloat(entry.fee) || 0) < 0)
    if (hasNegativeFee) {
      toast.error('Each job type fee must be zero or more')
      return
    }

    const deadlineDayNum = parseInt(formData.deadline_day, 10)
    if (!formData.deadline_day || isNaN(deadlineDayNum) || deadlineDayNum < 1 || deadlineDayNum > 31) {
      toast.error('Please select a deadline day between 1 and 31')
      return
    }

    const isRecurring = formData.frequency === 'recurring'

    if (!isRecurring) {
      if (!formData.deadline_month) {
        toast.error('Please select a deadline month')
        return
      }
    }

    if (isRecurring) {
      if (!formData.recurrence_type) {
        toast.error('Please select a recurrence')
        return
      }
      if (!formData.recurrence_start_date) {
        toast.error('Please select a start date')
        return
      }
      if (!formData.recurrence_end_date) {
        toast.error('Please select an end date')
        return
      }
      if (formData.recurrence_end_date < formData.recurrence_start_date) {
        toast.error('End date must be on or after the start date')
        return
      }
    }

    let jobName = formData.name.trim()
    if (!jobName) {
      const typeNames = validEntries
        .map((e: any) => {
          const jt = allJobTypes.find((t: any) => (t.id ?? t._id) === e.id)
          return jt?.name || ''
        })
        .filter(Boolean)
        .join(' & ')
      jobName = `${formData.client_name}${typeNames ? ` — ${typeNames}` : ''}`
    }

    const jobTypeFees = validEntries.map((e: any) => ({
      id: e.id,
      fee: parseFloat(e.fee) || 0,
      work_components: e.work_components?.length ? e.work_components : [],
    }))

    const deadlineDay = deadlineDayNum
    const deadlineMonth = isRecurring ? null : formData.deadline_month

    const data: any = {
      name: jobName,
      client_name: formData.client_name,
      job_type_id: validEntries[0].id,
      service_fee: totalJobFee,
      job_fee: totalJobFee,
      job_types: jobTypeFees,
      minimum_role: formData.minimum_role || null,
      deadline_day: deadlineDay,
      deadline: deadlineMonth ? `${deadlineMonth}-${String(deadlineDay).padStart(2, '0')}` : null,
      department_id: formData.department_id || null,
      is_recurring: isRecurring,
      month_range: null,
      recurrence_type: isRecurring ? formData.recurrence_type : null,
      recurrence_start_date: isRecurring ? formData.recurrence_start_date : null,
      recurrence_end_date: isRecurring ? formData.recurrence_end_date : null,
      description: formData.description || null,
    }

    setSubmitting(true)
    try {
      await onSubmit({ payload: data })
    } catch (error: any) {
      toast.error(error.response?.data?.detail || 'Failed to save job')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      <form onSubmit={handleSubmit} className="space-y-4">
        {!isEdit && (
          <div className="w-full max-w-2xl border border-indigo-100 bg-indigo-50/60 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-indigo-900">Start From Template</p>
                <p className="text-xs text-indigo-700">
                  Pick a system or custom template to prefill this job form, then adjust anything you need.
                </p>
              </div>
              {selectedTemplateId && (
                <button
                  type="button"
                  onClick={() => {
                    setSelectedTemplateId('')
                    setAppliedTemplateId('')
                    setFormData((prev: any) => buildEmptyForm(prev.client_name || ''))
                    setSearchParams((prev) => {
                      const next = new URLSearchParams(prev)
                      next.delete('templateId')
                      return next
                    }, { replace: true })
                  }}
                  className="text-xs font-medium text-indigo-700 hover:text-indigo-900"
                >
                  Clear template
                </button>
              )}
            </div>

            <div className="w-full max-w-xl">
              <Select
                value={selectedTemplateId || EMPTY_SELECT_VALUE}
                onValueChange={(value: string) => {
                  const nextValue = value === EMPTY_SELECT_VALUE ? '' : value
                  setSelectedTemplateId(nextValue)
                  setAppliedTemplateId('')
                  setSearchParams((prev) => {
                    const next = new URLSearchParams(prev)
                    if (nextValue) next.set('templateId', nextValue)
                    else next.delete('templateId')
                    return next
                  }, { replace: true })
                  if (!nextValue) {
                    setFormData((prev: any) => buildEmptyForm(prev.client_name || ''))
                  }
                }}
              >
                <SelectTrigger className="w-full px-4 py-2 border border-indigo-200 rounded-xl text-sm text-left bg-white">
                  <span className={selectedTemplate ? 'truncate text-gray-900' : 'truncate text-gray-500'}>
                    {selectedTemplate ? selectedTemplate.name : 'Select a job template...'}
                  </span>
                </SelectTrigger>
                <SelectContent className="bg-white text-gray-700 border border-gray-200">
                  <SelectItem value={EMPTY_SELECT_VALUE}>Select a job template...</SelectItem>
                  {jobTemplates.map((template) => (
                    <SelectItem key={template.id} value={template.id} textValue={template.name}>
                      <div className="flex items-center gap-2">
                        <span>{template.name}</span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded ${template.is_system ? 'bg-slate-100 text-slate-600' : 'bg-emerald-100 text-emerald-700'}`}>
                          {template.is_system ? 'System' : 'Custom'}
                        </span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {selectedTemplate && (
              <div className="flex flex-wrap items-center gap-2 text-xs text-indigo-800">
                <span className="rounded-full bg-white border border-indigo-200 px-2 py-0.5">
                  {selectedTemplate.is_system ? 'System Template' : 'Custom Template'}
                </span>
                {selectedTemplate.job_type && (
                  <span className="rounded-full bg-white border border-indigo-200 px-2 py-0.5">
                    {selectedTemplate.job_type}
                  </span>
                )}
                {selectedTemplate.is_editable === false && (
                  <span className="rounded-full bg-white border border-indigo-200 px-2 py-0.5">
                    Read only
                  </span>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── Job Name & Client (responsive row) ── */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Job Name</label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="Auto-generated from client & job type if left blank"
              className="w-full px-4 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {isEdit ? (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Client</label>
              <p className="px-4 py-2 border border-gray-200 rounded-xl text-sm text-gray-900 bg-gray-50">{formData.client_name}</p>
            </div>
          ) : (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Client *</label>
              <SearchableClientSelect
                value={formData.client_name}
                onValueChange={(value: string) => {
                  setFormData({ ...formData, client_name: value })
                  if (!isEdit && searchParams.has('clientId')) {
                    setSearchParams((prev) => {
                      const next = new URLSearchParams(prev)
                      next.delete('clientId')
                      return next
                    }, { replace: true })
                  }
                }}
                placeholder="Select client..."
                useClientName
                onCreateNew={() => navigate(`/app/clients?returnTo=${encodeURIComponent(location.pathname)}`)}
              />
            </div>
          )}

        </div>

        {/* ── Job Types & Allocation ── */}
        <div className="border border-gray-200 rounded-xl overflow-hidden">
          <div className="bg-gray-50 px-4 py-2 border-b border-gray-200">
            <p className="text-sm font-semibold text-gray-700">Job Types</p>
          </div>
          <div className="p-3 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
            {(formData.jobTypeEntries || []).map((entry: any, index: number) => (
              <div key={index} className="flex items-center gap-2 p-2 bg-gray-50 rounded-lg">
                <div className="flex-1 min-w-0">
                  <Select
                    value={entry.id || EMPTY_SELECT_VALUE}
                    onValueChange={(value: string) => {
                      const newEntries = [...(formData.jobTypeEntries || [])]
                      const newId = value === EMPTY_SELECT_VALUE ? '' : value
                      const updatedEntry: any = { ...newEntries[index], id: newId }
                      if (newId && !updatedEntry._allocation_cleared && (!updatedEntry.work_components || updatedEntry.work_components.length === 0)) {
                        const jt = allJobTypes.find((t: any) => (t.id ?? t._id) === newId)
                        if (jt?.work_components?.length) {
                          updatedEntry.work_components = jt.work_components.map((c: any) => ({ ...c }))
                        }
                      }
                      updatedEntry._allocation_cleared = false
                      newEntries[index] = updatedEntry
                      setFormData({ ...formData, jobTypeEntries: newEntries })
                    }}
                  >
                    <SelectTrigger className="w-full px-2.5 py-1 border border-gray-200 rounded text-sm text-left h-8">
                      <span className={entry.id ? 'truncate text-gray-900' : 'truncate text-gray-400'}>
                        {allJobTypes.find((t: any) => (t.id ?? t._id) === entry.id)?.name || 'Select job type...'}
                      </span>
                    </SelectTrigger>
                    <SelectContent className="bg-white text-gray-700 border border-gray-200">
                      <SelectItem value={EMPTY_SELECT_VALUE}>Select job type...</SelectItem>
                      {allJobTypes.map((t: any) => (
                        <SelectItem key={t.id ?? t._id} value={t.id ?? t._id} textValue={t.name}>
                          <div className="flex items-center gap-2">
                            <span>{t.name}</span>
                            {t.is_system && (
                              <span className="text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">System</span>
                            )}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="w-28 shrink-0">
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="Fee"
                    value={entry.fee ?? ''}
                    onChange={(e) => {
                      const newEntries = [...(formData.jobTypeEntries || [])]
                      newEntries[index] = { ...newEntries[index], fee: e.target.value }
                      setFormData({ ...formData, jobTypeEntries: newEntries })
                    }}
                    className="w-full px-2.5 py-1 border border-gray-200 rounded text-sm text-right h-8 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    aria-label={`Fee for job type ${index + 1}`}
                  />
                </div>
                {(formData.jobTypeEntries?.length || 0) > 1 && (
                  <button
                    type="button"
                    onClick={() => {
                      const newEntries = (formData.jobTypeEntries || []).filter((_: any, i: number) => i !== index)
                      setFormData({ ...formData, jobTypeEntries: newEntries })
                    }}
                    className="p-1 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors shrink-0"
                    title="Remove job type"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                    </svg>
                  </button>
                )}
              </div>
            ))}
            <button
              type="button"
              onClick={() => {
                const current = formData.jobTypeEntries || []
                setFormData({
                  ...formData,
                  jobTypeEntries: [...current, { id: '', fee: '' }],
                })
              }}
              className="col-span-full w-full py-1.5 border-2 border-dashed border-gray-200 rounded-lg text-sm text-gray-500 hover:border-blue-300 hover:text-blue-600 transition-colors"
            >
              + Add Job Type
            </button>
          </div>
        </div>

        {/* ── Work Allocation preview ── */}
        <div className="border border-gray-200 rounded-xl overflow-hidden">
          <div className="bg-gray-50 px-4 py-2.5 border-b border-gray-200 flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-gray-700">Work Allocation</p>
              <p className="text-xs text-gray-400 mt-0.5">
                {(formData.jobTypeEntries || []).some((e: any) => e.id) ? (
                  <>Each role's share within that job type fee</>
                ) : (
                  <>Add a job type above to see work allocation</>
                )}
              </p>
            </div>
          </div>
          {!(formData.jobTypeEntries || []).some((e: any) => e.id) ? (
            <div className="px-4 py-6 text-center">
              <p className="text-sm text-gray-400">Select job types above to see work allocation</p>
            </div>
          ) : distributionRows.length === 0 ? (
            <div className="px-4 py-6 text-center">
              <p className="text-sm text-gray-400">No work components defined for these job types</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {(formData.jobTypeEntries || []).map((entry: any, ei: number) => {
                if (!entry.id) return null
                const jt = allJobTypes.find((t: any) => (t.id ?? t._id) === entry.id)
                if (!jt) return null
                const comps = entry.work_components || jt.work_components || []
                if (comps.length === 0) return null
                const entryFee = parseFloat(entry.fee) || 0
                const typeTotal = comps.reduce((s: number, c: any) => s + (Number(c.percentage) || 0), 0)
                const overLimit = typeTotal > 100
                return (
                  <div key={ei} className="border border-gray-200 rounded-lg overflow-hidden">
                    <div className="flex items-center justify-between px-3 py-1.5 bg-gray-50 border-b border-gray-100">
                      <div>
                        <span className="font-semibold text-sm text-gray-800">{jt.name}</span>
                        <p className="text-[11px] font-medium text-green-700">{symbol}{entryFee.toFixed(2)}</p>
                      </div>
                      <span className={`text-xs font-medium text-right ${overLimit ? 'text-red-500' : 'text-gray-500'}`}>
                        {typeTotal.toFixed(1)}%{overLimit ? ' (exceeds 100%)' : ''}
                      </span>
                    </div>
                    <div className="divide-y divide-gray-50">
                      {comps.map((c: any, ci: number) => (
                        <div key={ci} className="flex items-center justify-between px-4 py-2 text-sm gap-3">
                          <Select
                            value={c.role || c.name || ''}
                            onValueChange={(value: string) => {
                              const newEntries = [...(formData.jobTypeEntries || [])]
                              const newComps = [...(newEntries[ei].work_components || jt.work_components || []).map((x: any) => ({ ...x }))]
                              newComps[ci] = { ...newComps[ci], name: value, role: value }
                              newEntries[ei] = { ...newEntries[ei], work_components: newComps }
                              setFormData({ ...formData, jobTypeEntries: newEntries })
                            }}
                          >
                            <SelectTrigger className="w-36 px-2 py-1 border border-gray-200 rounded text-sm h-8 bg-white text-left">
                              <span className="truncate text-gray-900">{c.role || c.name || 'Role'}</span>
                            </SelectTrigger>
                            <SelectContent className="bg-white text-gray-700 border border-gray-200">
                              <SelectItem value="Any">Any</SelectItem>
                              {(enums?.roles ?? []).map((r: string) => (
                                <SelectItem key={r} value={r}>{r}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <div className="flex items-center gap-2">
                            <input
                              type="number" min="0" step="0.1"
                              value={c.percentage ?? 0}
                              onChange={(e) => {
                                const newEntries = [...(formData.jobTypeEntries || [])]
                                const newComps = [...(newEntries[ei].work_components || jt.work_components || []).map((x: any) => ({ ...x }))]
                                newComps[ci] = { ...newComps[ci], percentage: parseFloat(e.target.value) || 0 }
                                newEntries[ei] = { ...newEntries[ei], work_components: newComps }
                                setFormData({ ...formData, jobTypeEntries: newEntries })
                              }}
                              className={`w-20 px-2 py-1 border rounded text-right text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                                overLimit ? 'border-red-300 bg-red-50' : 'border-gray-200'
                              }`}
                            />
                            <span className="text-gray-400 text-xs">%</span>
                            <button
                              type="button"
                              onClick={() => {
                                const newEntries = [...(formData.jobTypeEntries || [])]
                                const newComps = (newEntries[ei].work_components || jt.work_components || []).filter((_: any, i: number) => i !== ci)
                                newEntries[ei] = { ...newEntries[ei], work_components: newComps, _allocation_cleared: newComps.length === 0 }
                                setFormData({ ...formData, jobTypeEntries: newEntries })
                              }}
                              className="p-1 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors"
                              title="Remove component"
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
                                <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                              </svg>
                            </button>
                          </div>
                        </div>
                      ))}
                      <button
                        type="button"
                        onClick={() => {
                          const newEntries = [...(formData.jobTypeEntries || [])]
                          const newComps = [...(newEntries[ei].work_components || jt.work_components || []).map((x: any) => ({ ...x }))]
                          newComps.push({ name: '', role: '', percentage: 0, hours_multiplier: 1 })
                          newEntries[ei] = { ...newEntries[ei], work_components: newComps, _allocation_cleared: false }
                          setFormData({ ...formData, jobTypeEntries: newEntries })
                        }}
                        className="w-full py-1.5 text-xs text-gray-500 hover:text-blue-600 hover:bg-blue-50 transition-colors flex items-center justify-center gap-1"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
                        </svg>
                        Add Component
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* ── Total Job Fee ── */}
          <div className="border-t border-gray-200 px-4 py-3 flex items-center justify-between">
            <span className="text-sm font-semibold text-gray-700">Total Job Fee ({symbol})</span>
            <span className="text-sm font-bold text-gray-900">
              {symbol}{totalJobFee.toFixed(2)}
            </span>
          </div>
        </div>

        {/* ── Details ── */}
        <div className="border-t border-gray-200 pt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Priority *</label>
            <Select
              value={formData.priority}
              onValueChange={(value: string) => setFormData({ ...formData, priority: value })}
            >
              <SelectTrigger className="w-full px-4 py-2 border border-gray-200 rounded-xl text-sm text-left">
                <span className="truncate text-gray-900">{formData.priority}</span>
              </SelectTrigger>
              <SelectContent className="bg-white text-gray-700 border border-gray-200">
                {(enums?.priorities ?? ['Low', 'Medium', 'High', 'Critical']).map((p: string) => (
                  <SelectItem key={p} value={p}>{p}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Department</label>
            <Select
              value={formData.department_id || EMPTY_SELECT_VALUE}
              onValueChange={(value: string) => setFormData({ ...formData, department_id: value === EMPTY_SELECT_VALUE ? '' : value })}
            >
              <SelectTrigger className="w-full px-4 py-2 border border-gray-200 rounded-xl text-sm text-left">
                <span className={formData.department_id ? 'truncate text-gray-900' : 'truncate text-gray-400'}>
                  {departments.find((d: any) => d.id === formData.department_id)?.name || 'No department'}
                </span>
              </SelectTrigger>
              <SelectContent className="bg-white text-gray-700 border border-gray-200">
                <SelectItem value={EMPTY_SELECT_VALUE}>No department</SelectItem>
                {departments.map((dept: any) => (
                  <SelectItem key={dept.id} value={dept.id} textValue={dept.name}>{dept.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Deadline Day *</label>
            <select
              value={formData.deadline_day}
              onChange={(e) => setFormData({ ...formData, deadline_day: e.target.value })}
              className="w-full h-10 px-4 py-2 border border-gray-200 rounded-xl text-sm bg-white"
            >
              <option value="">Select day...</option>
              {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Minimum Role</label>
            <Select
              value={formData.minimum_role || EMPTY_SELECT_VALUE}
              onValueChange={(value: string) => setFormData({ ...formData, minimum_role: value === EMPTY_SELECT_VALUE ? '' : value })}
            >
              <SelectTrigger className="w-full px-4 py-2 border border-gray-200 rounded-xl text-sm text-left">
                <span className={formData.minimum_role ? 'truncate text-gray-900' : 'truncate text-gray-400'}>
                  {formData.minimum_role || 'Any'}
                </span>
              </SelectTrigger>
              <SelectContent className="bg-white text-gray-700 border border-gray-200">
                <SelectItem value={EMPTY_SELECT_VALUE}>Any</SelectItem>
                {enums?.roles?.map((r: string) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Frequency *</label>
            <Select
              value={formData.frequency}
              onValueChange={(value: string) => {
                const isRec = value === 'recurring'
                const recurringDefaults = buildDefaultRecurringFields()
                setFormData({
                  ...formData,
                  frequency: value,
                  recurrence_type: isRec ? (formData.recurrence_type || recurringDefaults.recurrence_type) : '',
                  recurrence_start_date: isRec ? (formData.recurrence_start_date || recurringDefaults.recurrence_start_date) : '',
                  recurrence_end_date: isRec ? (formData.recurrence_end_date || recurringDefaults.recurrence_end_date) : '',
                  deadline_month: isRec ? '' : (formData.deadline_month || ''),
                })
              }}
            >
              <SelectTrigger className="w-full px-4 py-2 border border-gray-200 rounded-xl text-sm text-left">
                <span className="truncate text-gray-900">{formData.frequency === 'recurring' ? 'Recurring' : 'Once Off'}</span>
              </SelectTrigger>
              <SelectContent className="bg-white text-gray-700 border border-gray-200">
                <SelectItem value="once-off">Once Off</SelectItem>
                <SelectItem value="recurring">Recurring</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {formData.frequency !== 'recurring' && (
          <div className="border-t border-gray-200 pt-4">
            <div className="max-w-xs">
              <label className="block text-sm font-medium text-gray-700 mb-1">Deadline Month *</label>
              <input
                type="month"
                value={formData.deadline_month}
                onChange={(e) => setFormData({ ...formData, deadline_month: e.target.value })}
                className="w-full h-10 px-4 py-2 border border-gray-200 rounded-xl"
              />
            </div>
          </div>
        )}

        {formData.frequency === 'recurring' && (
          <div className="border-t border-gray-200 pt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Recurrence *</label>
              <Select
                value={formData.recurrence_type || EMPTY_SELECT_VALUE}
                onValueChange={(value: string) => setFormData({ ...formData, recurrence_type: value === EMPTY_SELECT_VALUE ? '' : value })}
              >
                <SelectTrigger className="w-full px-4 py-2 border border-gray-200 rounded-xl text-sm text-left">
                  <span className={formData.recurrence_type ? 'truncate text-gray-900' : 'truncate text-gray-400'}>
                    {RECURRENCE_OPTIONS.find((option) => option.value === formData.recurrence_type)?.label || 'Select recurrence...'}
                  </span>
                </SelectTrigger>
                <SelectContent className="bg-white text-gray-700 border border-gray-200">
                  <SelectItem value={EMPTY_SELECT_VALUE}>Select recurrence...</SelectItem>
                  {RECURRENCE_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Start Date *</label>
              <input
                type="date"
                value={formData.recurrence_start_date}
                onChange={(e) => setFormData({ ...formData, recurrence_start_date: e.target.value })}
                className="w-full h-10 px-4 py-2 border border-gray-200 rounded-xl"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">End Date *</label>
              <input
                type="date"
                value={formData.recurrence_end_date}
                min={formData.recurrence_start_date || undefined}
                onChange={(e) => setFormData({ ...formData, recurrence_end_date: e.target.value })}
                className="w-full h-10 px-4 py-2 border border-gray-200 rounded-xl"
              />
            </div>
          </div>
        )}

        {/* ── Notes ── */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Notes (optional)</label>
          <textarea
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            rows={2}
            placeholder="e.g. special instructions, context, or references..."
            className="w-full px-4 py-2 border border-gray-200 rounded-xl text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* ── Actions ── */}
        <div className="flex gap-3 pt-4 border-t border-gray-200 justify-end">
          <button
            type="button"
            onClick={onCancel}
            className="px-6 py-2 border border-gray-200 text-gray-700 rounded-xl hover:bg-gray-50 text-sm"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="px-6 py-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:opacity-60 text-sm"
          >
            {submitting ? 'Saving...' : isEdit ? 'Update Job' : 'Add'}
          </button>
        </div>
      </form>

    </>
  )
}
