import type { ReportData, ReportType } from '@/types/reports'

export const REPORT_THRESHOLDS = {
  utilization: { healthy: 70, overloaded: 90 },
  productivity: { target: 100 },
  overtime: { medium: 15, high: 30 },
  capacity: { underutilized: 50, overloaded: 100 },
} as const

const toKey = (value: unknown) => String(value || '').toLowerCase().replace(/\s+/g, '_')

export const normalizeStatusLabel = (raw: unknown): string => {
  const value = String(raw || '').trim()
  if (!value) return 'Unknown'
  if (value === 'Doing') return 'In Progress'
  if (value === 'doing') return 'In Progress'
  return value
}

export const statusBadgeClass = (rawStatus: unknown): string => {
  const key = toKey(normalizeStatusLabel(rawStatus))

  const map: Record<string, string> = {
    pending: 'bg-gray-100 text-gray-800',
    partially_allocated: 'bg-orange-100 text-orange-800',
    fully_allocated: 'bg-blue-100 text-blue-800',
    in_progress: 'bg-purple-100 text-purple-800',
    completed: 'bg-green-100 text-green-800',
    on_hold: 'bg-yellow-100 text-yellow-800',
    overloaded: 'bg-red-100 text-red-800',
    underutilized: 'bg-yellow-100 text-yellow-800',
    optimal: 'bg-green-100 text-green-800',
    high: 'bg-red-100 text-red-800',
    medium: 'bg-orange-100 text-orange-800',
    low: 'bg-green-100 text-green-800',
    over_budget: 'bg-red-100 text-red-800',
    on_track: 'bg-green-100 text-green-800',
    late: 'bg-red-100 text-red-800',
    on_time: 'bg-green-100 text-green-800',
    no_deadline: 'bg-gray-100 text-gray-800',
  }

  return map[key] || 'bg-gray-100 text-gray-800'
}

export const primaryRows = (reportType: ReportType, data: ReportData): Record<string, unknown>[] => {
  if (!data) return []
  if (reportType === 'utilization-productivity' && Array.isArray((data as any).staff_breakdown)) return (data as any).staff_breakdown
  if (reportType === 'revenue-per-employee' && Array.isArray((data as any).by_employee)) return (data as any).by_employee
  if (reportType === 'team-productivity' && Array.isArray((data as any).team_members)) return (data as any).team_members
  if (reportType === 'quality-review' && Array.isArray((data as any).exceptions)) return (data as any).exceptions
  if (Array.isArray((data as any).staff)) return (data as any).staff
  if (Array.isArray((data as any).jobs)) return (data as any).jobs
  if (Array.isArray((data as any).by_employee)) return (data as any).by_employee
  if (Array.isArray((data as any).team_members)) return (data as any).team_members
  if (Array.isArray((data as any).exceptions)) return (data as any).exceptions
  return []
}

export const needsCompletedDataHint = (reportType: ReportType): boolean => {
  return reportType === 'turnaround-time' || reportType === 'actual-vs-budgeted' || reportType === 'quality-review'
}

export const getEmptyHintByReport = (reportType: ReportType): string => {
  const map: Record<ReportType, string> = {
    'utilization-productivity': 'Add active staff and monthly allocations for this period.',
    'wip-status': 'Create jobs and allocations; non-completed jobs appear here.',
    'firm-profitability': 'Set job fees and staff hourly rates to generate profitability figures.',
    'revenue-per-employee': 'Assign allocations to staff with allocated fees for this month.',
    'actual-vs-budgeted': 'Log time entries against allocations to compare actual versus budgeted hours.',
    'turnaround-time': 'Add deadlines on jobs and progress jobs through execution.',
    'team-productivity': 'Assign staff to departments and create monthly allocations.',
    'capacity-planning': 'Maintain active staff availability and monthly allocations.',
    'overtime-burnout': 'Capture time entries to calculate overtime and burnout risk.',
    'quality-review': 'This report needs budget vs actual variance from allocations and time entries.',
  }
  return map[reportType]
}
