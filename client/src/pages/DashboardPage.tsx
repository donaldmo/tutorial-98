import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { Icons, formatCurrency } from '@/components/workflow/shared'
import { ClickableStatCard, DeadlineWidget, InsightDetailModal, JobsStatusModal, OverutilisedModal, ProgressBar, UnderutilisedModal } from '@/components/workflow/analyticsShared'

const getUtilizationColor = (percentage: number) => percentage >= 90 ? 'text-red-600' : percentage >= 70 ? 'text-yellow-600' : percentage >= 50 ? 'text-green-600' : 'text-gray-500'

const getCurrentMonth = () => new Date().toISOString().slice(0, 7)

const getLastMonth = () => {
  const date = new Date()
  date.setMonth(date.getMonth() - 1)
  return date.toISOString().slice(0, 7)
}

const getPeriodFilterForMonth = (month: string) => {
  if (month === getCurrentMonth()) return 'current-month'
  if (month === getLastMonth()) return 'last-month'
  return 'custom'
}

interface DashboardPageProps {
  summary: any
  capacity: any
  insights: any
  timeSummary: any
  workStatusByDept: any
  settings: any
  departments: any[]
  onSeedData: () => void | Promise<void>
  selectedMonth: string
  setSelectedMonth: (month: string) => void
  selectedDepartmentId: string
  setSelectedDepartmentId: (departmentId: string) => void
  hidePageHeader?: boolean
}

export function DashboardPage({
  summary,
  capacity,
  insights,
  timeSummary,
  workStatusByDept,
  settings,
  departments = [],
  onSeedData,
  selectedMonth,
  setSelectedMonth,
  selectedDepartmentId,
  setSelectedDepartmentId,
  hidePageHeader = false,
}: DashboardPageProps) {
  const navigate = useNavigate()
  const symbol = settings?.currency_symbol || 'R'
  const [underModal, setUnderModal] = useState(false)
  const [overModal, setOverModal] = useState(false)
  const [jobsModal, setJobsModal] = useState({ open: false, status: '' })
  const [insightModal, setInsightModal] = useState<any>({ open: false, insight: null })
  const [periodFilter, setPeriodFilter] = useState(() => getPeriodFilterForMonth(selectedMonth || getCurrentMonth()))
  const [customMonth, setCustomMonth] = useState(selectedMonth || getCurrentMonth())
  const displaySummary = summary || {}

  useEffect(() => {
    setPeriodFilter(getPeriodFilterForMonth(selectedMonth || getCurrentMonth()))
    setCustomMonth(selectedMonth || getCurrentMonth())
  }, [selectedMonth])

  const selectedDepartmentName = useMemo(
    () => departments.find((department) => String(department.id || department._id) === String(selectedDepartmentId))?.name || 'Selected Department',
    [departments, selectedDepartmentId],
  )

  const handlePeriodChange = (value: string) => {
    setPeriodFilter(value)
    if (value === 'current-month') {
      setSelectedMonth(getCurrentMonth())
      return
    }
    if (value === 'last-month') {
      setSelectedMonth(getLastMonth())
      return
    }
    setSelectedMonth(customMonth || getCurrentMonth())
  }

  const handleCustomMonthChange = (value: string) => {
    setCustomMonth(value)
    setSelectedMonth(value)
  }

  return (
    <div className="space-y-4" data-testid="dashboard-page">
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          {!hidePageHeader && (
            <div>
              <h2 className="text-xl font-bold text-gray-900">Firm Dashboard</h2>
              <p className="mt-1 text-sm text-gray-500">
                Overview for {selectedMonth}
                {selectedDepartmentId !== 'all' ? ` • ${selectedDepartmentName}` : ''}
              </p>
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => navigate('/app/onboarding')}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100"
            >
              <Icons.Template /> Onboarding Guide
            </button>
            <button
              onClick={onSeedData}
              className="inline-flex items-center gap-2 rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-700"
              data-testid="seed-data-btn"
            >
              <Icons.Download />Load Sample Data
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-gray-100 bg-white p-3 shadow-sm">
          <div className="flex items-center gap-2 text-xs font-medium text-gray-700">
            <Icons.Calendar />
            <span>Period:</span>
          </div>
          <select
            value={periodFilter}
            onChange={(e) => handlePeriodChange(e.target.value)}
            className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
            data-testid="period-filter"
          >
            <option value="current-month">Current Month</option>
            <option value="last-month">Last Month</option>
            <option value="custom">Custom Month</option>
          </select>
          {periodFilter === 'custom' ? (
            <input
              type="month"
              value={customMonth}
              onChange={(e) => handleCustomMonthChange(e.target.value)}
              className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs focus:ring-2 focus:ring-blue-500"
              data-testid="custom-month-input"
            />
          ) : null}
          <div className="mx-1 hidden h-5 w-px bg-gray-200 sm:block" />
          <div className="flex items-center gap-2 text-xs font-medium text-gray-700">
            <Icons.Building />
            <span>Department:</span>
          </div>
          <select
            value={selectedDepartmentId}
            onChange={(e) => setSelectedDepartmentId(e.target.value)}
            className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
            data-testid="department-filter"
          >
            <option value="all">All Departments</option>
            {departments.map((department) => (
              <option key={String(department.id || department._id)} value={String(department.id || department._id)}>
                {department.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <ClickableStatCard compact title="Total Staff" value={displaySummary?.total_staff || 0} subtitle="Active members" icon={Icons.Users} color="blue" />
        <ClickableStatCard compact title="Total Jobs" value={displaySummary?.jobs?.total || 0} subtitle={`${displaySummary?.jobs?.pending || 0} pending`} icon={Icons.Briefcase} color="purple" onClick={() => setJobsModal({ open: true, status: 'Pending' })} />
        <ClickableStatCard compact title="Utilization" value={`${displaySummary?.capacity?.utilization_percentage || 0}%`} subtitle={`${displaySummary?.capacity?.allocated_hours || 0}h allocated`} icon={Icons.Chart} color={displaySummary?.capacity?.utilization_percentage >= 80 ? 'yellow' : 'green'} />
        <ClickableStatCard compact title="Total Job Fees" value={formatCurrency(displaySummary?.revenue?.total_job_fees || 0, symbol)} subtitle={`${formatCurrency(displaySummary?.revenue?.allocated_fees_this_month || 0, symbol)} this month`} icon={Icons.Calendar} color="green" />
      </div>

      {workStatusByDept?.totals ? (
        <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
          <h3 className="mb-3 flex items-center gap-2 text-base font-semibold text-gray-900">
            <Icons.Building />
            Work Status Overview
          </h3>
          <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <div className="rounded-lg border border-red-100 bg-red-50 p-3 text-center">
              <p className="text-2xl font-bold text-red-600">{workStatusByDept.totals.total_overdue}</p>
              <p className="mt-1 text-xs font-medium text-red-600">Overdue</p>
            </div>
            <div className="rounded-lg border border-orange-100 bg-orange-50 p-3 text-center">
              <p className="text-2xl font-bold text-orange-600">{workStatusByDept.totals.total_urgent}</p>
              <p className="mt-1 text-xs font-medium text-orange-600">Urgent (7 days)</p>
            </div>
            <div className="rounded-lg border border-blue-100 bg-blue-50 p-3 text-center">
              <p className="text-2xl font-bold text-blue-600">{workStatusByDept.totals.total_upcoming}</p>
              <p className="mt-1 text-xs font-medium text-blue-600">Upcoming (30 days)</p>
            </div>
            <div className="rounded-lg border border-purple-100 bg-purple-50 p-3 text-center">
              <p className="text-2xl font-bold text-purple-600">{workStatusByDept.totals.total_ongoing}</p>
              <p className="mt-1 text-xs font-medium text-purple-600">In Progress</p>
            </div>
          </div>

          {workStatusByDept.departments?.length > 0 ? (
            <div className="space-y-2">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-500">By Department</h4>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                {workStatusByDept.departments.map((department: any) => (
                  <div key={department.department_id} className="rounded-lg border border-gray-100 bg-gray-50 p-3">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <h5 className="text-sm font-medium text-gray-900">{department.department_name}</h5>
                      <span className="rounded bg-gray-200 px-2 py-0.5 text-[11px] text-gray-600">{department.department_code}</span>
                    </div>
                    <div className="grid grid-cols-4 gap-2 text-center text-[11px]">
                      <div>
                        <p className={`font-bold ${department.overdue_count > 0 ? 'text-red-600' : 'text-gray-400'}`}>{department.overdue_count}</p>
                        <p className="text-gray-500">Overdue</p>
                      </div>
                      <div>
                        <p className={`font-bold ${department.urgent_count > 0 ? 'text-orange-600' : 'text-gray-400'}`}>{department.urgent_count}</p>
                        <p className="text-gray-500">Urgent</p>
                      </div>
                      <div>
                        <p className={`font-bold ${department.upcoming_count > 0 ? 'text-blue-600' : 'text-gray-400'}`}>{department.upcoming_count}</p>
                        <p className="text-gray-500">Upcoming</p>
                      </div>
                      <div>
                        <p className={`font-bold ${department.ongoing_count > 0 ? 'text-purple-600' : 'text-gray-400'}`}>{department.ongoing_count}</p>
                        <p className="text-gray-500">Ongoing</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {timeSummary?.overall ? (
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-5">
          <div className="rounded-xl border border-gray-100 bg-white p-3 text-center shadow-sm">
            <p className="text-xs font-medium text-gray-500">Budgeted Hours</p>
            <p className="mt-1 text-xl font-bold text-blue-600">{timeSummary.overall.total_budgeted}h</p>
          </div>
          <div className="rounded-xl border border-gray-100 bg-white p-3 text-center shadow-sm">
            <p className="text-xs font-medium text-gray-500">Hours Logged</p>
            <p className="mt-1 text-xl font-bold text-green-600">{timeSummary.overall.total_logged}h</p>
          </div>
          <div className={`rounded-xl border p-3 text-center shadow-sm ${timeSummary.overall.efficiency < 100 ? 'border-orange-200 bg-orange-50' : 'border-green-200 bg-green-50'}`}>
            <p className="text-xs font-medium text-gray-500">Efficiency</p>
            <p className={`mt-1 text-xl font-bold ${timeSummary.overall.efficiency < 100 ? 'text-orange-600' : 'text-green-600'}`}>{timeSummary.overall.efficiency}%</p>
          </div>
          <div className="rounded-xl border border-gray-100 bg-white p-3 text-center shadow-sm">
            <p className="text-xs font-medium text-gray-500">Allocated Fees</p>
            <p className="mt-1 text-xl font-bold text-gray-900">{formatCurrency(timeSummary.overall.total_fees, symbol)}</p>
          </div>
          <div className="rounded-xl border border-gray-100 bg-white p-3 text-center shadow-sm">
            <p className="text-xs font-medium text-gray-500">Effective Rate</p>
            <p className="mt-1 text-xl font-bold text-purple-600">{formatCurrency(timeSummary.overall.effective_rate, symbol)}/h</p>
          </div>
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
          <h3 className="mb-3 text-base font-semibold text-gray-900">Staff Capacity</h3>
          <div className="max-h-80 space-y-3 overflow-y-auto">
            {capacity?.staff_capacity?.slice(0, 5).map((staffMember: any) => (
              <div key={staffMember.staff_id} className="space-y-1.5">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-gray-900">{staffMember.name}</p>
                    <p className="text-xs text-gray-500">{staffMember.role}</p>
                  </div>
                  <span className={`text-sm font-semibold ${getUtilizationColor(staffMember.utilization_percentage)}`}>{staffMember.utilization_percentage}%</span>
                </div>
                <ProgressBar percentage={staffMember.utilization_percentage} />
                <p className="text-[11px] text-gray-500">
                  {staffMember.remaining_hours}h remaining • {formatCurrency(staffMember.allocated_fees, symbol)} allocated
                </p>
              </div>
            ))}
            {!capacity?.staff_capacity?.length ? <p className="py-4 text-center text-sm text-gray-500">No staff data. Load sample data.</p> : null}
          </div>
        </div>

        <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
          <h3 className="mb-3 flex items-center gap-2 text-base font-semibold text-gray-900">
            <Icons.Bell />
            Upcoming Deadlines
          </h3>
          <DeadlineWidget compact />
        </div>

        <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
          <h3 className="mb-3 flex items-center gap-2 text-base font-semibold text-gray-900">
            <Icons.Lightbulb />
            Operational Insights
            <span className="text-[11px] text-gray-400">(click for details)</span>
          </h3>
          <div className="max-h-80 space-y-3 overflow-y-auto">
            {insights?.insights?.map((insight: any, index: number) => (
              <div
                key={index}
                onClick={() => setInsightModal({ open: true, insight })}
                className={`cursor-pointer rounded-lg border p-3 transition-shadow hover:shadow-md ${insight.type === 'danger' ? 'border-red-200 bg-red-50' : insight.type === 'warning' ? 'border-yellow-200 bg-yellow-50' : insight.type === 'info' ? 'border-blue-200 bg-blue-50' : 'border-green-200 bg-green-50'}`}
              >
                <h4 className="text-sm font-medium text-gray-900">{insight.title}</h4>
                <p className="mt-1 text-xs text-gray-600">{insight.message}</p>
                <p className="mt-2 text-[11px] text-blue-600">Click for details →</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
        <h3 className="mb-3 text-base font-semibold text-gray-900">
          Jobs Overview <span className="text-[11px] text-gray-400">(click any status)</span>
        </h3>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          <div onClick={() => setJobsModal({ open: true, status: 'Pending' })} className="cursor-pointer rounded-lg bg-gray-50 p-3 text-center transition-colors hover:bg-gray-100">
            <p className="text-2xl font-bold text-gray-600">{displaySummary?.jobs?.pending || 0}</p>
            <p className="mt-1 text-xs font-medium text-gray-500">Pending</p>
          </div>
          <div onClick={() => setJobsModal({ open: true, status: 'Partially Allocated' })} className="cursor-pointer rounded-lg bg-orange-50 p-3 text-center transition-colors hover:bg-orange-100">
            <p className="text-2xl font-bold text-orange-600">{displaySummary?.jobs?.partially_allocated || 0}</p>
            <p className="mt-1 text-xs font-medium text-orange-600">Partial</p>
          </div>
          <div onClick={() => setJobsModal({ open: true, status: 'Fully Allocated' })} className="cursor-pointer rounded-lg bg-blue-50 p-3 text-center transition-colors hover:bg-blue-100">
            <p className="text-2xl font-bold text-blue-600">{displaySummary?.jobs?.fully_allocated || 0}</p>
            <p className="mt-1 text-xs font-medium text-blue-600">Full (100%)</p>
          </div>
          <div onClick={() => setJobsModal({ open: true, status: 'In Progress' })} className="cursor-pointer rounded-lg bg-purple-50 p-3 text-center transition-colors hover:bg-purple-100">
            <p className="text-2xl font-bold text-purple-600">{displaySummary?.jobs?.in_progress || 0}</p>
            <p className="mt-1 text-xs font-medium text-purple-600">In Progress</p>
          </div>
          <div onClick={() => setJobsModal({ open: true, status: 'Completed' })} className="cursor-pointer rounded-lg bg-green-50 p-3 text-center transition-colors hover:bg-green-100">
            <p className="text-2xl font-bold text-green-600">{displaySummary?.jobs?.completed || 0}</p>
            <p className="mt-1 text-xs font-medium text-green-600">Completed</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <button onClick={() => setUnderModal(true)} className="rounded-xl border border-yellow-200 bg-yellow-50 p-3 text-left transition-colors hover:bg-yellow-100">
          <div className="mb-2 text-yellow-600"><Icons.TrendingDown /></div>
          <p className="text-sm font-medium text-yellow-800">Under-utilised Staff</p>
          <p className="text-[11px] text-yellow-600">View capacity gaps</p>
        </button>
        <button onClick={() => setOverModal(true)} className="rounded-xl border border-red-200 bg-red-50 p-3 text-left transition-colors hover:bg-red-100">
          <div className="mb-2 text-red-600"><Icons.AlertCircle /></div>
          <p className="text-sm font-medium text-red-800">Over-utilised Staff</p>
          <p className="text-[11px] text-red-600">View burnout risks</p>
        </button>
        <button onClick={() => setJobsModal({ open: true, status: 'Partially Allocated' })} className="rounded-xl border border-orange-200 bg-orange-50 p-3 text-left transition-colors hover:bg-orange-100">
          <div className="mb-2 text-orange-600"><Icons.Briefcase /></div>
          <p className="text-sm font-medium text-orange-800">Partial Allocations</p>
          <p className="text-[11px] text-orange-600">Complete job assignments</p>
        </button>
        <button onClick={() => setJobsModal({ open: true, status: 'Pending' })} className="rounded-xl border border-gray-200 bg-gray-50 p-3 text-left transition-colors hover:bg-gray-100">
          <div className="mb-2 text-gray-600"><Icons.Clock /></div>
          <p className="text-sm font-medium text-gray-800">Pending Jobs</p>
          <p className="text-[11px] text-gray-600">Start allocating</p>
        </button>
      </div>

      <UnderutilisedModal isOpen={underModal} onClose={() => setUnderModal(false)} month={selectedMonth} departmentId={selectedDepartmentId} symbol={symbol} />
      <OverutilisedModal isOpen={overModal} onClose={() => setOverModal(false)} month={selectedMonth} departmentId={selectedDepartmentId} />
      <JobsStatusModal isOpen={jobsModal.open} onClose={() => setJobsModal({ open: false, status: '' })} status={jobsModal.status} month={selectedMonth} departmentId={selectedDepartmentId} symbol={symbol} />
      <InsightDetailModal isOpen={insightModal.open} onClose={() => setInsightModal({ open: false, insight: null })} insight={insightModal.insight} />
    </div>
  )
}
