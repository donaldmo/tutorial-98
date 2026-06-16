/**
 * StaffMonthlySummaryModal (allocation summary variant)
 *
 * Slide-over modal that shows a single allocated component summary,
 * including logged-time totals and time-entry history.
 *
 * Data source: GET /allocations/:id/time-summary
 */

import { useEffect, useState } from 'react'
import api from '@/services/api'
import { formatCurrency } from '@/components/workflow/shared'


type TimeEntryRow = {
  id: string
  start_time: string
  end_time: string
  hours_worked: number
  description: string
}

type AllocationSummary = {
  allocation_id: string
  allocation: any
  budgeted_hours: number
  total_logged_hours: number
  remaining_hours: number
  efficiency_percentage: number
  allocated_fee: number
  time_entries: TimeEntryRow[]
}

function ReviewDisplay({ allocation }: { allocation: any }) {
  if (!allocation?.review_rating) return null

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
      <h3 className="text-sm font-semibold text-gray-800">Review</h3>
      <div className="flex items-center gap-2">
        <div className="flex">
          {[1, 2, 3, 4, 5].map((star) => (
            <svg
              key={star}
              className={`w-4 h-4 ${star <= allocation.review_rating ? 'text-yellow-400 fill-current' : 'text-gray-300'}`}
              viewBox="0 0 20 20"
            >
              <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
            </svg>
          ))}
        </div>
        <span className="text-sm font-medium text-gray-900">
          {allocation.review_rating} star{allocation.review_rating !== 1 ? 's' : ''}
        </span>
      </div>
      {allocation.review_comments && (
        <div>
          <p className="text-xs text-gray-500 mb-1">Comments:</p>
          <p className="text-sm text-gray-700">{allocation.review_comments}</p>
        </div>
      )}
      {allocation.reviewed_at && (
        <p className="text-xs text-gray-400">
          Reviewed on {new Date(allocation.reviewed_at).toLocaleDateString()}
        </p>
      )}
    </div>
  )
}

interface StaffInfo {
  id: string
  name: string
  role: string
  hourlyRate: number
  hoursPerDay: number
  productivityFactor: number
  efficiency: number
}

interface StaffMonthlySummaryModalProps {
  isOpen: boolean
  onClose: () => void
  allocation: any
  staffInfo?: StaffInfo | null
  symbol?: string
  selectedMonth?: string
}

export function StaffMonthlySummaryModal({
  isOpen,
  onClose,
  allocation,
  staffInfo,
  symbol = 'R',
  selectedMonth,
}: StaffMonthlySummaryModalProps) {
  const [data, setData] = useState<AllocationSummary | null>(null)
  const [loading, setLoading] = useState(false)
  const [workingDaysCount, setWorkingDaysCount] = useState<number | null>(null)
  const [calendarLoading, setCalendarLoading] = useState(false)
  const [staffSummary, setStaffSummary] = useState<{
    totalScheduledHours: number
    totalAllocatedFee: number
    allocations: Array<{ job_id: string; job_fee: number }>
  } | null>(null)
  const [summaryLoading, setSummaryLoading] = useState(false)

  useEffect(() => {
    if (!isOpen || !allocation?.id) return
    let cancelled = false
    const fetch = async () => {
      setLoading(true)
      setData(null)
      try {
        const res = await api.get(`/allocations/${allocation.id}/time-summary`)
        if (!cancelled) setData(res.data)
      } catch {
        // silently fail — modal shows empty state
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void fetch()
    return () => { cancelled = true }
  }, [isOpen, allocation?.id])

  useEffect(() => {
    if (!isOpen || !staffInfo || !selectedMonth) return
    let cancelled = false
    const fetch = async () => {
      setCalendarLoading(true)
      setWorkingDaysCount(null)
      try {
        const res = await api.get(`/planning/calendar?month=${selectedMonth}`)
        if (!cancelled) setWorkingDaysCount(res.data?.working_days_count ?? null)
      } catch {
        // silently fail
      } finally {
        if (!cancelled) setCalendarLoading(false)
      }
    }
    void fetch()
    return () => { cancelled = true }
  }, [isOpen, staffInfo, selectedMonth])

  useEffect(() => {
    if (!isOpen || !staffInfo?.id || !selectedMonth) return
    let cancelled = false
    const fetch = async () => {
      setSummaryLoading(true)
      setStaffSummary(null)
      try {
        const res = await api.get(`/staff/${staffInfo.id}/monthly-summary?month=${selectedMonth}`)
        if (!cancelled) {
          const total = res.data?.summary?.total_scheduled_hours
          const fee = res.data?.summary?.total_allocated_fee
          const allocations = res.data?.allocations || []
          setStaffSummary(total != null ? { totalScheduledHours: total, totalAllocatedFee: fee ?? 0, allocations } : null)
        }
      } catch {
        // silently fail
      } finally {
        if (!cancelled) setSummaryLoading(false)
      }
    }
    void fetch()
    return () => { cancelled = true }
  }, [isOpen, staffInfo?.id, selectedMonth])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex items-start justify-end min-h-screen">
        {/* Backdrop */}
        <div className="fixed inset-0 bg-gray-900/40 transition-opacity" onClick={onClose} />

        {/* Slide-over panel */}
        <div className="relative w-full max-w-lg h-screen bg-white shadow-2xl flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
            <div>
              <h2 className="text-base font-bold text-gray-900">{allocation?.staff_name || 'Allocation'}</h2>
              <p className="text-sm text-gray-500">Component summary · {allocation?.month || ''}</p>
            </div>
            <button
              onClick={onClose}
              className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Staff info */}
          {staffInfo ? (
            <div className="bg-white border border-gray-200 rounded-xl mx-6 mt-4 overflow-hidden">
              <div className="px-4 py-2.5 border-b border-gray-100">
                <p className="text-xs text-gray-400 uppercase tracking-wide font-medium">Staff Details</p>
              </div>
              <div className="divide-y divide-gray-100">
                <div className="flex justify-between items-center px-4 py-2.5">
                  <span className="text-xs font-medium text-gray-500">Name</span>
                  <span className="text-sm font-semibold text-gray-900">{staffInfo.name}</span>
                </div>
                <div className="flex justify-between items-center px-4 py-2.5">
                  <span className="text-xs font-medium text-gray-500">Role</span>
                  <span className="text-sm font-semibold text-gray-900">{staffInfo.role}</span>
                </div>
                <div className="flex justify-between items-center px-4 py-2.5">
                  <span className="text-xs font-medium text-gray-500">Rate</span>
                  <span className="text-sm font-semibold text-gray-900">{formatCurrency(staffInfo.hourlyRate, symbol)}/hr</span>
                </div>
                <div className="flex justify-between items-center px-4 py-2.5">
                  <span className="text-xs font-medium text-gray-500">Hours/Day</span>
                  <span className="text-sm font-semibold text-gray-900">{staffInfo.hoursPerDay}h</span>
                </div>
                <div className="flex justify-between items-center px-4 py-2.5">
                  <span className="text-xs font-medium text-gray-500">KPI</span>
                  <span className="text-sm font-semibold text-gray-900">{(staffInfo.productivityFactor * 100).toFixed(0)}%</span>
                </div>
                <div className="flex justify-between items-center px-4 py-2.5">
                  <span className="text-xs font-medium text-gray-500">Efficiency</span>
                  <span className="text-sm font-semibold text-gray-900">{(staffInfo.efficiency * 100).toFixed(0)}%</span>
                </div>
                <div className="flex justify-between items-center px-4 py-2.5">
                  <span className="text-xs font-medium text-gray-500">Working Days</span>
                  <span className="text-sm font-semibold text-gray-900">
                    {calendarLoading ? '…' : workingDaysCount != null ? `${workingDaysCount} days` : '—'}
                  </span>
                </div>
                {(() => {
                  const monthlyBudgetedHrs = workingDaysCount != null
                    ? workingDaysCount * staffInfo.hoursPerDay * staffInfo.productivityFactor
                    : null
                  return (
                    <>
                      <div className="flex justify-between items-center px-4 py-2.5 border-t border-gray-100">
                        <span className="text-xs font-medium text-gray-500">Monthly Budgeted Hours</span>
                        <span className="text-sm font-semibold text-gray-900">
                          {monthlyBudgetedHrs != null ? `${monthlyBudgetedHrs.toFixed(1)}h` : '—'}
                        </span>
                      </div>
                      <div className="flex justify-between items-center px-4 py-2.5">
                        <span className="text-xs font-medium text-gray-500">Allocated Budgeted Hours</span>
                        <span className="text-sm font-semibold text-gray-900">
                          {summaryLoading ? '…' : staffSummary != null ? `${staffSummary.totalScheduledHours.toFixed(1)}h` : '—'}
                        </span>
                      </div>
                      <div className="flex justify-between items-center px-4 py-2.5">
                        <span className="text-xs font-medium text-gray-500">Monthly Hours Left</span>
                        <span className="text-sm font-semibold text-gray-900">
                          {monthlyBudgetedHrs != null && staffSummary != null
                            ? `${Math.max(0, monthlyBudgetedHrs - staffSummary.totalScheduledHours).toFixed(1)}h`
                            : '—'}
                        </span>
                      </div>
                      <div className="flex justify-between items-center px-4 py-2.5 border-t border-gray-100">
                        <span className="text-xs font-medium text-gray-500">Total Job Fee</span>
                        <span className="text-sm font-semibold text-gray-900">
                          {staffSummary != null
                            ? (() => {
                                const seen = new Set<string>()
                                let total = 0
                                for (const a of staffSummary.allocations) {
                                  if (!seen.has(a.job_id)) { seen.add(a.job_id); total += a.job_fee }
                                }
                                return formatCurrency(total, symbol)
                              })()
                            : summaryLoading ? '…' : '—'}
                        </span>
                      </div>
                      <div className="flex justify-between items-center px-4 py-2.5">
                        <span className="text-xs font-medium text-gray-500">Total Job Budgeted WIP</span>
                        <span className="text-sm font-semibold text-gray-900">
                          {staffSummary != null
                            ? formatCurrency(staffSummary.totalAllocatedFee * staffInfo.efficiency, symbol)
                            : summaryLoading ? '…' : '—'}
                        </span>
                      </div>
                    </>
                  )
                })()}
              </div>
            </div>
          ) : (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mx-6 mt-4">
              <p className="text-sm text-amber-800">Select a staff member from the filter above to view their details here.</p>
            </div>
          )}

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {loading && (
              <div className="flex items-center justify-center py-16">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
              </div>
            )}

            {!loading && !data && (
              <div className="text-center py-16 text-gray-400">No summary available</div>
            )}

            {!loading && data && (
              <>
                {/* Allocation meta */}
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div className="bg-gray-50 rounded-xl p-3">
                    <p className="text-gray-500 text-xs mb-0.5">Client</p>
                    <p className="font-semibold text-gray-800">{allocation?.client_name || '—'}</p>
                  </div>
                  <div className="bg-gray-50 rounded-xl p-3">
                    <p className="text-gray-500 text-xs mb-0.5">Job</p>
                    <p className="font-semibold text-gray-800">{allocation?.job_name || '—'}</p>
                  </div>

                </div>

                 {/* Review Display */}
                 <ReviewDisplay allocation={data.allocation} />
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
