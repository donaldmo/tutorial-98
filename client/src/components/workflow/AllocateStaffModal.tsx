import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'

import { Modal } from '@/components/workflow/shared'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectSeparator, SelectTrigger } from '@/components/ui/select'
import { COMPLETED_JOB_LOCK_MESSAGE } from '@/lib/allocationMessages'
import api from '@/services/api'
import { normalizeCompKey } from '@/lib/workComponentLabels'

interface ComponentOption {
  key: string
  label: string
  percentage: number
  allocatedPercentage: number
  remainingPercentage: number
}

interface AllocateStaffModalProps {
  job: any | null   // null = closed
  symbol?: string
  onClose: () => void
  onSuccess?: () => void | Promise<void>
}

const EMPTY_SELECT_VALUE = '__empty__'

const isStaffActivated = (member: any) => Boolean(member?.is_active)

const formatStaffTriggerLabel = (member: any) => member ? `${member.name} (${member.role})` : ''

const renderStaffOptionContent = (member: any, options?: { matchedRole?: boolean }) => (
  <div className="flex w-full items-start justify-between gap-2 pr-4">
    <div className="min-w-0">
      <span className="block truncate text-sm text-gray-900">
        {member.name} ({member.role})
      </span>
      {options?.matchedRole && (
        <span className="block truncate text-xs text-gray-500">
          Matches selected component
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

export function AllocateStaffModal({ job, symbol = 'R', onClose, onSuccess }: AllocateStaffModalProps) {
  const [staff, setStaff] = useState<any[]>([])
  const [components, setComponents] = useState<ComponentOption[]>([])
  const [rows, setRows] = useState<{ work_component_key: string; staff_id: string }[]>([{ work_component_key: '', staff_id: '' }])
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7))
  const [coverage, setCoverage] = useState<any>(null)
  const [loadingCoverage, setLoadingCoverage] = useState(false)
  const [saving, setSaving] = useState(false)
  const [submitStage, setSubmitStage] = useState<'idle' | 'allocating' | 'refreshing'>('idle')
  const pendingJobInit = useRef(false)
  const jobRef = useRef<any | null>(null)
  const jobId = job?.id ? String(job.id) : ''

  const loadJobData = useCallback(async (targetJob: any, targetMonth: string) => {
    // 1. Fetch staff
    try {
      const staffRes = await api.get('/staff')
      const staffList = staffRes.data?.data ?? staffRes.data ?? []
      setStaff(staffList.filter((m: any) => !m.is_archived))
    } catch {
      setStaff([])
    }

    // 2. Fetch coverage
    setLoadingCoverage(true)
    let coverageData: any = null
    try {
      const params = new URLSearchParams()
      if (targetMonth) params.set('month', targetMonth)
      const suffix = params.toString() ? `?${params.toString()}` : ''
      const coverageRes = await api.get(`/jobs/${targetJob.id}/allocation-coverage${suffix}`)
      coverageData = coverageRes.data || null
      setCoverage(coverageData)
    } catch {
      coverageData = null
      setCoverage(null)
    } finally {
      setLoadingCoverage(false)
    }

    // 3. Compute work component options from embedded job_type_entries
    const rawComponents: any[] = []
    for (const entry of (targetJob.job_type_entries || [])) {
      for (const c of (entry.work_components || [])) {
        rawComponents.push({ ...c, service: c.service || entry.job_type_name || 'general' })
      }
    }

    const coverageAllocatedMap = new Map<string, number>()
    for (const role of coverageData?.allocatedRoles || []) {
      coverageAllocatedMap.set(normalizeCompKey(role.key), Number(role.allocatedPercentage || 0))
    }

    const coverageOptions: ComponentOption[] = (coverageData?.requiredRoles || []).map((r: any) => {
      const key = normalizeCompKey(r.key)
      const required = Number(r.requiredPercentage || 0)
      const allocated = Number(coverageAllocatedMap.get(key) || 0)
      return { key, label: `${r.label} — ${required}%`, percentage: required, allocatedPercentage: allocated, remainingPercentage: Math.max(0, required - allocated) }
    })

    const fallbackOptions: ComponentOption[] = rawComponents.length > 0
      ? rawComponents.map((c: any) => {
          const key = normalizeCompKey(`${c.service || 'general'}:${c.role || c.name}`)
          const required = Number(c.percentage || 0)
          const allocated = Number(coverageAllocatedMap.get(key) || 0)
          return { key, label: `${c.role || c.name} (${c.service || 'General'}) — ${required}%`, percentage: required, allocatedPercentage: allocated, remainingPercentage: Math.max(0, required - allocated) }
        })
      : [{ key: 'general:General', label: 'General — 100%', percentage: 100, allocatedPercentage: Number(coverageAllocatedMap.get('general:General') || 0), remainingPercentage: Math.max(0, 100 - Number(coverageAllocatedMap.get('general:General') || 0)) }]

    const componentOptions = coverageOptions.length > 0 ? coverageOptions : fallbackOptions
    setComponents(componentOptions)

    const fillable = componentOptions.filter((c) => c.remainingPercentage > 0)
    setRows(fillable.length > 0 ? fillable.map((c) => ({ work_component_key: c.key, staff_id: '' })) : [{ work_component_key: '', staff_id: '' }])
  }, [])

  useEffect(() => {
    jobRef.current = job
  }, [job])

  useEffect(() => {
    if (!jobId) return
    pendingJobInit.current = true
    setMonth(new Date().toISOString().slice(0, 7))
  }, [jobId])

  useEffect(() => {
    if (!jobId) return
    if (pendingJobInit.current) {
      pendingJobInit.current = false
      return
    }
    if (!jobRef.current) return
    loadJobData(jobRef.current, month)
  }, [jobId, month, loadJobData])

  const selectedComponentCount = useMemo(() => {
    const map = new Map<string, number>()
    for (const row of rows) {
      if (!row.work_component_key) continue
      const key = normalizeCompKey(row.work_component_key)
      map.set(key, Number(map.get(key) || 0) + 1)
    }
    return map
  }, [rows])

  const componentMap = useMemo(
    () => new Map(components.map((c) => [normalizeCompKey(c.key), c])),
    [components],
  )

  const handleSubmit = async () => {
    if (saving) return
    const rowsToSubmit = rows.filter((r) => !!r.staff_id)
    if (rowsToSubmit.length === 0) { toast.error('Please select at least one staff assignment'); return }
    const missingComponent = rowsToSubmit.filter((r) => !r.work_component_key)
    if (missingComponent.length > 0) { toast.error('Please select a work component for each selected staff member'); return }
    const selectedKeys = rowsToSubmit.map((r) => normalizeCompKey(r.work_component_key))
    const duplicateKeys = selectedKeys.filter((k, i) => selectedKeys.indexOf(k) !== i)
    if (duplicateKeys.length > 0) { toast.error('Duplicate component rows detected. Assign each work component once.'); return }
    const fullyAllocated = selectedKeys.filter((k) => { const c = componentMap.get(k); return c && c.remainingPercentage <= 0 })
    if (fullyAllocated.length > 0) { toast.error('One or more selected work components are already fully allocated.'); return }

    setSaving(true)
    setSubmitStage('allocating')
    try {
      const res = await api.post(`/jobs/${job!.id}/auto-allocate`, {
        month,
        allocations: rowsToSubmit.map((r) => ({ staff_id: r.staff_id, work_component_key: r.work_component_key })),
      })
      const created = Number(res.data?.created_count || 0)
      const errors = res.data?.errors || []
      if (errors.length > 0) {
        toast.error(`Created ${created} allocation${created !== 1 ? 's' : ''}, ${errors.length} failed`)
      } else {
        setSubmitStage('refreshing')
        toast.success(res.data.message || 'Allocations created successfully')
        await Promise.resolve(onSuccess?.())
        setCoverage(null)
        setRows([{ work_component_key: '', staff_id: '' }])
        onClose()
      }
    } catch (error: any) {
      const detail = String(error.response?.data?.detail || '')
      toast.error(detail.includes('completed and locked') ? COMPLETED_JOB_LOCK_MESSAGE : (detail || 'Auto-allocate failed'))
    } finally {
      setSaving(false)
      setSubmitStage('idle')
    }
  }

  const handleClose = () => {
    if (saving) return
    setCoverage(null)
    setRows([{ work_component_key: '', staff_id: '' }])
    setSubmitStage('idle')
    onClose()
  }

  return (
    <Modal
      isOpen={!!job}
      onClose={handleClose}
      size="lg"
      title={`Allocate Staff: ${job?.name || ''}`}
    >
      <div className="space-y-4">
        {saving && (
          <div className="rounded-xl border border-blue-200 bg-blue-50 px-3 py-2">
            <div className="flex items-center gap-2 text-sm font-medium text-blue-700">
              <div className="h-3 w-3 animate-spin rounded-full border-2 border-blue-300 border-t-blue-700" />
              {submitStage === 'refreshing' ? 'Refreshing dashboard allocations…' : 'Allocating components…'}
            </div>
            <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-blue-100">
              <div
                className="h-full rounded-full bg-blue-600 transition-all duration-300"
                style={{ width: submitStage === 'refreshing' ? '100%' : '65%' }}
              />
            </div>
          </div>
        )}
        {job && (
          <div className="bg-gray-50 rounded-xl p-3 border border-gray-200">
            <p className="text-sm font-semibold text-gray-800">{job.name}</p>
            <p className="text-xs text-gray-500">
              {job.client_name} · {(job.job_type_entries || []).map((e: any) => e.job_type_name || '').filter(Boolean).join(' & ')} · {symbol}{Number(job.job_fee || 0).toFixed(2)}
            </p>
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Allocation Month</label>
          <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="w-full px-4 py-2 border border-gray-200 rounded-xl" />
          {coverage && (
            <p className="text-xs text-gray-500 mt-1">
              Coverage status: {coverage.allocation_status || 'Pending'}
              {Array.isArray(coverage.missingRoles) && coverage.missingRoles.length > 0
                ? ` · ${coverage.missingRoles.length} component(s) still missing`
                : ''}
            </p>
          )}
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-semibold text-gray-700">Assign Staff to Work Components</p>
            <button
              type="button"
              onClick={() => setRows((prev) => [...prev, { work_component_key: '', staff_id: '' }])}
              className="px-3 py-1 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              + Add Row
            </button>
          </div>
          {components.every((c) => c.remainingPercentage <= 0) && !loadingCoverage && (
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-2">
              All work components are already fully allocated for this job.
            </p>
          )}
          <div className="space-y-2">
            {rows.map((row, idx) => {
              const normalizedRowKey = normalizeCompKey(row.work_component_key)
              const compInfo = componentMap.get(normalizedRowKey)
              const selectedComponent = components.find((component) => component.key === row.work_component_key)
              const selectedStaffMember = staff.find((member: any) => String(member.id) === String(row.staff_id))
              return (
                <div key={idx} className="flex items-center gap-2">
                  <Select
                    value={row.work_component_key || EMPTY_SELECT_VALUE}
                    onValueChange={(value: string) => setRows((prev) => prev.map((r, i) => i === idx ? { ...r, work_component_key: value === EMPTY_SELECT_VALUE ? '' : value } : r))}
                  >
                    <SelectTrigger className="flex-1 px-3 py-2 border border-gray-200 rounded-xl text-sm text-left">
                      <span className={row.work_component_key ? 'truncate text-gray-900' : 'truncate text-gray-400'}>
                        {selectedComponent ? selectedComponent.label : 'Select component…'}
                      </span>
                    </SelectTrigger>
                    <SelectContent className="bg-white text-gray-700 border border-gray-200">
                      <SelectItem value={EMPTY_SELECT_VALUE}>Select component…</SelectItem>
                      {components.map((c) => {
                        const key = normalizeCompKey(c.key)
                        const usedByOthers = (selectedComponentCount.get(key) || 0) - (key === normalizedRowKey && row.work_component_key ? 1 : 0)
                        const blockedByCoverage = c.remainingPercentage <= 0 && key !== normalizedRowKey
                        const blockedByDuplicate = usedByOthers > 0 && key !== normalizedRowKey
                        const disabled = blockedByCoverage || blockedByDuplicate
                        const suffix = c.remainingPercentage <= 0
                          ? ' (fully allocated)'
                          : ` (${c.remainingPercentage.toFixed(2)}% remaining)`

                        return (
                          <SelectItem key={c.key} value={c.key} disabled={disabled} textValue={`${c.label}${suffix}`}>
                            {c.label}{suffix}
                          </SelectItem>
                        )
                      })}
                    </SelectContent>
                  </Select>
                  <Select
                    value={row.staff_id}
                    onValueChange={(value: string) => setRows((prev) => prev.map((r, i) => i === idx ? { ...r, staff_id: value === EMPTY_SELECT_VALUE ? '' : value } : r))}
                  >
                    <SelectTrigger className="flex-1 border border-gray-200 rounded-xl text-sm text-left">
                      <span className={row.staff_id ? 'truncate text-gray-900' : 'truncate text-gray-400'}>
                        {row.staff_id ? formatStaffTriggerLabel(selectedStaffMember) : 'Select staff…'}
                      </span>
                    </SelectTrigger>
                    <SelectContent className="bg-white text-gray-700 border border-gray-200">
                      <SelectItem value={EMPTY_SELECT_VALUE}>Select staff…</SelectItem>
                      {compInfo && (() => {
                        const roleLabel = String(compInfo.key || '').split(':').slice(1).join(':').trim() || compInfo.label
                        const matched = staff.filter((m: any) => m.role === roleLabel)
                        const others = staff.filter((m: any) => m.role !== roleLabel)
                        return (
                          <>
                            {matched.length > 0 && (
                              <SelectGroup>
                                <SelectLabel className="text-xs text-gray-500">Matching role</SelectLabel>
                                {matched.map((m: any) => (
                                  <SelectItem key={m.id} value={String(m.id)} textValue={formatStaffTriggerLabel(m)}>
                                    {renderStaffOptionContent(m, { matchedRole: true })}
                                  </SelectItem>
                                ))}
                              </SelectGroup>
                            )}
                            {matched.length > 0 && others.length > 0 && <SelectSeparator />}
                            {others.length > 0 && (
                              <SelectGroup>
                                <SelectLabel className="text-xs text-gray-500">Other staff</SelectLabel>
                                {others.map((m: any) => (
                                  <SelectItem key={m.id} value={String(m.id)} textValue={formatStaffTriggerLabel(m)}>
                                    {renderStaffOptionContent(m)}
                                  </SelectItem>
                                ))}
                              </SelectGroup>
                            )}
                          </>
                        )
                      })()}
                      {!compInfo && staff.map((m: any) => (
                        <SelectItem key={m.id} value={String(m.id)} textValue={formatStaffTriggerLabel(m)}>
                          {renderStaffOptionContent(m)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {compInfo && (
                    <span className="text-[10px] text-gray-500 min-w-[110px] text-right">
                      {compInfo.remainingPercentage.toFixed(2)}% left
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => setRows((prev) => prev.filter((_, i) => i !== idx))}
                    disabled={rows.length <= 1}
                    className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg disabled:opacity-30"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              )
            })}
          </div>
        </div>

        <div className="flex gap-3 pt-2">
          <button
            type="button"
            onClick={handleClose}
            disabled={saving}
            className="flex-1 px-4 py-2 border border-gray-200 text-gray-700 rounded-xl hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving}
            className="flex-1 px-4 py-2 bg-green-600 text-white rounded-xl hover:bg-green-700 disabled:bg-gray-300"
          >
            {submitStage === 'refreshing' ? 'Refreshing…' : saving ? 'Allocating…' : 'Create Allocations'}
          </button>
        </div>
      </div>
    </Modal>
  )
}
