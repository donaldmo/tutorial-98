import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'

import { toast } from 'sonner'

import { DestructiveConfirmModal } from '@/components/common/DestructiveConfirmModal'
import api from '@/services/api'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { SearchableSelect } from '@/components/common/SearchableSelect'
import { Icons, formatCurrency } from '@/components/workflow/shared'

export function StaffPage({ staff: _staff, enums, onCreateStaff, onUpdateStaff, onDeleteStaff, settings, onRefresh, user, hidePageHeader = false, addTriggerKey }: any) {
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingStaff, setEditingStaff] = useState<any>(null)

  const [formData, setFormData] = useState<any>({
    name: '',
    role: 'Accountant',
    hourly_rate: '',
    available_hours_per_month: 160,
    productivity_factor: 0.8,
    efficiency: 1,
    annual_fee_budget: '',
    annual_budgeted_hours: '',
    email: '',
    password: '',
    phone: '',
    manager_id: '',
    department_id: '',
    department_ids: [],
  })

  const [permissionModal, setPermissionModal] = useState<any>({ open: false, staff: null })
  const [permissionAccessLevel, setPermissionAccessLevel] = useState('Standard')
  const [passwordModal, setPasswordModal] = useState<any>({ open: false, staff: null, newPassword: '', showPassword: false })
  const [departments, setDepartments] = useState<any[]>([])
  const [showArchived, setShowArchived] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [confirmSubmitting, setConfirmSubmitting] = useState(false)
  const [confirmAction, setConfirmAction] = useState<any>(null)
  const [search, setSearch] = useState('')
  const [allStaff, setAllStaff] = useState<any[]>([])
  const [_staffLoading, setStaffLoading] = useState(false)
  const [staffTotal, setStaffTotal] = useState(0)
  const [loadedStaffPage, setLoadedStaffPage] = useState(0)
  const [staffHasMore, setStaffHasMore] = useState(true)
  const sentinelRef = useRef<HTMLDivElement>(null)
  const staffLoadingRef = useRef(_staffLoading)
  staffLoadingRef.current = _staffLoading
  const staffPageRef = useRef(loadedStaffPage)
  staffPageRef.current = loadedStaffPage
  const staffHasMoreRef = useRef(staffHasMore)
  staffHasMoreRef.current = staffHasMore
  const symbol = settings?.currency_symbol || 'R'
  const calcBudgetedHours = (() => {
    const fee = parseFloat(formData.annual_fee_budget)
    const rate = parseFloat(formData.hourly_rate)
    return fee > 0 && rate > 0 ? Math.round(fee / rate) : 0
  })()
  const canManagePermissions = user?.access_level === 'Full'
  const canDelete = user?.access_level !== 'Admin' && user?.can_delete !== false

  const fetchStaffPage = useCallback(async (page: number) => {
    try {
      setStaffLoading(true)
      const params = new URLSearchParams({ page: page.toString(), limit: '6' })
      if (search) params.set('search', search)
      if (showArchived) params.set('archived', 'true')
      const res = await api.get(`/staff?${params}`)
      const items = res.data.data || []
      const total = res.data.pagination?.total ?? 0
      const totalPages = res.data.pagination?.total_pages ?? 1

      if (page === 1) {
        setAllStaff(items)
      } else {
        setAllStaff(prev => {
          const existingIds = new Set(prev.map((s: any) => s.id))
          return [...prev, ...items.filter((s: any) => !existingIds.has(s.id))]
        })
      }
      setStaffTotal(total)
      setStaffHasMore(page < totalPages)
      setLoadedStaffPage(page)
    } catch {
      toast.error('Failed to load staff')
    } finally {
      setStaffLoading(false)
    }
  }, [search, showArchived])

  useEffect(() => {
    fetchStaffPage(1)
  }, [fetchStaffPage])

  useEffect(() => {
    api.get('/departments').then((res) => {
      setDepartments((res.data?.data || []).filter((d: any) => d.is_active !== false))
    }).catch(() => {})
  }, [])

  useEffect(() => {
    if (addTriggerKey && addTriggerKey > 0) {
      setEditingStaff(null)
      resetForm()
      setFormError(null)
      setIsModalOpen(true)
    }
  }, [addTriggerKey])

  useEffect(() => {
    if (!staffHasMoreRef.current || staffLoadingRef.current) return
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !staffLoadingRef.current && staffHasMoreRef.current) {
          fetchStaffPage(staffPageRef.current + 1)
        }
      },
      { rootMargin: '200px' }
    )
    const el = sentinelRef.current
    if (el) observer.observe(el)
    return () => observer.disconnect()
  }, [_staffLoading, staffHasMore, fetchStaffPage])

  const handleArchive = async (staffId: string) => {
    try {
      await api.post(`/staff/${staffId}/archive`)
      toast.success('Staff member archived')
      onRefresh?.()
    } catch (error: any) {
      toast.error(error.response?.data?.detail || 'Failed to archive staff')
    }
  }

  const handleRestore = async (staffId: string) => {
    try {
      await api.post(`/staff/${staffId}/restore`)
      toast.success('Staff member restored')
      onRefresh?.()
    } catch (error: any) {
      toast.error(error.response?.data?.detail || 'Failed to restore staff')
    }
  }

  const handleResendWelcome = async (s: any) => {
    try {
      const res = await api.post(`/staff/${s.id}/resend-welcome`)
      if (res.data?.email_queued || res.data?.email_sent) {
        toast.success(`Welcome email queued for ${s.email}`)
      } else {
        toast.error(`Failed to resend: ${res.data?.email_error || 'Unknown error'}`)
      }
      onRefresh?.()
    } catch (error: any) {
      toast.error(error.response?.data?.detail || 'Failed to resend welcome email')
    }
  }

  const handleSetPassword = async () => {
    if (!passwordModal.newPassword || passwordModal.newPassword.length < 6) {
      toast.error('Password must be at least 6 characters')
      return
    }
    try {
      await api.post(`/staff/${passwordModal.staff.id}/set-password`, { password: passwordModal.newPassword })
      toast.success(`Password updated for ${passwordModal.staff.name}. Share this password with them: ${passwordModal.newPassword}`)
      setPasswordModal({ open: false, staff: null, newPassword: '', showPassword: false })
    } catch (error: any) {
      toast.error(error.response?.data?.detail || 'Failed to set password')
    }
  }

  const generateRandomPassword = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'
    let password = ''
    for (let i = 0; i < 10; i += 1) password += chars.charAt(Math.floor(Math.random() * chars.length))
    setPasswordModal((prev: any) => ({ ...prev, newPassword: password, showPassword: true }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setFormError(null)
    // ── Frontend validation ──────────────────────────────────────
    const rate = parseFloat(formData.hourly_rate)
    if (!rate || rate <= 0) { setFormError('Hourly rate must be greater than 0'); return }
    if (!formData.name.trim()) { setFormError('Full name is required'); return }
    if (editingStaff && formData.password && formData.password.length < 6) { setFormError('Password must be at least 6 characters'); return }
    if (formData.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) { setFormError('Please enter a valid email address'); return }
    // ── Submit ───────────────────────────────────────────────────
    const data = { ...formData, hourly_rate: rate, available_hours_per_month: parseFloat(formData.available_hours_per_month), productivity_factor: parseFloat(formData.productivity_factor), efficiency: parseFloat(formData.efficiency) || 1, annual_fee_budget: parseFloat(formData.annual_fee_budget) || 0, annual_budgeted_hours: calcBudgetedHours, manager_id: formData.manager_id || null, department_id: formData.department_id || null, department_ids: formData.department_ids || [] }
    if (!editingStaff) {
      delete data.password
    } else if (!data.password) {
      delete data.password
    }
    setIsSubmitting(true)
    try {
      if (editingStaff) await onUpdateStaff(editingStaff.id, data)
      else await onCreateStaff(data)
      setIsModalOpen(false)
      setEditingStaff(null)
      fetchStaffPage(1)
    } catch (error: any) {
      setFormError(error.response?.data?.detail || (editingStaff ? 'Failed to update staff member' : 'Failed to create staff member'))
    } finally {
      setIsSubmitting(false)
    }
  }

  const fetchRoles = useCallback(async (search: string, page: number) => {
    const q = search.toLowerCase()
    const filtered = (enums?.roles || []).filter((r: string) => !q || r.toLowerCase().includes(q))
    const PAGE_SIZE = 20
    const start = (page - 1) * PAGE_SIZE
    const paged = filtered.slice(start, start + PAGE_SIZE)
    return { items: paged.map((r: string) => ({ value: r, label: r })), totalPages: Math.ceil(filtered.length / PAGE_SIZE) }
  }, [enums?.roles])

  const openEditModal = (s: any) => {
    setEditingStaff(s)
    setFormData({ name: s.name, role: s.role, hourly_rate: s.hourly_rate, available_hours_per_month: s.available_hours_per_month, productivity_factor: s.productivity_factor, efficiency: s.efficiency ?? 1, annual_fee_budget: s.annual_fee_budget || '', annual_budgeted_hours: s.annual_budgeted_hours || '', email: s.email || '', password: '', phone: s.phone || '', manager_id: s.manager_id || '', department_id: s.department_id || '', department_ids: s.department_ids || [] })
    setFormError(null)
    setIsModalOpen(true)
  }

  const resetForm = () => setFormData({ name: '', role: 'Accountant', hourly_rate: '', available_hours_per_month: 160, productivity_factor: 0.8, efficiency: 1, annual_fee_budget: '', annual_budgeted_hours: '', email: '', password: '', phone: '', manager_id: '', department_id: '', department_ids: [] })

  const handleDepartmentToggle = (deptId: string) => {
    setFormData((prev: any) => ({ ...prev, department_ids: prev.department_ids.includes(deptId) ? prev.department_ids.filter((id: string) => id !== deptId) : [...prev.department_ids, deptId] }))
  }

  const filteredStaff = allStaff

  const handleUpdatePermissions = async (staffId: string, accessLevel: string, canDeletePerm: boolean) => {
    try {
      await api.post(`/staff/${staffId}/update-permissions?access_level=${accessLevel}&can_delete=${canDeletePerm}&updater_id=${user?.id || ''}`)
      toast.success('Permissions updated')
      setPermissionModal({ open: false, staff: null })
      onRefresh?.()
    } catch (error: any) {
      toast.error(error.response?.data?.detail || 'Failed to update permissions')
    }
  }

  const getAccessLevelBadge = (level: string) => ({ Full: 'bg-purple-100 text-purple-800', Admin: 'bg-blue-100 text-blue-800', Supervisor: 'bg-green-100 text-green-800', Standard: 'bg-gray-100 text-gray-800' } as Record<string, string>)[level] || 'bg-gray-100 text-gray-800'

  return (
    <div className="space-y-6" data-testid="staff-page">
      <div className="flex flex-col sm:flex-row sm:items-center gap-4">
        {!hidePageHeader && <div><h2 className="text-2xl font-bold text-gray-900">Staff Management</h2><p className="text-gray-500 mt-1">{staffTotal} {showArchived ? 'archived' : 'active'} team members</p></div>}
        <div className="relative flex-1 max-w-xs"><svg className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" /></svg><input type="text" placeholder="Search staff..." value={search} onChange={(e: any) => setSearch(e.target.value)} className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" /></div>
        <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer ml-auto"><input type="checkbox" checked={showArchived} onChange={(e: any) => setShowArchived(e.target.checked)} className="rounded border-gray-300 text-blue-600" />Show Archived</label>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden"><div className="overflow-x-auto"><table className="w-full text-sm" data-testid="staff-table"><thead className="bg-gray-50 border-b border-gray-100"><tr><th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase">Name</th><th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase">Role</th><th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase">Access</th><th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase">Rate/hr</th><th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase">Bud. Hrs</th><th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase">Annual Budget</th><th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase">Efficiency</th><th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase">Productivity</th><th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase">Status</th><th className="px-4 py-2.5 text-right text-xs font-semibold text-gray-500 uppercase">Actions</th></tr></thead><tbody className="divide-y divide-gray-100">{filteredStaff.map((s: any) => <tr key={s.id} className={`hover:bg-gray-50 ${s.is_archived ? 'opacity-60' : ''}`}><td className="px-4 py-2.5"><Link to={`/app/staff/${s.id}`} className="font-medium text-gray-900 hover:text-blue-600 transition-colors">{s.name}</Link><p className="text-sm text-gray-500">{s.email}</p>{s.manager_name && <p className="text-xs text-gray-400">Supervisor: {s.manager_name}</p>}{s.department_ids?.length > 0 && <div className="flex flex-wrap gap-1 mt-1">{s.department_ids.map((dId: string) => { const d = departments.find((dep: any) => dep.id === dId); return d ? <span key={dId} className="px-1.5 py-0.5 text-xs font-semibold rounded-full" style={{ backgroundColor: (d.color || '#3B82F6') + '22', color: d.color || '#3B82F6', border: `1px solid ${d.color || '#3B82F6'}44` }}>{d.code || d.name}</span> : null; })}</div>}</td><td className="px-6 py-4"><span className="px-3 py-1 text-sm font-medium bg-slate-100 text-slate-700 rounded-full">{s.role}</span></td><td className="px-6 py-4"><span className={`px-2 py-1 text-xs font-medium rounded-full ${getAccessLevelBadge(s.access_level)}`}>{s.access_level}</span></td><td className="px-6 py-4 font-medium text-gray-900">{formatCurrency(s.hourly_rate, symbol)}</td><td className="px-6 py-4 font-medium text-gray-900">{s.annual_budgeted_hours || 0}h</td><td className="px-6 py-4 font-medium text-green-600">{formatCurrency(s.annual_fee_budget || 0, symbol)}</td><td className="px-6 py-4 font-medium text-gray-900">{Math.round((s.efficiency ?? 1) * 100)}%</td><td className="px-6 py-4 font-medium text-gray-900">{Math.round((s.productivity_factor ?? 0.8) * 100)}%</td><td className="px-6 py-4">{s.is_archived ? <span className="px-2 py-1 text-xs font-medium bg-gray-100 text-gray-600 rounded-full">Archived</span> : s.is_active ? <span className="px-2 py-1 text-xs font-medium bg-green-100 text-green-700 rounded-full">Active</span> : <span className="inline-flex items-center gap-1"><span className="px-2 py-1 text-xs font-medium bg-amber-100 text-amber-700 rounded-full">Pending Invitation</span><button onClick={() => handleResendWelcome(s)} className="text-[10px] font-medium text-amber-700 underline underline-offset-2 hover:text-amber-900 whitespace-nowrap" title="Resend verification email">Resend</button></span>}</td><td className="px-6 py-4"><div className="flex items-center justify-end gap-2"><Link to={`/app/staff/${s.id}`} className="p-2 text-gray-500 hover:text-teal-600 hover:bg-teal-50 rounded-lg" title="Single View"><Icons.User /></Link>{canManagePermissions && !s.is_archived && <button onClick={() => setPasswordModal({ open: true, staff: s, newPassword: '', showPassword: false })} className="p-2 text-gray-500 hover:text-green-600 hover:bg-green-50 rounded-lg" title="Set Password"><Icons.Key /></button>}{canManagePermissions && !s.is_archived && <button onClick={() => { setPermissionModal({ open: true, staff: s }); setPermissionAccessLevel(s.access_level || 'Standard') }} className="p-2 text-gray-500 hover:text-purple-600 hover:bg-purple-50 rounded-lg" title="Manage Permissions"><Icons.Shield /></button>}{!s.is_archived && <button onClick={() => openEditModal(s)} className="p-2 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg" title="Edit"><Icons.Edit /></button>}{s.is_archived ? <button onClick={() => handleRestore(s.id)} className="p-2 text-gray-500 hover:text-green-600 hover:bg-green-50 rounded-lg" title="Restore"><Icons.Restore /></button> : <button onClick={() => setConfirmAction({ title: 'Archive Staff Member', description: `Archive ${s.name || 'this staff member'}? They will be deactivated but kept for historical records.`, confirmLabel: 'Archive', tone: 'warning', onConfirm: () => handleArchive(s.id) })} className="p-2 text-gray-500 hover:text-orange-600 hover:bg-orange-50 rounded-lg" title="Archive"><Icons.Archive /></button>}{canDelete && s.is_archived && <button onClick={() => setConfirmAction({ title: 'Delete Staff Member', description: `Delete ${s.name || 'this staff member'} permanently? This action cannot be undone.`, confirmLabel: 'Delete Permanently', tone: 'danger', onConfirm: () => onDeleteStaff(s.id) })} className="p-2 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg" title="Delete Permanently"><Icons.Trash /></button>}</div></td></tr>)}</tbody></table></div>

          {staffHasMore && (
            <div ref={sentinelRef} className="flex justify-center py-4">
              {_staffLoading && (
                <div className="flex items-center gap-2 text-sm text-gray-500">
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Loading more...
                </div>
              )}
            </div>
          )}
        </div>

      <Dialog open={isModalOpen} onOpenChange={(open: boolean) => { if (!open) { setIsModalOpen(false); setFormError(null) } }}>
        <DialogContent className="sm:max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingStaff ? 'Edit Staff' : 'Add Staff'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit}>
            <div className="grid grid-cols-2 gap-4 py-4">
              <div className="col-span-2 space-y-1.5">
                <Label htmlFor="staff-name">Full Name *</Label>
                <Input id="staff-name" required value={formData.name} onChange={(e: any) => setFormData({ ...formData, name: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Role *</Label>
                <SearchableSelect
                  value={formData.role}
                  onValueChange={(value: string) => setFormData({ ...formData, role: value })}
                  fetchItems={fetchRoles}
                  placeholder="Select role…"
                  searchPlaceholder="Search roles…"
                  emptyMessage="No roles found"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Hourly Rate ({symbol}) *</Label>
                <Input type="number" required min="1" value={formData.hourly_rate} onChange={(e: any) => setFormData({ ...formData, hourly_rate: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Annual Fee Budget ({symbol})</Label>
                <Input type="number" min="0" value={formData.annual_fee_budget} onChange={(e: any) => setFormData({ ...formData, annual_fee_budget: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Annual Budgeted Hours <span className="text-xs text-muted-foreground font-normal">(Fee ÷ Rate)</span></Label>
                <div className="flex h-9 w-full items-center rounded-md border border-input bg-muted px-3 py-1 text-sm shadow-sm"><span className="font-semibold">{calcBudgetedHours > 0 ? `${calcBudgetedHours}h` : '—'}</span>{calcBudgetedHours > 0 && <span className="ml-auto text-xs text-muted-foreground">{formatCurrency(parseFloat(formData.annual_fee_budget), symbol)} ÷ {formatCurrency(parseFloat(formData.hourly_rate), symbol)}</span>}</div>
              </div>
              <div className="space-y-1.5">
                <Label>Productivity Factor *</Label>
                <Input type="number" required min="0.1" max="1" step="0.05" value={formData.productivity_factor} onChange={(e: any) => setFormData({ ...formData, productivity_factor: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Efficiency *</Label>
                <Input type="number" required min="0" max="2" step="0.05" value={formData.efficiency} onChange={(e: any) => setFormData({ ...formData, efficiency: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Email</Label>
                <Input type="email" value={formData.email} onChange={(e: any) => setFormData({ ...formData, email: e.target.value })} />
              </div>
              {editingStaff && <div className="col-span-2 space-y-1.5">
                <Label>New Password (leave blank to keep current)</Label>
                <Input type="password" value={formData.password} onChange={(e: any) => setFormData({ ...formData, password: e.target.value })} placeholder="••••••••" minLength={6} />
                <p className="text-xs text-muted-foreground">Leave blank to keep existing password, or enter new password (min 6 characters)</p>
              </div>}
              <div className="space-y-1.5">
                <Label>Supervisor</Label>
                <Select value={formData.manager_id || 'none'} onValueChange={(value: string) => setFormData({ ...formData, manager_id: value === 'none' ? '' : value })}>
                  <SelectTrigger><SelectValue placeholder="No Supervisor" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No Supervisor</SelectItem>
                    {(_staff || []).filter((s: any) => !s.is_archived && s.id !== editingStaff?.id).map((s: any) => <SelectItem key={s.id} value={s.id}>{s.name} ({s.role})</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Department</Label>
                <Select value={formData.department_id || 'none'} onValueChange={(value: string) => setFormData({ ...formData, department_id: value === 'none' ? '' : value })}>
                  <SelectTrigger><SelectValue placeholder="No Department" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No Department</SelectItem>
                    {departments.map((dept: any) => <SelectItem key={dept.id} value={dept.id}>{dept.name}{dept.code ? ` (${dept.code})` : ''}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-2 space-y-2">
                <Label>Teams / Org Units</Label>
                <div className="grid grid-cols-2 gap-2 rounded-md border p-3 bg-muted/30">
                  {departments.length > 0 ? departments.map((dept: any) => (
                    <label key={dept.id} className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm border cursor-pointer transition-colors ${formData.department_ids.includes(dept.id) ? 'bg-blue-50 text-blue-700 border-blue-300' : 'bg-background text-muted-foreground border-input hover:bg-accent'}`}>
                      <Checkbox checked={formData.department_ids.includes(dept.id)} onCheckedChange={() => handleDepartmentToggle(dept.id)} />
                      <span className="font-medium flex-1">{dept.name}</span>
                      {dept.code && <span className="text-xs font-mono opacity-50">{dept.code}</span>}
                    </label>
                  )) : <p className="text-sm text-muted-foreground col-span-2 py-2">No teams yet. Create departments first.</p>}
                </div>
                <p className="text-xs text-muted-foreground">Used for reporting and supervisory grouping only — does not affect work component assignment.</p>
              </div>
            </div>
            {formError && <div className="text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-md px-4 py-2.5 mb-4">⚠ {formError}</div>}
            <div className="flex justify-end gap-3 pt-2 border-t">
              <Button type="button" variant="outline" disabled={isSubmitting} onClick={() => setIsModalOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={isSubmitting}>{isSubmitting ? (editingStaff ? 'Saving...' : 'Adding...') : (editingStaff ? 'Update' : 'Add Staff')}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={permissionModal.open} onOpenChange={(open: boolean) => { if (!open) setPermissionModal({ open: false, staff: null }) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Manage Permissions</DialogTitle>
          </DialogHeader>
          {permissionModal.staff && <div className="space-y-4 py-2">
            <div className="rounded-lg bg-muted p-4">
              <p className="font-medium">{permissionModal.staff.name}</p>
              <p className="text-sm text-muted-foreground">{permissionModal.staff.role} • {permissionModal.staff.email}</p>
            </div>
            <div className="space-y-2">
              <Label>Access Level</Label>
              <RadioGroup value={permissionAccessLevel} onValueChange={setPermissionAccessLevel} className="space-y-2">
                {['Full', 'Admin', 'Supervisor', 'Standard'].map((level) => (
                  <div key={level} className="flex items-start gap-3 rounded-lg border p-3 has-[[data-state=checked]]:border-blue-300 has-[[data-state=checked]]:bg-blue-50">
                    <RadioGroupItem value={level} id={`perm-${level}`} className="mt-0.5" />
                    <div>
                      <Label htmlFor={`perm-${level}`} className="font-medium cursor-pointer">{level}</Label>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {level === 'Full' && 'Partner - Complete system access, manage all permissions'}
                        {level === 'Admin' && 'Admin - Full access but cannot delete records'}
                        {level === 'Supervisor' && 'Supervisor - Team dashboards and departmental reports'}
                        {level === 'Standard' && 'Employee - Own dashboard only'}
                      </p>
                    </div>
                  </div>
                ))}
              </RadioGroup>
            </div>
            <div className="flex justify-end gap-3 pt-2 border-t">
              <Button variant="outline" onClick={() => setPermissionModal({ open: false, staff: null })}>Cancel</Button>
              <Button onClick={() => handleUpdatePermissions(permissionModal.staff.id, permissionAccessLevel, permissionAccessLevel !== 'Admin')}>Save Permissions</Button>
            </div>
          </div>}
        </DialogContent>
      </Dialog>

      <Dialog open={passwordModal.open} onOpenChange={(open: boolean) => { if (!open) setPasswordModal({ open: false, staff: null, newPassword: '', showPassword: false }) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Set User Password</DialogTitle>
          </DialogHeader>
          {passwordModal.staff && <div className="space-y-4 py-2">
            <div className="rounded-lg bg-muted p-4">
              <p className="font-medium">{passwordModal.staff.name}</p>
              <p className="text-sm text-muted-foreground">{passwordModal.staff.role} • {passwordModal.staff.email}</p>
            </div>
            <div className="rounded-lg bg-blue-50 border border-blue-200 p-4">
              <p className="text-sm text-blue-800"><strong>Note:</strong> Since email notifications are not configured, you'll need to share this password manually with the user.</p>
            </div>
            <div className="space-y-2">
              <Label>New Password</Label>
              <div className="relative">
                <Input type={passwordModal.showPassword ? 'text' : 'password'} value={passwordModal.newPassword} onChange={(e: any) => setPasswordModal((prev: any) => ({ ...prev, newPassword: e.target.value }))} placeholder="Enter new password" minLength={6} className="pr-24" />
                <div className="absolute right-1 top-1/2 -translate-y-1/2 flex gap-1">
                  <Button type="button" variant="ghost" size="sm" onClick={() => setPasswordModal((prev: any) => ({ ...prev, showPassword: !prev.showPassword }))} className="h-7 px-2 text-xs">{passwordModal.showPassword ? 'Hide' : 'Show'}</Button>
                  <Button type="button" variant="ghost" size="sm" onClick={generateRandomPassword} className="h-7 px-2 text-xs">Generate</Button>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">Minimum 6 characters. Click "Generate" for a random password.</p>
            </div>
            {passwordModal.showPassword && passwordModal.newPassword && <div className="rounded-lg bg-green-50 border border-green-200 p-4">
              <p className="text-sm text-green-800"><strong>Password to share:</strong> <span className="font-mono bg-green-100 px-2 py-1 rounded">{passwordModal.newPassword}</span></p>
              <p className="text-xs text-green-600 mt-2">Copy this password and share it securely with {passwordModal.staff.name}</p>
            </div>}
            <div className="flex justify-end gap-3 pt-2 border-t">
              <Button variant="outline" onClick={() => setPasswordModal({ open: false, staff: null, newPassword: '', showPassword: false })}>Cancel</Button>
              <Button onClick={handleSetPassword} disabled={!passwordModal.newPassword || passwordModal.newPassword.length < 6}>Set Password</Button>
            </div>
          </div>}
        </DialogContent>
      </Dialog>
      <DestructiveConfirmModal
        isOpen={!!confirmAction}
        onClose={() => !confirmSubmitting && setConfirmAction(null)}
        onConfirm={async () => {
          if (!confirmAction?.onConfirm) return
          try {
            setConfirmSubmitting(true)
            await confirmAction.onConfirm()
            setConfirmAction(null)
          } finally {
            setConfirmSubmitting(false)
          }
        }}
        title={confirmAction?.title || 'Confirm Action'}
        description={confirmAction?.description || ''}
        confirmLabel={confirmAction?.confirmLabel || 'Confirm'}
        isSubmitting={confirmSubmitting}
        tone={confirmAction?.tone || 'danger'}
      />
    </div>
  )
}
