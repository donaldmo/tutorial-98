import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'

import { AllocateStaffModal } from '@/components/workflow/AllocateStaffModal'
import { formatCurrency, getStatusColor, Icons } from '@/components/workflow/shared'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { ChevronDown } from 'lucide-react'
import api from '@/services/api'

function fmtDeadline(d: string | null | undefined) {
  if (!d) return '—'
  const dt = new Date(d)
  return isNaN(dt.getTime()) ? '—' : dt.toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' })
}

function isOverdue(dateStr: string | null | undefined, status: string | null | undefined) {
  if (!dateStr || status === 'Completed') return false
  return new Date(dateStr) < new Date()
}

function formatDateTime(dateStr: string | null | undefined) {
  if (!dateStr) return '—'
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return '—'
  return d.toLocaleString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function formatDate(dateStr: string | null | undefined) {
  if (!dateStr) return '—'
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' })
}

function getFrequencyLabel(job: any) {
  if (!job.is_recurring) return 'Once Off'
  const labels: Record<string, string> = { monthly: 'Monthly', 'bi-monthly': 'Bi-Monthly', quarterly: 'Quarterly', biannually: 'Biannually', annually: 'Annually' }
  return labels[job.recurrence_type] || 'Recurring'
}

export function JobDetailPage({ settings }: any) {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const symbol = settings?.currency_symbol || 'R'

  const [job, setJob] = useState<any>(null)
  const [allocations, setAllocations] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [allocateModal, setAllocateModal] = useState(false)
  const [clientJobs, setClientJobs] = useState<any[]>([])
  const [clientJobsLoading, setClientJobsLoading] = useState(false)
  const [activeTab, setActiveTab] = useState<'current' | 'historical'>('current')

  useEffect(() => {
    if (!id) return
    setLoading(true)
    api
      .get(`/jobs/${id}`)
      .then((res) => setJob(res.data))
      .catch(() => {
        toast.error('Job not found')
        navigate('/app/jobs')
      })
      .finally(() => setLoading(false))
  }, [id, navigate])

  useEffect(() => {
    if (!job?.id) {
      setClientJobs([])
      return
    }

    setClientJobsLoading(true)

    const request = job.client_id
      ? api.get(`/jobs?client_id=${encodeURIComponent(String(job.client_id))}&limit=200`)
      : api.get(`/jobs?search=${encodeURIComponent(String(job.client_name || ''))}&limit=200`)

    request
      .then((res) => {
        const rows = (res.data?.data ?? res.data ?? []) as any[]
        const normalized = rows.filter((candidate) => {
          if (!candidate?.id) return false
          if (job.client_id && candidate.client_id) return String(candidate.client_id) === String(job.client_id)
          return String(candidate.client_name || '').trim().toLowerCase() === String(job.client_name || '').trim().toLowerCase()
        })
        const map = new Map<string, any>()
        ;[job, ...normalized].forEach((candidate) => {
          if (candidate?.id) map.set(String(candidate.id), candidate)
        })
        setClientJobs(Array.from(map.values()))
      })
      .catch(() => setClientJobs(job ? [job] : []))
      .finally(() => setClientJobsLoading(false))
  }, [job?.id, job?.client_id, job?.client_name, job])

  const activeJob = useMemo(() => {
    if (!job) return null

    const pool = (clientJobs.length ? clientJobs : [job]).filter((item) => item?.id)
    const toStamp = (item: any) => new Date(item.createdAt || item.created_at || 0).getTime()

    const now = new Date()
    const currentMonthJobs = pool.filter((item) => {
      const stamp = toStamp(item)
      if (!Number.isFinite(stamp) || stamp <= 0) return false
      const d = new Date(stamp)
      return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()
    })

    const sortDesc = (a: any, b: any) => toStamp(b) - toStamp(a)
    if (currentMonthJobs.length > 0) return [...currentMonthJobs].sort(sortDesc)[0]
    return [...pool].sort(sortDesc)[0] || job
  }, [job, clientJobs])

  const historicalJobs = useMemo(() => {
    if (!activeJob?.id) return []
    const toStamp = (item: any) => new Date(item.createdAt || item.created_at || 0).getTime()
    return clientJobs
      .filter((item) => item?.id && String(item.id) !== String(activeJob.id))
      .sort((a, b) => toStamp(b) - toStamp(a))
  }, [clientJobs, activeJob?.id])

  useEffect(() => {
    if (!activeJob?.id) {
      setAllocations([])
      return
    }
    api.get(`/allocations?job_id=${activeJob.id}&limit=100`)
      .then((res) => setAllocations(res.data?.data || []))
      .catch(() => setAllocations([]))
  }, [activeJob?.id])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600" />
      </div>
    )
  }

  if (!job || !activeJob) return null

  const totalScheduledHours = Math.round(allocations.reduce((sum, a) => sum + Number(a.adjusted_hours || 0), 0))

  const jobTypeLabel = (activeJob.job_type_entries || [])
    .map((e: any) => e.job_type_name || '')
    .filter(Boolean)
    .join(' & ')
  const addedBy = activeJob.created_by_name
    || activeJob.created_by
    || activeJob.createdByName
    || activeJob.createdBy
    || activeJob.added_by
    || activeJob.addedBy
    || '—'
  const createdAt = formatDateTime(activeJob.createdAt || activeJob.created_at)
  const updatedAt = formatDateTime(activeJob.updatedAt || activeJob.updated_at)
  const submissionDate = formatDate(activeJob.submission_date)
  const recurrenceStart = formatDate(activeJob.recurrence_start_date)
  const recurrenceEnd = formatDate(activeJob.recurrence_end_date)
  const allocationStatus = activeJob.status || '—'
  const allocatedPct = Number(activeJob.total_allocated_percentage || 0)

  return (
    <div className="w-full space-y-6">
      {/* ── Header card ── */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
        <div className="flex items-start justify-between gap-6">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <button
                onClick={() => navigate('/app/jobs')}
                className="text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1"
              >
                ← Jobs
              </button>
            </div>
            <h1 className="text-2xl font-bold text-gray-900 truncate">{activeJob.client_name}</h1>
            <p className="text-sm text-gray-500 mt-0.5 truncate">
              {activeJob.name}{jobTypeLabel ? ` · ${jobTypeLabel}` : ''}
            </p>
            <div className="flex flex-wrap items-center gap-2 mt-3">
              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${getStatusColor(activeJob.status)}`}>{activeJob.status}</span>
              {activeJob.is_recurring && (
                <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-purple-100 text-purple-700">{getFrequencyLabel(activeJob)}</span>
              )}
              {activeJob.is_retainer && (
                <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-blue-100 text-blue-700">Retainer</span>
              )}
              {activeJob.deadline && (
                <span className={`flex items-center gap-1 text-xs ${isOverdue(activeJob.deadline, activeJob.status) ? 'text-red-600 font-medium' : 'text-gray-500'}`}>
                  📅 {fmtDeadline(activeJob.deadline)}{isOverdue(activeJob.deadline, activeJob.status) ? ' ⚠ Overdue' : ''}
                </span>
              )}
              {activeJob.priority && (
                <span className="text-xs text-gray-500">Priority: <strong>{activeJob.priority}</strong></span>
              )}
              <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700">
                Showing: {activeJob.id === job.id ? 'Selected Job' : 'Current/Latest Job'}
              </span>
            </div>
          </div>
          <div className="flex flex-col items-end gap-3 shrink-0">
            <div className="text-right">
              <p className="text-[10px] text-gray-400 uppercase tracking-wide">Total Fee</p>
              <p className="text-xl font-bold text-green-600">{formatCurrency(Number(activeJob.job_fee || 0), symbol)}</p>
              <p className="text-xs text-gray-400 mt-0.5">{totalScheduledHours}h scheduled</p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setAllocateModal(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm font-medium"
              >
                <Icons.Users /> Allocate
              </button>
              <button
                onClick={() => navigate(`/app/jobs/${activeJob.id}/edit`)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium"
              >
                <Icons.Edit /> Edit
              </button>
              {activeJob.status !== 'Completed' && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="secondary" size="sm" className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium">
                      <ChevronDown className="h-3.5 w-3.5" /> Status
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-48">
                    {['Pending', 'Partially Allocated', 'Fully Allocated', 'In Progress', 'Completed', 'On Hold'].map((s) => (
                      <DropdownMenuItem
                        key={s}
                        disabled={s === activeJob.status}
                        onSelect={async () => {
                          try {
                            await api.patch(`/jobs/${activeJob.id}/status`, { status: s })
                            toast.success(`Status changed to "${s}"`)
                            api.get(`/jobs/${activeJob.id}`).then((res) => setJob(res.data))
                          } catch (err: any) {
                            toast.error(err.response?.data?.detail || 'Failed to update status')
                          }
                        }}
                      >
                        <span className={`h-2 w-2 rounded-full mr-2 ${getStatusColor(s).split(' ')[0]}`} />
                        {s}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          </div>
        </div>

        {/* Fee breakdown row */}
        {(activeJob.job_type_entries || []).length > 0 && (
          <div className="mt-4 pt-4 border-t border-gray-100 flex flex-wrap gap-6">
            {(activeJob.job_type_entries || []).map((entry: any, i: number) => {
              const fee = Number(entry.fee || 0)
              if (!fee) return null
              return (
                <div key={i}>
                  <p className="text-[10px] text-gray-400 uppercase tracking-wide">{entry.job_type_name || 'Service'} Fee</p>
                  <p className="text-sm font-bold text-blue-700">{formatCurrency(fee, symbol)}</p>
                </div>
              )
            })}
            {activeJob.is_retainer && activeJob.retainer_fee && (
              <div>
                <p className="text-[10px] text-gray-400 uppercase tracking-wide">Monthly Retainer</p>
                <p className="text-sm font-bold text-gray-700">{formatCurrency(Number(activeJob.retainer_fee), symbol)}</p>
              </div>
            )}
            {activeJob.description && (
              <div className="w-full">
                <p className="text-[10px] text-gray-400 uppercase tracking-wide mb-1">Notes</p>
                <p className="text-sm text-gray-600">{activeJob.description}</p>
              </div>
            )}
          </div>
        )}

        <div className="mt-4 pt-4 border-t border-gray-100">
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-3">Metadata</p>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="rounded-lg border border-gray-100 bg-gray-50/70 px-3 py-2">
              <p className="text-[10px] text-gray-400 uppercase tracking-wide">Date Created</p>
              <p className="text-sm font-medium text-gray-800 mt-0.5">{createdAt}</p>
            </div>
            <div className="rounded-lg border border-gray-100 bg-gray-50/70 px-3 py-2">
              <p className="text-[10px] text-gray-400 uppercase tracking-wide">Added By</p>
              <p className="text-sm font-medium text-gray-800 mt-0.5">{String(addedBy)}</p>
            </div>
            <div className="rounded-lg border border-gray-100 bg-gray-50/70 px-3 py-2">
              <p className="text-[10px] text-gray-400 uppercase tracking-wide">Last Updated</p>
              <p className="text-sm font-medium text-gray-800 mt-0.5">{updatedAt}</p>
            </div>
          </div>

          <details className="mt-3 rounded-lg border border-gray-200 bg-white">
            <summary className="cursor-pointer select-none px-3 py-2 text-xs font-medium text-blue-700 hover:text-blue-800">
              Show more metadata
            </summary>
            <div className="px-3 pb-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                <div className="rounded-lg border border-gray-100 bg-gray-50/70 px-3 py-2">
                  <p className="text-[10px] text-gray-400 uppercase tracking-wide">Financial Year</p>
                  <p className="text-sm font-medium text-gray-800 mt-0.5">{activeJob.financial_year || '—'}</p>
                </div>
                <div className="rounded-lg border border-gray-100 bg-gray-50/70 px-3 py-2">
                  <p className="text-[10px] text-gray-400 uppercase tracking-wide">Submission Date</p>
                  <p className="text-sm font-medium text-gray-800 mt-0.5">{submissionDate}</p>
                </div>
                <div className="rounded-lg border border-gray-100 bg-gray-50/70 px-3 py-2">
                  <p className="text-[10px] text-gray-400 uppercase tracking-wide">Minimum Role</p>
                  <p className="text-sm font-medium text-gray-800 mt-0.5">{activeJob.minimum_role || 'Any'}</p>
                </div>
                <div className="rounded-lg border border-gray-100 bg-gray-50/70 px-3 py-2">
                  <p className="text-[10px] text-gray-400 uppercase tracking-wide">Department</p>
                  <p className="text-sm font-medium text-gray-800 mt-0.5">{activeJob.department_id || '—'}</p>
                </div>
                <div className="rounded-lg border border-gray-100 bg-gray-50/70 px-3 py-2">
                  <p className="text-[10px] text-gray-400 uppercase tracking-wide">Allocation Status</p>
                  <p className="text-sm font-medium text-gray-800 mt-0.5">{allocationStatus}</p>
                </div>
                <div className="rounded-lg border border-gray-100 bg-gray-50/70 px-3 py-2">
                  <p className="text-[10px] text-gray-400 uppercase tracking-wide">Allocated %</p>
                  <p className="text-sm font-medium text-gray-800 mt-0.5">{allocatedPct.toFixed(2)}%</p>
                </div>
                <div className="rounded-lg border border-gray-100 bg-gray-50/70 px-3 py-2 lg:col-span-2">
                  <p className="text-[10px] text-gray-400 uppercase tracking-wide">Recurring Window</p>
                  <p className="text-sm font-medium text-gray-800 mt-0.5">{recurrenceStart} → {recurrenceEnd}</p>
                </div>
              </div>
            </div>
          </details>
        </div>
      </div>

      {/* ── Job Component Split ── */}
      {activeJob.job_type_entries?.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="bg-gray-50 px-6 py-3 border-b border-gray-100">
            <h3 className="text-sm font-semibold text-gray-700">Job Component Split</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/50">
                  <th className="px-6 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Job Type</th>
                  <th className="px-6 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Component</th>
                  <th className="px-6 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">%</th>
                  <th className="px-6 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {activeJob.job_type_entries.map((entry: any, ei: number) => {
                  const entryFee = Number(entry.fee) || 0
                  if (!entryFee) return null
                  const comps = entry.work_components || []
                  const rowSpan = comps.length || 1
                  return comps.map((c: any, ci: number) => {
                    const pct = Number(c.percentage || 0)
                    const amount = (entryFee * pct) / 100
                    return (
                      <tr key={`${ei}-${ci}`}>
                        {ci === 0 && (
                          <td className="px-6 py-3 align-top" rowSpan={rowSpan}>
                            <p className="font-semibold text-gray-800">{entry.job_type_name || 'Service'}</p>
                            <p className="text-xs font-medium text-green-600 mt-0.5">{formatCurrency(entryFee, symbol)}</p>
                          </td>
                        )}
                        <td className="px-6 py-3 text-gray-700">{c.role || c.name}</td>
                        <td className="px-6 py-3 text-right text-gray-500">{pct.toFixed(0)}%</td>
                        <td className="px-6 py-3 text-right font-medium text-gray-800">{formatCurrency(amount, symbol)}</td>
                      </tr>
                    )
                  })
                })}
              </tbody>
              <tfoot>
                <tr className="border-t border-gray-200 bg-gray-50">
                  <td className="px-6 py-3 text-sm font-semibold text-gray-700" colSpan={3}>Service Fee</td>
                  <td className="px-6 py-3 text-right text-sm font-bold text-green-700">{formatCurrency(Number(activeJob.job_fee || 0), symbol)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      <div className="flex items-center gap-2 border-b border-gray-200 pb-2">
        <button
          onClick={() => setActiveTab('current')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${activeTab === 'current' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
        >
          Current Job
        </button>
        <button
          onClick={() => setActiveTab('historical')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${activeTab === 'historical' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
        >
          Historical Jobs
        </button>
      </div>

      {activeTab === 'historical' ? (
        <div>
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3 px-1">Historical Jobs</h2>

        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          {clientJobsLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600" />
            </div>
          ) : historicalJobs.length === 0 ? (
            <div className="px-6 py-6 text-sm text-gray-400 italic">No historical jobs found for this client.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px]">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Job</th>
                    <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase">FY</th>
                    <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Deadline</th>
                    <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Status</th>
                    <th className="px-4 py-2 text-right text-xs font-semibold text-gray-500 uppercase">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {historicalJobs.map((related) => (
                    <tr key={related.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-sm text-gray-800">{related.name || 'Untitled job'}</td>
                      <td className="px-4 py-3 text-sm text-gray-600">{related.financial_year || '—'}</td>
                      <td className="px-4 py-3 text-sm text-gray-600">{fmtDeadline(related.deadline)}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${getStatusColor(related.status || 'Pending')}`}>
                          {related.status || 'Pending'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => navigate(`/app/jobs/${related.id}`)}
                          className="text-xs font-medium text-indigo-600 hover:text-indigo-700"
                        >
                          Open
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
      ) : null}

      <AllocateStaffModal
        job={allocateModal ? activeJob : null}
        symbol={symbol}
        onClose={() => setAllocateModal(false)}
        onSuccess={() => {
          api.get(`/allocations?job_id=${activeJob.id}&limit=100`).then((res) => setAllocations(res.data?.data || []))
        }}
      />
    </div>
  )
}
