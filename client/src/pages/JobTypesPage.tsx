import { useEffect, useState, useCallback } from 'react'
import { toast } from 'sonner'

import { DestructiveConfirmModal } from '@/components/common/DestructiveConfirmModal'
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select'
import api from '@/services/api'
import { Icons, Modal, ContentLoading } from '@/components/workflow/shared'

// ── Constants ─────────────────────────────────────────────────────────────────

const SERVICE_BADGE: Record<string, string> = {
  payroll: 'bg-blue-100 text-blue-700',
  ma: 'bg-purple-100 text-purple-700',
  once_off: 'bg-orange-100 text-orange-700',
  general: 'bg-gray-100 text-gray-600',
}

const ROLES = [
  'Any', 'Partner', 'Director', 'Manager', 'Reviewer', 'Auditor',
  'Senior Accountant', 'Accountant', 'Junior Accountant',
  'Bookkeeper', 'Accounting Intern', 'Trainee', 'Admin',
]

// ── Helpers ───────────────────────────────────────────────────────────────────

const deriveServiceFromName = (name: string): string => {
  const token = name.toLowerCase().replace(/[\s_-]+/g, '')
  if (!token || token === 'general' || token === 'gen') return 'general'
  if (token === 'payroll' || token === 'p') return 'payroll'
  if (token === 'ma' || token === 'managementaccounts' || token === 'managementaccount' || token === 'm') return 'ma'
  if (token === 'onceoff' || token === 'onceoffservice' || token === 'onceoffjob') return 'once_off'
  return 'general'
}

type WorkComponent = {
  role: string
  name: string
  percentage: number
  hours_multiplier: number
}

const autoName = (jobTypeName: string, role: string) => {
  if (!role) return ''
  const service = deriveServiceFromName(jobTypeName)
  if (service === 'payroll') return `P: ${role}`
  if (service === 'ma') return `MA: ${role}`
  if (service === 'once_off') return `Once-off: ${role}`
  const abbr = jobTypeName
    .split(/[\s-]+/)
    .map((w) => w[0] || '')
    .join('')
    .toUpperCase()
  return `${abbr}: ${role}`
}

const emptyComponent = (): WorkComponent => ({
  role: 'Any', name: '', percentage: 100, hours_multiplier: 1,
})

// ── Validation ────────────────────────────────────────────────────────────────

function validateComponents(components: WorkComponent[]): string[] {
  const errors: string[] = []
  if (!components.length) {
    errors.push('At least one work component is required')
    return errors
  }

  const totalPct = components.reduce((sum, c) => sum + Number(c.percentage || 0), 0)
  if (Math.abs(totalPct - 100) > 0.01) {
    errors.push(`Work components must sum to 100% (currently ${totalPct}%)`)
  }

  return errors
}

// ── ComponentRow ──────────────────────────────────────────────────────────────

function ComponentRow({
  row, index, onChange, onRemove, jobTypeName,
}: {
  row: WorkComponent; index: number
  onChange: (i: number, row: WorkComponent) => void
  onRemove: (i: number) => void
  jobTypeName: string
}) {
  const update = (patch: Partial<WorkComponent>) => {
    const next = { ...row, ...patch }
    if ('role' in patch) {
      next.name = autoName(jobTypeName, next.role)
    }
    onChange(index, next)
  }

  return (
    <div className="grid grid-cols-[140px_1fr_60px_65px_32px] gap-2 items-center py-2 border-b border-gray-50 last:border-0">
      <Select
        value={row.role}
        onValueChange={(value: string) => update({ role: value })}
      >
        <SelectTrigger className="px-2 py-1.5 border border-gray-200 rounded-lg text-sm bg-white h-9 text-left">
          <span className="truncate text-gray-900">{row.role}</span>
        </SelectTrigger>
        <SelectContent className="bg-white text-gray-700 border border-gray-200">
          {ROLES.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
        </SelectContent>
      </Select>
      <input
        type="text"
        value={autoName(jobTypeName, row.role)}
        readOnly
        className="px-2 py-1.5 border border-gray-200 rounded-lg text-sm bg-gray-50 text-gray-500 cursor-default"
      />
      <input
        type="number" min={0} max={100} step={1}
        value={row.percentage}
        onChange={(e) => update({ percentage: Number(e.target.value) })}
        className="px-2 py-1.5 border border-gray-200 rounded-lg text-sm text-right"
      />
      <input
        type="number" min={0.1} step={0.1}
        value={row.hours_multiplier}
        onChange={(e) => update({ hours_multiplier: Number(e.target.value) })}
        className="px-2 py-1.5 border border-gray-200 rounded-lg text-sm text-right"
      />
      <button
        type="button" onClick={() => onRemove(index)}
        className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-red-500 hover:bg-red-50 rounded"
      >
        <Icons.Trash />
      </button>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export function JobTypesPage({ onRefresh, hidePageHeader = false, addTriggerKey, readOnly = false }: any) {
  const [jobTypes, setJobTypes] = useState<any>({ system_types: [], custom_types: [] })
  const [loading, setLoading] = useState(true)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingType, setEditingType] = useState<any>(null)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [components, setComponents] = useState<WorkComponent[]>([])
  const [compErrors, setCompErrors] = useState<string[]>([])
  const [activeTab, setActiveTab] = useState<'custom' | 'system'>('custom')
  const [pendingDeleteType, setPendingDeleteType] = useState<any>(null)
  const [deleteSubmitting, setDeleteSubmitting] = useState(false)

  useEffect(() => { fetchJobTypes() }, [])
  useEffect(() => {
    if (!readOnly && addTriggerKey && addTriggerKey > 0) {
      resetForm()
      setIsModalOpen(true)
    }
  }, [addTriggerKey, readOnly])

  const fetchJobTypes = async () => {
    try {
      const response = await api.get('/job-types')
      setJobTypes(response.data)
    } catch {
      toast.error('Failed to load job types')
    } finally {
      setLoading(false)
    }
  }

  const handleComponentChange = useCallback((i: number, row: WorkComponent) => {
    setComponents((prev) => prev.map((c, idx) => (idx === i ? row : c)))
    setCompErrors([])
  }, [])

  const handleComponentRemove = useCallback((i: number) => {
    setComponents((prev) => prev.filter((_, idx) => idx !== i))
    setCompErrors([])
  }, [])

  const addComponent = () => { setComponents((prev) => [...prev, emptyComponent()]); setCompErrors([]) }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const errs = validateComponents(components)
    if (errs.length) { setCompErrors(errs); return }
    const service = deriveServiceFromName(name)
    const workComponents = components.map((c) => ({ ...c, name: autoName(name, c.role), service }))
    try {
      const payload = { name, description, work_components: workComponents }
      if (editingType) {
        await api.put(`/job-types/${editingType.id}`, payload)
        toast.success('Job type updated')
      } else {
        await api.post('/job-types', payload)
        toast.success('Job type created')
      }
      setIsModalOpen(false)
      resetForm()
      fetchJobTypes()
      if (onRefresh) onRefresh()
    } catch (error: any) {
      toast.error(error.response?.data?.detail || 'Failed to save job type')
    }
  }

  const handleDelete = async (typeId: string) => {
    try {
      await api.delete(`/job-types/${typeId}`)
      toast.success('Job type deleted')
      fetchJobTypes()
      if (onRefresh) onRefresh()
    } catch (error: any) {
      toast.error(error.response?.data?.detail || 'Failed to delete job type')
    }
  }

  const openEditModal = (type: any) => {
    setEditingType(type)
    setName(type.name)
    setDescription(type.description || '')
    setComponents(
      (type.work_components || []).map((c: any) => ({
        role: c.role || '',
        name: c.name || autoName(type.name, c.role || ''),
        percentage: Number(c.percentage || 0),
        hours_multiplier: Number(c.hours_multiplier || 1),
      }))
    )
    setCompErrors([])
    setIsModalOpen(true)
  }

  const resetForm = () => {
    setEditingType(null); setName(''); setDescription(''); setComponents([emptyComponent()]); setCompErrors([])
  }

  const displayTypes = activeTab === 'system' ? (jobTypes.system_types || []) : (jobTypes.custom_types || [])
  const totalPct = components.reduce((sum, c) => sum + Number(c.percentage || 0), 0)
  const remainingPct = Math.max(0, 100 - totalPct)

  return (
    <div className="space-y-6" data-testid="job-types-page">
      {!hidePageHeader && (
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Job Types</h2>
            <p className="text-gray-500 mt-1">
              {readOnly ? 'View the organisation job-type catalog and component splits.' : 'Define service types and their work-component splits'}
            </p>
          </div>
        </div>
      )}

      {/* ── Tabs ── */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit">
        <button
          onClick={() => setActiveTab('custom')}
          className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${activeTab === 'custom' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
        >
          Custom Job Types
        </button>
        <button
          onClick={() => setActiveTab('system')}
          className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${activeTab === 'system' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
        >
          System Job Types
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        {loading ? (
          <ContentLoading />
        ) : displayTypes.length === 0 ? (
          <div className="p-12 text-center">
            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4"><Icons.Tag /></div>
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              {activeTab === 'system' ? 'No System Job Types' : 'No Custom Job Types'}
            </h3>
            <p className="text-gray-500 mb-4">
              {activeTab === 'system'
                ? 'System job types are predefined and cannot be modified.'
                : readOnly
                  ? 'No custom job types are available to view yet.'
                  : 'Create custom job types to define work-component splits.'}
            </p>
            {activeTab === 'custom' && !readOnly && (
              <button onClick={() => { resetForm(); setIsModalOpen(true) }} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium">Create First Job Type</button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase">Name</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase">Components</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase">ID</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase">Status</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase">Created</th>
                  <th className="px-6 py-4 text-right text-xs font-semibold text-gray-500 uppercase">{readOnly ? 'Mode' : 'Actions'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {displayTypes.map((type: any) => (
                  <tr key={type.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full ${type.is_system ? 'bg-purple-500' : 'bg-blue-500'}`} />
                        <span className="font-medium text-gray-900">{type.name}</span>
                      </div>
                      {type.description && <p className="text-xs text-gray-400 mt-0.5 pl-4">{type.description}</p>}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-wrap gap-1">
                        {(type.work_components || []).map((c: any, idx: number) => (
                          <span
                            key={idx}
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${SERVICE_BADGE[c.service || 'general'] || SERVICE_BADGE.general}`}
                          >
                            <span>{c.name || `${c.service}:${c.role}`}</span>
                            <span className="opacity-60">{c.percentage}%</span>
                          </span>
                        ))}
                        {!(type.work_components?.length) && <span className="text-gray-400 text-xs italic">No components</span>}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <code className="text-xs text-gray-400 font-mono">{type.code || '-'}</code>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`px-2 py-1 text-xs font-medium rounded-full ${type.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                        {type.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500">
                      {type.createdAt ? new Date(type.createdAt).toLocaleDateString() : '-'}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center justify-end gap-2">
                        {!type.is_system && !readOnly && (
                          <>
                            <button onClick={() => openEditModal(type)} className="p-2 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg" title="Edit"><Icons.Edit /></button>
                            <button onClick={() => setPendingDeleteType(type)} className="p-2 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg" title="Delete"><Icons.Trash /></button>
                          </>
                        )}
                        {(type.is_system || readOnly) && (
                          <span className="text-xs text-gray-400 italic">{type.is_system ? 'System' : 'View only'}</span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Modal ── */}
      {!readOnly && (
        <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={editingType ? 'Edit Job Type' : 'Add Job Type'} size="lg">
          <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
            <input
              type="text" required value={name} onChange={(e) => setName(e.target.value)}
              className="w-full px-4 py-2 border border-gray-200 rounded-xl"
              placeholder="e.g., Payroll, Tax Advisory"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <textarea
              value={description} onChange={(e) => setDescription(e.target.value)}
              className="w-full px-4 py-2 border border-gray-200 rounded-xl" rows={2}
              placeholder="Optional description"
            />
          </div>

          {/* Work Components */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-medium text-gray-700">Work Components</label>
              <button
                type="button" onClick={addComponent}
                className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100"
              >
                <Icons.Plus /> Add
              </button>
            </div>
            {components.length > 0 && (
              <div className="border border-gray-200 rounded-xl overflow-hidden">
                <div className="grid grid-cols-[140px_1fr_60px_65px_32px] gap-2 px-3 py-2 bg-gray-50 border-b border-gray-100">
                  <span className="text-xs text-gray-500 font-medium">Role</span>
                  <span className="text-xs text-gray-500 font-medium">Display Name</span>
                  <span className="text-xs text-gray-500 font-medium text-right">%</span>
                  <span className="text-xs text-gray-500 font-medium text-right">Hrs ×</span>
                  <span />
                </div>
                <div className="px-3 divide-y divide-gray-50">
                  {components.map((row, i) => (
                    <ComponentRow key={i} row={row} index={i} onChange={handleComponentChange} onRemove={handleComponentRemove} jobTypeName={name} />
                  ))}
                </div>
                {/* Total percentage indicator */}
                <div className="px-3 py-2 bg-gray-50 border-t border-gray-100">
                  <div className="flex items-center justify-between text-xs">
                    <span className={`font-medium ${totalPct === 100 ? 'text-green-700' : totalPct > 100 ? 'text-red-700' : 'text-amber-700'}`}>
                      Total: {totalPct}%
                    </span>
                    {totalPct < 100 && <span className="text-gray-500">Remaining: {remainingPct}%</span>}
                    {totalPct > 100 && <span className="text-red-600">Over by {Math.abs(totalPct - 100)}%</span>}
                    {totalPct === 100 && <span className="text-green-600">Complete</span>}
                  </div>
                  <div className="mt-1.5 w-full h-1.5 bg-gray-200 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${totalPct > 100 ? 'bg-red-500' : totalPct === 100 ? 'bg-green-500' : 'bg-amber-400'}`}
                      style={{ width: `${Math.min(totalPct, 100)}%` }}
                    />
                  </div>
                </div>
              </div>
            )}
            {components.length === 0 && (
              <p className="text-xs text-gray-400 italic">No components yet — click &ldquo;+ Add&rdquo; to define splits.</p>
            )}
            {compErrors.length > 0 && (
              <div className="mt-2 space-y-1">
                {compErrors.map((err, i) => <p key={i} className="text-xs text-red-600">⚠ {err}</p>)}
              </div>
            )}
          </div>

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={() => setIsModalOpen(false)} className="flex-1 px-4 py-2 border border-gray-200 text-gray-700 rounded-xl hover:bg-gray-50">Cancel</button>
            <button type="submit" className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700">{editingType ? 'Update' : 'Create'}</button>
          </div>
          </form>
        </Modal>
      )}

      {!readOnly && (
        <DestructiveConfirmModal
          isOpen={!!pendingDeleteType}
          onClose={() => !deleteSubmitting && setPendingDeleteType(null)}
          onConfirm={async () => {
            if (!pendingDeleteType?.id) return
            try {
              setDeleteSubmitting(true)
              await handleDelete(pendingDeleteType.id)
              setPendingDeleteType(null)
            } finally {
              setDeleteSubmitting(false)
            }
          }}
          title="Delete Job Type"
          description={`Delete ${pendingDeleteType?.name || 'this job type'}? Jobs using it will need to be updated.`}
          confirmLabel="Delete Job Type"
          isSubmitting={deleteSubmitting}
        />
      )}
    </div>
  )
}
