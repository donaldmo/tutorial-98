import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { MoreHorizontal, Info } from 'lucide-react'
import { toast } from 'sonner'

import api from '@/services/api'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { getAllocationJobKey, getAllocationTotals, getDerivedAllocationMetrics, getFirstJobFeeRowIds } from '@/lib/allocationMetrics'
import { COMPLETED_JOB_LOCK_MESSAGE } from '@/lib/allocationMessages'
import { StaffMonthlySummaryModal } from '@/components/workflow/StaffMonthlySummaryModal'
import { TimeLoggingModal } from '@/components/workflow/analyticsShared'
import { ReviewModal } from '@/components/workflow/ReviewModal'
import { Icons, Modal, formatCurrency, TableLoading } from '@/components/workflow/shared'
import { formatWorkComponentLabel } from '@/lib/workComponentLabels'
import { TooltipProvider, Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip'

const EMPTY_SELECT_VALUE = '__empty__'

const isStaffActivated = (member: any) => Boolean(member?.is_active)

const formatStaffTriggerLabel = (member?: any) => member ? `${member.name} (${member.role})` : ''

const formatStaffOptionMeta = (member: any, options?: { symbol?: string; utilization?: number }) => {
  const symbol = options?.symbol || 'R'
  const parts: string[] = []

  if (typeof member?.hourly_rate !== 'undefined' && member?.hourly_rate !== null && member?.hourly_rate !== '') {
    parts.push(`${formatCurrency(member.hourly_rate, symbol)}/hr`)
  }

  if (typeof options?.utilization === 'number') {
    const over = options.utilization >= 90
    parts.push(over ? `Over-capacity: ${options.utilization.toFixed(0)}%` : `Utilization: ${options.utilization.toFixed(0)}%`)
  }

  return parts.join(' · ')
}

const renderStaffOptionContent = (member: any, options?: { symbol?: string; utilization?: number }) => {
  const meta = formatStaffOptionMeta(member, options)
  const isOverCapacity = typeof options?.utilization === 'number' && options.utilization >= 90

  return (
    <div className="flex w-full items-start justify-between gap-2 pr-4">
      <div className="min-w-0">
        <span className="block truncate text-sm text-gray-900">
          {member.name} ({member.role})
        </span>
        {meta && (
          <span className={`block truncate text-xs ${isOverCapacity ? 'text-red-600' : 'text-gray-500'}`}>
            {meta}
          </span>
        )}
      </div>
      {!isStaffActivated(member) && (
        <span className="shrink-0 rounded-md border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs text-amber-700">
          Not Verified
        </span>
      )}
    </div>
  )
}

// ─── Reallocation modal ───────────────────────────────────────────────────────

function ReallocationModalContent({
  allocation,
  activeStaff,
  onClose,
  onSuccess,
}: {
  allocation: any
  activeStaff: any[]
  onClose: () => void
  onSuccess: () => void
}) {
  const [loading, setLoading] = useState(true)
  const [timeSummary, setTimeSummary] = useState<any>(null)
  const [transferType, setTransferType] = useState<'single' | 'split' | 'add_staff'>('single')
  const [percentage, setPercentage] = useState(100)
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)
  const [selectedStaff, setSelectedStaff] = useState('')
  const [splitStaff, setSplitStaff] = useState([
    { staff_id: '', percentage: 50 },
    { staff_id: '', percentage: 50 },
  ])

  useEffect(() => {
    if (!allocation?.id) return
    api.get(`/allocations/${allocation.id}/time-summary`)
      .then((res) => setTimeSummary(res.data))
      .catch(() => { })
      .finally(() => setLoading(false))
  }, [allocation?.id])

  const handleReallocate = async () => {
    if (saving) return
    if (!reason || reason.length < 5) { toast.error('Please provide a reason (min 5 chars)'); return }
    const payload: any = { reason, percentage_to_reallocate: percentage }
    if (transferType === 'single') {
      if (!selectedStaff) { toast.error('Please select a staff member'); return }
      payload.reallocation_type = 'transfer_staff'
      payload.new_staff_id = selectedStaff
    } else {
      const valid = splitStaff.filter((s) => s.staff_id && s.percentage > 0)
      if (!valid.length) { toast.error('Select at least one staff member'); return }
      if (Math.abs(valid.reduce((s, x) => s + x.percentage, 0) - percentage) > 0.01) {
        toast.error(`Split must sum to ${percentage}%`); return
      }
      const unique = new Set(valid.map((s) => s.staff_id))
      if (unique.size !== valid.length) {
        toast.error('Each selected staff member must be unique')
        return
      }
      payload.reallocation_type = transferType === 'add_staff' ? 'add_staff' : 'transfer_staff'
      payload.split_transfers = valid
      if (transferType === 'add_staff') payload.keep_existing_staff = true
    }
    setSaving(true)
    try {
      await api.post(`/allocations/${allocation.id}/reallocate`, payload)
      toast.success(transferType === 'add_staff' ? 'Work shared successfully' : 'Work reallocated successfully')
      onSuccess()
    } catch (e: any) {
      const detail = String(e.response?.data?.detail || '')
      toast.error(detail.includes('completed and locked') ? COMPLETED_JOB_LOCK_MESSAGE : (detail || 'Failed to reallocate'))
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div className="flex justify-center py-8"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" /></div>

  const remaining = timeSummary?.remaining_hours ?? (allocation?.adjusted_hours || 0)
  const budgeted = timeSummary?.budgeted_hours ?? (allocation?.adjusted_hours || 0)
  const totalFee = Number(allocation?.allocated_fee ?? 0)
  const hoursRatio = budgeted > 0 ? Math.min(1, Math.max(0, remaining / budgeted)) : 1
  const _remainingBudget = totalFee * hoursRatio
  const available = (activeStaff || []).filter((s: any) => s.id !== allocation?.staff_id)
  const splitAssignedPct = splitStaff.reduce((sum, row) => sum + Number(row.percentage || 0), 0)
  const componentLabel = formatWorkComponentLabel(allocation?.work_component_key)

  const addSplitRow = () => setSplitStaff((prev) => [...prev, { staff_id: '', percentage: 0 }])
  const removeSplitRow = (index: number) => setSplitStaff((prev) => prev.length <= 2 ? prev : prev.filter((_, i) => i !== index))

  const setSplitValue = (index: number, patch: Partial<{ staff_id: string; percentage: number }>) => {
    setSplitStaff((prev) => prev.map((row, i) => i === index ? { ...row, ...patch } : row))
  }

  return (
    <div className="space-y-4">
      <div className="bg-purple-50 border border-purple-200 rounded-xl p-4">
        <p className="text-sm font-medium text-purple-800 mb-2">Current Assignment</p>
        <p className="text-sm text-purple-700">{allocation?.job_name} → {allocation?.staff_name}</p>
        <div className="mt-2 rounded-lg border border-purple-200 bg-white/70 px-3 py-2">
          <p className="text-xs text-purple-900">
            You are transfaring <strong>{componentLabel}</strong> from <strong>{allocation?.staff_name || 'Current staff'}</strong>
          </p>
        </div>
      </div>

      {remaining <= 0 ? (
        <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 text-center">
          <p className="text-yellow-800 font-medium">No remaining hours to transfer</p>
        </div>
      ) : (
        <>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Percentage to Transfer</label>
            <div className="flex items-center gap-4">
              <input type="range" min="1" max="100" value={percentage} onChange={(e) => setPercentage(+e.target.value)} className="flex-1" />
              <input type="number" min="1" max="100" value={percentage} onChange={(e) => setPercentage(Math.min(100, Math.max(1, +e.target.value || 1)))} className="w-20 px-3 py-2 border border-gray-200 rounded-lg text-center" />
              <span className="text-sm text-gray-500">%</span>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Transfer Type</label>
            <div className="flex gap-4">
              {(['single', 'split', 'add_staff'] as const).map((t) => (
                <label key={t} className={`flex-1 p-3 border rounded-xl cursor-pointer text-center transition-colors ${transferType === t ? 'border-purple-500 bg-purple-50' : 'border-gray-200 hover:bg-gray-50'}`}>
                  <input type="radio" name="transferType" value={t} checked={transferType === t} onChange={() => setTransferType(t)} className="sr-only" />
                  <p className="font-medium text-gray-900">
                    {t === 'single' ? 'Single Staff' : t === 'split' ? 'Split Transfer' : 'Add Staff'}
                  </p>
                  <p className="text-xs text-gray-500">
                    {t === 'single' ? 'One person' : t === 'split' ? 'Move all selected work away' : 'Share with extra staff'}
                  </p>
                </label>
              ))}
            </div>
          </div>
          {transferType === 'single' ? (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Transfer To *</label>
              <Select value={selectedStaff} onValueChange={(value: string) => setSelectedStaff(value === EMPTY_SELECT_VALUE ? '' : value)}>
                <SelectTrigger className="w-full px-4 py-2 border border-gray-200 rounded-xl text-sm text-left">
                  <span className={selectedStaff ? 'truncate text-gray-900' : 'truncate text-gray-400'}>
                    {selectedStaff ? formatStaffTriggerLabel(available.find((s: any) => String(s.id) === String(selectedStaff))) : 'Select staff…'}
                  </span>
                </SelectTrigger>
                <SelectContent className="bg-white text-gray-700 border border-gray-200">
                  <SelectItem value={EMPTY_SELECT_VALUE}>Select staff…</SelectItem>
                  {available.map((s: any) => (
                    <SelectItem key={s.id} value={String(s.id)} textValue={formatStaffTriggerLabel(s)}>
                      {renderStaffOptionContent(s)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="block text-sm font-medium text-gray-700">{transferType === 'add_staff' ? 'Share With' : 'Split Between'}</label>
                <button type="button" onClick={addSplitRow} className="px-2 py-1 text-xs text-blue-700 hover:bg-blue-50 rounded-md">+ Add Staff</button>
              </div>
              {splitStaff.map((split, i) => (
                <div key={i} className="flex gap-3 items-center">
                  <Select value={split.staff_id} onValueChange={(value: string) => setSplitValue(i, { staff_id: value === EMPTY_SELECT_VALUE ? '' : value })}>
                    <SelectTrigger className="flex-1 px-4 py-2 border border-gray-200 rounded-xl text-sm text-left">
                      <span className={split.staff_id ? 'truncate text-gray-900' : 'truncate text-gray-400'}>
                        {split.staff_id ? formatStaffTriggerLabel(available.find((s: any) => String(s.id) === String(split.staff_id))) : `Select staff ${i + 1}…`}
                      </span>
                    </SelectTrigger>
                    <SelectContent className="bg-white text-gray-700 border border-gray-200">
                      <SelectItem value={EMPTY_SELECT_VALUE}>{`Select staff ${i + 1}…`}</SelectItem>
                      {available
                        .filter((s: any) => !splitStaff.some((r, idx) => idx !== i && r.staff_id === s.id))
                        .map((s: any) => (
                          <SelectItem key={s.id} value={String(s.id)} textValue={formatStaffTriggerLabel(s)}>
                            {renderStaffOptionContent(s)}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                  <input type="number" min="0" max={percentage} value={split.percentage} onChange={(e) => setSplitValue(i, { percentage: +e.target.value || 0 })} className="w-20 px-3 py-2 border border-gray-200 rounded-lg text-center" />
                  <span className="text-sm text-gray-500">%</span>
                  <button type="button" onClick={() => removeSplitRow(i)} className="px-2 py-2 text-xs text-red-600 hover:bg-red-50 rounded-lg" title="Remove row">✕</button>
                </div>
              ))}
              <p className={`text-xs ${Math.abs(splitAssignedPct - percentage) <= 0.01 ? 'text-green-700' : 'text-amber-700'}`}>
                Assigned split: {splitAssignedPct.toFixed(2)}% / {percentage.toFixed(2)}%
              </p>

              <div className="rounded-lg border border-gray-100 bg-gray-50 p-3 space-y-1">
                <p className="text-xs font-medium text-gray-700 uppercase tracking-wide">Preview</p>
                {splitStaff.filter((s) => s.staff_id && s.percentage > 0).map((row) => {
                  const target = available.find((s: any) => s.id === row.staff_id)
                  return (
                    <p key={row.staff_id} className="text-sm text-gray-700">
                      {target?.name || 'Staff'} receives <strong>{componentLabel}</strong> · <strong>{Number(row.percentage || 0).toFixed(2)}%</strong> of transfer
                    </p>
                  )
                })}
                {transferType === 'add_staff' && (
                  <p className="text-sm text-gray-700 pt-1 border-t border-gray-200">
                    {allocation?.staff_name} keeps <strong>{componentLabel}</strong> · <strong>{Math.max(0, 100 - percentage).toFixed(2)}%</strong>
                  </p>
                )}
              </div>
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Reason *</label>
            <textarea value={reason} onChange={(e) => setReason(e.target.value)} className="w-full px-4 py-2 border border-gray-200 rounded-xl" rows={2} placeholder="e.g., Staff on leave, workload balancing…" />
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 px-4 py-2 border border-gray-200 text-gray-700 rounded-xl hover:bg-gray-50">Cancel</button>
            <button onClick={handleReallocate} disabled={saving} className="flex-1 px-4 py-2 bg-purple-600 text-white rounded-xl hover:bg-purple-700 disabled:bg-gray-300">
              {saving ? 'Saving…' : 'Transfare'}
            </button>
          </div>
        </>
      )}
    </div>
  )
}



// ─── Main page ────────────────────────────────────────────────────────────────

export function AllocationsPage({
  allocations: _allocations,
  jobs,
  staff,
  onUpdateAllocation: _onUpdateAllocation,
  onDeleteAllocation,
  selectedMonth,
  settings,
  onRefresh,
  user: _user,
  hidePageHeader: _hidePageHeader = false,
}: any) {
  const [pagedAllocations, setPagedAllocations] = useState<any[]>([])
  const [_allocationsLoading, setAllocationsLoading] = useState(false)
  const [loadedAllocPage, setLoadedAllocPage] = useState(0)
  const [allocHasMore, setAllocHasMore] = useState(true)
  const [allocTotal, setAllocTotal] = useState(0)
  const sentinelRef = useRef<HTMLDivElement>(null)
  const allocLoadingRef = useRef(_allocationsLoading)
  allocLoadingRef.current = _allocationsLoading
  const allocPageRef = useRef(loadedAllocPage)
  allocPageRef.current = loadedAllocPage
  const allocHasMoreRef = useRef(allocHasMore)
  allocHasMoreRef.current = allocHasMore
  // client filter
  // modals
  const navigate = useNavigate()
  const [timeModal, setTimeModal] = useState<{ open: boolean; allocation: any }>({ open: false, allocation: null })
  const [reallocateModal, setReallocateModal] = useState<{ open: boolean; allocation: any }>({ open: false, allocation: null })
  const [revokeModal, setRevokeModal] = useState<{ open: boolean; allocation: any; reason: string; saving: boolean }>({ open: false, allocation: null, reason: '', saving: false })
  const [summaryModal, setSummaryModal] = useState<{ open: boolean; allocation: any }>({ open: false, allocation: null })
  const [reviewModal, setReviewModal] = useState<{ open: boolean; allocation: any; mode: 'create' | 'edit' }>({ open: false, allocation: null, mode: 'create' })
  // async
  const [pendingRequests, setPendingRequests] = useState<any[]>([])
  const [workflowActionFor, setWorkflowActionFor] = useState<string | null>(null)

  const symbol = settings?.currency_symbol || 'R'

  // Tab and month state for filtering
  const [activeTab, setActiveTab] = useState<'all' | 'once-off' | 'recurring'>('all')
  const [localMonth, setLocalMonth] = useState(selectedMonth)
  const [searchParams] = useSearchParams()
  const [staffFilter, setStaffFilter] = useState(searchParams.get('stuffId') || '')

  const fetchAllocPage = useCallback(async (page: number, tab?: string, month?: string, staffId?: string) => {
    try {
      setAllocationsLoading(true)
      const resolvedTab = tab ?? activeTab
      const resolvedMonth = month ?? localMonth
      const resolvedStaff = staffId ?? staffFilter
      const params = new URLSearchParams({ page: page.toString(), limit: '6', month: resolvedMonth })
      if (resolvedTab !== 'all') {
        params.append('is_recurring', (resolvedTab === 'recurring').toString())
      }
      if (resolvedStaff) params.append('staff_id', resolvedStaff)
      const res = await api.get(`/allocations?${params}`)
      const items = res.data.data || []
      const total = res.data.pagination?.total ?? 0
      const totalPages = res.data.pagination?.total_pages ?? 1

      if (page === 1) {
        setPagedAllocations(items)
      } else {
        setPagedAllocations(prev => {
          const existingIds = new Set(prev.map((a: any) => a.id))
          return [...prev, ...items.filter((a: any) => !existingIds.has(a.id))]
        })
      }
      setAllocTotal(total)
      setAllocHasMore(page < totalPages)
      setLoadedAllocPage(page)
    } catch {
      toast.error('Failed to load allocations')
    } finally {
      setAllocationsLoading(false)
    }
  }, [activeTab, localMonth, staffFilter])

  useEffect(() => {
    fetchAllocPage(1, activeTab, localMonth, staffFilter)
  }, [activeTab, fetchAllocPage, localMonth, staffFilter])

  const handleTabChange = (tab: 'all' | 'once-off' | 'recurring') => {
    setActiveTab(tab)
  }

  const handleMonthChange = (month: string) => {
    setLocalMonth(month)
  }

  useEffect(() => {
    if (!allocHasMoreRef.current || allocLoadingRef.current) return
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !allocLoadingRef.current && allocHasMoreRef.current) {
          fetchAllocPage(allocPageRef.current + 1, activeTab, localMonth, staffFilter)
        }
      },
      { rootMargin: '200px' }
    )
    const el = sentinelRef.current
    if (el) observer.observe(el)
    return () => observer.disconnect()
  }, [_allocationsLoading, allocHasMore, activeTab, localMonth, staffFilter, fetchAllocPage])

  const handleStaffFilterChange = (staffId: string) => {
    setStaffFilter(staffId)
    navigate(staffId ? `/app/allocations?filter=true&target=staff&stuffId=${staffId}` : '/app/allocations')
  }

  const activeStaff = staff.filter((m: any) => !m.is_archived)
  const staffById = useMemo<Map<string, any>>(
    () => new Map((staff || []).map((m: any) => [String(m.id), m])),
    [staff],
  )
  const filteredStaffMember = staffFilter ? staffById.get(staffFilter) : null

  const sortedAllocations = useMemo(() => {
    return [...pagedAllocations].sort((a: any, b: any) => {
      const c = (a.client_name || '').localeCompare(b.client_name || '')
      if (c !== 0) return c
      const j = (a.job_name || '').localeCompare(b.job_name || '')
      if (j !== 0) return j
      const s = (a.staff_name || '').localeCompare(b.staff_name || '')
      if (s !== 0) return s
      return (a.work_component_key || '').localeCompare(b.work_component_key || '')
    })
  }, [pagedAllocations])

  const firstJobFeeRowIds = useMemo(() => {
    return getFirstJobFeeRowIds(sortedAllocations)
  }, [sortedAllocations])

  const allocationTotals = useMemo(() => {
    return getAllocationTotals(sortedAllocations, (allocation) => {
      const staffMember = staffById.get(String(allocation.staff_id || '')) as any
      return {
        hourlyRate: Number(staffMember?.hourly_rate ?? 0),
        efficiency: Number(staffMember?.efficiency ?? 1),
      }
    })
  }, [sortedAllocations, staffById])

  useEffect(() => {
    api.get('/authorization-requests?status=pending')
      .then((reqRes) => {
        setPendingRequests(reqRes.data || [])
      })
      .catch(() => { })
  }, [])

  const handleApproveRequest = async (id: string) => {
    try {
      await api.post(`/authorization-requests/${id}/approve?reviewer_id=${localStorage.getItem('staff_id') || 'admin'}`)
      toast.success('Approved!'); setPendingRequests((p) => p.filter((r) => r.id !== id)); onRefresh()
    } catch { toast.error('Failed to approve') }
  }

  const handleRejectRequest = async (id: string) => {
    try {
      await api.post(`/authorization-requests/${id}/reject?reviewer_id=${localStorage.getItem('staff_id') || 'admin'}`)
      toast.success('Rejected'); setPendingRequests((p) => p.filter((r) => r.id !== id))
    } catch { toast.error('Failed to reject') }
  }

  const handleDeleteAllocation = async (id: string) => {
    await onDeleteAllocation(id)
    await fetchAllocPage(1)
    onRefresh?.()
  }

  const handleConfirmRevoke = async () => {
    const allocation = revokeModal.allocation
    if (!allocation?.id) return
    setRevokeModal((prev) => ({ ...prev, saving: true }))
    try {
      await handleDeleteAllocation(allocation.id)
      toast.success('Allocation revoked')
      setRevokeModal({ open: false, allocation: null, reason: '', saving: false })
    } catch (e: any) {
      const detail = String(e?.response?.data?.detail || '')
      toast.error(detail.includes('completed and locked') ? COMPLETED_JOB_LOCK_MESSAGE : (detail || 'Failed to revoke allocation'))
      setRevokeModal((prev) => ({ ...prev, saving: false }))
    }
  }

  const handleUncompleteComponent = async (allocationId: string) => {
    setWorkflowActionFor(allocationId)
    try {
      await api.post(`/allocations/${allocationId}/uncomplete`)
      toast.success('Component re-opened')
      fetchAllocPage(1)
      onRefresh?.()
    } catch (e: any) {
      const detail = String(e.response?.data?.detail || '')
      toast.error(detail.includes('completed and locked') ? COMPLETED_JOB_LOCK_MESSAGE : (detail || 'Failed to re-open component'))
    } finally {
      setWorkflowActionFor(null)
    }
  }

  return (
    <div className="space-y-3" data-testid="allocations-page">

      {/* Tab switcher & Month filter */}
      <div className="flex items-center justify-between">
        <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit">
          <button
            onClick={() => handleTabChange('all')}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
              activeTab === 'all'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            All Allocations
          </button>
          <button
            onClick={() => handleTabChange('once-off')}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
              activeTab === 'once-off'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            Once Off
          </button>
          <button
            onClick={() => handleTabChange('recurring')}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
              activeTab === 'recurring'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            Recurring
          </button>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Month</label>
            <input
              type="month"
              value={localMonth}
              onChange={(e) => handleMonthChange(e.target.value)}
              className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm"
            />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Staff</label>
            <Select
              value={staffFilter}
              onValueChange={(value: string) => handleStaffFilterChange(value === EMPTY_SELECT_VALUE ? '' : value)}
            >
              <SelectTrigger className="w-48 px-3 py-1.5 border border-gray-200 rounded-lg text-sm h-9">
                <SelectValue placeholder="All staff" />
              </SelectTrigger>
              <SelectContent className="bg-white text-gray-700 border border-gray-200">
                <SelectItem value={EMPTY_SELECT_VALUE}>All staff</SelectItem>
                {activeStaff.map((s: any) => (
                  <SelectItem key={s.id} value={String(s.id)} textValue={s.name}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {staffFilter && (
            <button
              onClick={() => handleStaffFilterChange('')}
              className="px-3 py-1.5 text-sm border border-gray-200 text-gray-500 rounded-lg hover:bg-gray-50"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Pending auth requests */}
      {pendingRequests.length > 0 && (
        <div className="bg-gradient-to-r from-amber-50 to-orange-50 rounded-xl border-2 border-amber-300 p-6">
          <h3 className="text-lg font-bold text-amber-800 mb-4 flex items-center gap-2">
            <Icons.Shield /> Pending Authorization Requests ({pendingRequests.length})
          </h3>
          <div className="space-y-3">
            {pendingRequests.map((req) => (
              <div key={req.id} className="bg-white rounded-xl p-4 shadow-sm border border-amber-200">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="font-semibold text-gray-900">{req.staff?.name || 'Unknown'} → {req.job?.name || 'Unknown Job'}</p>
                    <p className="text-sm text-gray-600 mt-1">
                      Utilization: <span className="font-bold text-red-600">{req.current_utilization?.toFixed(1)}%</span>
                    </p>
                    <p className="text-sm text-gray-500 mt-0.5">Reason: {req.reason}</p>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <button onClick={() => handleApproveRequest(req.id)} className="px-4 py-2 bg-green-600 text-white rounded-xl hover:bg-green-700 text-sm font-medium">✓ Approve</button>
                    <button onClick={() => handleRejectRequest(req.id)} className="px-4 py-2 bg-red-600 text-white rounded-xl hover:bg-red-700 text-sm font-medium">✕ Reject</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Allocations table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-900">Current Allocations — {localMonth}</h3>
          {filteredStaffMember && (
            <span className="text-sm font-medium text-gray-500">Staff: {filteredStaffMember.name}</span>
          )}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="px-4 py-2 text-left text-[10px] font-semibold text-gray-500 uppercase">Client</th>
                <th className="px-4 py-2 text-left text-[10px] font-semibold text-gray-500 uppercase">Job</th>
                <th className="px-4 py-2 text-left text-[10px] font-semibold text-gray-500 uppercase">Assigned To</th>
                <th className="px-4 py-2 text-left text-[10px] font-semibold text-gray-500 uppercase">Component</th>
                <th className="px-4 py-2 text-left text-[10px] font-semibold text-gray-500 uppercase">Job Fee</th>
                <th className="px-4 py-2 text-left text-[10px] font-semibold text-gray-500 uppercase">
                  <div className="flex items-center gap-1">
                    Budgeted WIP
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Info className="w-3 h-3 text-gray-400 cursor-help" />
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>staff.rate × budgeted hours</p>
                          <p className="text-[10px] text-muted-foreground">R700 × 3.53h = R2,473.44</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                </th>
                <th className="px-4 py-2 text-left text-[10px] font-semibold text-gray-500 uppercase">
                  <div className="flex items-center gap-1">
                    Budgeted Hrs
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Info className="w-3 h-3 text-gray-400 cursor-help" />
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>(allocated_fee × staff.efficiency) / staff.rate</p>
                          <p className="text-[10px] text-muted-foreground">(R2,473.44 × 100%) / R700 = 3.53h</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                </th>
                <th className="px-4 py-2 text-left text-[10px] font-semibold text-gray-500 uppercase">
                  Logged Hours
                </th>
                <th className="px-4 py-2 text-right text-[10px] font-semibold text-gray-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {_allocationsLoading && pagedAllocations.length === 0 ? (
                <TableLoading colSpan={9} />
              ) : sortedAllocations.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-6 py-16 text-center text-gray-400">No allocations for {localMonth}.</td>
                </tr>
              ) : (
                sortedAllocations.map((alloc: any) => {
                  const staffMember = staffById.get(String(alloc.staff_id || '')) as any
                  const derived = getDerivedAllocationMetrics(alloc, {
                    hourlyRate: Number(staffMember?.hourly_rate ?? 0),
                    efficiency: Number(staffMember?.efficiency ?? 1),
                  })
                  const showJobFee = firstJobFeeRowIds.has(String(alloc.id || getAllocationJobKey(alloc)))
                  return (
                    <tr key={alloc.id} className={`hover:bg-gray-50 transition-colors ${alloc.is_auto_generated ? 'bg-purple-50/40' : ''}`}>
                      <td className="px-4 py-2 text-xs text-gray-700">{alloc.client_name}</td>
                      <td className="px-4 py-2 text-xs text-gray-700">{alloc.job_name}</td>
                      <td className="px-4 py-2">
                        <button onClick={() => setSummaryModal({ open: true, allocation: alloc })} className="text-left group" title="View summary">
                          <p className="text-xs font-medium text-gray-900 group-hover:text-blue-600 transition-colors">{alloc.staff_name}</p>
                        </button>
                      </td>
                      <td className="px-4 py-2">
                        <span className="text-xs font-medium text-gray-700">{formatWorkComponentLabel(alloc.work_component_key as string | null)}</span>
                        <span className="text-xs text-gray-600 ml-1">
                          <span className="inline-flex px-2 py-0.5 text-xs font-medium rounded-full bg-blue-100 text-blue-700">
                            {Number(alloc.percentage || 0).toFixed(0)}%
                          </span>
                        </span>
                        {alloc.is_over_capacity && (
                          <span className="inline-flex w-fit rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-800">
                            Over-capacity{typeof alloc.over_capacity_utilization_percentage === 'number' ? ` · ${Number(alloc.over_capacity_utilization_percentage).toFixed(1)}%` : ''}
                          </span>
                        )}
                        {alloc.notes && <span className="text-xs text-gray-500 line-clamp-2">{String(alloc.notes)}</span>}
                      </td>
                      <td className="px-4 py-2 text-xs font-medium">
                        {showJobFee ? (
                          <span className="text-green-600">{formatCurrency(derived.jobFee, symbol)}</span>
                        ) : (
                          <span className="text-gray-300">-</span>
                        )}
                      </td>
                      <td className="px-4 py-2">
                        <p className="text-xs font-medium text-emerald-700">{formatCurrency(derived.budgetedWip, symbol)}</p>
                      </td>
                      <td className="px-4 py-2">
                        <p className="text-xs font-medium text-gray-900">{Number(derived.budgetedHrs || 0).toFixed(2)}h</p>
                      </td>
                      <td className="px-4 py-2">
                        <p className="text-xs font-medium text-blue-700">{Number(alloc.total_logged_hours || 0).toFixed(2)}h</p>
                      </td>
                      <td className="px-4 py-2">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button type="button" variant="ghost" size="icon" className="ml-auto h-8 w-8" aria-label="Allocation actions">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-48">
                            <DropdownMenuItem onSelect={() => setSummaryModal({ open: true, allocation: alloc })}>
                              <Icons.Chart className="h-4 w-4" />View summary
                            </DropdownMenuItem>
                            {alloc.workflow_status !== 'Completed' && (
                              <DropdownMenuItem
                                onSelect={() => setTimeModal({
                                  open: true,
                                  allocation: {
                                    ...alloc,
                                    budgeted_hours_display: Number(derived.budgetedHrs || 0),
                                  },
                                })}
                              >
                                <Icons.Clock className="h-4 w-4" />Log time
                              </DropdownMenuItem>
                            )}
                            {alloc.workflow_status === 'Completed' && (
                              <>
                                <DropdownMenuItem
                                  disabled={workflowActionFor === alloc.id}
                                  onSelect={() => handleUncompleteComponent(alloc.id)}
                                >
                                  <Icons.Restore className="h-4 w-4" />Mark as uncomplete
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onSelect={() => setReviewModal({
                                    open: true,
                                    allocation: alloc,
                                    mode: alloc.review_rating ? 'edit' : 'create'
                                  })}
                                >
                                  <Icons.Star className="h-4 w-4" />
                                  {alloc.review_rating ? 'View or Edit Review' : 'Review'}
                                </DropdownMenuItem>
                              </>
                            )}
                            <DropdownMenuItem onSelect={() => {
                              const job = jobs.find((j: any) => j.id === alloc.job_id)
                              navigate(`/app/allocations/add?clientId=${job?.client_id || ''}&jobId=${alloc.job_id}`)
                            }}>
                              <Icons.Edit className="h-4 w-4" />Edit / Reallocate
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onSelect={() => setRevokeModal({ open: true, allocation: alloc, reason: '', saving: false })}
                              className="text-red-600 focus:text-red-700"
                            >
                              <Icons.Trash className="h-4 w-4" />Revoke allocation
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    </tr>
                  )
                })
              )}
              {sortedAllocations.length > 0 && (
                <tr className="bg-gray-50 border-t-2 border-gray-200 font-semibold">
                  <td colSpan={4} className="px-4 py-3 text-xs text-gray-500 uppercase tracking-wide">Totals</td>
                  <td className="px-4 py-3 text-xs font-bold text-green-700">{formatCurrency(allocationTotals.jobFee, symbol)}</td>
                  <td className="px-4 py-3 text-xs font-bold text-emerald-700">{formatCurrency(allocationTotals.budgetedWip, symbol)}</td>
                  <td className="px-4 py-3 text-xs font-bold text-gray-900">{allocationTotals.budgetedHrs.toFixed(2)}h</td>
                  <td className="px-4 py-3 text-xs font-bold text-blue-700">{allocationTotals.loggedHrs.toFixed(2)}h</td>
                  <td />
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {allocHasMore && pagedAllocations.length > 0 && (
        <div ref={sentinelRef} className="flex justify-center py-4">
          {_allocationsLoading && (
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

      {/* ── Modals ── */}

      <TimeLoggingModal
        isOpen={timeModal.open}
        onClose={() => setTimeModal({ open: false, allocation: null })}
        allocation={timeModal.allocation}
        onTimeLogged={onRefresh}
        symbol={symbol}
        onStatusChanged={() => {
          fetchAllocPage(1)
          onRefresh?.()
        }}
      />

      <Modal isOpen={reallocateModal.open} onClose={() => setReallocateModal({ open: false, allocation: null })} title="Reallocate Work">
        <ReallocationModalContent
          allocation={reallocateModal.allocation}
          activeStaff={activeStaff}
          onClose={() => setReallocateModal({ open: false, allocation: null })}
          onSuccess={() => { setReallocateModal({ open: false, allocation: null }); fetchAllocPage(1); if (onRefresh) onRefresh() }}
        />
      </Modal>

      <Modal isOpen={revokeModal.open} onClose={() => setRevokeModal({ open: false, allocation: null, reason: '', saving: false })} title="Revoke Allocation">
        {revokeModal.allocation && (() => {
          const alloc = revokeModal.allocation
          return (
            <div className="space-y-4">
              <div className="bg-red-50 border border-red-200 rounded-xl p-4">
                <p className="text-sm font-semibold text-red-800 mb-1">You are about to revoke this allocation</p>
                <p className="text-sm text-red-700">{alloc.job_name} → {alloc.staff_name}</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Reason</label>
                <textarea
                  value={revokeModal.reason}
                  onChange={(e) => setRevokeModal((prev) => ({ ...prev, reason: e.target.value }))}
                  rows={3}
                  placeholder="e.g., Incorrect assignment, staff unavailable, or scope changed..."
                  className="w-full px-4 py-2 border border-gray-200 rounded-xl"
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setRevokeModal({ open: false, allocation: null, reason: '', saving: false })}
                  className="flex-1 px-4 py-2 border border-gray-200 text-gray-700 rounded-xl hover:bg-gray-50"
                  disabled={revokeModal.saving}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleConfirmRevoke}
                  disabled={revokeModal.saving}
                  className="flex-1 px-4 py-2 bg-red-600 text-white rounded-xl hover:bg-red-700 disabled:bg-gray-300"
                >
                  {revokeModal.saving ? 'Revoking…' : 'Confirm Revoke'}
                </button>
              </div>
            </div>
          )
        })()}
      </Modal>

      <StaffMonthlySummaryModal
        isOpen={summaryModal.open}
        onClose={() => setSummaryModal({ open: false, allocation: null })}
        allocation={summaryModal.allocation}
        staffInfo={filteredStaffMember ? {
          id: filteredStaffMember.id,
          name: filteredStaffMember.name,
          role: filteredStaffMember.role,
          hourlyRate: filteredStaffMember.hourly_rate,
          hoursPerDay: filteredStaffMember.hours_per_day ?? 8,
          productivityFactor: filteredStaffMember.productivity_factor,
          efficiency: filteredStaffMember.efficiency,
        } : null}
        symbol={symbol}
        selectedMonth={localMonth}
      />

      <ReviewModal
        isOpen={reviewModal.open}
        onClose={() => setReviewModal({ open: false, allocation: null, mode: 'create' })}
        allocation={reviewModal.allocation}
        mode={reviewModal.mode}
        onReviewSubmitted={() => {
          setReviewModal({ open: false, allocation: null, mode: 'create' })
          fetchAllocPage(1)
          onRefresh?.()
        }}
      />
    </div>
  )
}
