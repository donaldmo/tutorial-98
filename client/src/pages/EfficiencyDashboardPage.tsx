import { useCallback, useEffect, useState } from 'react'

import api from '@/services/api'
import { Icons, formatCurrency } from '@/components/workflow/shared'

const efficiencyColor = (pct: number) =>
  pct <= 100 ? 'text-green-600' : pct <= 120 ? 'text-yellow-600' : 'text-red-600'

const statusBadge = (status: string) => {
  const colors: Record<string, string> = {
    Efficient: 'bg-green-100 text-green-800',
    'Slightly Over': 'bg-yellow-100 text-yellow-800',
    'Over Budget': 'bg-red-100 text-red-800',
    'Significantly Over': 'bg-red-200 text-red-900',
    'In Progress': 'bg-blue-100 text-blue-800',
    'No Time Logged': 'bg-gray-100 text-gray-600',
  }
  return colors[status] || 'bg-gray-100 text-gray-600'
}

export function EfficiencyDashboardPage({ settings, hidePageHeader = false }: any) {
  const [staffData, setStaffData] = useState<any>(null)
  const [jobsData, setJobsData] = useState<any>(null)
  const [mgmtData, setMgmtData] = useState<any>(null)
  const [deptData, setDeptData] = useState<any[]>([])
  const [departments, setDepartments] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().slice(0, 7))
  const [selectedDepartment, setSelectedDepartment] = useState('all')
  const symbol = settings?.currency_symbol || 'R'

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params: Record<string, string> = { month: selectedMonth }
      if (selectedDepartment !== 'all') {
        params.department_id = selectedDepartment
      }

      const qs = new URLSearchParams(params).toString()
      const suffix = qs ? `?${qs}` : ''

      const [staffRes, jobsRes, mgmtRes, deptRes, deptsRes] = await Promise.all([
        api.get(`/analytics/efficiency/staff${suffix}`),
        api.get(`/analytics/efficiency/jobs${suffix}`),
        api.get(`/analytics/management-dashboard${suffix}`),
        api.get(`/analytics/efficiency/departments${suffix}`),
        api.get('/departments'),
      ])

      setStaffData(staffRes.data)
      setJobsData(jobsRes.data)
      setMgmtData(mgmtRes.data)
      setDeptData(Array.isArray(deptRes.data) ? deptRes.data : [])
      setDepartments(deptsRes.data?.data || [])
    } catch (err) {
      console.error(err)
      setError('Efficiency data could not be loaded right now.')
    } finally {
      setLoading(false)
    }
  }, [selectedMonth, selectedDepartment])

  useEffect(() => { fetchData() }, [fetchData])

  if (loading) {
    return <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" /></div>
  }

  const summary = mgmtData?.summary || {}
  const totalBudgeted = Number(summary.budgeted_hours || 0)
  const totalActual = Number(summary.actual_hours || 0)
  const overallEfficiency = Number(summary.overall_efficiency ?? summary.productivity_percentage ?? 0)
  const totalAllocatedFees = Number(summary.total_allocated_fees || 0)
  const effectiveRate = Number(summary.effective_hourly_rate || 0)
  const overallStatus = summary.overall_status || (overallEfficiency <= 100 ? 'Healthy' : 'Needs Attention')
  const recommendation = summary.recommendation || ''
  const staffRows = staffData?.staff || []
  const jobsOverBudget = (jobsData?.jobs || []).filter((j: any) => j.variance_percentage > 20)

  return (
    <div className="space-y-6" data-testid="efficiency-dashboard">
      {error && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-800 text-sm">{error}</div>
      )}

      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        {!hidePageHeader && (
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Efficiency &amp; Analytics</h2>
            <p className="text-gray-500 mt-1">Track performance and identify improvement areas</p>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <input
            type="month"
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            className="px-4 py-2 border border-gray-200 rounded-xl text-sm"
          />

          <select
            value={selectedDepartment}
            onChange={(e) => setSelectedDepartment(e.target.value)}
            className="px-4 py-2 border border-gray-200 rounded-xl text-sm"
          >
            <option value="all">All Departments</option>
            {departments.map((d: any) => (
              <option key={d.id || d._id} value={d.id || d._id}>{d.name}</option>
            ))}
          </select>
        </div>
      </div>

      {summary && (
        <div className="grid grid-cols-1 md:grid-cols-5 gap-2">
          <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg px-3 py-2 text-white">
            <p className="text-blue-100 text-xs flex items-center gap-1">
              <span className="text-xs">&#9679;</span> Total Budgeted
            </p>
            <p className="text-lg font-bold">{totalBudgeted}h</p>
          </div>
          <div className="bg-gradient-to-br from-green-500 to-green-600 rounded-lg px-3 py-2 text-white">
            <p className="text-green-100 text-xs flex items-center gap-1">
              <span className="text-xs">&#9679;</span> Total Actual
            </p>
            <p className="text-lg font-bold">{totalActual}h</p>
          </div>
          <div className={`rounded-lg px-3 py-2 text-white ${overallEfficiency <= 100 ? 'bg-gradient-to-br from-green-500 to-green-600' : overallEfficiency <= 120 ? 'bg-gradient-to-br from-yellow-500 to-yellow-600' : 'bg-gradient-to-br from-red-500 to-red-600'}`}>
            <p className="text-xs flex items-center gap-1 opacity-80">
              <span className="text-xs">&#9679;</span> Overall Efficiency
            </p>
            <p className="text-lg font-bold">{overallEfficiency}%</p>
          </div>
          <div className="bg-gradient-to-br from-purple-500 to-purple-600 rounded-lg px-3 py-2 text-white">
            <p className="text-purple-100 text-xs flex items-center gap-1">
              <span className="text-xs">&#9679;</span> Allocated Fees
            </p>
            <p className="text-lg font-bold">{formatCurrency(totalAllocatedFees, symbol)}</p>
          </div>
          <div className="bg-gradient-to-br from-slate-600 to-slate-700 rounded-lg px-3 py-2 text-white">
            <p className="text-slate-300 text-xs flex items-center gap-1">
              <span className="text-xs">&#9679;</span> Effective Rate
            </p>
            <p className="text-lg font-bold">{formatCurrency(effectiveRate, symbol)}/hr</p>
          </div>
        </div>
      )}

      <div className="bg-white rounded-lg shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-4 py-2 border-b border-gray-100 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-900">Department Efficiency</h3>
          <span className="text-xs text-gray-500">Average efficiency by department</span>
        </div>
        <div className="p-3">
          {deptData.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
              {deptData.map((dept: any) => (
                <div key={dept.department_id} className="border border-gray-200 rounded-lg px-3 py-2">
                  <div className="flex items-center justify-between mb-1">
                    <h4 className="text-sm font-medium text-gray-900">{dept.department_name}</h4>
                    <span className={`px-1.5 py-0.5 text-xs font-bold rounded-full ${dept.avg_efficiency <= 100 ? 'bg-green-100 text-green-700' : dept.avg_efficiency <= 120 ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700'}`}>
                      {Number(dept.avg_efficiency || 0).toFixed(1)}%
                    </span>
                  </div>
                  <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${dept.avg_efficiency <= 100 ? 'bg-green-500' : dept.avg_efficiency <= 120 ? 'bg-yellow-500' : 'bg-red-500'}`}
                      style={{ width: `${Math.min(100, dept.avg_efficiency)}%` }}
                    />
                  </div>
                  <div className="flex justify-between mt-1 text-xs text-gray-500">
                    <span>{dept.staff_count} staff</span>
                    <span>{Number(dept.total_budgeted_hours || 0).toFixed(1)}h budgeted</span>
                    <span>{Number(dept.total_actual_hours || 0).toFixed(1)}h actual</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-600">
              No department efficiency data found for the selected period.
            </div>
          )}
        </div>
      </div>

      <div className={`rounded-lg border px-3 py-2 ${overallStatus === 'Healthy' ? 'border-green-200 bg-green-50' : overallStatus === 'Needs Attention' ? 'border-yellow-200 bg-yellow-50' : 'border-red-200 bg-red-50'}`}>
        <div className="flex items-center gap-1">
          {overallStatus === 'Healthy' ? (
            <span className="text-green-600 text-sm"><Icons.Check /></span>
          ) : (
            <span className="text-yellow-600 text-sm"><Icons.AlertCircle /></span>
          )}
          <span className="font-medium text-sm">{overallStatus === 'Healthy' ? '✅ Healthy' : overallStatus === 'Needs Attention' ? 'Needs Attention' : 'Critical'}</span>
          <span className="text-gray-600 text-xs ml-1">&mdash; {recommendation}</span>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h3 className="text-lg font-semibold text-gray-900">Staff Efficiency</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Staff</th>
                <th className="px-6 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Budgeted</th>
                <th className="px-6 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Actual</th>
                <th className="px-6 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Variance</th>
                <th className="px-6 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Efficiency</th>
                <th className="px-6 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Eff. Rate</th>
                <th className="px-6 py-3 text-center text-xs font-semibold text-gray-500 uppercase">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {staffRows.map((s: any) => (
                <tr key={s.staff_id} className="hover:bg-gray-50">
                  <td className="px-6 py-4">
                    <p className="font-medium text-gray-900">{s.name}</p>
                    <p className="text-xs text-gray-500">{s.role} &bull; {formatCurrency(s.hourly_rate || 0, symbol)}/hr</p>
                  </td>
                  <td className="px-6 py-4 text-right text-gray-600">{Number(s.budgeted_hours || 0).toFixed(1)}h</td>
                  <td className="px-6 py-4 text-right text-gray-900 font-medium">{Number(s.actual_hours || 0).toFixed(1)}h</td>
                  <td className={`px-6 py-4 text-right font-medium ${Number(s.variance_hours || 0) <= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {Number(s.variance_hours || 0) > 0 ? '+' : ''}{Number(s.variance_hours || 0).toFixed(1)}h
                  </td>
                  <td className={`px-6 py-4 text-right font-semibold ${efficiencyColor(Number(s.efficiency_percentage || 0))}`}>
                    {Number(s.efficiency_percentage || 0).toFixed(1)}%
                  </td>
                  <td className="px-6 py-4 text-right text-gray-600">{formatCurrency(s.effective_hourly_rate || s.hourly_rate || 0, symbol)}</td>
                  <td className="px-6 py-4 text-center">
                    <span className={`px-2 py-1 text-xs font-medium rounded-full ${statusBadge(s.efficiency_status || 'In Progress')}`}>
                      {s.efficiency_status || 'In Progress'}
                    </span>
                  </td>
                </tr>
              ))}
              {staffRows.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-6 py-8 text-center text-sm text-gray-500">
                    No efficiency data found for the selected period.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {jobsOverBudget.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-red-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-red-100 bg-red-50">
            <h3 className="text-lg font-semibold text-red-800">⚠ Jobs Over Budget (&gt;20%)</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Job</th>
                  <th className="px-6 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Budgeted</th>
                  <th className="px-6 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Actual</th>
                  <th className="px-6 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Over By</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {jobsOverBudget.map((j: any) => (
                  <tr key={j.job_id} className="hover:bg-gray-50">
                    <td className="px-6 py-4">
                      <p className="font-medium text-gray-900">{j.job_name}</p>
                      <p className="text-xs text-gray-500">{j.client_name}</p>
                    </td>
                    <td className="px-6 py-4 text-right text-gray-600">{Number(j.budgeted_hours || 0).toFixed(1)}h</td>
                    <td className="px-6 py-4 text-right font-medium text-red-600">{Number(j.actual_hours || 0).toFixed(1)}h</td>
                    <td className="px-6 py-4 text-right">
                      <span className="px-2 py-1 text-sm font-medium bg-red-100 text-red-800 rounded-full">
                        +{Number(j.variance_percentage || 0).toFixed(1)}%
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
