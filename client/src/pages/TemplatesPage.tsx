import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { useNavigate, useParams } from 'react-router-dom'

import api from '@/services/api'
import { Icons, Modal, formatCurrency } from '@/components/workflow/shared'

const getPriorityColor = (priority: string) => {
  const colors: Record<string, string> = {
    Critical: 'bg-red-100 text-red-800 border-red-200',
    High: 'bg-orange-100 text-orange-800 border-orange-200',
    Medium: 'bg-yellow-100 text-yellow-800 border-yellow-200',
    Low: 'bg-green-100 text-green-800 border-green-200',
  }
  return colors[priority] || 'bg-gray-100 text-gray-800 border-gray-200'
}

export function TemplatesPage({ settings, enums, onRefresh, hidePageHeader = false }: any) {
  const navigate = useNavigate()
  const { template_ref: templateRef = '' } = useParams()
  const [customTemplates, setCustomTemplates] = useState<any[]>([])
  const [builtInTemplates, setBuiltInTemplates] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [installingKey, setInstallingKey] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editingTemplate, setEditingTemplate] = useState<any>(null)
  const [showCreateJobModal, setShowCreateJobModal] = useState<any>(null)
  const [confirmSubmitting, setConfirmSubmitting] = useState(false)
  const [confirmAction, setConfirmAction] = useState<null | {
    kind: 'install' | 'delete'
    templateKey?: string
    templateId?: string
    templateName?: string
    installed?: boolean
  }>(null)
  const [jobFormData, setJobFormData] = useState({ client_name: '', job_fee: '', deadline: '' })
  const [newTemplate, setNewTemplate] = useState({ name: '', industry: '', job_type: '', default_fee: '', estimated_hours: '', minimum_role: '', default_priority: 'Medium', description: '' })
  const symbol = settings?.currency_symbol || 'R'

  const selectedTemplate = useMemo(() => {
    if (!templateRef) return null

    if (templateRef.startsWith('system-')) {
      const key = templateRef.replace('system-', '')
      const template = builtInTemplates.find((item: any) => String(item.key) === key)
      if (!template) return null
      return { ...template, _templateType: 'System' }
    }

    if (templateRef.startsWith('custom-')) {
      const id = templateRef.replace('custom-', '')
      const template = customTemplates.find((item: any) => String(item.id) === id)
      if (!template) return null
      return { ...template, _templateType: 'Custom' }
    }

    return null
  }, [templateRef, builtInTemplates, customTemplates])

  const fetchTemplates = useCallback(async () => {
    try {
      setLoading(true)
      const res = await api.get('/templates')
      if (Array.isArray(res.data)) {
        setCustomTemplates(res.data)
        setBuiltInTemplates([])
      } else {
        setBuiltInTemplates(res.data?.built_in_templates || [])
        setCustomTemplates(res.data?.custom_templates || [])
      }
    } catch (error: any) {
      const detail = error?.response?.data?.detail || error?.message || 'Failed to load templates'
      toast.error(detail)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchTemplates()
  }, [fetchTemplates])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      const payload = {
        ...newTemplate,
        default_fee: parseFloat(newTemplate.default_fee),
        estimated_hours: newTemplate.estimated_hours ? parseFloat(newTemplate.estimated_hours) : null,
      }
      if (editingTemplate) {
        await api.put(`/templates/${editingTemplate.id}`, payload)
        toast.success('Template updated!')
      } else {
        await api.post('/templates', payload)
        toast.success('Template created!')
      }
      setShowForm(false)
      setEditingTemplate(null)
      setNewTemplate({ name: '', industry: '', job_type: '', default_fee: '', estimated_hours: '', minimum_role: '', default_priority: 'Medium', description: '' })
      fetchTemplates()
    } catch {
      toast.error('Failed to save template')
    }
  }

  const handleInstallBuiltIn = async (templateKey: string, isCurrentlyInstalled: boolean) => {
    if (!templateKey) return

    try {
      setInstallingKey(templateKey)
      const { data } = await api.post(`/templates/built-in/${templateKey}/install`)
      const action = data?.action

      if (action === 'uninstalled') {
        toast.success('Template uninstalled successfully!')
      } else if (action === 'installed') {
        toast.success(isCurrentlyInstalled ? 'Template updated successfully!' : 'Template installed successfully!')
      } else {
        toast.success('Template updated successfully!')
      }
      fetchTemplates()
    } catch (error: any) {
      toast.error(error?.response?.data?.detail || 'Failed to update template')
    } finally {
      setInstallingKey('')
    }
  }

  const handleDelete = async (id: string) => {
    try {
      await api.delete(`/templates/${id}`)
      toast.success('Template deleted!')
      fetchTemplates()
    } catch {
      toast.error('Failed to delete template')
    }
  }

  const openInstallConfirm = (templateKey: string, templateName?: string, installed = false) => {
    setConfirmAction({ kind: 'install', templateKey, templateName, installed })
  }

  const openDeleteConfirm = (templateId: string, templateName?: string) => {
    setConfirmAction({ kind: 'delete', templateId, templateName })
  }

  const handleConfirmAction = async () => {
    if (!confirmAction) return

    setConfirmSubmitting(true)
    try {
      if (confirmAction.kind === 'install' && confirmAction.templateKey) {
        await handleInstallBuiltIn(confirmAction.templateKey, Boolean(confirmAction.installed))
      }

      if (confirmAction.kind === 'delete' && confirmAction.templateId) {
        await handleDelete(confirmAction.templateId)
      }

      setConfirmAction(null)
    } finally {
      setConfirmSubmitting(false)
    }
  }

  const handleCreateJob = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      const params = new URLSearchParams({ client_name: jobFormData.client_name })
      if (jobFormData.job_fee) params.append('job_fee', jobFormData.job_fee)
      if (jobFormData.deadline) params.append('deadline', jobFormData.deadline)
      await api.post(`/templates/${showCreateJobModal.id}/create-job?${params.toString()}`)
      toast.success('Job created from template!')
      setShowCreateJobModal(null)
      setJobFormData({ client_name: '', job_fee: '', deadline: '' })
      if (onRefresh) onRefresh()
    } catch {
      toast.error('Failed to create job')
    }
  }

  const renderTemplateDetail = () => {
    if (!selectedTemplate) return null

    const setup = selectedTemplate.setup || {}
    const departments = Array.isArray(setup.departments) ? setup.departments : []
    const jobTypes = Array.isArray(setup.job_types) ? setup.job_types : []
    const installFlow = Array.isArray(setup.seed_order) ? setup.seed_order : []

    return (
      <div className="space-y-6" data-testid="template-detail-page">
        <button
          onClick={() => navigate('/app/templates')}
          className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg"
        >
          <Icons.Close />
          Back to Templates
        </button>

        <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <p className="text-xs uppercase tracking-wide text-indigo-600 font-semibold">{selectedTemplate._templateType} Template</p>
              <h2 className="text-3xl font-bold text-gray-900 mt-1">{selectedTemplate.name}</h2>
              <p className="text-sm text-gray-500 mt-1">Industry: <span className="font-medium text-gray-700">{selectedTemplate.industry || 'General'}</span></p>
              <p className="text-gray-600 mt-3 max-w-3xl">{selectedTemplate.description || 'No description provided.'}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {selectedTemplate._templateType === 'System' ? (
                <>
                  <span className={`px-3 py-1 text-xs font-semibold rounded-full border ${selectedTemplate.installed ? 'bg-green-100 text-green-700 border-green-200' : 'bg-blue-100 text-blue-700 border-blue-200'}`}>
                    {selectedTemplate.installed ? 'Installed' : 'Available'}
                  </span>
                  <button
                    onClick={() => openInstallConfirm(selectedTemplate.key, selectedTemplate.name, Boolean(selectedTemplate.installed))}
                    disabled={installingKey === selectedTemplate.key}
                    className={`px-3 py-1 text-xs font-semibold rounded-full text-white disabled:bg-gray-400 disabled:cursor-not-allowed ${selectedTemplate.installed ? 'bg-red-600 hover:bg-red-700' : 'bg-indigo-600 hover:bg-indigo-700'}`}
                  >
                    {installingKey === selectedTemplate.key
                      ? 'Processing...'
                      : (selectedTemplate.installed ? 'Uninstall Template' : 'Install Template')}
                  </button>
                </>
              ) : (
                <span className="px-3 py-1 text-xs font-semibold rounded-full border bg-slate-100 text-slate-700 border-slate-200">Custom</span>
              )}
            </div>
          </div>
          {selectedTemplate._templateType === 'System' && (
            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="rounded-xl bg-gray-50 border border-gray-100 p-3 text-sm">
                <p className="text-gray-500">Installed Status</p>
                <p className="font-semibold text-gray-900 mt-1">{selectedTemplate.installed ? 'Installed' : 'Not Installed'}</p>
              </div>
              <div className="rounded-xl bg-gray-50 border border-gray-100 p-3 text-sm">
                <p className="text-gray-500">Installed At</p>
                <p className="font-semibold text-gray-900 mt-1">{selectedTemplate.installed_at ? new Date(selectedTemplate.installed_at).toLocaleString() : '-'}</p>
              </div>
            </div>
          )}
        </section>

        {selectedTemplate._templateType === 'System' && (
          <section className="space-y-4">
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wide">Install Flow</h3>
              <div className="mt-4 flex flex-wrap items-center gap-2">
                {installFlow.length === 0 ? (
                  <span className="text-sm text-gray-500">No install flow defined.</span>
                ) : (
                  installFlow.map((step: string, index: number) => (
                    <div key={`${step}-${index}`} className="flex items-center gap-2">
                      <span className="px-3 py-1 text-xs font-semibold rounded-full bg-indigo-100 text-indigo-700 border border-indigo-200">{step.replace('_', ' ')}</span>
                      {index < installFlow.length - 1 ? <span className="text-gray-400">→</span> : null}
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wide">Departments</h3>
              <div className="mt-4 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                {departments.length === 0 ? (
                  <p className="text-sm text-gray-500">No departments configured.</p>
                ) : (
                  departments.map((department: any) => (
                    <div key={department.code || department.name} className="rounded-xl border border-gray-100 bg-gray-50 p-4">
                      <div className="flex items-center gap-3">
                        <span className="h-9 w-9 rounded-lg flex items-center justify-center text-xs font-bold" style={{ backgroundColor: `${department.color || '#6366F1'}22`, color: department.color || '#6366F1' }}>
                          {department.code || '?'}
                        </span>
                        <div>
                          <p className="font-semibold text-gray-900">{department.name}</p>
                          <p className="text-xs text-gray-500">Code: {department.code || '-'}</p>
                        </div>
                      </div>
                      <p className="mt-3 text-sm text-gray-600">{department.description || '-'}</p>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wide">Job Types</h3>
              <div className="mt-4 space-y-3">
                {jobTypes.length === 0 ? (
                  <p className="text-sm text-gray-500">No job types configured.</p>
                ) : (
                  jobTypes.map((jobType: any) => (
                    <div key={jobType.name} className="rounded-xl border border-gray-100 bg-gray-50 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-semibold text-gray-900">{jobType.name}</p>
                          <p className="text-sm text-gray-600 mt-1">{jobType.description || '-'}</p>
                        </div>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {Array.isArray(jobType.work_components) && jobType.work_components.length > 0 ? (
                          jobType.work_components.map((component: any, index: number) => (
                            <span key={`${jobType.name}-${component.name}-${index}`} className="px-2.5 py-1 text-xs font-medium rounded-full bg-indigo-100 text-indigo-700 border border-indigo-200">
                              {component.name || component.role || 'Component'} {component.percentage !== undefined && component.percentage !== null ? `${component.percentage}%` : ''}
                            </span>
                          ))
                        ) : (
                          <span className="text-sm text-gray-500">No components configured.</span>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </section>
        )}

        <Modal isOpen={!!confirmAction} onClose={() => !confirmSubmitting && setConfirmAction(null)} title={confirmAction?.kind === 'install' ? (confirmAction?.installed ? 'Uninstall Template' : 'Install Template') : 'Delete Template'}>
          <div className="space-y-4">
            <div className="rounded-xl border border-indigo-100 bg-indigo-50 p-3 text-sm text-indigo-900">
              {confirmAction?.kind === 'install'
                ? (confirmAction?.installed
                  ? `Uninstall ${confirmAction.templateName || 'this template'} from your organisation? You can reinstall it later.`
                  : `Install ${confirmAction.templateName || 'this template'} for your organisation? This seeds the built-in setup.`)
                : `Delete ${confirmAction?.templateName || 'this template'}? This action cannot be undone.`}
            </div>
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmAction(null)}
                disabled={confirmSubmitting}
                className="px-4 py-2 rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmAction}
                disabled={confirmSubmitting}
                className={`px-4 py-2 rounded-lg text-white disabled:bg-gray-400 ${confirmAction?.kind === 'install' ? (confirmAction?.installed ? 'bg-red-600 hover:bg-red-700' : 'bg-indigo-600 hover:bg-indigo-700') : 'bg-red-600 hover:bg-red-700'}`}
              >
                {confirmSubmitting
                  ? 'Please wait...'
                  : (confirmAction?.kind === 'install'
                    ? (confirmAction?.installed ? 'Uninstall Template' : 'Install Template')
                    : 'Delete Template')}
              </button>
            </div>
          </div>
        </Modal>
      </div>
    )
  }

  if (!loading && templateRef && !selectedTemplate) {
    return (
      <div className="space-y-6" data-testid="template-detail-not-found">
        <button
          onClick={() => navigate('/app/templates')}
          className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg"
        >
          <Icons.Close />
          Back to Templates
        </button>
        <div className="bg-white border border-gray-100 rounded-2xl p-8 text-center shadow-sm">
          <h2 className="text-2xl font-bold text-gray-900">Template Not Found</h2>
          <p className="text-gray-600 mt-2">The template you are trying to view does not exist or is no longer available.</p>
        </div>
      </div>
    )
  }

  if (templateRef && selectedTemplate) {
    return renderTemplateDetail()
  }

  return (
    <div className="space-y-6" data-testid="templates-page">
      <div className="flex items-center justify-between">
        {!hidePageHeader && <div><h2 className="text-2xl font-bold text-gray-900">Job Templates</h2><p className="text-gray-500 mt-1">Pre-configured job templates for quick creation</p></div>}
        <button onClick={() => { setShowForm(true); setEditingTemplate(null) }} className="px-4 py-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 flex items-center gap-2"><Icons.Plus />New Template</button>
      </div>

      {loading ? <div className="animate-pulse h-48 bg-gray-100 rounded-xl" /> : (
        <>
          {builtInTemplates.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-lg font-semibold text-gray-900">System Templates</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {builtInTemplates.map((t: any) => (
                  <div key={t.id || t.key} className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                    <div className="p-4 border-b border-gray-100">
                      <div className="flex items-start justify-between gap-2">
                        <h4 className="font-semibold text-gray-900">{t.name}</h4>
                        <span className={`inline-block px-2 py-0.5 text-xs rounded-full ${t.installed ? 'bg-green-100 text-green-800 border border-green-200' : 'bg-blue-100 text-blue-800 border border-blue-200'}`}>
                          {t.installed ? 'Installed' : 'Available'}
                        </span>
                      </div>
                      <p className="mt-2 text-xs text-gray-500">Industry: <span className="font-medium text-gray-700">{t.industry}</span></p>
                    </div>
                    <div className="p-4 text-sm text-gray-600">{t.description}</div>
                    <div className="p-3 bg-gray-50 border-t border-gray-100 flex gap-2">
                      <button
                        onClick={() => navigate(`/app/templates/system-${t.key}`)}
                        className="p-2 text-gray-500 hover:text-indigo-600"
                        title="View details"
                      >
                        <Icons.Eye />
                      </button>
                      <button
                        onClick={() => openInstallConfirm(t.key, t.name, Boolean(t.installed))}
                        disabled={installingKey === t.key}
                        className={`flex-1 px-3 py-2 text-white text-sm rounded-lg disabled:bg-gray-400 disabled:cursor-not-allowed ${t.installed ? 'bg-red-600 hover:bg-red-700' : 'bg-indigo-600 hover:bg-indigo-700'}`}
                      >
                        {installingKey === t.key ? 'Processing...' : (t.installed ? 'Uninstall Template' : 'Install Template')}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-3">
            <h3 className="text-lg font-semibold text-gray-900">Custom Templates</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {customTemplates.map((t: any) => (
            <div key={t.id} className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="p-4 border-b border-gray-100">
                <h3 className="font-semibold text-gray-900">{t.name}</h3>
                <span className={`inline-block mt-1 px-2 py-0.5 text-xs rounded-full ${getPriorityColor(t.default_priority)}`}>{t.default_priority}</span>
                <p className="mt-2 text-xs text-gray-500">Industry: <span className="font-medium text-gray-700">{t.industry || 'General'}</span></p>
              </div>
              <div className="p-4 space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-gray-500">Job Type:</span><span className="font-medium">{t.job_type}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">Default Fee:</span><span className="font-medium text-green-600">{formatCurrency(t.default_fee, symbol)}</span></div>
                {t.estimated_hours && <div className="flex justify-between"><span className="text-gray-500">Est. Hours:</span><span className="font-medium">{t.estimated_hours}h</span></div>}
                {t.minimum_role && <div className="flex justify-between"><span className="text-gray-500">Min. Role:</span><span className="font-medium">{t.minimum_role}</span></div>}
                {t.description && <p className="text-gray-500 text-xs mt-2 pt-2 border-t border-gray-100">{t.description}</p>}
              </div>
              <div className="p-3 bg-gray-50 border-t border-gray-100 flex gap-2">
                <button onClick={() => setShowCreateJobModal(t)} className="flex-1 px-3 py-2 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700">Create Job</button>
                <button onClick={() => navigate(`/app/templates/custom-${t.id}`)} className="p-2 text-gray-500 hover:text-indigo-600" title="View details"><Icons.Eye /></button>
                <button onClick={() => { setEditingTemplate(t); setNewTemplate({ name: t.name, industry: t.industry || '', job_type: t.job_type, default_fee: t.default_fee, estimated_hours: t.estimated_hours || '', minimum_role: t.minimum_role || '', default_priority: t.default_priority, description: t.description || '' }); setShowForm(true) }} className="p-2 text-gray-500 hover:text-blue-600"><Icons.Edit /></button>
                <button onClick={() => openDeleteConfirm(t.id, t.name)} className="p-2 text-gray-500 hover:text-red-600"><Icons.Trash /></button>
              </div>
            </div>
              ))}
              {customTemplates.length === 0 && <div className="col-span-full text-center py-12 text-gray-500">No custom templates yet. Create your first template!</div>}
            </div>
          </div>
        </>
      )}

      <Modal isOpen={showForm} onClose={() => setShowForm(false)} title={editingTemplate ? 'Edit Template' : 'Create Template'} size="md">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div><label className="block text-sm font-medium text-gray-700 mb-1">Template Name *</label><input type="text" required value={newTemplate.name} onChange={(e) => setNewTemplate({ ...newTemplate, name: e.target.value })} className="w-full px-3 py-2 border border-gray-200 rounded-lg" placeholder="e.g., Monthly VAT Return" /></div>
          <div><label className="block text-sm font-medium text-gray-700 mb-1">Industry *</label><input type="text" required value={newTemplate.industry} onChange={(e) => setNewTemplate({ ...newTemplate, industry: e.target.value })} className="w-full px-3 py-2 border border-gray-200 rounded-lg" placeholder="e.g., Accounting firm" /></div>
          <div className="grid grid-cols-2 gap-4">
            <div><label className="block text-sm font-medium text-gray-700 mb-1">Job Type *</label><select required value={newTemplate.job_type} onChange={(e) => setNewTemplate({ ...newTemplate, job_type: e.target.value })} className="w-full px-3 py-2 border border-gray-200 rounded-lg"><option value="">Select Type</option>{enums?.job_types?.map((t: string) => <option key={t} value={t}>{t}</option>)}</select></div>
            <div><label className="block text-sm font-medium text-gray-700 mb-1">Default Fee ({symbol}) *</label><input type="number" required min="0" value={newTemplate.default_fee} onChange={(e) => setNewTemplate({ ...newTemplate, default_fee: e.target.value })} className="w-full px-3 py-2 border border-gray-200 rounded-lg" /></div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div><label className="block text-sm font-medium text-gray-700 mb-1">Est. Hours</label><input type="number" min="0" value={newTemplate.estimated_hours} onChange={(e) => setNewTemplate({ ...newTemplate, estimated_hours: e.target.value })} className="w-full px-3 py-2 border border-gray-200 rounded-lg" /></div>
            <div><label className="block text-sm font-medium text-gray-700 mb-1">Priority</label><select value={newTemplate.default_priority} onChange={(e) => setNewTemplate({ ...newTemplate, default_priority: e.target.value })} className="w-full px-3 py-2 border border-gray-200 rounded-lg">{enums?.priorities?.map((p: string) => <option key={p} value={p}>{p}</option>)}</select></div>
          </div>
          <div><label className="block text-sm font-medium text-gray-700 mb-1">Minimum Role</label><select value={newTemplate.minimum_role} onChange={(e) => setNewTemplate({ ...newTemplate, minimum_role: e.target.value })} className="w-full px-3 py-2 border border-gray-200 rounded-lg"><option value="">Any</option>{enums?.roles?.map((r: string) => <option key={r} value={r}>{r}</option>)}</select></div>
          <div><label className="block text-sm font-medium text-gray-700 mb-1">Description</label><textarea value={newTemplate.description} onChange={(e) => setNewTemplate({ ...newTemplate, description: e.target.value })} className="w-full px-3 py-2 border border-gray-200 rounded-lg" rows={2} placeholder="Template description..." /></div>
          <button type="submit" className="w-full py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">{editingTemplate ? 'Update Template' : 'Create Template'}</button>
        </form>
      </Modal>

      <Modal isOpen={!!confirmAction} onClose={() => !confirmSubmitting && setConfirmAction(null)} title={confirmAction?.kind === 'install' ? (confirmAction?.installed ? 'Uninstall Template' : 'Install Template') : 'Delete Template'}>
        <div className="space-y-4">
          <div className="rounded-xl border border-indigo-100 bg-indigo-50 p-3 text-sm text-indigo-900">
            {confirmAction?.kind === 'install'
              ? (confirmAction?.installed
                ? `Uninstall ${confirmAction.templateName || 'this template'} from your organisation? You can reinstall it later.`
                : `Install ${confirmAction.templateName || 'this template'} for your organisation? This seeds the built-in setup.`)
              : `Delete ${confirmAction?.templateName || 'this template'}? This action cannot be undone.`}
          </div>
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setConfirmAction(null)}
              disabled={confirmSubmitting}
              className="px-4 py-2 rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleConfirmAction}
              disabled={confirmSubmitting}
              className={`px-4 py-2 rounded-lg text-white disabled:bg-gray-400 ${confirmAction?.kind === 'install' ? (confirmAction?.installed ? 'bg-red-600 hover:bg-red-700' : 'bg-indigo-600 hover:bg-indigo-700') : 'bg-red-600 hover:bg-red-700'}`}
            >
              {confirmSubmitting
                ? 'Please wait...'
                : (confirmAction?.kind === 'install'
                  ? (confirmAction?.installed ? 'Uninstall Template' : 'Install Template')
                  : 'Delete Template')}
            </button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={!!showCreateJobModal} onClose={() => setShowCreateJobModal(null)} title={`Create Job from: ${showCreateJobModal?.name}`}>
        <form onSubmit={handleCreateJob} className="space-y-4">
          <div><label className="block text-sm font-medium text-gray-700 mb-1">Client Name *</label><input type="text" required value={jobFormData.client_name} onChange={(e) => setJobFormData({ ...jobFormData, client_name: e.target.value })} className="w-full px-3 py-2 border border-gray-200 rounded-lg" placeholder="Client company name" /></div>
          <div><label className="block text-sm font-medium text-gray-700 mb-1">Fee ({symbol}) <span className="text-gray-400">- defaults to {formatCurrency(showCreateJobModal?.default_fee || 0, symbol)}</span></label><input type="number" min="0" value={jobFormData.job_fee} onChange={(e) => setJobFormData({ ...jobFormData, job_fee: e.target.value })} className="w-full px-3 py-2 border border-gray-200 rounded-lg" placeholder={showCreateJobModal?.default_fee} /></div>
          <div><label className="block text-sm font-medium text-gray-700 mb-1">Deadline</label><input type="date" value={jobFormData.deadline} onChange={(e) => setJobFormData({ ...jobFormData, deadline: e.target.value })} className="w-full px-3 py-2 border border-gray-200 rounded-lg" /></div>
          <button type="submit" className="w-full py-2 bg-green-600 text-white rounded-lg hover:bg-green-700">Create Job</button>
        </form>
      </Modal>
    </div>
  )
}
