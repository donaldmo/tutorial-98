import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'

import api from '@/services/api'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { SearchableClientSelect } from '@/components/common/SearchableClientSelect'
import { SearchableJobSelect } from '@/components/common/SearchableJobSelect'
import { SearchableSelect } from '@/components/common/SearchableSelect'
import { AllocationCoveragePanel } from '@/components/workflow/AllocationCoveragePanel'
import type { CoverageData } from '@/components/workflow/AllocationCoveragePanel'
import { formatCurrency } from '@/components/workflow/shared'
import { formatWorkComponentLabel, normalizeCompKey } from '@/lib/workComponentLabels'

const formatAllocatableJobLabel = (job?: any) => {
  if (!job) return ''
  const labels = (job.job_type_entries || []).map((e: any) => e.job_type_name).filter(Boolean)
  const labelStr = labels.length > 0 ? ` [${labels.join(', ')}]` : ''
  return `${job.client_name} — ${job.name}${labelStr}${job.status ? ` · ${job.status}` : ''}`
}

const isStaffActivated = (member: any) => Boolean(member?.is_active)

const RECURRENCE_INTERVALS: Record<string, number> = {
  monthly: 1,
  'bi-monthly': 2,
  quarterly: 3,
  biannually: 6,
  annually: 12,
}

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
        <Badge variant="outline" className="shrink-0 border-amber-200 bg-amber-50 text-amber-700">
          Not Verified
        </Badge>
      )}
    </div>
  )
}

export function AllocateJobPage({
  jobs,
  staff,
  capacity,
  enums,
  onCreateAllocation,
  selectedMonth,
  setSelectedMonth,
  settings,
  onRefresh,
}: any) {
  const navigate = useNavigate()
  const [selectedClient, setSelectedClient] = useState('')
  const [selectedJob, setSelectedJob] = useState('')
  const [selectedClientName, setSelectedClientName] = useState('')
  const [selectedJobLabel, setSelectedJobLabel] = useState('')
  const [allocationRows, setAllocationRows] = useState(() => Array(1).fill(null).map(() => ({
    staff_id: '',
    work_component_key: '',
    percentage: 100,
    month: selectedMonth,
  })))
  const [existingAllocationsForSelectedJob, setExistingAllocationsForSelectedJob] = useState<any[]>([])
  const [editingExistingId, setEditingExistingId] = useState<string | null>(null)
  const [editingExistingDraft, setEditingExistingDraft] = useState<{ percentage: number; service: string; role: string }>({ percentage: 100, service: '', role: '' })
  const [editingExistingSaving, setEditingExistingSaving] = useState(false)
  const [editingExistingErrors, setEditingExistingErrors] = useState<string[]>([])
  const [editingExistingWarnings, setEditingExistingWarnings] = useState<string[]>([])
  const [coverageRefreshKey, setCoverageRefreshKey] = useState(0)
  const [coverageData, setCoverageData] = useState<CoverageData | null>(null)
  const [validationErrors, setValidationErrors] = useState<string[]>([])
  const [allocating, setAllocating] = useState(false)
  const [recurrenceMode, setRecurrenceMode] = useState<'single' | 'all' | 'custom'>('single')
  const [customMonths, setCustomMonths] = useState<string[]>([])

  const symbol = settings?.currency_symbol || 'R'
  const [searchParams] = useSearchParams()

  useEffect(() => {
    const clientId = searchParams.get('clientId')
    const jobId = searchParams.get('jobId')
    if (!clientId && !jobId) return
    if (clientId) {
      setSelectedClient(clientId)
      api.get(`/clients/${clientId}`)
        .then((res) => setSelectedClientName(res.data?.name || ''))
        .catch(() => {})
    }
    if (jobId) {
      setSelectedJob(jobId)
      const matchedJob = jobs.find((j: any) => String(j.id) === String(jobId))
      if (matchedJob) {
        setSelectedJobLabel(formatAllocatableJobLabel(matchedJob))
      }
    }
  }, [searchParams, jobs])

  const activeStaff = staff.filter((m: any) => !m.is_archived)
  const staffById = useMemo<Map<string, any>>(
    () => new Map((staff || []).map((m: any) => [String(m.id), m])),
    [staff],
  )
  const staffRoles = useMemo(() => {
    const roles = new Set<string>()
    activeStaff.forEach((m: any) => { if (m.role) roles.add(m.role) })
    return Array.from(roles).sort()
  }, [activeStaff])
  const allRoles = enums?.roles || staffRoles

  const fetchServices = useCallback(async (search: string, page: number) => {
    const q = search.toLowerCase()
    const filtered = (enums?.job_types || []).filter((n: string) => !q || n.toLowerCase().includes(q))
    const PAGE_SIZE = 20
    const start = (page - 1) * PAGE_SIZE
    const paged = filtered.slice(start, start + PAGE_SIZE)
    return { items: paged.map((n: string) => ({ value: n, label: n })), totalPages: Math.ceil(filtered.length / PAGE_SIZE) }
  }, [enums?.job_types])

  const fetchRoleOptions = useCallback(async (search: string, page: number) => {
    const q = search.toLowerCase()
    const filtered = allRoles.filter((r: string) => !q || r.toLowerCase().includes(q))
    const PAGE_SIZE = 20
    const start = (page - 1) * PAGE_SIZE
    const paged = filtered.slice(start, start + PAGE_SIZE)
    return { items: paged.map((r: string) => ({ value: r, label: r })), totalPages: Math.ceil(filtered.length / PAGE_SIZE) }
  }, [allRoles])

  const fetchStaffOptions = useCallback(async (search: string, page: number) => {
    const q = search.toLowerCase()
    const filtered = activeStaff.filter((m: any) =>
      !q || m.name.toLowerCase().includes(q) || (m.role || '').toLowerCase().includes(q),
    )
    const PAGE_SIZE = 50
    const start = (page - 1) * PAGE_SIZE
    const paged = filtered.slice(start, start + PAGE_SIZE)
    return {
      items: paged.map((m: any) => ({ value: String(m.id), label: m.name })),
      totalPages: Math.ceil(filtered.length / PAGE_SIZE),
    }
  }, [activeStaff])

  const getStaffCapacity = useCallback((id: string) => capacity?.staff_capacity?.find((e: any) => e.staff_id === id), [capacity])
  const isOverCapacity = useCallback((id: string) => { const c = getStaffCapacity(id); return c && c.utilization_percentage >= 90 }, [getStaffCapacity])

  const renderStaffItem = useCallback((item: { value: string; label: string }, _isSelected: boolean) => {
    const member = activeStaff.find((m: any) => String(m.id) === item.value)
    if (!member) return <>{item.label}</>
    const cap = getStaffCapacity(member.id)
    const util = cap?.utilization_percentage || 0
    return renderStaffOptionContent(member, { symbol, utilization: util })
  }, [activeStaff, getStaffCapacity, symbol])

  const selectedJobData = useMemo(
    () => jobs.find((j: any) => String(j.id) === String(selectedJob)),
    [jobs, selectedJob],
  )

  const recurringMonths = useMemo(() => {
    if (!selectedJobData?.is_recurring) return []
    const interval = RECURRENCE_INTERVALS[selectedJobData.recurrence_type] || 1
    const start = selectedJobData.recurrence_start_date
    const end = selectedJobData.recurrence_end_date
    if (!start || !end) return []

    const months: string[] = []
    const cursor = new Date(new Date(start).getFullYear(), new Date(start).getMonth(), 1)
    const endDate = new Date(new Date(end).getFullYear(), new Date(end).getMonth(), 1)

    while (cursor <= endDate) {
      const m = String(cursor.getMonth() + 1).padStart(2, '0')
      months.push(`${cursor.getFullYear()}-${m}`)
      cursor.setMonth(cursor.getMonth() + interval)
    }

    return months
  }, [selectedJobData])

  const existingTotalAllocatedPct = useMemo(
    () => existingAllocationsForSelectedJob.reduce((sum: number, a: any) => sum + (a.custom_component ? 0 : Number(a?.percentage || 0)), 0),
    [existingAllocationsForSelectedJob],
  )

  const pendingTotalAllocatedPct = useMemo(() => {
    const rows = allocationRows.filter((row) => row.staff_id && Number(row.percentage || 0) > 0)
    return rows.reduce((sum, row) => sum + Number(row.percentage || 0), 0)
  }, [allocationRows])

  const projectedTotalAllocatedPct = useMemo(
    () => existingTotalAllocatedPct + pendingTotalAllocatedPct,
    [existingTotalAllocatedPct, pendingTotalAllocatedPct],
  )

  const wouldExceedTotalCap = projectedTotalAllocatedPct > 100

  const fetchExistingAllocations = useCallback(async (jobId: string, month: string) => {
    try {
      const res = await api.get(`/allocations?job_id=${jobId}&month=${month}`)
      const items = res.data.data || []
      if (!items.length) return null
      return items
    } catch {
      return null
    }
  }, [])

  const refreshExistingForSelectedJob = useCallback(async () => {
    if (!selectedJob) {
      setExistingAllocationsForSelectedJob([])
      return []
    }
    const existing = await fetchExistingAllocations(selectedJob, selectedMonth)
    setExistingAllocationsForSelectedJob(existing || [])
    return existing || []
  }, [fetchExistingAllocations, selectedJob, selectedMonth])

  const beginInlineEditExisting = useCallback((alloc: any) => {
    const id = String(alloc?.id || '')
    if (!id) return
    const keyParts = String(alloc?.work_component_key || '').split(':')
    const service = String(keyParts[0] || '').trim() || String(enums?.job_types?.[0] || '').trim()
    const role = String(keyParts.slice(1).join(':') || '').trim()
    setEditingExistingErrors([])
    setEditingExistingWarnings([])
    setEditingExistingId(id)
    setEditingExistingDraft({
      percentage: Number(alloc?.percentage ?? 100),
      service,
      role,
    })
  }, [enums?.job_types])

  const cancelInlineEditExisting = useCallback(() => {
    setEditingExistingId(null)
    setEditingExistingErrors([])
    setEditingExistingWarnings([])
  }, [])

  const deleteExistingAllocation = useCallback(async (alloc: any) => {
    const id = String(alloc?.id || '')
    if (!id) return
    if (!window.confirm(`Remove this allocation for ${alloc.staff_name || 'this staff member'}?`)) return
    try {
      await api.delete(`/allocations/${id}`)
      toast.success('Allocation removed')
      setCoverageRefreshKey((k) => k + 1)
      await refreshExistingForSelectedJob()
      onRefresh?.()
    } catch (e: any) {
      const detail = e.response?.data?.detail || 'Failed to remove allocation'
      toast.error(detail)
    }
  }, [refreshExistingForSelectedJob, onRefresh])

  const saveInlineEditExisting = useCallback(async () => {
    if (!editingExistingId) return
    if (editingExistingSaving) return
    const service = String(editingExistingDraft.service || '').trim()
    const role = String(editingExistingDraft.role || '').trim()
    if (!service || !role) {
      setEditingExistingErrors(['Select Type and Role before saving.'])
      return
    }
    const current = existingAllocationsForSelectedJob.find((a: any) => String(a?.id || '') === String(editingExistingId))
    const baseTotal = Number(existingTotalAllocatedPct || 0) - Number(current?.percentage || 0)
    const editedAbs = Number(editingExistingDraft.percentage || 0)
    const projected = baseTotal + editedAbs
    if (projected > 100) {
      setEditingExistingErrors([
        `Total allocations for this job in ${selectedMonth} would be ${projected.toFixed(2)}%, which exceeds the 100.00% limit.`,
      ])
      return
    }
    setEditingExistingSaving(true)
    setEditingExistingErrors([])
    setEditingExistingWarnings([])
    try {
      const work_component_key = normalizeCompKey(`${service}:${role}`)
      const payload = {
        percentage: Number(editingExistingDraft.percentage || 0),
        work_component_key,
      }
      const res = await api.put(`/allocations/${editingExistingId}`, payload)
      if (res.data?.warnings?.length) setEditingExistingWarnings(res.data.warnings)
      toast.success('Allocation updated')
      setCoverageRefreshKey((k) => k + 1)
      await refreshExistingForSelectedJob()
      onRefresh?.()
      setEditingExistingId(null)
    } catch (e: any) {
      const err = e.response?.data
      if (err?.errors?.length) {
        setEditingExistingErrors(err.errors)
      } else {
        const detail = String(err?.detail || '')
        toast.error(detail)
      }
    } finally {
      setEditingExistingSaving(false)
    }
  }, [editingExistingDraft.percentage, editingExistingDraft.role, editingExistingDraft.service, editingExistingId, editingExistingSaving, existingAllocationsForSelectedJob, existingTotalAllocatedPct, onRefresh, refreshExistingForSelectedJob, selectedMonth])

  useEffect(() => {
    setAllocationRows(rows => rows.map(row => ({ ...row, month: selectedMonth })))
  }, [selectedMonth])

  useEffect(() => {
    setCoverageData(null)
    setRecurrenceMode('single')
    setCustomMonths([])
    if (!selectedJob) {
      setExistingAllocationsForSelectedJob([])
      setAllocationRows(Array(1).fill(null).map(() => ({
        staff_id: '',
        work_component_key: '',
        percentage: 100,
        month: selectedMonth,
      })))
      return
    }
    const loadExisting = async () => {
      const existing = await refreshExistingForSelectedJob()
      setAllocationRows(Array(1).fill(null).map(() => ({
        staff_id: '',
        work_component_key: '',
        percentage: 100,
        month: selectedMonth,
      })))
      if (existing && existing.length > 0 && !searchParams.has('edit')) {
        const job = jobs.find((j: any) => String(j.id) === String(selectedJob))
        const cid = job ? String(job.client_id) : ''
        if (cid) {
          const params = new URLSearchParams(searchParams.toString())
          params.set('edit', 'true')
          params.set('clientId', cid)
          params.set('jobId', selectedJob)
          navigate(`/app/allocations/add?${params.toString()}`, { replace: true })
        }
      }
    }
    void loadExisting()
  }, [selectedJob, selectedMonth, refreshExistingForSelectedJob, searchParams, jobs, navigate])

  const handleAllocate = async () => {
    if (allocating) return
    if (!selectedJob) { toast.error('Select a job'); return }
    const validRows = allocationRows.filter(row => row.staff_id && row.percentage > 0)
    if (validRows.length === 0) { toast.error('At least one allocation must have staff and amount'); return }
    if (wouldExceedTotalCap) {
      toast.error(`Total allocations for this job in ${selectedMonth} would exceed 100%`)
      return
    }

    const overCapacityRows = validRows.filter(row => {
      const staffCap = getStaffCapacity(row.staff_id)
      return staffCap && staffCap.utilization_percentage >= 90
    })
    if (overCapacityRows.length > 0) {
      const warningNames = overCapacityRows
        .map((row) => staff.find((m: any) => m.id === row.staff_id)?.name || 'Unknown staff')
        .slice(0, 3)
      const suffix = warningNames.length > 0 ? ` (${warningNames.join(', ')}${overCapacityRows.length > 3 ? ', …' : ''})` : ''
      toast.warning(`Over-capacity warning: ${overCapacityRows.length} assignment${overCapacityRows.length > 1 ? 's' : ''}${suffix}`)
    }

    setValidationErrors([])
    setAllocating(true)
    try {
      let targetMonths: string[]
      if (selectedJobData?.is_recurring && recurrenceMode === 'all' && recurringMonths.length > 0) {
        targetMonths = recurringMonths
      } else if (selectedJobData?.is_recurring && recurrenceMode === 'custom' && customMonths.length > 0) {
        targetMonths = customMonths
      } else {
        targetMonths = [allocationRows[0]?.month || selectedMonth]
      }

      for (const row of validRows) {
          const wck = row.work_component_key ? normalizeCompKey(row.work_component_key) : null
          const isEdit = searchParams.get('edit') === 'true'

          const payload: any = {
            job_id: selectedJob,
            staff_id: row.staff_id,
            percentage: row.percentage,
            work_component_key: wck,
            edit: isEdit,
          }
          if (targetMonths.length === 1) {
            payload.month = targetMonths[0]
          } else {
            payload.months = targetMonths
          }
          await onCreateAllocation(payload)
        }
      const monthsCount = targetMonths.length
      const totalCount = validRows.length * monthsCount
      const allocatedJob = jobs.find((j: any) => String(j.id) === String(selectedJob))
      const clientId = selectedClient || (allocatedJob ? String(allocatedJob.client_id) : '')
      navigate(`/app/allocations/add?edit=true&clientId=${encodeURIComponent(clientId)}&jobId=${encodeURIComponent(selectedJob)}`, { replace: true })
      toast.success(`Allocated ${totalCount} assignment${totalCount !== 1 ? 's' : ''}`)
    } catch (e: any) {
      const err = e.response?.data
      if (err?.errors?.length) {
        setValidationErrors(err.errors)
        toast.error(err.errors[0] || 'Allocation violates work-component split rules')
      } else {
        const detail = String(err?.detail || '')
        toast.error(detail)
      }
    } finally {
      setAllocating(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Allocation form */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 space-y-5">
        <div className="flex items-center justify-between">
          <button
            onClick={() => navigate('/app/allocations')}
            className="px-3 py-1.5 text-sm border border-gray-200 text-gray-700 rounded-xl hover:bg-gray-50"
          >
            ← Back to Allocations
          </button>
          {searchParams.get('edit') === 'true' && (
            <div className="flex items-center gap-3">
              <span className="text-sm font-semibold text-blue-600">Edit</span>
              <button
                onClick={() => navigate('/app/allocations')}
                className="px-3 py-1.5 text-sm border border-gray-200 text-gray-700 rounded-xl hover:bg-gray-50"
              >
                Cancel
              </button>
            </div>
          )}
        </div>

        {validationErrors.length > 0 && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 space-y-1">
            {validationErrors.map((e, i) => <p key={i} className="text-sm text-red-700">✕ {e}</p>)}
          </div>
        )}

        {/* Select Client, Select Job & Target Month */}
        <div className="flex flex-wrap gap-4">
          <div className="w-1/3 min-w-[200px]">
            <label className="block text-sm font-medium text-gray-700 mb-1">Select Client</label>
            <SearchableClientSelect
              value={selectedClient}
              onValueChange={(value: string) => {
                setSelectedClient(value)
                setSelectedClientName('')
                setSelectedJob('')
                setCoverageData(null)
              }}
              placeholder="Choose a client…"
              clientName={selectedClientName}
            />
          </div>

          {selectedClient && (
          <div className="flex-1 min-w-[200px]">
            <label className="block text-sm font-medium text-gray-700 mb-1">Select Job</label>
            <SearchableJobSelect
              value={selectedJob}
              onValueChange={(value: string) => {
                setSelectedJob(value)
                setSelectedJobLabel('')
                setCoverageData(null)
              }}
              clientId={selectedClient}
              placeholder="Choose a job…"
              formatLabel={formatAllocatableJobLabel}
              displayValue={selectedJobLabel}
            />
          </div>
          )}

          {selectedJob && (
          <div className="flex-1 min-w-[200px]">
            <label className="block text-sm font-medium text-gray-700 mb-1">Target Month</label>
            {selectedJobData?.is_recurring && recurringMonths.length > 0 ? (
              <div className="space-y-3">
                <div className="flex gap-1">
                  {(['single', 'all', 'custom'] as const).map((mode) => (
                    <Button
                      key={mode}
                      type="button"
                      size="sm"
                      variant={recurrenceMode === mode ? 'default' : 'outline'}
                      onClick={() => setRecurrenceMode(mode)}
                    >
                      {mode === 'single' ? 'This Month' : mode === 'all' ? 'All Recurring' : 'Custom'}
                    </Button>
                  ))}
                </div>
                {recurrenceMode === 'single' && (
                  <input type="month" value={selectedMonth} onChange={(e) => setSelectedMonth(e.target.value)} className="w-full px-4 py-2 border border-gray-200 rounded-xl text-sm" />
                )}
                {recurrenceMode === 'all' && (
                  <div className="flex flex-wrap gap-1.5">
                    {recurringMonths.map((m: string) => (
                      <span key={m} className="px-2 py-1 text-xs font-medium bg-blue-50 text-blue-700 rounded-md border border-blue-200">
                        {m}
                      </span>
                    ))}
                  </div>
                )}
                {recurrenceMode === 'custom' && (
                  <div className="max-h-40 overflow-y-auto border border-gray-200 rounded-xl p-2 space-y-1">
                    {recurringMonths.map((m: string) => (
                      <label key={m} className="flex items-center gap-2 px-2 py-1 rounded hover:bg-gray-50 cursor-pointer text-sm">
                        <input
                          type="checkbox"
                          checked={customMonths.includes(m)}
                          onChange={(e) => {
                            if (e.target.checked) setCustomMonths(prev => [...prev, m])
                            else setCustomMonths(prev => prev.filter(x => x !== m))
                          }}
                          className="rounded border-gray-300"
                        />
                        {m}
                      </label>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <input type="month" value={selectedMonth} onChange={(e) => setSelectedMonth(e.target.value)} className="w-full px-4 py-2 border border-gray-200 rounded-xl text-sm" />
            )}
          </div>
          )}
        </div>

        {/* Work-component coverage (hidden, logic/code kept) */}
        {selectedJob && (
          <div style={{ display: 'none' }}>
            <AllocationCoveragePanel
              jobId={selectedJob}
              month={selectedMonth}
              refreshKey={coverageRefreshKey}
              onCoverageLoaded={(data) => setCoverageData(data)}
              pendingAllocations={allocationRows
                .filter((r) => r.work_component_key && r.percentage > 0)
                .map((r) => ({
                  work_component_key: normalizeCompKey(r.work_component_key || ''),
                  percentage: Number(r.percentage || 0),
                  staffName: staffById.get(String(r.staff_id))?.name,
                }))}
            />
          </div>
        )}

        {/* Existing allocations for selected job/month */}
        {selectedJob && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-md font-medium text-gray-900">Existing Allocations (Target Month)</h4>
            </div>
            {existingAllocationsForSelectedJob.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full border border-gray-200 rounded-xl">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-2 text-left text-sm font-medium text-gray-700">Staff</th>
                      <th className="px-4 py-2 text-left text-sm font-medium text-gray-700">Component</th>
                      <th className="px-4 py-2 text-left text-sm font-medium text-gray-700">Percentage</th>
                      <th className="px-4 py-2 text-left text-sm font-medium text-gray-700">Month</th>
                      <th className="px-4 py-2 text-left text-sm font-medium text-gray-700">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {existingAllocationsForSelectedJob.map((alloc: any) => (
                      <Fragment key={alloc.id || `${alloc.staff_id}-${alloc.work_component_key}`}>
                        <tr className="border-t border-gray-200">
                          <td className="px-4 py-2 text-sm text-gray-900">
                            {alloc.staff_name || staffById.get(String(alloc.staff_id || ''))?.name || '—'}
                          </td>
                          <td className="px-4 py-2 text-sm text-gray-900">
                            {editingExistingId === String(alloc.id) ? (
                              <div className="space-y-2 min-w-[320px]">
                                <div className="flex gap-1">
                                  <SearchableSelect
                                    value={editingExistingDraft.service}
                                    onValueChange={(value: string) => setEditingExistingDraft((d) => ({ ...d, service: value }))}
                                    fetchItems={fetchServices}
                                    placeholder="Type…"
                                    searchPlaceholder="Search services…"
                                    emptyMessage="No services found"
                                    className="flex-1 px-2 py-1 min-h-9 rounded"
                                  />
                                  <SearchableSelect
                                    value={editingExistingDraft.role}
                                    onValueChange={(value: string) => setEditingExistingDraft((d) => ({ ...d, role: value }))}
                                    fetchItems={fetchRoleOptions}
                                    placeholder="Role…"
                                    searchPlaceholder="Search roles…"
                                    emptyMessage="No roles found"
                                    className="flex-1 px-2 py-1 min-h-9 rounded"
                                  />
                                </div>
                              </div>
                            ) : (
                              <div className="space-y-1">
                                <div>{formatWorkComponentLabel(alloc.work_component_key || '')}</div>
                                {alloc.notes && (
                                  <div className="text-xs text-gray-500 line-clamp-2">{String(alloc.notes)}</div>
                                )}
                              </div>
                            )}
                          </td>
                          <td className="px-4 py-2 text-sm text-gray-900">
                            {editingExistingId === String(alloc.id) ? (
                              <div className="flex items-center gap-2">
                                <input
                                  type="number"
                                  min="1"
                                  max="100"
                                  value={editingExistingDraft.percentage}
                                  onChange={(e) => setEditingExistingDraft((d) => ({ ...d, percentage: Math.min(100, Math.max(1, Number(e.target.value || 1))) }))}
                                  className="w-20 px-3 py-2 border border-gray-200 rounded-lg text-center"
                                />
                                <span className="text-sm text-gray-500">%</span>
                              </div>
                            ) : (
                              `${Number(alloc.percentage || 0).toFixed(2)}%`
                            )}
                          </td>
                          <td className="px-4 py-2 text-sm text-gray-700">
                            {alloc.month || selectedMonth}
                          </td>
                          <td className="px-4 py-2">
                            <div className="flex gap-2">
                              {editingExistingId === String(alloc.id) ? (
                                <>
                                  <button
                                    type="button"
                                    onClick={saveInlineEditExisting}
                                    disabled={editingExistingSaving}
                                    className="px-3 py-1 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300"
                                  >
                                    {editingExistingSaving ? 'Saving…' : 'Save'}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={cancelInlineEditExisting}
                                    disabled={editingExistingSaving}
                                    className="px-3 py-1 text-sm border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50 disabled:bg-gray-100"
                                  >
                                    Cancel
                                  </button>
                                </>
                              ) : (
                                <div className="flex gap-2">
                                  <button
                                    type="button"
                                    onClick={() => beginInlineEditExisting(alloc)}
                                    className="px-3 py-1 text-sm border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50"
                                  >
                                    Edit
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => deleteExistingAllocation(alloc)}
                                    className="px-3 py-1 text-sm border border-red-200 text-red-600 rounded-lg hover:bg-red-50"
                                  >
                                    Delete
                                  </button>
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                        {editingExistingId === String(alloc.id) && (editingExistingErrors.length > 0 || editingExistingWarnings.length > 0) && (
                          <tr className="border-t border-gray-200">
                            <td colSpan={5} className="px-4 py-3">
                              {editingExistingErrors.length > 0 && (
                                <div className="bg-red-50 border border-red-200 rounded-xl p-3 space-y-1">
                                  {editingExistingErrors.map((e, i) => <p key={i} className="text-sm text-red-700">✕ {e}</p>)}
                                </div>
                              )}
                              {editingExistingWarnings.length > 0 && (
                                <div className="mt-2 bg-yellow-50 border border-yellow-200 rounded-xl p-3 space-y-1">
                                  {editingExistingWarnings.map((w, i) => <p key={i} className="text-sm text-yellow-800">⚠ {w}</p>)}
                                </div>
                              )}
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    ))}
                  </tbody>
                </table>
                {existingAllocationsForSelectedJob.length > 0 && (
                  (() => {
                    const totalPct = existingAllocationsForSelectedJob.reduce((sum: number, a: any) => sum + Number(a.percentage || 0), 0)
                    const isFullyAllocated = totalPct >= 100
                    return (
                      <div className="flex items-center justify-end gap-2 px-4 py-2 border-t border-gray-200 bg-gray-50 rounded-b-xl">
                        <span className="text-sm font-medium text-gray-700">Total:</span>
                        <span className="text-sm text-gray-900">{totalPct.toFixed(2)}%</span>
                        {isFullyAllocated && (
                          <span className="inline-flex px-2 py-0.5 text-xs font-medium rounded-full bg-green-100 text-green-700">
                            Fully Allocated
                          </span>
                        )}
                      </div>
                    )
                  })()
                )}
              </div>
            ) : (
              <div className="text-sm text-gray-500">No allocations exist for this job in {selectedMonth}.</div>
            )}
          </div>
        )}

        {/* Multi-allocation table */}
        {selectedJob && (
          <div className="space-y-4">
            {allocationRows.some((row) => row.staff_id && isOverCapacity(row.staff_id)) && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                One or more selected staff members are over-capacity. Allocation will continue and be tracked as over-capacity.
              </div>
            )}
            <div className="flex items-center justify-between">
              <h4 className="text-md font-medium text-gray-900">Add - Edit Allocation</h4>
              <button
                onClick={() => setAllocationRows(rows => [...rows, { staff_id: '', work_component_key: '', percentage: 100, month: selectedMonth }])}
                className="px-3 py-1 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                + Add Row
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full border border-gray-200 rounded-xl">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-2 text-left text-sm font-medium text-gray-700">Staff</th>
                    <th className="px-4 py-2 text-left text-sm font-medium text-gray-700">Component</th>
                    <th className="px-4 py-2 text-left text-sm font-medium text-gray-700">Percentage</th>
                    <th className="px-4 py-2 text-left text-sm font-medium text-gray-700">Month</th>
                    <th className="px-4 py-2 text-left text-sm font-medium text-gray-700">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {allocationRows.map((row, index) => (
                    <tr key={index} className="border-t border-gray-200">
                      <td className="px-4 py-2">
                        <SearchableSelect
                          value={row.staff_id}
                          onValueChange={(value: string) => setAllocationRows(rows => rows.map((r, i) => {
                            if (i !== index) return r
                            const staffMember = value ? activeStaff.find((m: any) => String(m.id) === String(value)) : null
                            if (!staffMember) return { ...r, staff_id: '' }
                            const keyParts = r.work_component_key ? r.work_component_key.split(':') : []
                            const service = keyParts[0] || ''
                            const newKey = service ? `${service}:${staffMember.role}` : `:${staffMember.role}`
                            const normalizedKey = normalizeCompKey(newKey)
                            const matchedRole = coverageData?.requiredRoles?.find((rr: any) => rr.key === normalizedKey)
                            return {
                              ...r,
                              staff_id: value,
                              work_component_key: newKey,
                              percentage: matchedRole?.requiredPercentage ?? r.percentage,
                            }
                          }))}
                          fetchItems={fetchStaffOptions}
                          renderItem={renderStaffItem}
                          placeholder="Choose staff…"
                          searchPlaceholder="Search staff…"
                          emptyMessage="No staff found"
                          className={`px-2 py-1 min-h-9 rounded ${row.staff_id && isOverCapacity(row.staff_id) ? 'border-red-400 bg-red-50' : ''}`}
                        />
                        {row.staff_id && isOverCapacity(row.staff_id) && <p className="text-xs text-red-600 mt-1">⚠ Over-capacity</p>}
                      </td>
                      <td className="px-4 py-2">
                        {(() => {
                          const keyParts = row.work_component_key ? row.work_component_key.split(':') : []
                          const rowService = keyParts[0] || ''
                          const rowRole = keyParts.slice(1).join(':') || ''
                          return (
                            <div className="flex gap-1 min-w-[280px]">
                              <SearchableSelect
                                value={rowService}
                                onValueChange={(value: string) => setAllocationRows(rows => rows.map((r, i) => {
                                  if (i !== index) return r
                                  const keyParts = r.work_component_key ? r.work_component_key.split(':') : []
                                  const currentRole = keyParts.slice(1).join(':') || ''
                                  const newKey = value && currentRole ? `${value}:${currentRole}` : (currentRole ? `:${currentRole}` : '')
                                  const normalizedKey = normalizeCompKey(newKey)
                                  const matchedRole = coverageData?.requiredRoles?.find((rr: any) => rr.key === normalizedKey)
                                  return {
                                    ...r,
                                    work_component_key: newKey,
                                    percentage: matchedRole?.requiredPercentage ?? r.percentage,
                                  }
                                }))}
                                fetchItems={fetchServices}
                                placeholder="Service…"
                                searchPlaceholder="Search services…"
                                emptyMessage="No services found"
                                className="flex-1 px-2 py-1 min-h-9 rounded"
                              />
                              <SearchableSelect
                                value={rowRole}
                                onValueChange={(value: string) => setAllocationRows(rows => rows.map((r, i) => {
                                  if (i !== index) return r
                                  const keyParts = r.work_component_key ? r.work_component_key.split(':') : []
                                  const currentService = keyParts[0] || ''
                                  const newKey = currentService && value ? `${currentService}:${value}` : (currentService ? `${currentService}:` : '')
                                  const normalizedKey = normalizeCompKey(newKey)
                                  const matchedRole = coverageData?.requiredRoles?.find((rr: any) => rr.key === normalizedKey)
                                  return {
                                    ...r,
                                    work_component_key: newKey,
                                    percentage: matchedRole?.requiredPercentage ?? r.percentage,
                                  }
                                }))}
                                fetchItems={fetchRoleOptions}
                                placeholder="Role…"
                                searchPlaceholder="Search roles…"
                                emptyMessage="No roles found"
                                className="flex-1 px-2 py-1 min-h-9 rounded"
                              />
                            </div>
                          )
                        })()}
                      </td>
                      <td className="px-4 py-2">
                        <input
                          type="number"
                          min="0.01"
                          max="100"
                          step="0.01"
                          value={row.percentage}
                          onChange={(e) => setAllocationRows(rows => rows.map((r, i) => i === index ? { ...r, percentage: +e.target.value || 0 } : r))}
                          className="w-full px-2 py-1 border border-gray-200 rounded text-sm"
                        />
                      </td>
                      <td className="px-4 py-2">
                        {selectedJobData?.is_recurring && recurrenceMode !== 'single' ? (
                          <span className="inline-flex items-center px-2.5 py-1 text-sm font-medium text-blue-700 bg-blue-50 rounded-md border border-blue-200">
                            Affects {recurrenceMode === 'all' ? recurringMonths.length : customMonths.length} month{(recurrenceMode === 'all' ? recurringMonths.length : customMonths.length) !== 1 ? 's' : ''}
                          </span>
                        ) : (
                          <input
                            type="month"
                            value={row.month}
                            onChange={(e) => setAllocationRows(rows => rows.map((r, i) => i === index ? { ...r, month: e.target.value } : r))}
                            className="w-full px-2 py-1 border border-gray-200 rounded text-sm"
                          />
                        )}
                      </td>
                      <td className="px-4 py-2">
                        <button
                          onClick={() => setAllocationRows(rows => rows.filter((_, i) => i !== index))}
                          className="px-2 py-1 text-red-600 hover:bg-red-50 rounded text-sm"
                          disabled={allocationRows.length <= 1}
                        >
                          Remove
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-end gap-4">
              {wouldExceedTotalCap && projectedTotalAllocatedPct > 0 && (
                <div className="mr-auto rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  Projected total: {projectedTotalAllocatedPct.toFixed(2)}% of job (must be ≤ 100.00%)
                </div>
              )}
              <button
                onClick={handleAllocate}
                disabled={allocating || wouldExceedTotalCap || !selectedJob || allocationRows.every(row => !row.staff_id || row.percentage <= 0)}
                className="inline-flex items-center gap-2 px-6 py-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:bg-gray-300"
              >
                {allocating && (
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-blue-200 border-t-white" aria-hidden="true" />
                )}
                {allocating ? 'Allocating...' : 'Allocate Selected'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
