import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { toast } from 'sonner'

import { Sheet, SheetContent } from '@/components/ui/sheet'

import { formatCurrency } from '@/components/workflow/shared'
import api from '@/services/api'

interface StaffDetailPageProps {
  selectedMonth: string
  settings: any
}

function formatComponentLabel(key: string): string {
  const idx = key.indexOf(':')
  if (idx < 0) return key.toUpperCase()
  const service = key.slice(0, idx).toLowerCase()
  const role = key.slice(idx + 1)
  const serviceMap: Record<string, string> = {
    payroll: 'Payroll', p: 'Payroll',
    ma: 'MA', m: 'MA', management_accounts: 'MA',
    once_off: 'Once-off', general: 'General',
  }
  return `${serviceMap[service] ?? service}: ${role}`
}

function normalizeComponentKey(key: string | null | undefined): string {
  if (!key) return '__unspecified__'
  const [serviceRaw = 'general', ...roleParts] = String(key).split(':')
  const role = roleParts.join(':').trim() || 'unknown'
  const serviceToken = serviceRaw.trim().toLowerCase().replace(/[\s_-]+/g, '')

  const service =
    serviceToken === 'p' || serviceToken === 'payroll'
      ? 'payroll'
      : serviceToken === 'm' || serviceToken === 'ma' || serviceToken === 'managementaccounts' || serviceToken === 'managementaccount'
        ? 'ma'
        : serviceToken === 'onceoff' || serviceToken === 'onceoffservice' || serviceToken === 'onceoffjob'
          ? 'once_off'
          : serviceToken === 'general' || serviceToken === 'gen' || !serviceToken
            ? 'general'
            : serviceRaw.trim().toLowerCase()

  return `${service}:${role}`
}

function formatDeadline(dateStr: string | null | undefined): string {
  if (!dateStr) return '—'
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' })
}

function isOverdue(dateStr: string | null | undefined, jobStatus: string | null | undefined): boolean {
  if (!dateStr || jobStatus === 'Completed') return false
  return new Date(dateStr) < new Date()
}

function formatDateTime(dateStr: string | null | undefined): string {
  if (!dateStr) return '—'
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return '—'
  return d.toLocaleString('en-ZA', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatCalendarDuration(minutes: number | null | undefined): string {
  if (minutes === null || minutes === undefined || Number.isNaN(Number(minutes))) return '—'
  const total = Math.max(0, Math.round(Number(minutes)))
  const days = Math.floor(total / (60 * 24))
  const hours = Math.floor((total % (60 * 24)) / 60)
  const mins = total % 60
  if (days > 0) return `${days}d ${hours}h ${mins}m`
  if (hours > 0) return `${hours}h ${mins}m`
  return `${mins}m`
}

const WORKFLOW_STATUS_STYLES: Record<string, string> = {
  Pending: 'bg-gray-100 text-gray-700',
  Doing: 'bg-blue-100 text-blue-700',
  Completed: 'bg-green-100 text-green-700',
}

function normalizeJobStatus(status: string | null | undefined): 'Pending' | 'Doing' | 'Completed' {
  const value = String(status || '').trim().toLowerCase()
  if (value === 'completed' || value === 'complete' || value === 'closed' || value === 'done') return 'Completed'
  if (value === 'doing' || value === 'in progress' || value === 'in_progress') return 'Doing'
  return 'Pending'
}

export function StaffDetailPage({ selectedMonth, settings }: StaffDetailPageProps) {
  const SheetContentView: any = SheetContent
  const { id } = useParams<{ id: string }>()
  const [profile, setProfile] = useState<any>(null)
  const [summary, setSummary] = useState<any>(null)
  const [loadingProfile, setLoadingProfile] = useState(true)
  const [loadingSummary, setLoadingSummary] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [workflowActionFor, setWorkflowActionFor] = useState<string | null>(null)
  const [refreshTrigger, setRefreshTrigger] = useState(0)
  const [selectedJob, setSelectedJob] = useState<any>(null)
  const [jobAllocations, setJobAllocations] = useState<any[]>([])
  const [loadingJobAllocations, setLoadingJobAllocations] = useState(false)
  const [workingDaysCount, setWorkingDaysCount] = useState<number | null>(null)
  const [calendarLoading, setCalendarLoading] = useState(false)

  const symbol = settings?.currency_symbol || 'R'

  useEffect(() => {
    if (!id) return
    setLoadingProfile(true)
    api
      .get(`/staff/${id}`)
      .then((res) => setProfile(res.data?.data || res.data))
      .catch(() => setError('Staff member not found'))
      .finally(() => setLoadingProfile(false))
  }, [id])

  useEffect(() => {
    if (!id || !selectedMonth) return
    setLoadingSummary(true)
    api
      .get(`/staff/${id}/monthly-summary?month=${selectedMonth}`)
      .then((res) => setSummary(res.data))
      .catch(() => setSummary(null))
      .finally(() => setLoadingSummary(false))
  }, [id, selectedMonth, refreshTrigger])

  useEffect(() => {
    if (!id || !selectedMonth) return
    setCalendarLoading(true)
    api.get(`/planning/calendar?month=${selectedMonth}`)
      .then((res) => setWorkingDaysCount(res.data?.working_days_count ?? null))
      .catch(() => setWorkingDaysCount(null))
      .finally(() => setCalendarLoading(false))
  }, [id, selectedMonth])

  const hourlyRate = Number(summary?.hourly_rate || profile?.hourly_rate || 0)
  const productivityFactor = Number(summary?.productivity_factor ?? profile?.productivity_factor ?? 1)
  const monthlyBudgetedHrs = workingDaysCount != null
    ? workingDaysCount * (profile?.hours_per_day || 8) * productivityFactor
    : null

  // Group allocations by job_id — one row per job, component keys become columns
  const jobGroups = useMemo(() => {
    const allocations: any[] = summary?.allocations || []
    const groups: Record<
      string,
      {
        job_id: string
        client_name: string
        deadline: string | null
        job_status: string | null
        jobFee: number
        components: Record<string, {
          allocation_id: string | null
          percentage: number
          allocated_fee: number
          adjusted_hours: number
          workflow_status: string
          started_at: string | null
          completed_at: string | null
          assigned_to_started_minutes: number | null
          started_to_completed_minutes: number | null
        }>
        totalFee: number
        totalHours: number
      }
    > = {}

    for (const a of allocations) {
      // Defensive guard: render only allocations for this staff member.
      // (API already filters by staff_id, but this prevents accidental bleed-through.)
      if (a?.staff_id && id && String(a.staff_id) !== String(id)) continue

      const jid = a.job_id
      if (!jid) continue
      if (!groups[jid]) {
        groups[jid] = {
          job_id: jid,
          client_name: a.client_name || 'Unknown',
          deadline: a.deadline ?? null,
          job_status: a.job_status ?? null,
          jobFee: Number(a.job_fee ?? 0),
          components: {},
          totalFee: 0,
          totalHours: 0,
        }
      }
      const compKey = normalizeComponentKey(a.work_component_key)
      const existing = groups[jid].components[compKey]
      const statusRank: Record<string, number> = { Pending: 0, Doing: 1, Completed: 2 }
      const nextStatus = (() => {
        const current = existing?.workflow_status || 'Pending'
        const incoming = a.workflow_status || 'Pending'
        return (statusRank[incoming] ?? 0) > (statusRank[current] ?? 0) ? incoming : current
      })()
      groups[jid].components[compKey] = {
        allocation_id: existing?.allocation_id ?? a.allocation_id ?? null,
        percentage: Number(existing?.percentage ?? 0) + Number(a.percentage ?? 0),
        allocated_fee: Number(existing?.allocated_fee ?? 0) + Number(a.allocated_fee ?? 0),
        adjusted_hours: Number(existing?.adjusted_hours ?? 0) + Number(a.adjusted_hours ?? 0),
        workflow_status: nextStatus,
        started_at: existing?.started_at ?? a.started_at ?? null,
        completed_at: existing?.completed_at ?? a.completed_at ?? null,
        assigned_to_started_minutes: existing?.assigned_to_started_minutes ?? a.assigned_to_started_minutes ?? null,
        started_to_completed_minutes: existing?.started_to_completed_minutes ?? a.started_to_completed_minutes ?? null,
      }
      groups[jid].totalFee += Number(a.allocated_fee ?? 0)
      groups[jid].totalHours += Number(a.adjusted_hours ?? 0)
    }

    return Object.values(groups).sort((a, b) => a.client_name.localeCompare(b.client_name))
  }, [summary, id])

  const handleStartComponent = async (allocationId: string) => {
    setWorkflowActionFor(allocationId)
    try {
      await api.post(`/allocations/${allocationId}/start`, {
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      })
      toast.success('Component marked as doing')
      setRefreshTrigger((n) => n + 1)
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Failed to start component')
    } finally {
      setWorkflowActionFor(null)
    }
  }

  const handleCompleteComponent = async (allocationId: string) => {
    setWorkflowActionFor(allocationId)
    try {
      await api.post(`/allocations/${allocationId}/complete`, {
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      })
      toast.success('Component marked as completed')
      setRefreshTrigger((n) => n + 1)
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Failed to complete component')
    } finally {
      setWorkflowActionFor(null)
    }
  }

  const getAccessLevelBadge = (level: string) =>
    ({
      Full: 'bg-purple-100 text-purple-800',
      Admin: 'bg-blue-100 text-blue-800',
      Supervisor: 'bg-green-100 text-green-800',
      Standard: 'bg-gray-100 text-gray-800',
    } as Record<string, string>)[level] || 'bg-gray-100 text-gray-800'

  const openJobDrawer = async (g: any) => {
    setSelectedJob(g)
    setJobAllocations([])
    setLoadingJobAllocations(true)
    try {
      const res = await api.get(`/allocations?job_id=${g.job_id}&limit=100`)
      setJobAllocations(res.data?.data || [])
    } catch {
      setJobAllocations([])
    } finally {
      setLoadingJobAllocations(false)
    }
  }

  if (loadingProfile) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" />
      </div>
    )
  }

  if (error || !profile) {
    return (
      <div className="text-center py-16">
        <p className="text-gray-500">{error || 'Staff member not found'}</p>
        <Link to="/app/staff" className="mt-4 inline-block text-blue-600 hover:underline text-sm">
          ← Back to Staff
        </Link>
      </div>
    )
  }

  return (
    <>
    <div className="space-y-6">
      {/* ── Back link ── */}
      <Link
        to="/app/staff"
        className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-blue-600 transition-colors"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        Back to Staff
      </Link>

      {/* ── Profile card ── */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <div className="flex flex-col sm:flex-row sm:items-start gap-6">
          <div className="w-16 h-16 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
            <span className="text-2xl font-bold text-blue-600">
              {profile.name?.charAt(0)?.toUpperCase() || '?'}
            </span>
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-3 mb-1">
              <h2 className="text-2xl font-bold text-gray-900">{profile.name}</h2>
              <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${getAccessLevelBadge(profile.access_level)}`}>
                {profile.access_level}
              </span>
              {profile.is_archived ? (
                <span className="px-2 py-0.5 text-xs font-medium bg-gray-100 text-gray-600 rounded-full">Archived</span>
              ) : profile.is_active ? (
                <span className="px-2 py-0.5 text-xs font-medium bg-green-100 text-green-700 rounded-full">Active</span>
              ) : (
                <span className="px-2 py-0.5 text-xs font-medium bg-amber-100 text-amber-700 rounded-full">Pending Invitation</span>
              )}
            </div>
            <p className="text-gray-500 text-sm mb-1">{profile.role}</p>
            {profile.email && <p className="text-gray-400 text-sm">{profile.email}</p>}
            {profile.phone && <p className="text-gray-400 text-sm mt-0.5">{profile.phone}</p>}
            {profile.manager_name && (
              <p className="text-gray-400 text-xs mt-1">Supervisor: {profile.manager_name}</p>
            )}
          </div>
          <div className="flex flex-wrap gap-6 sm:gap-8">
            <div className="text-right">
              <p className="text-xs text-gray-500 uppercase tracking-wide">Rate / hr</p>
              <p className="text-lg font-bold text-gray-900">{formatCurrency(profile.hourly_rate, symbol)}</p>
            </div>
            <div className="text-right">
              <p className="text-xs text-gray-500 uppercase tracking-wide">Annual Budget</p>
              <p className="text-lg font-bold text-green-600">{formatCurrency(profile.annual_fee_budget || 0, symbol)}</p>
            </div>
            <div className="text-right">
              <p className="text-xs text-gray-500 uppercase tracking-wide">Monthly Budgeted Hours</p>
              <p className="text-lg font-bold text-gray-900">
                {calendarLoading ? '…' : monthlyBudgetedHrs != null ? `${monthlyBudgetedHrs.toFixed(1)}h` : `${(profile.available_hours_per_month || 160)}h`}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* ── Work assignments table ── */}
      <div>
        <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
          Work Assignments
        </h3>
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          {loadingSummary ? (
            <div className="p-10 text-center">
              <div className="animate-spin inline-block rounded-full h-8 w-8 border-b-2 border-blue-600" />
            </div>
          ) : jobGroups.length === 0 ? (
            <div className="p-10 text-center">
              <svg
                className="mx-auto h-12 w-12 text-gray-200 mb-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
                />
              </svg>
              <p className="text-gray-500 font-medium">No work assigned for {selectedMonth}</p>
              <p className="text-gray-400 text-sm mt-1">
                This staff member has no active allocations for this month.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap border-b border-gray-200">Client</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap border-b border-gray-200">Components</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap border-b border-gray-200">Est. Fee for Job</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap border-b border-gray-200">Completion %</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap border-b border-gray-200">Efficiency</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap border-b border-gray-200">Budgeted WIP</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap border-b border-gray-200">Budgeted Hrs</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap border-b border-gray-200">Deadline</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap border-b border-gray-200">Status</th>
                    <th className="border-b border-gray-200" />
                  </tr>
                </thead>
                <tbody>
                  {jobGroups.map((g) => {
                    const compEntries = Object.entries(g.components) as [string, any][]
                    const normalizedJobStatus = normalizeJobStatus(g.job_status)
                    const allComponentsCompleted = compEntries.length > 0 && compEntries.every(([, comp]) => (comp?.workflow_status || 'Pending') === 'Completed')
                    const displayJobStatus = allComponentsCompleted ? 'Completed' : normalizedJobStatus
                    const isCompleted = displayJobStatus === 'Completed'
                    const overdue = isOverdue(g.deadline, displayJobStatus)
                    const rowCount = compEntries.length || 1
                    return compEntries.map(([key, comp], compIdx) => {
                      const isFirst = compIdx === 0
                      const label = key === '__unspecified__' ? 'General' : formatComponentLabel(key)
                      const componentStatus = isCompleted ? 'Completed' : (comp.workflow_status || 'Pending')
                      return (
                        <tr
                          key={`${g.job_id}-${key}`}
                          className={`transition-colors hover:bg-blue-50/20 ${
                            isCompleted ? 'opacity-60' : ''
                          } ${
                            isFirst ? 'border-t-2 border-gray-200' : 'border-t border-gray-100'
                          }`}
                        >
                          {/* Client — spans all component rows */}
                          {isFirst && (
                            <td
                              rowSpan={rowCount}
                              className="px-4 py-3 font-semibold text-gray-900 whitespace-nowrap align-top border-r border-gray-100"
                            >
                              {g.client_name}
                            </td>
                          )}

                          {/* Component name + status badge */}
                          <td className="px-4 py-3 whitespace-nowrap">
                            <span
                              className={`inline-flex items-center gap-1.5 text-xs font-medium px-2 py-1 rounded-md ${
                                componentStatus === 'Completed'
                                  ? 'bg-green-50 text-green-700'
                                  : componentStatus === 'Doing'
                                    ? 'bg-blue-50 text-blue-700'
                                    : 'bg-gray-50 text-gray-600'
                              }`}
                            >
                              <span
                                className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                                  componentStatus === 'Completed'
                                    ? 'bg-green-500'
                                    : componentStatus === 'Doing'
                                      ? 'bg-blue-500'
                                      : 'bg-gray-400'
                                }`}
                              />
                              {label}
                            </span>
                          </td>

                          {/* Est. Fee for Job — spans all component rows */}
                          {isFirst && (
                            <td
                              rowSpan={rowCount}
                              className="px-4 py-3 text-right font-semibold text-gray-800 whitespace-nowrap align-top border-l border-gray-100"
                            >
                              {formatCurrency(g.jobFee || g.totalFee, symbol)}
                            </td>
                          )}

                          {/* Completion % */}
                          <td className="px-4 py-3 text-right font-semibold text-blue-700 whitespace-nowrap">
                            {comp.percentage}%
                          </td>

                          {/* Efficiency — spans all component rows */}
                          {isFirst && (
                            <td
                              rowSpan={rowCount}
                              className="px-4 py-3 text-right text-gray-600 whitespace-nowrap align-top"
                            >
                              {Math.round(productivityFactor * 100)}%
                            </td>
                          )}

                          {/* Budgeted WIP */}
                          <td className="px-4 py-3 text-right text-green-600 font-medium whitespace-nowrap">
                            {formatCurrency((g.jobFee || g.totalFee) * comp.percentage / 100 * productivityFactor, symbol)}
                          </td>

                          {/* Budgeted Hrs */}
                          <td className="px-4 py-3 text-right text-gray-600 whitespace-nowrap">
                            {hourlyRate > 0
                              ? (((g.jobFee || g.totalFee) * comp.percentage / 100 * productivityFactor) / hourlyRate).toFixed(2)
                              : Math.round(comp.adjusted_hours)}
                            h
                          </td>

                          {/* Deadline — spans all component rows */}
                          {isFirst && (
                            <td
                              rowSpan={rowCount}
                              className={`px-4 py-3 text-center whitespace-nowrap align-top border-l border-gray-100 text-sm ${
                                overdue ? 'text-red-600 font-medium' : 'text-gray-500'
                              }`}
                            >
                              {g.deadline ? (
                                <>{formatDeadline(g.deadline)}{overdue && <span className="ml-1">⚠</span>}</>
                              ) : (
                                <span className="text-gray-300 text-xs italic">No deadline</span>
                              )}
                            </td>
                          )}

                          {/* Status — spans all component rows */}
                          {isFirst && (
                            <td rowSpan={rowCount} className="px-4 py-3 text-center align-top border-l border-gray-100">
                              <span
                                className={`inline-flex items-center px-2 py-1 text-xs font-medium rounded-full ${
                                  g.job_status === 'Completed'
                                    ? 'bg-green-100 text-green-700'
                                    : displayJobStatus === 'Doing'
                                      ? 'bg-blue-100 text-blue-700'
                                      : 'bg-gray-100 text-gray-700'
                                }`}
                              >
                                {displayJobStatus}
                              </span>
                            </td>
                          )}

                          {/* Details button — spans all component rows */}
                          {isFirst && (
                            <td rowSpan={rowCount} className="px-4 py-3 text-right align-top">
                              <button
                                onClick={() => openJobDrawer(g)}
                                className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-blue-600 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors whitespace-nowrap"
                              >
                                Details
                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                </svg>
                              </button>
                            </td>
                          )}
                        </tr>
                      )
                    })
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>

    {/* ── Job Details Drawer ── */}
    <Sheet open={!!selectedJob} onOpenChange={(open) => { if (!open) setSelectedJob(null) }}>
      <SheetContentView side="right" className="sm:max-w-lg w-full flex flex-col p-0 overflow-hidden">
        {selectedJob && (
          <>
            {/* Drawer header */}
            <div className="px-6 py-5 border-b border-gray-100 bg-gray-50" style={{ paddingRight: '3.5rem' }}>
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Job Details</p>
                  <h2 className="text-lg font-bold text-gray-900 truncate">{selectedJob.client_name}</h2>
                  <div className="flex items-center flex-wrap gap-2 mt-2">
                    <span
                      className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                        normalizeJobStatus(selectedJob.job_status) === 'Completed'
                          ? 'bg-green-100 text-green-700'
                          : normalizeJobStatus(selectedJob.job_status) === 'Doing'
                            ? 'bg-blue-100 text-blue-700'
                            : 'bg-gray-100 text-gray-700'
                      }`}
                    >
                      {normalizeJobStatus(selectedJob.job_status)}
                    </span>
                    {selectedJob.deadline ? (
                      <span
                        className={`flex items-center gap-1 text-xs ${
                          isOverdue(selectedJob.deadline, normalizeJobStatus(selectedJob.job_status))
                            ? 'text-red-600 font-medium'
                            : 'text-gray-500'
                        }`}
                      >
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                        {formatDeadline(selectedJob.deadline)}
                        {isOverdue(selectedJob.deadline, normalizeJobStatus(selectedJob.job_status)) && ' ⚠'}
                      </span>
                    ) : (
                      <span className="text-xs text-gray-400 italic">No deadline set</span>
                    )}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-[10px] text-gray-400 uppercase tracking-wide">Total Fee</p>
                  <p className="text-base font-bold text-green-600">{formatCurrency(selectedJob.totalFee, symbol)}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{Math.round(selectedJob.totalHours)}h scheduled</p>
                  {monthlyBudgetedHrs != null && (
                    <p className="text-xs text-gray-400 mt-0.5">{monthlyBudgetedHrs.toFixed(1)}h budgeted</p>
                  )}
                </div>
              </div>
            </div>

            {/* Component cards — scrollable body */}
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider px-1">
                Work Components
              </p>

              {loadingJobAllocations ? (
                <div className="flex items-center justify-center py-10">
                  <div className="animate-spin rounded-full h-7 w-7 border-b-2 border-blue-600" />
                </div>
              ) : (() => {
                // Group fetched allocations by normalised component key
                const compGroups: Record<string, any[]> = {}
                for (const a of jobAllocations) {
                  const k = normalizeComponentKey(a.work_component_key)
                  if (!compGroups[k]) compGroups[k] = []
                  compGroups[k].push(a)
                }
                // Ensure every key the current staff has is represented even if API missed it
                for (const k of Object.keys(selectedJob.components)) {
                  if (!compGroups[k]) compGroups[k] = []
                }
                const sortedKeys = Object.keys(compGroups).sort((a, b) => {
                  const svcA = a.split(':')[0].toLowerCase()
                  const svcB = b.split(':')[0].toLowerCase()
                  if (svcA !== svcB) return svcA.localeCompare(svcB)
                  return a.localeCompare(b)
                })

                return sortedKeys.map((key) => {
                  const label = key === '__unspecified__' ? 'General' : formatComponentLabel(key)
                  const staffList = compGroups[key]
                  const selectedJobCompEntries = Object.values(selectedJob?.components || {}) as any[]
                  const selectedJobAllComponentsCompleted = selectedJobCompEntries.length > 0 && selectedJobCompEntries.every((comp: any) => (comp?.workflow_status || 'Pending') === 'Completed')
                  const jobIsCompleted = normalizeJobStatus(selectedJob?.job_status) === 'Completed' || selectedJobAllComponentsCompleted
                  // Overall component status: highest rank across all staff
                  const rankMap: Record<string, number> = { Pending: 0, Doing: 1, Completed: 2 }
                  const aggregatedStatus = staffList.reduce((best, a) => {
                    const s = a.workflow_status || 'Pending'
                    return (rankMap[s] ?? 0) > (rankMap[best] ?? 0) ? s : best
                  }, 'Pending')
                  const overallStatus = jobIsCompleted ? 'Completed' : aggregatedStatus
                  const headerStyle = WORKFLOW_STATUS_STYLES[overallStatus] || WORKFLOW_STATUS_STYLES.Pending

                  return (
                    <div key={key} className="rounded-xl border border-gray-100 bg-white shadow-sm overflow-hidden">
                      {/* Card header */}
                      <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-b border-gray-100">
                        <span className="font-semibold text-sm text-gray-800">{label}</span>
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${headerStyle}`}>
                          {overallStatus}
                        </span>
                      </div>

                      {/* One section per staff member assigned to this component */}
                      <div className="divide-y divide-gray-100">
                        {staffList.length > 0 ? staffList.map((a: any, i: number) => {
                          const isMe = String(a.staff_id) === String(id)
                          const sName = a.staff_name || 'Unknown'
                          const wStatus = jobIsCompleted ? 'Completed' : (a.workflow_status || 'Pending')
                          const sStyle = WORKFLOW_STATUS_STYLES[wStatus] || WORKFLOW_STATUS_STYLES.Pending
                          const startedFmt = formatDateTime(a.started_at)
                          const completedFmt = formatDateTime(a.completed_at)
                          const timeToStart = formatCalendarDuration(a.assigned_to_started_minutes)
                          const timeToComplete = formatCalendarDuration(a.started_to_completed_minutes)
                          const hasTimeline = startedFmt !== '—' || completedFmt !== '—' || timeToStart !== '—' || timeToComplete !== '—'

                          return (
                            <div key={i} className={`px-4 py-3 space-y-3 ${isMe ? 'bg-blue-50/30' : ''}`}>
                              {/* Staff identity + status */}
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                                    isMe ? 'bg-blue-200 text-blue-700' : 'bg-gray-200 text-gray-600'
                                  }`}>
                                    {sName.charAt(0).toUpperCase()}
                                  </div>
                                  <div>
                                    <p className={`text-sm font-medium leading-tight ${
                                      isMe ? 'text-blue-700' : 'text-gray-800'
                                    }`}>
                                      {sName}
                                      {isMe && <span className="ml-1 text-[10px] text-blue-400 font-normal">(you)</span>}
                                    </p>
                                    {a.staff_role && <p className="text-[10px] text-gray-400">{a.staff_role}</p>}
                                  </div>
                                </div>
                                <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${sStyle}`}>
                                  {wStatus}
                                </span>
                              </div>

                              {/* Stats */}
                              <div className="flex items-center gap-5">
                                <div>
                                  <p className="text-[10px] text-gray-400 uppercase tracking-wide">Completion</p>
                                  <p className="text-sm font-bold text-blue-700">{a.percentage || 0}%</p>
                                </div>
                                <div>
                                  <p className="text-[10px] text-gray-400 uppercase tracking-wide">Budgeted Hrs</p>
                                  <p className="text-sm font-bold text-gray-800">
                                    {(() => {
                                      const jFee = Number(a.job_fee || selectedJob?.jobFee || selectedJob?.totalFee || 0)
                                      const pct = Number(a.percentage || 0)
                                      return hourlyRate > 0
                                        ? (jFee * pct / 100 * productivityFactor / hourlyRate).toFixed(2)
                                        : Math.round(Number(a.adjusted_hours || 0))
                                    })()}h
                                  </p>
                                </div>
                                <div>
                                  <p className="text-[10px] text-gray-400 uppercase tracking-wide">Budgeted WIP</p>
                                  <p className="text-sm font-bold text-green-600">
                                    {formatCurrency(
                                      Number(a.job_fee || selectedJob?.jobFee || selectedJob?.totalFee || 0) * Number(a.percentage || 0) / 100 * productivityFactor,
                                      symbol
                                    )}
                                  </p>
                                </div>
                              </div>

                              {/* Timeline — only when values exist */}
                              {hasTimeline && (
                                <div className="border-t border-gray-100 pt-2 space-y-1.5">
                                  {startedFmt !== '—' && (
                                    <div className="flex items-center justify-between text-xs">
                                      <span className="flex items-center gap-1.5 text-gray-400">
                                        <svg className="w-3.5 h-3.5 text-blue-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                        </svg>
                                        Started
                                      </span>
                                      <span className="font-medium text-gray-700">{startedFmt}</span>
                                    </div>
                                  )}
                                  {completedFmt !== '—' && (
                                    <div className="flex items-center justify-between text-xs">
                                      <span className="flex items-center gap-1.5 text-gray-400">
                                        <svg className="w-3.5 h-3.5 text-green-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                        </svg>
                                        Completed
                                      </span>
                                      <span className="font-medium text-gray-700">{completedFmt}</span>
                                    </div>
                                  )}
                                  {timeToStart !== '—' && (
                                    <div className="flex items-center justify-between text-xs">
                                      <span className="flex items-center gap-1.5 text-gray-400">
                                        <svg className="w-3.5 h-3.5 text-amber-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                        </svg>
                                        Time to start
                                      </span>
                                      <span className="font-medium text-gray-700">{timeToStart}</span>
                                    </div>
                                  )}
                                  {timeToComplete !== '—' && (
                                    <div className="flex items-center justify-between text-xs">
                                      <span className="flex items-center gap-1.5 text-gray-400">
                                        <svg className="w-3.5 h-3.5 text-purple-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                                        </svg>
                                        Time to complete
                                      </span>
                                      <span className="font-medium text-gray-700">{timeToComplete}</span>
                                    </div>
                                  )}
                                </div>
                              )}

                              {/* Action buttons — only for current staff member */}
                              {isMe && a.allocation_id && !jobIsCompleted && wStatus !== 'Completed' && (
                                <div className="flex gap-2 pt-2 border-t border-gray-100">
                                  <button
                                    onClick={() => handleStartComponent(a.allocation_id)}
                                    disabled={workflowActionFor === a.allocation_id || wStatus === 'Doing'}
                                    className="flex-1 py-2 text-xs rounded-lg bg-blue-50 text-blue-700 font-medium hover:bg-blue-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                                  >
                                    {workflowActionFor === a.allocation_id ? '…' : '▶  Start'}
                                  </button>
                                  <button
                                    onClick={() => handleCompleteComponent(a.allocation_id)}
                                    disabled={workflowActionFor === a.allocation_id}
                                    className="flex-1 py-2 text-xs rounded-lg bg-green-50 text-green-700 font-medium hover:bg-green-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                                  >
                                    {workflowActionFor === a.allocation_id ? '…' : '✓  Done'}
                                  </button>
                                </div>
                              )}
                            </div>
                          )
                        }) : (
                          <p className="px-4 py-3 text-xs text-gray-400 italic">No staff assigned</p>
                        )}
                      </div>
                    </div>
                  )
                })
              })()}
            </div>
          </>
        )}
      </SheetContentView>
    </Sheet>
    </>
  )
}
