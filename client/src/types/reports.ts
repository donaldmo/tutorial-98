export type ReportType =
  | 'utilization-productivity'
  | 'wip-status'
  | 'firm-profitability'
  | 'revenue-per-employee'
  | 'actual-vs-budgeted'
  | 'turnaround-time'
  | 'team-productivity'
  | 'capacity-planning'
  | 'overtime-burnout'
  | 'quality-review'

export type ReportData = Record<string, unknown>
