import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'

import { DestructiveConfirmModal } from '@/components/common/DestructiveConfirmModal'
import api from '@/services/api'
import { Icons, Modal, ContentLoading } from '@/components/workflow/shared'

export function DepartmentsPage({ staff, onRefresh, hidePageHeader = false, addTriggerKey }: any) {
  const [departments, setDepartments] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editDept, setEditDept] = useState<any>(null)
  const [form, setForm] = useState({ name: '', code: '', description: '', supervisor_id: '' })
  const [pendingDeleteDept, setPendingDeleteDept] = useState<any>(null)
  const [confirmSubmitting, setConfirmSubmitting] = useState(false)

  const fetchDepartments = useCallback(async () => {
    try {
      const res = await api.get('/departments')
      setDepartments((res.data?.data || []).filter((d: any) => d.is_active !== false))
      } catch (_e) {
        console.error(_e)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchDepartments()
  }, [fetchDepartments])

  useEffect(() => {
    if (addTriggerKey && addTriggerKey > 0) {
      setEditDept(null)
      setForm({ name: '', code: '', description: '', supervisor_id: '' })
      setShowModal(true)
    }
  }, [addTriggerKey])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      if (editDept) {
        await api.put(`/departments/${editDept.id}`, form)
        toast.success('Department updated!')
      } else {
        await api.post('/departments', form)
        toast.success('Department created!')
      }
      setShowModal(false)
      setEditDept(null)
      setForm({ name: '', code: '', description: '', supervisor_id: '' })
      fetchDepartments()
      if (onRefresh) onRefresh()
    } catch (error: any) {
      toast.error(error.response?.data?.detail || 'Failed')
    }
  }

  const handleEdit = (dept: any) => {
    setEditDept(dept)
    setForm({ name: dept.name, code: dept.code || String(dept.name || '').replace(/[^A-Za-z0-9]/g, '').slice(0, 5).toUpperCase(), description: dept.description || '', supervisor_id: dept.supervisor_id || '' })
    setShowModal(true)
  }

  const handleDelete = async (id: string) => {
    try {
      await api.delete(`/departments/${id}`)
      toast.success('Department deactivated!')
      fetchDepartments()
      } catch {
        toast.error('Failed')
      }
  }

  const supervisors = staff?.filter((s: any) => ['Partner', 'Director', 'Manager', 'Supervisor'].includes(s.role)) || []

  return (
    <div className="space-y-6">
      {!hidePageHeader && (
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Departments</h2>
          <p className="text-gray-500 mt-1">Manage organizational structure and job categorization</p>
        </div>
      )}

      {loading ? (
        <ContentLoading />
      ) : departments.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-xl shadow-sm border border-gray-100">
          <Icons.Building />
          <h3 className="mt-4 text-lg font-semibold text-gray-900">No departments yet</h3>
          <p className="text-gray-500 mt-2">Create departments to organize your staff and jobs.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {departments.map((dept: any) => {
            const supervisor = staff?.find((s: any) => s.id === dept.supervisor_id)
            const departmentCode = dept.code || String(dept.name || '').replace(/[^A-Za-z0-9]/g, '').slice(0, 5).toUpperCase()
            return (
              <div key={dept.id} className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 hover:shadow-md transition-all">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center">
                      <span className="text-blue-700 font-bold text-lg">{departmentCode}</span>
                    </div>
                    <div>
                      <h3 className="font-semibold text-gray-900">{dept.name}</h3>
                      <p className="text-sm text-gray-500">Code: {departmentCode}</p>
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <button onClick={() => handleEdit(dept)} className="p-2 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg"><Icons.Edit /></button>
                    <button onClick={() => setPendingDeleteDept(dept)} className="p-2 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg"><Icons.Trash /></button>
                  </div>
                </div>
                {dept.description && <p className="text-sm text-gray-600 mb-4">{dept.description}</p>}
                {supervisor && (
                  <div className="pt-4 border-t border-gray-100">
                    <p className="text-xs text-gray-500 mb-1">Supervisor</p>
                    <p className="text-sm font-medium text-gray-900">{supervisor.name}</p>
                    <p className="text-xs text-gray-500">{supervisor.role}</p>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title={editDept ? 'Edit Department' : 'Create Department'}>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Department Name *</label>
            <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full px-4 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500" placeholder="e.g., Tax Division" required />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Department Code *</label>
            <input type="text" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} className="w-full px-4 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 uppercase" placeholder="e.g., TAX" maxLength={5} required />
            <p className="text-xs text-gray-500 mt-1">Used as prefix for job codes (e.g., TAX-001)</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="w-full px-4 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500" rows={3} placeholder="Department description..." />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Supervisor</label>
            <select value={form.supervisor_id} onChange={(e) => setForm({ ...form, supervisor_id: e.target.value })} className="w-full px-4 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500">
              <option value="">Select supervisor...</option>
              {supervisors.map((s: any) => <option key={s.id} value={s.id}>{s.name} ({s.role})</option>)}
            </select>
          </div>
          <div className="flex gap-3 pt-4">
            <button type="button" onClick={() => setShowModal(false)} className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-xl hover:bg-gray-50">Cancel</button>
            <button type="submit" className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700">{editDept ? 'Update' : 'Create'}</button>
          </div>
        </form>
      </Modal>

      <DestructiveConfirmModal
        isOpen={!!pendingDeleteDept}
        onClose={() => !confirmSubmitting && setPendingDeleteDept(null)}
        onConfirm={async () => {
          if (!pendingDeleteDept?.id) return
          try {
            setConfirmSubmitting(true)
            await handleDelete(pendingDeleteDept.id)
            setPendingDeleteDept(null)
          } finally {
            setConfirmSubmitting(false)
          }
        }}
        title="Deactivate Department"
        description={`Deactivate ${pendingDeleteDept?.name || 'this department'}?`}
        confirmLabel="Deactivate"
        isSubmitting={confirmSubmitting}
        tone="warning"
      />
    </div>
  )
}
