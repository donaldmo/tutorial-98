import { useCallback, useEffect, useState } from 'react'
import moment from 'moment'
import { toast } from 'sonner'

import { DestructiveConfirmModal } from '@/components/common/DestructiveConfirmModal'
import api from '@/services/api'
import { COMPLETED_JOB_LOCK_MESSAGE } from '@/lib/allocationMessages'
import { Icons, Modal, formatCurrency } from '@/components/workflow/shared'

export function ClickableStatCard({ title, value, subtitle, icon: Icon, color = 'blue', onClick, compact = false }: any) {
  const colorClasses: Record<string, string> = {
    blue: 'bg-blue-50 text-blue-600',
    green: 'bg-green-50 text-green-600',
    yellow: 'bg-yellow-50 text-yellow-600',
    red: 'bg-red-50 text-red-600',
    purple: 'bg-purple-50 text-purple-600',
    orange: 'bg-orange-50 text-orange-600',
  }
  return (
    <div
      onClick={onClick}
      className={`bg-white rounded-xl shadow-sm border border-gray-100 hover:shadow-md transition-all ${compact ? 'p-4' : 'p-6'} ${onClick ? 'cursor-pointer hover:border-blue-300' : ''}`}
      data-testid="stat-card"
    >
      <div className="flex items-center justify-between">
        <div>
          <p className={`${compact ? 'text-xs' : 'text-sm'} font-medium text-gray-500`}>{title}</p>
          <p className={`${compact ? 'text-xl' : 'text-2xl'} mt-1 font-bold text-gray-900`}>{value}</p>
          {subtitle && <p className={`${compact ? 'text-xs' : 'text-sm'} mt-1 text-gray-500`}>{subtitle}</p>}
        </div>
        <div className={`${compact ? 'rounded-lg p-2.5' : 'rounded-xl p-3'} ${colorClasses[color] || colorClasses.blue}`}><Icon /></div>
      </div>
      {onClick && <p className="mt-2 text-xs text-blue-600">Click for details →</p>}
    </div>
  )
}

export function ProgressBar({ percentage }: { percentage: number }) {
  const bgClass = percentage >= 90 ? 'bg-red-500' : percentage >= 70 ? 'bg-yellow-500' : 'bg-green-500'
  return <div className="w-full bg-gray-200 rounded-full h-2.5"><div className={`h-2.5 rounded-full ${bgClass} transition-all duration-300`} style={{ width: `${Math.min(percentage, 100)}%` }} /></div>
}

export function UnderutilisedModal({ isOpen, onClose, month, departmentId, symbol }: any) {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(false)

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api.get('/analytics/drilldown/underutilised', { params: { month, ...(departmentId && departmentId !== 'all' ? { department_id: departmentId } : {}) } })
      setData(res.data)
    } catch {}
    setLoading(false)
  }, [departmentId, month])

  useEffect(() => { if (isOpen) fetchData() }, [isOpen, fetchData])

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Under-utilised Staff Details" size="lg">
      {loading ? <div className="flex justify-center py-8"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" /></div> : data && (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-4 mb-4">
            <div className="bg-yellow-50 p-4 rounded-xl text-center"><p className="text-2xl font-bold text-yellow-700">{data.total_count}</p><p className="text-sm text-yellow-600">Staff Under 50%</p></div>
            <div className="bg-blue-50 p-4 rounded-xl text-center"><p className="text-2xl font-bold text-blue-700">{data.total_hours_to_fill}h</p><p className="text-sm text-blue-600">Total Hours to Fill</p></div>
            <div className="bg-red-50 p-4 rounded-xl text-center"><p className="text-2xl font-bold text-red-700">{formatCurrency(data.under_utilised_staff?.reduce((sum: number, s: any) => sum + s.potential_fee_loss, 0) || 0, symbol)}</p><p className="text-sm text-red-600">Potential Fee Loss</p></div>
          </div>
          <table className="w-full">
            <thead className="bg-gray-50"><tr><th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Staff</th><th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Utilization</th><th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Hours to Fill</th><th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Potential Loss</th></tr></thead>
            <tbody className="divide-y divide-gray-100">{data.under_utilised_staff?.map((s: any) => <tr key={s.staff_id} className="hover:bg-gray-50"><td className="px-4 py-3"><p className="font-medium text-gray-900">{s.name}</p><p className="text-xs text-gray-500">{s.role} • {formatCurrency(s.hourly_rate, symbol)}/hr</p></td><td className="px-4 py-3 text-right"><span className="px-2 py-1 text-sm font-medium bg-yellow-100 text-yellow-800 rounded-full">{s.utilization_percentage}%</span></td><td className="px-4 py-3 text-right font-medium text-gray-900">{s.hours_to_fill.toFixed(1)}h</td><td className="px-4 py-3 text-right font-medium text-red-600">{formatCurrency(s.potential_fee_loss, symbol)}</td></tr>)}</tbody>
          </table>
        </div>
      )}
    </Modal>
  )
}

export function OverutilisedModal({ isOpen, onClose, month, departmentId }: any) {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(false)

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api.get('/analytics/drilldown/overutilised', { params: { month, ...(departmentId && departmentId !== 'all' ? { department_id: departmentId } : {}) } })
      setData(res.data)
    } catch {}
    setLoading(false)
  }, [departmentId, month])

  useEffect(() => { if (isOpen) fetchData() }, [isOpen, fetchData])

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Over-utilised Staff (Risk)" size="lg">
      {loading ? <div className="flex justify-center py-8"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" /></div> : data && (
        <div className="space-y-4">
          <div className="bg-red-50 p-4 rounded-xl text-center mb-4"><p className="text-2xl font-bold text-red-700">{data.total_count}</p><p className="text-sm text-red-600">Staff Over 90% Capacity</p></div>
          {data.over_utilised_staff?.length === 0 ? <p className="text-center text-gray-500 py-8">No over-utilised staff this month</p> : <table className="w-full"><thead className="bg-gray-50"><tr><th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Staff</th><th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Utilization</th><th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Over-allocated</th><th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Risk Level</th></tr></thead><tbody className="divide-y divide-gray-100">{data.over_utilised_staff?.map((s: any) => <tr key={s.staff_id} className="hover:bg-gray-50"><td className="px-4 py-3"><p className="font-medium text-gray-900">{s.name}</p><p className="text-xs text-gray-500">{s.role}</p></td><td className="px-4 py-3 text-right"><span className="px-2 py-1 text-sm font-medium bg-red-100 text-red-800 rounded-full">{s.utilization_percentage}%</span></td><td className="px-4 py-3 text-right font-medium text-red-600">{s.over_allocated_hours}h</td><td className="px-4 py-3 text-right"><span className={`px-2 py-1 text-xs font-medium rounded-full ${s.risk_level === 'High' ? 'bg-red-100 text-red-800' : 'bg-orange-100 text-orange-800'}`}>{s.risk_level}</span></td></tr>)}</tbody></table>}
        </div>
      )}
    </Modal>
  )
}

export function JobsStatusModal({ isOpen, onClose, status, month, departmentId, symbol }: any) {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(false)

  const fetchData = useCallback(async () => {
    if (!status) return
    setLoading(true)
    try {
      const res = await api.get(`/analytics/drilldown/jobs/${encodeURIComponent(status)}`, {
        params: {
          month,
          ...(departmentId && departmentId !== 'all' ? { department_id: departmentId } : {}),
        },
      })
      setData(res.data)
    } catch {}
    setLoading(false)
  }, [departmentId, month, status])

  useEffect(() => { if (isOpen) fetchData() }, [isOpen, fetchData])

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`Jobs - ${status}`} size="xl">
      {loading ? <div className="flex justify-center py-8"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" /></div> : data && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4 mb-4"><div className="bg-blue-50 p-4 rounded-xl text-center"><p className="text-2xl font-bold text-blue-700">{data.total_count}</p><p className="text-sm text-blue-600">Total Jobs</p></div><div className="bg-green-50 p-4 rounded-xl text-center"><p className="text-2xl font-bold text-green-700">{formatCurrency(data.total_fees, symbol)}</p><p className="text-sm text-green-600">Total Fees</p></div></div>
          <table className="w-full"><thead className="bg-gray-50"><tr><th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Job</th><th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Client</th><th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Fee</th><th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Allocated</th><th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Remaining</th></tr></thead><tbody className="divide-y divide-gray-100">{data.jobs?.map((j: any) => <tr key={j.job_id} className="hover:bg-gray-50"><td className="px-4 py-3"><p className="font-medium text-gray-900">{j.name}</p><p className="text-xs text-gray-500">{j.job_type}</p></td><td className="px-4 py-3 text-gray-600">{j.client_name}</td><td className="px-4 py-3 text-right font-medium text-green-600">{formatCurrency(j.job_fee, symbol)}</td><td className="px-4 py-3 text-right"><span className="px-2 py-1 text-sm font-medium bg-blue-100 text-blue-800 rounded-full">{j.total_allocated_percentage}%</span></td><td className="px-4 py-3 text-right text-gray-600">{formatCurrency(j.remaining_fee, symbol)}</td></tr>)}</tbody></table>
        </div>
      )}
    </Modal>
  )
}

export function InsightDetailModal({ isOpen, onClose, insight }: any) {
  if (!insight) return null
  return (
    <Modal isOpen={isOpen} onClose={onClose} title={insight.title} size="lg">
      <div className="space-y-4">
        <p className="text-gray-600">{insight.message}</p>
        <div className="bg-blue-50 p-4 rounded-xl"><p className="text-sm text-blue-800"><strong>Recommendation:</strong> {insight.recommendation}</p></div>
        {insight.details && insight.details.length > 0 && <div className="mt-4"><h4 className="font-medium text-gray-900 mb-2">Details:</h4><div className="space-y-2">{insight.details.map((d: any, i: number) => <div key={i} className="p-3 bg-gray-50 rounded-lg flex justify-between items-center"><div><p className="font-medium text-gray-900">{d.name}</p><p className="text-xs text-gray-500">{d.role || d.client || d.priority}</p></div>{d.utilization !== undefined && <span className="px-2 py-1 text-sm font-medium bg-yellow-100 text-yellow-800 rounded-full">{d.utilization}%</span>}{d.allocated_percentage !== undefined && <span className="px-2 py-1 text-sm font-medium bg-orange-100 text-orange-800 rounded-full">{d.allocated_percentage}% / {d.remaining_percentage}% left</span>}</div>)}</div></div>}
      </div>
    </Modal>
  )
}

export function TimeLoggingModal({ isOpen, onClose, allocation, onTimeLogged, onStatusChanged: _onStatusChanged, symbol: _symbol, allowEntryDelete = true }: any) {
  const [entries, setEntries] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [pendingDeleteEntryId, setPendingDeleteEntryId] = useState<string | null>(null)
  const [deleteSubmitting, setDeleteSubmitting] = useState(false)
  const [newEntry, setNewEntry] = useState({
    start_time: moment().startOf('hour').format('YYYY-MM-DDTHH:mm'),
    end_time: moment().startOf('hour').add(1, 'hour').format('YYYY-MM-DDTHH:mm'),
    description: '',
  })

  const toLocalDisplay = (value?: string | null) => {
    if (!value) return '—'
    const m = moment(value)
    if (!m.isValid()) return '—'
    return m.local().format('YYYY-MM-DD HH:mm')
  }

  const calcHours = () => {
    const start = moment(newEntry.start_time)
    const end = moment(newEntry.end_time)
    if (!start.isValid() || !end.isValid()) return 0
    const minutes = end.diff(start, 'minutes')
    if (!Number.isFinite(minutes) || minutes <= 0) return 0
    return Number((minutes / 60).toFixed(2))
  }

  const computedHours = calcHours()
  const isCompleted = allocation?.workflow_status === 'Completed'

  const fetchData = useCallback(async () => {
    if (!allocation?.id) return
    setLoading(true)
    if (allocation?.id) {
      try {
        const res = await api.get(`/allocations/${allocation.id}/time-summary`)
        setEntries(res.data.time_entries || [])
      } catch (error) {
        console.error(error)
      } finally {
        setLoading(false)
      }
    }
  }, [allocation?.id])

  useEffect(() => { if (isOpen) fetchData() }, [isOpen, fetchData])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (isCompleted) {
      toast.error('This component is completed. Mark it uncomplete before logging more time.')
      return
    }

    const description = String(newEntry.description || '').trim()
    if (description.length < 5) {
      toast.error('Description must be at least 5 characters')
      return
    }

    if (computedHours <= 0) {
      toast.error('End time must be later than start time')
      return
    }

    try {
      setSubmitting(true)
      await api.post('/time-entries', {
        allocation_id: allocation.id,
        start_time: moment(newEntry.start_time).utc().toISOString(),
        end_time: moment(newEntry.end_time).utc().toISOString(),
        description,
      })
      toast.success('Time logged successfully')
      setNewEntry({
        start_time: moment().startOf('hour').format('YYYY-MM-DDTHH:mm'),
        end_time: moment().startOf('hour').add(1, 'hour').format('YYYY-MM-DDTHH:mm'),
        description: '',
      })
      fetchData()
      onTimeLogged?.()
    } catch (error: any) {
      const detail = error.response?.data?.detail
      toast.error(typeof detail === 'string' && detail.toLowerCase().includes('completed and locked') ? COMPLETED_JOB_LOCK_MESSAGE : detail || 'Failed to log time')
    } finally {
      setSubmitting(false)
    }
  }

  const handleDelete = async (entryId: string) => {
    try {
      await api.delete(`/time-entries/${entryId}`)
      toast.success('Time entry deleted')
      fetchData()
      onTimeLogged?.()
    } catch (error: any) {
      const detail = error.response?.data?.detail
      toast.error(typeof detail === 'string' && detail.toLowerCase().includes('completed and locked') ? COMPLETED_JOB_LOCK_MESSAGE : detail || 'Failed to delete')
    }
  }

  return (
    <>
    <Modal isOpen={isOpen} onClose={onClose} title="Log Time" size="lg">
      {loading ? <div className="flex justify-center py-8"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" /></div> : <div className="space-y-6">
        {allocation?.month && <p className="text-sm text-gray-500">Allocation month: {new Date(allocation.month + '-01').toLocaleDateString('en-US', { year: 'numeric', month: 'long' })}</p>}
        <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-3 items-end"><div><label className="block text-sm font-medium text-gray-700 mb-1">Start (Local)</label><input type="datetime-local" required value={newEntry.start_time} onChange={(e) => setNewEntry({ ...newEntry, start_time: e.target.value })} className="w-full px-3 py-2 border border-gray-200 rounded-lg" disabled={isCompleted || submitting} /></div><div><label className="block text-sm font-medium text-gray-700 mb-1">End (Local)</label><input type="datetime-local" required value={newEntry.end_time} onChange={(e) => setNewEntry({ ...newEntry, end_time: e.target.value })} className="w-full px-3 py-2 border border-gray-200 rounded-lg" disabled={isCompleted || submitting} /></div><div><label className="block text-sm font-medium text-gray-700 mb-1">Hours</label><div className="w-full px-3 py-2 border border-gray-100 rounded-lg bg-gray-50 text-gray-800 font-medium">{computedHours > 0 ? `${computedHours.toFixed(2)}h` : '—'}</div></div><div className="md:col-span-2"><label className="block text-sm font-medium text-gray-700 mb-1">Description <span className="text-gray-400 font-normal">(min 5 characters)</span></label><textarea required minLength={5} rows={4} value={newEntry.description} onChange={(e) => setNewEntry({ ...newEntry, description: e.target.value })} className="w-full px-3 py-2 border border-gray-200 rounded-lg resize-y min-h-[112px]" placeholder="What did you work on?" disabled={isCompleted || submitting} /></div><div className="md:col-span-2 flex justify-end"><button type="submit" disabled={isCompleted || submitting} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300">{submitting ? 'Logging…' : 'Log Time'}</button></div></form>
        {isCompleted && <div className="rounded-xl border border-yellow-200 bg-yellow-50 p-3 text-sm text-yellow-800">This component is completed. Mark it uncomplete before logging more time.</div>}
        <div className="border border-gray-200 rounded-xl overflow-hidden"><table className="w-full"><thead className="bg-gray-50"><tr><th className="px-4 py-2 text-left text-xs font-semibold text-gray-500">Start</th><th className="px-4 py-2 text-left text-xs font-semibold text-gray-500">End</th><th className="px-4 py-2 text-left text-xs font-semibold text-gray-500">Hours</th><th className="px-4 py-2 text-left text-xs font-semibold text-gray-500">Description</th>{allowEntryDelete && <th className="px-4 py-2 text-right text-xs font-semibold text-gray-500">Actions</th>}</tr></thead><tbody className="divide-y divide-gray-100">{entries.length ? entries.map((entry) => <tr key={entry.id} className="hover:bg-gray-50"><td className="px-4 py-3 text-sm text-gray-900">{toLocalDisplay(entry.start_time)}</td><td className="px-4 py-3 text-sm text-gray-900">{toLocalDisplay(entry.end_time)}</td><td className="px-4 py-3 text-sm font-medium text-gray-900">{Number(entry.hours_worked || 0).toFixed(2)}h</td><td className="px-4 py-3 text-sm text-gray-600">{entry.description || '-'}</td>{allowEntryDelete && <td className="px-4 py-3 text-right"><button onClick={() => setPendingDeleteEntryId(entry.id)} disabled={isCompleted} className="p-1 text-gray-400 hover:text-red-600 disabled:opacity-40 disabled:cursor-not-allowed"><Icons.Trash /></button></td>}</tr>) : <tr><td colSpan={allowEntryDelete ? 5 : 4} className="px-4 py-6 text-center text-sm text-gray-500">No time entries yet</td></tr>}</tbody></table></div>
      </div>}
    </Modal>
    <DestructiveConfirmModal
      isOpen={!!pendingDeleteEntryId}
      onClose={() => !deleteSubmitting && setPendingDeleteEntryId(null)}
      onConfirm={async () => {
        if (!pendingDeleteEntryId) return
        try {
          setDeleteSubmitting(true)
          await handleDelete(pendingDeleteEntryId)
          setPendingDeleteEntryId(null)
        } finally {
          setDeleteSubmitting(false)
        }
      }}
      title="Delete Time Entry"
      description="Delete this time entry?"
      confirmLabel="Delete Entry"
      isSubmitting={deleteSubmitting}
    />
    </>
  )
}

export function DeadlineWidget({ staffId, compact = false }: any) {
  const [deadlines, setDeadlines] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchDeadlines = async () => {
      try {
        const endpoint = staffId ? `/deadlines/staff/${staffId}` : '/deadlines/upcoming'
        const res = await api.get(endpoint, { params: { days: 30 } })
        setDeadlines(res.data)
      } catch (e) {
        console.error(e)
      } finally {
        setLoading(false)
      }
    }
    fetchDeadlines()
  }, [staffId])

  const sectionPadding = compact ? 'p-3' : 'p-4'
  const headingClass = compact ? 'text-sm font-semibold' : 'font-semibold'
  const rowClass = compact ? 'py-1.5' : 'py-2'
  const titleClass = compact ? 'text-sm font-medium text-gray-900' : 'font-medium text-gray-900'
  const metaClass = compact ? 'text-[11px] text-gray-500' : 'text-xs text-gray-500'
  const countClass = compact ? 'text-xs font-medium' : 'text-sm font-medium'

  if (loading) return <div className="h-24 animate-pulse rounded-xl bg-gray-100" />
  if (!deadlines || deadlines.total_count === 0) return <div className={`rounded-xl border border-green-200 bg-green-50 ${sectionPadding}`}><div className="flex items-center gap-2 text-green-700"><Icons.Check /><span className={headingClass}>No upcoming deadlines</span></div></div>

  return <div className="space-y-3">{deadlines.overdue?.length > 0 && <div className={`rounded-xl border border-red-200 bg-red-50 ${sectionPadding}`}><div className="mb-2 flex items-center gap-2 text-red-700"><Icons.Warning /><span className={headingClass}>Overdue ({deadlines.overdue.length})</span></div>{deadlines.overdue.slice(0, 3).map((j: any) => <div key={j.job_id} className={`flex items-center justify-between border-t border-red-100 ${rowClass}`}><div><p className={titleClass}>{j.name}</p><p className={metaClass}>{j.client_name}</p></div><span className={`${countClass} text-red-600`}>{Math.abs(j.days_until)} days overdue</span></div>)}</div>}{deadlines.urgent?.length > 0 && <div className={`rounded-xl border border-orange-200 bg-orange-50 ${sectionPadding}`}><div className="mb-2 flex items-center gap-2 text-orange-700"><Icons.Bell /><span className={headingClass}>Urgent - Due in 3 days ({deadlines.urgent.length})</span></div>{deadlines.urgent.slice(0, 3).map((j: any) => <div key={j.job_id} className={`flex items-center justify-between border-t border-orange-100 ${rowClass}`}><div><p className={titleClass}>{j.name}</p><p className={metaClass}>{j.client_name}</p></div><span className={`${countClass} text-orange-600`}>{j.days_until} day{j.days_until !== 1 ? 's' : ''}</span></div>)}</div>}{deadlines.upcoming?.length > 0 && <div className={`rounded-xl border border-blue-200 bg-blue-50 ${sectionPadding}`}><div className="mb-2 flex items-center gap-2 text-blue-700"><Icons.Calendar /><span className={headingClass}>Upcoming ({deadlines.upcoming.length})</span></div>{deadlines.upcoming.slice(0, 3).map((j: any) => <div key={j.job_id} className={`flex items-center justify-between border-t border-blue-100 ${rowClass}`}><div><p className={titleClass}>{j.name}</p><p className={metaClass}>{j.client_name}</p></div><span className={`${countClass} text-blue-600`}>{j.days_until} days</span></div>)}</div>}</div>
}
