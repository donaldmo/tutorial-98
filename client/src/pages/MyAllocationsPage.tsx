import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { MoreHorizontal, Info } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { TooltipProvider, Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { TimeLoggingModal } from '@/components/workflow/analyticsShared'
import { StaffMonthlySummaryModal } from '@/components/workflow/StaffMonthlySummaryModal'
import { COMPLETED_JOB_LOCK_MESSAGE } from '@/lib/allocationMessages'
import { getAllocationJobKey, getAllocationTotals, getDerivedAllocationMetrics, getFirstJobFeeRowIds } from '@/lib/allocationMetrics'
import api from '@/services/api'
import { formatCurrency, Icons } from '@/components/workflow/shared'
import { formatWorkComponentLabel } from '@/lib/workComponentLabels'

const getCurrentMonth = () => new Date().toISOString().slice(0, 7)

export function MyAllocationsPage({ user, settings, hidePageHeader = false }: any) {
  const [monthlySummary, setMonthlySummary] = useState<any>(null)
  const [summaryLoading, setSummaryLoading] = useState(true)
  const [allocationsLoading, setAllocationsLoading] = useState(true)
  const [pagedAllocations, setPagedAllocations] = useState<any[]>([])
  const [allocTotal, setAllocTotal] = useState(0)
  const [loadedAllocPage, setLoadedAllocPage] = useState(0)
  const [allocHasMore, setAllocHasMore] = useState(true)
  const sentinelRef = useRef<HTMLDivElement>(null)
  const allocLoadingRef = useRef(allocationsLoading)
  allocLoadingRef.current = allocationsLoading
  const allocPageRef = useRef(loadedAllocPage)
  allocPageRef.current = loadedAllocPage
  const allocHasMoreRef = useRef(allocHasMore)
  allocHasMoreRef.current = allocHasMore
  const [actioningId, setActioningId] = useState<string | null>(null)
  const [timeModal, setTimeModal] = useState<{ open: boolean; allocation: any }>({ open: false, allocation: null })
  const [summaryModal, setSummaryModal] = useState<{ open: boolean; allocation: any }>({ open: false, allocation: null })
  const [selectedMonth, setSelectedMonth] = useState(getCurrentMonth())
  const [activeTab, setActiveTab] = useState<'all' | 'once-off' | 'recurring'>('all')
  const symbol = settings?.currency_symbol || 'R'
  const staffId = user?.staff_id || user?.id

  const fetchMonthlySummary = useCallback(async () => {
    if (!staffId) {
      setMonthlySummary(null)
      return null
    }

    try {
      setSummaryLoading(true)
      const res = await api.get(`/staff/${staffId}/monthly-summary`, {
        params: { month: selectedMonth },
      })
      const nextSummary = res.data || null
      setMonthlySummary(nextSummary)
      return nextSummary
    } catch (error: any) {
      toast.error(error.response?.data?.detail || 'Failed to load allocation summary')
      return null
    } finally {
      setSummaryLoading(false)
    }
  }, [staffId, selectedMonth])

  const fetchAllocPage = useCallback(async (page: number, tab?: 'all' | 'once-off' | 'recurring', month?: string) => {
    try {
      setAllocationsLoading(true)
      const resolvedTab = tab ?? activeTab
      const resolvedMonth = month ?? selectedMonth
      const params = new URLSearchParams({ page: page.toString(), limit: '6', month: resolvedMonth })
      if (resolvedTab !== 'all') {
        params.append('is_recurring', (resolvedTab === 'recurring').toString())
      }

      const res = await api.get(`/allocations?${params}`)
      const items = res.data.data || []
      const total = res.data.pagination?.total ?? 0
      const totalPages = res.data.pagination?.total_pages ?? 1

      if (page === 1) {
        setPagedAllocations(items)
      } else {
        setPagedAllocations((prev) => {
          const existingIds = new Set(prev.map((allocation: any) => allocation.id))
          return [...prev, ...items.filter((allocation: any) => !existingIds.has(allocation.id))]
        })
      }
      setAllocTotal(total)
      setAllocHasMore(page < totalPages)
      setLoadedAllocPage(page)
      return items
    } catch {
      toast.error('Failed to load allocations')
      return []
    } finally {
      setAllocationsLoading(false)
    }
  }, [activeTab, selectedMonth])

  useEffect(() => {
    void fetchMonthlySummary()
  }, [fetchMonthlySummary])

  useEffect(() => {
    void fetchAllocPage(1, activeTab, selectedMonth)
  }, [fetchAllocPage, activeTab, selectedMonth])

  const WORKFLOW_STATUS_STYLES: Record<string, string> = {
    Pending: 'bg-gray-100 text-gray-700',
    Doing: 'bg-blue-100 text-blue-700',
    Completed: 'bg-green-100 text-green-700',
  }

  const hourlyRate = Number(monthlySummary?.hourly_rate ?? user?.hourly_rate ?? 0)
  const efficiency = Number(monthlySummary?.efficiency ?? user?.efficiency ?? 1)
  const staffInfo = staffId ? {
    id: String(staffId),
    name: String(monthlySummary?.staff_name || user?.name || 'Staff'),
    role: String(monthlySummary?.role || user?.role || 'Staff'),
    hourlyRate,
    hoursPerDay: Number(user?.hours_per_day ?? 8),
    productivityFactor: Number(monthlySummary?.productivity_factor ?? user?.productivity_factor ?? 1),
    efficiency,
  } : null

  const sortedAllocations = useMemo(() => {
    return [...pagedAllocations].sort((a: any, b: any) => {
      const client = String(a.client_name || '').localeCompare(String(b.client_name || ''))
      if (client !== 0) return client
      const job = String(a.job_name || '').localeCompare(String(b.job_name || ''))
      if (job !== 0) return job
      return String(a.work_component_key || '').localeCompare(String(b.work_component_key || ''))
    })
  }, [pagedAllocations])

  const firstJobFeeRowIds = useMemo(() => {
    return getFirstJobFeeRowIds(sortedAllocations)
  }, [sortedAllocations])

  const totalsSourceAllocations = useMemo(
    () => (Array.isArray(monthlySummary?.allocations) && monthlySummary.allocations.length > 0 ? monthlySummary.allocations : sortedAllocations),
    [monthlySummary?.allocations, sortedAllocations],
  )

  const allocationTotals = useMemo(() => {
    return getAllocationTotals(totalsSourceAllocations, () => ({
      hourlyRate,
      efficiency,
    }))
  }, [efficiency, hourlyRate, totalsSourceAllocations])

  const handleCompleteToggle = async (allocationId: string, shouldComplete: boolean) => {
    try {
      setActioningId(allocationId)
      if (shouldComplete) {
        await api.post(`/allocations/${allocationId}/complete`, {
          completed_at: new Date().toISOString(),
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        })
        toast.success('Allocation marked complete')
      } else {
        await api.post(`/allocations/${allocationId}/uncomplete`)
        toast.success('Allocation marked uncomplete')
      }
      const [, nextRows] = await Promise.all([
        fetchMonthlySummary(),
        fetchAllocPage(1, activeTab, selectedMonth),
      ])

      if (summaryModal.open && String(summaryModal.allocation?.id || summaryModal.allocation?.allocation_id || '') === String(allocationId)) {
        const refreshed = (nextRows || []).find((item: any) => String(item.id || item.allocation_id) === String(allocationId))
        if (refreshed) {
          setSummaryModal({ open: true, allocation: refreshed })
        }
      }
    } catch (error: any) {
      const detail = String(error?.response?.data?.detail || '')
      toast.error(detail.toLowerCase().includes('completed and locked') ? COMPLETED_JOB_LOCK_MESSAGE : (detail || 'Failed to update allocation status'))
    } finally {
      setActioningId(null)
    }
  }

  const isInitialLoading = summaryLoading && allocationsLoading && pagedAllocations.length === 0 && !monthlySummary

  useEffect(() => {
    if (!allocHasMoreRef.current || allocLoadingRef.current) return
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !allocLoadingRef.current && allocHasMoreRef.current) {
          void fetchAllocPage(allocPageRef.current + 1, activeTab, selectedMonth)
        }
      },
      { rootMargin: '200px' }
    )
    const el = sentinelRef.current
    if (el) observer.observe(el)
    return () => observer.disconnect()
  }, [allocationsLoading, allocHasMore, activeTab, selectedMonth, fetchAllocPage])

  return (
    <div className="space-y-6" data-testid="my-allocations-page">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        {!hidePageHeader && (
          <div>
            <h2 className="text-2xl font-bold text-gray-900">My Allocations</h2>
            <p className="text-gray-500 mt-1">Manage your assigned work, log time, and complete or uncomplete components.</p>
          </div>
        )}
        <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit">
          <button
            onClick={() => setActiveTab('all')}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${activeTab === 'all' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
          >
            All Allocations
          </button>
          <button
            onClick={() => setActiveTab('once-off')}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${activeTab === 'once-off' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
          >
            Once Off
          </button>
          <button
            onClick={() => setActiveTab('recurring')}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${activeTab === 'recurring' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
          >
            Recurring
          </button>
        </div>
      </div>

      {isInitialLoading ? (
        <div className="space-y-4">
          <div className="h-48 animate-pulse rounded-xl bg-gray-100" />
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-900">Current Allocations — {selectedMonth}</h3>
            <div className="flex items-center gap-2">
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Month</label>
              <input
                type="month"
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm"
              />
            </div>
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
                  <th className="px-4 py-2 text-left text-[10px] font-semibold text-gray-500 uppercase">Logged Hours</th>
                  <th className="px-4 py-2 text-right text-[10px] font-semibold text-gray-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {sortedAllocations.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-6 py-16 text-center text-gray-400">No allocations for {selectedMonth}.</td>
                  </tr>
                ) : (
                  sortedAllocations.map((allocation: any) => {
                    const derived = getDerivedAllocationMetrics(allocation, {
                      hourlyRate,
                      efficiency,
                    })
                    const showJobFee = firstJobFeeRowIds.has(String(allocation.id || getAllocationJobKey(allocation)))
                    const statusClass = WORKFLOW_STATUS_STYLES[String(allocation.workflow_status || 'Pending')] || WORKFLOW_STATUS_STYLES.Pending
                    const isCompleted = allocation.workflow_status === 'Completed'

                    return (
                      <tr key={allocation.id} className={`hover:bg-gray-50 transition-colors ${allocation.is_auto_generated ? 'bg-purple-50/40' : ''}`}>
                        <td className="px-4 py-2 text-xs text-gray-700">{allocation.client_name}</td>
                        <td className="px-4 py-2 text-xs text-gray-700">
                          <div className="space-y-1">
                            <p>{allocation.job_name}</p>
                            {allocation.deadline && (
                              <p className="text-[11px] text-gray-400">
                                Deadline: {new Date(allocation.deadline).toLocaleDateString('en-ZA')}
                              </p>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-2">
                          <button
                            onClick={() => setSummaryModal({ open: true, allocation })}
                            className="text-left group"
                            title="View summary"
                          >
                            <p className="text-xs font-medium text-gray-900 group-hover:text-blue-600 transition-colors">
                              {allocation.staff_name || staffInfo?.name || 'Me'}
                            </p>
                          </button>
                        </td>
                        <td className="px-4 py-2">
                          <div className="flex flex-col gap-1">
                            <span className="text-xs font-medium text-gray-700">{formatWorkComponentLabel(allocation.work_component_key as string | null)}</span>
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="inline-flex px-2 py-0.5 text-xs font-medium rounded-full bg-blue-100 text-blue-700">
                                {Number(allocation.percentage || 0).toFixed(0)}%
                              </span>
                              <span className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full ${statusClass}`}>
                                {allocation.workflow_status || 'Pending'}
                              </span>
                            </div>
                            {allocation.notes && <span className="text-xs text-gray-500 line-clamp-2">{String(allocation.notes)}</span>}
                          </div>
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
                          <p className="text-xs font-medium text-blue-700">{Number(allocation.total_logged_hours || 0).toFixed(2)}h</p>
                        </td>
                        <td className="px-4 py-2">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button type="button" variant="ghost" size="icon" className="ml-auto h-8 w-8" aria-label="Allocation actions">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-48">
                              <DropdownMenuItem onSelect={() => setSummaryModal({ open: true, allocation })}>
                                <Icons.Chart className="h-4 w-4" />View summary
                              </DropdownMenuItem>
                              {!isCompleted && (
                                <DropdownMenuItem
                                  onSelect={() => setTimeModal({
                                    open: true,
                                    allocation: {
                                      ...allocation,
                                      budgeted_hours_display: Number(derived.budgetedHrs || 0),
                                    },
                                  })}
                                >
                                  <Icons.Clock className="h-4 w-4" />Log time
                                </DropdownMenuItem>
                              )}
                              {!isCompleted ? (
                                <DropdownMenuItem
                                  disabled={actioningId === allocation.id}
                                  onSelect={() => handleCompleteToggle(allocation.id, true)}
                                >
                                  <Icons.Check className="h-4 w-4" />Mark as complete
                                </DropdownMenuItem>
                              ) : (
                                <DropdownMenuItem
                                  disabled={actioningId === allocation.id}
                                  onSelect={() => handleCompleteToggle(allocation.id, false)}
                                >
                                  <Icons.Restore className="h-4 w-4" />Mark as uncomplete
                                </DropdownMenuItem>
                              )}
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
      )}

      {allocHasMore && (
        <div ref={sentinelRef} className="flex justify-center py-2">
          {allocationsLoading && (
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

      <TimeLoggingModal
        isOpen={timeModal.open}
        onClose={() => setTimeModal({ open: false, allocation: null })}
        allocation={timeModal.allocation}
        onTimeLogged={() => {
          void fetchMonthlySummary()
          void fetchAllocPage(1, activeTab, selectedMonth)
        }}
        onStatusChanged={() => {
          void fetchMonthlySummary()
          void fetchAllocPage(1, activeTab, selectedMonth)
        }}
        symbol={symbol}
        allowEntryDelete={false}
      />

      <StaffMonthlySummaryModal
        isOpen={summaryModal.open}
        onClose={() => setSummaryModal({ open: false, allocation: null })}
        allocation={summaryModal.allocation}
        staffInfo={staffInfo}
        symbol={symbol}
        selectedMonth={selectedMonth}
      />
    </div>
  )
}
