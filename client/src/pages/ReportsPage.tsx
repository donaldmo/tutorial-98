import { useCallback, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { Printer } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Modal, formatCurrency } from '@/components/workflow/shared'
import { getStatusBadgeClass, normalizeStatusLabel } from '@/pages/reports/reportNormalization'
import { useWorkflowPageHeader } from '@/pages/workflow/WorkflowPageHeaderContext'
import api from '@/services/api'
import type { ReportType } from '@/types/reports'
import type { WorkflowSettings } from '@/types/workflow'

type DrilldownState = { open: boolean; title: string; data: Record<string, unknown>[]; columns: string[] }
type DetailDrawerState = { open: boolean; row: Record<string, unknown> | null }

const getCurrentMonth = () => new Date().toISOString().slice(0, 7)

const toNumber = (value: unknown) => {
  const num = Number(value)
  return Number.isFinite(num) ? num : 0
}

const toText = (value: unknown) => value === null || value === undefined ? '' : String(value)

const escapeCsv = (value: unknown) => `"${toText(value).replace(/"/g, '""')}"`

const formatReportValue = (key: string, value: unknown, symbol: string) => {
  const keyLower = key.toLowerCase()
  if (typeof value === 'number') {
    if (keyLower.includes('count') || keyLower === 'jobs' || keyLower === 'late' || keyLower === 'on_time' || keyLower === 'jobs_in_progress' || keyLower === 'total_jobs_in_progress' || keyLower === 'total_wip_jobs' || keyLower === 'team_size' || keyLower === 'jobs_assigned') return value.toFixed(0)
    if (keyLower.includes('hourly_rate')) return `${formatCurrency(value, symbol)}/hr`
    if (keyLower.includes('percentage') || keyLower.includes('rate') || keyLower.includes('utilization') || keyLower.includes('productivity') || keyLower.includes('adherence') || keyLower.includes('efficiency') || keyLower.includes('margin_percentage') || keyLower.includes('progress') || keyLower.includes('variance_percentage') || keyLower.includes('delivery')) return `${value.toFixed(1)}%`
    if (keyLower.includes('hours') || keyLower === 'available' || keyLower === 'allocated' || keyLower === 'actual' || keyLower === 'budgeted' || keyLower === 'capacity' || keyLower === 'overtime' || keyLower.includes('tat') || keyLower.includes('variance_days')) return `${value.toFixed(1)}h`
    if (keyLower.includes('fee') || keyLower.includes('revenue') || keyLower.includes('cost') || keyLower.includes('contribution') || keyLower.includes('margin') || keyLower.includes('value') || keyLower.includes('wip') || keyLower === 'total_fee' || keyLower === 'net_contribution' || keyLower === 'estimated_cost') return formatCurrency(value, symbol)
    if (keyLower === 'days_variance') return `${value >= 0 ? '+' : ''}${value.toFixed(0)}`
    return value.toFixed(2)
  }
  return String(value ?? '-')
}

const MetricCard = ({ label, value, color, onClick, info, compact = false }: any) => (
  <div onClick={onClick} className={`${color} ${compact ? 'p-3' : 'p-4'} rounded-xl text-center cursor-pointer hover:shadow-lg hover:scale-105 transition-all duration-200 border-2 border-transparent hover:border-gray-300`}>
    <div className="flex items-center justify-center gap-2">
      <p className={`${compact ? 'text-xs' : 'text-sm'} ${color.includes('blue') ? 'text-blue-600' : color.includes('green') ? 'text-green-600' : color.includes('purple') ? 'text-purple-600' : color.includes('yellow') ? 'text-yellow-600' : color.includes('orange') ? 'text-orange-600' : color.includes('red') ? 'text-red-600' : 'text-gray-600'}`}>
        {label}
      </p>
      {info ? (
        <div className="group relative" onClick={(event) => event.stopPropagation()}>
          <button
            type="button"
            aria-label={`${info.title} info`}
            className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-gray-300 bg-white/80 text-[9px] font-semibold leading-none text-gray-600"
          >
            i
          </button>
          <div className="pointer-events-none absolute left-1/2 top-full z-20 mt-2 hidden w-72 -translate-x-1/2 rounded-lg border border-gray-200 bg-white p-3 text-left shadow-lg group-hover:block">
            <p className="text-xs font-semibold text-gray-900">{info.title}</p>
            <p className="mt-1 text-xs leading-5 text-gray-600">{info.description}</p>
            <p className="mt-2 text-xs font-medium text-gray-800">Calculation</p>
            <p className="mt-1 text-xs leading-5 text-gray-600">{info.formula}</p>
            {info.example ? (
              <>
                <p className="mt-2 text-xs font-medium text-gray-800">Example</p>
                <p className="mt-1 text-xs leading-5 text-gray-600">{info.example}</p>
              </>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
    <p className={`${compact ? 'text-xl' : 'text-2xl'} font-bold ${color.includes('blue') ? 'text-blue-700' : color.includes('green') ? 'text-green-700' : color.includes('purple') ? 'text-purple-700' : color.includes('yellow') ? 'text-yellow-700' : color.includes('orange') ? 'text-orange-700' : color.includes('red') ? 'text-red-700' : 'text-gray-700'}`}>
      {value}
    </p>
    <p className={`text-gray-500 ${compact ? 'mt-0.5 text-[11px]' : 'mt-1 text-xs'}`}>Click to view details</p>
  </div>
)

// ====== STATIC REPORT DATA ======

interface TableColumn {
  key: string
  label: string
  info?: SummaryCardInfo
}

interface SummaryCardInfo {
  title: string
  description: string
  formula: string
  example?: string
}

interface ReportConfig {
  summaryCards?: { label: string; key: string; color: string; filterKey?: string; filterValue?: string; info?: SummaryCardInfo; drilldownDataset?: 'default' | 'quality-review-staff' }[]
  columns: TableColumn[]
  rows: Record<string, unknown>[]
}

const AVAILABLE_HOURS_INFO: SummaryCardInfo = {
  title: 'Available Hours',
  description: 'The total work hours available in the selected period for the included staff.',
  formula: 'Annual Budgeted Hours / 12 x Number of Months in scope',
}

const ALLOCATED_HOURS_INFO: SummaryCardInfo = {
  title: 'Allocated Hours',
  description: 'The total planned job hours assigned in the selected period.',
  formula: 'Sum of allocation adjusted_hours for the included rows',
}

const ACTUAL_HOURS_INFO: SummaryCardInfo = {
  title: 'Actual Hours',
  description: 'The total logged timesheet hours for the included report rows and selected period.',
  formula: 'Sum of time entry hours_worked for the included scope',
}

const UTILIZATION_INFO: SummaryCardInfo = {
  title: 'Utilization',
  description: 'Shows how much of the available time has been assigned to work.',
  formula: '(Allocated Hours / Available or Capacity Hours) x 100',
}

const PRODUCTIVITY_INFO: SummaryCardInfo = {
  title: 'Productivity',
  description: 'Shows how efficiently actual work tracked against planned allocations.',
  formula: '(Actual Hours / Allocated Hours) x 100',
}

const TOTAL_STAFF_INFO: SummaryCardInfo = {
  title: 'Total Staff',
  description: 'The total number of staff rows included in the selected report.',
  formula: 'Count of included staff rows',
}

const BUDGETED_HOURS_INFO: SummaryCardInfo = {
  title: 'Budgeted Hours',
  description: 'The total planned hours for the selected report scope.',
  formula: 'Sum of budgeted or allocated hours for the included rows',
}

const ESTIMATED_COST_INFO: SummaryCardInfo = {
  title: 'Estimated Cost',
  description: 'The estimated internal delivery cost using allocated hours and the effective hourly rate.',
  formula: 'Allocated Hours x Effective Hourly Rate x 0.5',
}

const NET_CONTRIBUTION_INFO: SummaryCardInfo = {
  title: 'Net Contribution',
  description: 'The value left after subtracting estimated internal cost from allocated revenue.',
  formula: 'Allocated Revenue - Estimated Cost',
}

const REVENUE_PER_HEAD_INFO: SummaryCardInfo = {
  title: 'Revenue per Head',
  description: 'The average allocated revenue per included staff member or team headcount.',
  formula: 'Total Allocated Revenue / Total Staff',
}

const JOBS_ASSIGNED_INFO: SummaryCardInfo = {
  title: 'Jobs Assigned',
  description: 'The total number of unique selected-month jobs represented in the report scope.',
  formula: 'Count of unique included job_ids',
}

const BUDGET_ADHERENCE_INFO: SummaryCardInfo = {
  title: 'Budget Adherence',
  description: 'Shows how closely actual work stays within planned hours.',
  formula: '(Budgeted Hours / Actual Hours) x 100, capped where applicable',
}

const ON_TIME_DELIVERY_INFO: SummaryCardInfo = {
  title: 'On-Time Delivery',
  description: 'Shows what percentage of included jobs were delivered on or before deadline.',
  formula: '(On Time Jobs / Jobs Assigned) x 100',
}

const CAPACITY_INFO: SummaryCardInfo = {
  title: 'Capacity',
  description: 'The total workable hours available for the staff member in the selected month.',
  formula: 'Monthly Capacity or Effective Capacity hours for the selected month',
}

const OVERTIME_INFO: SummaryCardInfo = {
  title: 'Overtime',
  description: 'The amount of work done beyond the planned or budgeted hours.',
  formula: 'Max(0, Actual Hours - Budgeted Hours)',
}

const RISK_LEVEL_INFO: SummaryCardInfo = {
  title: 'Risk Level',
  description: 'A workload risk flag derived from how much actual work exceeded plan.',
  formula: 'High / Medium / Low based on overtime thresholds in the report logic',
}

const VARIANCE_INFO: SummaryCardInfo = {
  title: 'Variance',
  description: 'The difference between actual hours and budgeted hours.',
  formula: 'Actual Hours - Budgeted Hours',
}

const STATUS_OVER_BUDGET_INFO: SummaryCardInfo = {
  title: 'Status',
  description: 'A simple budget health label for the row based on the variance result.',
  formula: 'Over Budget when variance > 0, otherwise On Track',
}

const TOTAL_FEE_INFO: SummaryCardInfo = {
  title: 'Total Fee',
  description: 'The total engagement value of the included job.',
  formula: 'Job fee as stored on the included job',
}

const WIP_VALUE_INFO: SummaryCardInfo = {
  title: 'WIP Value',
  description: 'The estimated monetary value of work done but not yet billed.',
  formula: 'Allocated Fee x (Progress % / 100)',
}

const WIP_PROGRESS_INFO: SummaryCardInfo = {
  title: 'Progress',
  description: 'The percentage of the job completed based on hours worked versus budgeted hours.',
  formula: '(Actual Hours Worked / Total Budgeted Hours) x 100',
}

const REVENUE_INFO: SummaryCardInfo = {
  title: 'Revenue',
  description: 'The total engagement value for the included rows in the selected period.',
  formula: 'Sum of effective job fee or allocated revenue for the included scope',
}

const LABOR_COST_INFO: SummaryCardInfo = {
  title: 'Labor Cost',
  description: 'The estimated internal delivery cost for the included work.',
  formula: 'Allocated or Actual Hours x Effective Staff Rate x 0.5',
}

const GROSS_MARGIN_INFO: SummaryCardInfo = {
  title: 'Gross Margin',
  description: 'The profit remaining after direct labor cost is deducted from revenue.',
  formula: 'Revenue - Labor Cost',
}

const MARGIN_PERCENTAGE_INFO: SummaryCardInfo = {
  title: 'Margin %',
  description: 'The profitability ratio showing what percentage of revenue remains after labor cost.',
  formula: '(Gross Margin / Revenue) x 100',
}

const JOB_COUNT_INFO: SummaryCardInfo = {
  title: 'Jobs',
  description: 'The number of jobs contributing to the row or summary total.',
  formula: 'Count of included jobs',
}

const EXCEPTIONS_INFO: SummaryCardInfo = {
  title: 'Exceptions',
  description: 'The number of flagged report exceptions in the selected period.',
  formula: 'Count of rows where the exception rule is met',
}

const AVG_VARIANCE_INFO: SummaryCardInfo = {
  title: 'Average Variance',
  description: 'The average variance percentage across the included exceptions.',
  formula: 'Total Variance % / Number of Exceptions',
}

const QUALITY_ISSUE_INFO: SummaryCardInfo = {
  title: 'Issue',
  description: 'The quality-review issue category assigned when a row breaches the exception threshold.',
  formula: 'Flag shown when Variance % > 30%',
}

const MAX_VARIANCE_INFO: SummaryCardInfo = {
  title: 'Max Variance',
  description: 'The highest exception variance recorded for the included staff row.',
  formula: 'Maximum variance percentage across that staff member’s flagged exceptions',
}

const TRAINING_FOCUS_INFO: SummaryCardInfo = {
  title: 'Training Focus',
  description: 'The suggested improvement area based on the severity of repeated quality exceptions.',
  formula: 'Derived recommendation from the report’s variance severity rules',
}

const STATIC_REPORTS: Record<ReportType, ReportConfig> = {
  'utilization-productivity': {
    summaryCards: [
      { label: '🔵 Available Hours', key: 'available_hours', color: 'bg-blue-50', info: AVAILABLE_HOURS_INFO },
      { label: '🟢 Allocated Hours', key: 'allocated_hours', color: 'bg-green-50', info: ALLOCATED_HOURS_INFO },
      { label: '🟣 Actual Hours', key: 'actual_hours', color: 'bg-purple-50', info: ACTUAL_HOURS_INFO },
      { label: '🟡 Utilization', key: 'utilization', color: 'bg-yellow-50', info: UTILIZATION_INFO },
      { label: '🔴 Productivity', key: 'productivity', color: 'bg-red-50', info: PRODUCTIVITY_INFO },
    ],
    columns: [
      { key: 'staff_name', label: 'STAFF' },
      { key: 'role', label: 'ROLE' },
      { key: 'available_hours', label: 'AVAILABLE', info: AVAILABLE_HOURS_INFO },
      { key: 'allocated_hours', label: 'ALLOCATED', info: ALLOCATED_HOURS_INFO },
      { key: 'actual_hours', label: 'ACTUAL', info: ACTUAL_HOURS_INFO },
      { key: 'utilization_percentage', label: 'UTILIZATION', info: UTILIZATION_INFO },
      { key: 'productivity_percentage', label: 'PRODUCTIVITY', info: PRODUCTIVITY_INFO },
    ],
    rows: [
      { staff_name: 'Johan van der Merwe', role: 'Partner', available_hours: 84.0, allocated_hours: 0.0, actual_hours: 0, utilization_percentage: 0.0, productivity_percentage: 0.0 },
      { staff_name: 'Thandi Nkosi', role: 'Director', available_hours: 97.5, allocated_hours: 0.0, actual_hours: 0, utilization_percentage: 0.0, productivity_percentage: 0.0 },
      { staff_name: 'Pieter Botha', role: 'Manager', available_hours: 120.0, allocated_hours: 0.0, actual_hours: 0, utilization_percentage: 0.0, productivity_percentage: 0.0 },
      { staff_name: 'Nomvula Dlamini', role: 'Senior Accountant', available_hours: 142.8, allocated_hours: 0.0, actual_hours: 0, utilization_percentage: 0.0, productivity_percentage: 0.0 },
      { staff_name: 'David Kruger', role: 'Senior Accountant', available_hours: 142.8, allocated_hours: 0.0, actual_hours: 0, utilization_percentage: 0.0, productivity_percentage: 0.0 },
      { staff_name: 'Lerato Molefe', role: 'Accountant', available_hours: 158.3, allocated_hours: 0.0, actual_hours: 0, utilization_percentage: 0.0, productivity_percentage: 0.0 },
      { staff_name: 'Hennie Venter', role: 'Accountant', available_hours: 158.3, allocated_hours: 0.0, actual_hours: 0, utilization_percentage: 0.0, productivity_percentage: 0.0 },
      { staff_name: 'Sipho Zulu', role: 'Junior Accountant', available_hours: 167.2, allocated_hours: 0.0, actual_hours: 0, utilization_percentage: 0.0, productivity_percentage: 0.0 },
      { staff_name: 'Christine du Plessis', role: 'Junior Accountant', available_hours: 112.3, allocated_hours: 0.0, actual_hours: 0, utilization_percentage: 0.0, productivity_percentage: 0.0 },
      { staff_name: 'Fatima Patel', role: 'Admin', available_hours: 167.2, allocated_hours: 0.0, actual_hours: 0, utilization_percentage: 0.0, productivity_percentage: 0.0 },
      { staff_name: 'Mollen M', role: 'Partner', available_hours: 0.0, allocated_hours: 0.0, actual_hours: 0, utilization_percentage: 0.0, productivity_percentage: 0.0 },
      { staff_name: 'Updated Test Staff Member', role: 'Accountant', available_hours: 0.0, allocated_hours: 0.0, actual_hours: 0, utilization_percentage: 0.0, productivity_percentage: 0.0 },
      { staff_name: 'Updated Test Staff Member', role: 'Accountant', available_hours: 0.0, allocated_hours: 0.0, actual_hours: 0, utilization_percentage: 0.0, productivity_percentage: 0.0 },
      { staff_name: 'Sarah Supervisor', role: 'Manager', available_hours: 0.0, allocated_hours: 0.0, actual_hours: 0, utilization_percentage: 0.0, productivity_percentage: 0.0 },
      { staff_name: 'Tom Auditor', role: 'Senior Accountant', available_hours: 0.0, allocated_hours: 0.0, actual_hours: 0, utilization_percentage: 0.0, productivity_percentage: 0.0 },
      { staff_name: 'Lisa Junior', role: 'Accountant', available_hours: 0.0, allocated_hours: 0.0, actual_hours: 0, utilization_percentage: 0.0, productivity_percentage: 0.0 },
      { staff_name: 'Mike Trainee', role: 'Junior Accountant', available_hours: 0.0, allocated_hours: 0.0, actual_hours: 0, utilization_percentage: 0.0, productivity_percentage: 0.0 },
    ],
  },
  'wip-status': {
    summaryCards: [
      { label: '🟣 Total WIP Value', key: 'total_wip_value', color: 'bg-purple-50', info: { title: 'Total WIP Value', description: 'The total unbilled value of work already performed across included jobs.', formula: 'Sum of all individual job WIP values' } },
      { label: '🔵 Jobs In Progress', key: 'jobs_in_progress', color: 'bg-blue-50', filterKey: 'status_bucket', filterValue: 'In Progress', info: { title: 'Jobs In Progress', description: 'The number of included jobs currently in progress for the selected month.', formula: 'Count of included jobs where status_bucket = In Progress' } },
      { label: '🟢 Allocated', key: 'allocated_count', color: 'bg-green-50', filterKey: 'status_bucket', filterValue: 'Fully Allocated', info: { title: 'Allocated', description: 'The number of included jobs that are fully allocated in the report result.', formula: 'Count of included jobs where status_bucket = Fully Allocated' } },
      { label: '🟡 Pending', key: 'pending_count', color: 'bg-yellow-50', filterKey: 'status_bucket', filterValue: 'Pending', info: { title: 'Pending', description: 'The number of included jobs still waiting to start or to be fully progressed.', formula: 'Count of included jobs where status_bucket = Pending' } },
    ],
    columns: [
      { key: 'job_name', label: 'JOB' },
      { key: 'client_name', label: 'CLIENT' },
      { key: 'status', label: 'STATUS' },
      { key: 'total_fee', label: 'TOTAL FEE', info: TOTAL_FEE_INFO },
      { key: 'wip_value', label: 'WIP VALUE', info: WIP_VALUE_INFO },
      { key: 'progress_percentage', label: 'PROGRESS', info: WIP_PROGRESS_INFO },
    ],
    rows: [
      { job_name: 'Q3 VAT Return', client_name: 'Shoprite Holdings', status: 'Fully Allocated', total_fee: 15000.00, wip_value: 15306.12, progress_percentage: 102.0 },
      { job_name: 'Annual Audit 2024', client_name: 'Discovery Ltd', status: 'Pending', total_fee: 450000.00, wip_value: 0.00, progress_percentage: 0.0 },
      { job_name: 'Monthly Bookkeeping Aug', client_name: "Nando's SA", status: 'Pending', total_fee: 8500.00, wip_value: 0.00, progress_percentage: 0.0 },
      { job_name: 'CIPC Annual Return', client_name: 'Woolworths', status: 'Pending', total_fee: 3500.00, wip_value: 0.00, progress_percentage: 0.0 },
      { job_name: 'IT14 Tax Return', client_name: 'MTN Group', status: 'Pending', total_fee: 75000.00, wip_value: 0.00, progress_percentage: 0.0 },
      { job_name: 'B-BBEE Verification', client_name: 'Sasol Ltd', status: 'Pending', total_fee: 85000.00, wip_value: 0.00, progress_percentage: 0.0 },
      { job_name: 'EMP201 Monthly', client_name: 'Pick n Pay', status: 'Pending', total_fee: 4500.00, wip_value: 0.00, progress_percentage: 0.0 },
      { job_name: 'AFS Preparation', client_name: 'Capitec Bank', status: 'Pending', total_fee: 180000.00, wip_value: 0.00, progress_percentage: 0.0 },
      { job_name: 'Tax Advisory', client_name: 'Naspers Ltd', status: 'Pending', total_fee: 125000.00, wip_value: 0.00, progress_percentage: 0.0 },
      { job_name: 'Company Registration', client_name: 'New Startup Pty', status: 'Pending', total_fee: 5500.00, wip_value: 0.00, progress_percentage: 0.0 },
      { job_name: 'Payroll Processing Aug', client_name: 'Clicks Group', status: 'Pending', total_fee: 12000.00, wip_value: 0.00, progress_percentage: 0.0 },
      { job_name: 'Management Accounts Q2', client_name: 'Tiger Brands', status: 'Pending', total_fee: 55000.00, wip_value: 0.00, progress_percentage: 0.0 },
      { job_name: 'Test Audit Job', client_name: 'Test Client Ltd', status: 'Pending', total_fee: 30000.00, wip_value: 0.00, progress_percentage: 0.0 },
      { job_name: 'ABC Corp Annual Audit', client_name: 'ABC Corporation', status: 'In Progress', total_fee: 150000.00, wip_value: 0.00, progress_percentage: 0.0 },
      { job_name: 'XYZ Ltd Tax Review', client_name: 'XYZ Limited', status: 'Pending', total_fee: 85000.00, wip_value: 0.00, progress_percentage: 0.0 },
      { job_name: 'DEF Inc Internal Audit', client_name: 'DEF Inc', status: 'Fully Allocated', total_fee: 120000.00, wip_value: 0.00, progress_percentage: 0.0 },
    ],
  },
  'firm-profitability': {
    summaryCards: [
      {
        label: '🟢 Total Revenue',
        key: 'total_revenue',
        color: 'bg-green-50',
        info: {
          title: 'Revenue',
          description: 'The total engagement value for the jobs included in the selected month, using each job fee as the commercial value.',
          formula: 'Sum of effective job fee per included job, where effective job fee = pricing_override ?? job_fee',
        },
      },
      {
        label: '🔵 Labor Cost',
        key: 'total_labor_cost',
        color: 'bg-blue-50',
        info: {
          title: 'Labor Cost',
          description: 'The estimated internal delivery cost for allocated work, based on budgeted allocation hours rather than logged extra time.',
          formula: 'Sum of allocation adjusted_hours × effective staff rate × 0.5, where effective staff rate = staff hourly_rate or allocated_fee / adjusted_hours',
        },
      },
      {
        label: '🟣 Gross Margin',
        key: 'total_gross_margin',
        color: 'bg-purple-50',
        info: {
          title: 'Gross Margin',
          description: 'The profit left after subtracting direct labor cost from revenue.',
          formula: 'Total Revenue - Labor Cost',
        },
      },
      {
        label: '🟡 Margin %',
        key: 'margin_percentage',
        color: 'bg-yellow-50',
        info: {
          title: 'Margin %',
          description: 'The profitability ratio showing what percentage of revenue remains after labor cost.',
          formula: '(Gross Margin / Total Revenue) × 100',
        },
      },
    ],
    columns: [
      { key: 'service_line', label: 'SERVICE LINE' },
      { key: 'revenue', label: 'REVENUE', info: REVENUE_INFO },
      { key: 'labor_cost', label: 'LABOR COST', info: LABOR_COST_INFO },
      { key: 'gross_margin', label: 'GROSS MARGIN', info: GROSS_MARGIN_INFO },
      { key: 'margin_percentage', label: 'MARGIN %', info: MARGIN_PERCENTAGE_INFO },
      { key: 'job_count', label: 'JOBS', info: JOB_COUNT_INFO },
    ],
    rows: [
      { service_line: 'Audit', revenue: 480000.00, labor_cost: 0, gross_margin: 480000.00, margin_percentage: 100, job_count: 2 },
    ],
  },
  'revenue-per-employee': {
    summaryCards: [
      {
        label: '🟢 Allocated Revenue',
        key: 'total_allocated_revenue',
        color: 'bg-green-50',
        info: {
          title: 'Allocated Revenue',
          description: 'The total planned revenue attributed to staff for the selected month, based on their month allocations.',
          formula: 'Sum of all selected-month allocation allocated_fee values for included staff',
          example: 'If Staff A has allocations of R10 000 and R4 000 in June, their allocated revenue is R14 000.',
        },
      },
      {
        label: '🔵 Estimated Cost',
        key: 'total_estimated_cost',
        color: 'bg-blue-50',
        info: {
          title: 'Estimated Cost',
          description: 'The estimated internal staff delivery cost using allocated hours and a 50% cost ratio.',
          formula: 'Sum of allocation adjusted_hours × effective hourly rate × 0.5',
          example: 'If an allocation has 10h and the effective rate is R200/h, estimated cost is 10 × 200 × 0.5 = R1 000.',
        },
      },
      {
        label: '🟣 Net Contribution',
        key: 'total_net_contribution',
        color: 'bg-purple-50',
        info: {
          title: 'Net Contribution',
          description: 'The value left after subtracting estimated internal cost from allocated revenue.',
          formula: 'Allocated Revenue - Estimated Cost',
          example: 'If allocated revenue is R14 000 and estimated cost is R5 000, net contribution is R9 000.',
        },
      },
      {
        label: '🟡 Revenue / Head',
        key: 'average_revenue_per_head',
        color: 'bg-yellow-50',
        info: {
          title: 'Revenue per Head',
          description: 'The average allocated revenue per included staff member for the selected month.',
          formula: 'Total Allocated Revenue / Total Staff',
          example: 'If total allocated revenue is R60 000 across 6 staff, revenue per head is R10 000.',
        },
      },
      {
        label: '🟠 Total Staff',
        key: 'total_staff',
        color: 'bg-orange-50',
        info: {
          title: 'Total Staff',
          description: 'The number of staff rows included in this report for the selected month.',
          formula: 'Count of included staff with selected-month allocations',
          example: 'If 8 staff members have allocations in June, Total Staff is 8.',
        },
      },
    ],
    columns: [
      { key: 'staff_name', label: 'STAFF' },
      { key: 'role', label: 'ROLE' },
      { key: 'department_name', label: 'DEPARTMENT' },
      { key: 'allocated_revenue', label: 'REVENUE', info: REVENUE_INFO },
      { key: 'estimated_cost', label: 'EST. COST', info: ESTIMATED_COST_INFO },
      { key: 'net_contribution', label: 'NET CONTRIBUTION', info: NET_CONTRIBUTION_INFO },
    ],
    rows: [
      { staff_name: 'Johan van der Merwe', role: 'Partner', department: 'Unassigned', revenue: 0.00, estimated_cost: 0.00, net_contribution: 0.00 },
      { staff_name: 'Thandi Nkosi', role: 'Director', department: 'Unassigned', revenue: 0.00, estimated_cost: 0.00, net_contribution: 0.00 },
      { staff_name: 'Pieter Botha', role: 'Manager', department: 'Unassigned', revenue: 0.00, estimated_cost: 0.00, net_contribution: 0.00 },
      { staff_name: 'Nomvula Dlamini', role: 'Senior Accountant', department: 'Unassigned', revenue: 0.00, estimated_cost: 0.00, net_contribution: 0.00 },
      { staff_name: 'David Kruger', role: 'Senior Accountant', department: 'Unassigned', revenue: 0.00, estimated_cost: 0.00, net_contribution: 0.00 },
      { staff_name: 'Lerato Molefe', role: 'Accountant', department: 'Unassigned', revenue: 0.00, estimated_cost: 0.00, net_contribution: 0.00 },
      { staff_name: 'Hennie Venter', role: 'Accountant', department: 'Unassigned', revenue: 0.00, estimated_cost: 0.00, net_contribution: 0.00 },
      { staff_name: 'Sipho Zulu', role: 'Junior Accountant', department: 'Unassigned', revenue: 0.00, estimated_cost: 0.00, net_contribution: 0.00 },
      { staff_name: 'Christine du Plessis', role: 'Junior Accountant', department: 'Unassigned', revenue: 0.00, estimated_cost: 0.00, net_contribution: 0.00 },
      { staff_name: 'Fatima Patel', role: 'Admin', department: 'Unassigned', revenue: 0.00, estimated_cost: 0.00, net_contribution: 0.00 },
      { staff_name: 'Mollen M', role: 'Partner', department: 'Unassigned', revenue: 0.00, estimated_cost: 0.00, net_contribution: 0.00 },
      { staff_name: 'Updated Test Staff Member', role: 'Accountant', department: 'Unassigned', revenue: 0.00, estimated_cost: 0.00, net_contribution: 0.00 },
      { staff_name: 'Updated Test Staff Member', role: 'Accountant', department: 'Unassigned', revenue: 0.00, estimated_cost: 0.00, net_contribution: 0.00 },
      { staff_name: 'Sarah Supervisor', role: 'Manager', department: 'Unassigned', revenue: 0.00, estimated_cost: 0.00, net_contribution: 0.00 },
      { staff_name: 'Tom Auditor', role: 'Senior Accountant', department: 'Unassigned', revenue: 0.00, estimated_cost: 0.00, net_contribution: 0.00 },
      { staff_name: 'Lisa Junior', role: 'Accountant', department: 'Unassigned', revenue: 0.00, estimated_cost: 0.00, net_contribution: 0.00 },
      { staff_name: 'Mike Trainee', role: 'Junior Accountant', department: 'Unassigned', revenue: 0.00, estimated_cost: 0.00, net_contribution: 0.00 },
    ],
  },
  'actual-vs-budgeted': {
    summaryCards: [
      {
        label: '🔵 Budgeted Hours',
        key: 'budgeted_hours',
        color: 'bg-blue-50',
        info: {
          title: 'Budgeted Hours',
          description: 'The total planned hours for the selected month based on job allocations.',
          formula: 'Sum of selected-month allocation adjusted_hours across included jobs',
          example: 'If Job A has 5h budgeted and Job B has 8h budgeted in June, total budgeted hours are 13h.',
        },
      },
      {
        label: '🟢 Actual Hours',
        key: 'actual_hours',
        color: 'bg-green-50',
        info: {
          title: 'Actual Hours',
          description: 'The total logged timesheet hours for the selected month against the jobs included in this report.',
          formula: 'Sum of all selected-month timesheet hours logged against the job allocations',
          example: 'If June timesheets show 6h on Job A and 4h on Job B, total actual hours are 10h.',
        },
      },
      {
        label: '🔴 Efficiency Gap',
        key: 'efficiency_gap',
        color: 'bg-red-50',
        info: {
          title: 'Efficiency Gap',
          description: 'The overall month variance between actual logged hours and planned budgeted hours.',
          formula: 'Total Actual Hours - Total Budgeted Hours',
          example: 'If actual hours are 10h and budgeted hours are 13h, efficiency gap is -3h.',
        },
      },
      {
        label: '🟣 Jobs Over Budget',
        key: 'jobs_over_budget',
        color: 'bg-purple-50',
        info: {
          title: 'Jobs Over Budget',
          description: 'The number of jobs where actual hours are greater than budgeted hours for the selected month.',
          formula: 'Count of job rows where variance_hours > 0',
          example: 'If 3 jobs have positive variance and 7 do not, Jobs Over Budget is 3.',
        },
      },
    ],
    columns: [
      { key: 'job_name', label: 'JOB' },
      { key: 'client_name', label: 'CLIENT' },
      { key: 'budgeted_hours', label: 'BUDGETED', info: BUDGETED_HOURS_INFO },
      { key: 'actual_hours', label: 'ACTUAL', info: ACTUAL_HOURS_INFO },
      { key: 'variance_hours', label: 'VARIANCE', info: VARIANCE_INFO },
      { key: 'status', label: 'STATUS', info: STATUS_OVER_BUDGET_INFO },
    ],
    rows: [],
  },
  'turnaround-time': {
    summaryCards: [
      {
        label: '🔵 Total Jobs',
        key: 'total_jobs',
        color: 'bg-blue-50',
        info: {
          title: 'Total Jobs',
          description: 'The total number of jobs included for the selected month in the turnaround report.',
          formula: 'Count of jobs with selected-month allocations',
          example: 'If 12 jobs have allocations in June, Total Jobs is 12.',
        },
      },
      {
        label: '🟢 On Time',
        key: 'on_time_count',
        color: 'bg-green-50',
        filterKey: 'performance',
        filterValue: 'On Time',
        info: {
          title: 'On Time',
          description: 'The number of jobs whose allocation date is on or before the deadline.',
          formula: 'Count of jobs where days_variance <= 0',
          example: 'If 8 jobs have zero or negative days variance, On Time is 8.',
        },
      },
      {
        label: '🔴 Late',
        key: 'late_count',
        color: 'bg-red-50',
        filterKey: 'performance',
        filterValue: 'Late',
        info: {
          title: 'Late',
          description: 'The number of jobs whose allocation date is after the deadline.',
          formula: 'Count of jobs where days_variance > 0',
          example: 'If 4 jobs are past deadline, Late is 4.',
        },
      },
      {
        label: '🟣 On-Time Rate',
        key: 'on_time_rate',
        color: 'bg-purple-50',
        info: {
          title: 'On-Time Rate',
          description: 'The percentage of included jobs that are currently on time for the selected month.',
          formula: '(On Time / Total Jobs) x 100',
          example: 'If 8 out of 12 jobs are on time, On-Time Rate is 66.7%.',
        },
      },
    ],
    columns: [
      { key: 'job_name', label: 'JOB' },
      { key: 'client_name', label: 'CLIENT' },
      {
        key: 'status',
        label: 'STATUS',
        info: {
          title: 'Status',
          description: 'The current workflow state of the job for the selected month.',
          formula: 'Taken directly from the job status, for example Pending, In Progress, or Completed',
          example: 'If a job has started but is not finished yet, Status shows In Progress.',
        },
      },
      {
        key: 'days_variance',
        label: 'VARIANCE (DAYS)',
        info: {
          title: 'Variance (Days)',
          description: 'Shows how many days early or late the job was allocated against its deadline.',
          formula: 'Allocated Date - Deadline Date',
          example: 'If the deadline is 25 May and the job was allocated on 28 May, variance is +3 days. If it was allocated on 23 May, variance is -2 days.',
        },
      },
      {
        key: 'performance',
        label: 'PERFORMANCE',
        info: {
          title: 'Performance',
          description: 'A simple deadline result based on the day variance.',
          formula: 'On Time when days_variance <= 0, otherwise Late',
          example: 'If allocation happened on the deadline or earlier, it shows On Time. If allocation happened 5 days after deadline, it shows Late.',
        },
      },
    ],
    rows: [
      { job_name: 'Annual Audit 2024', client_name: 'Discovery Ltd', status: 'Pending', days_variance: 151, performance: 'Late' },
      { job_name: 'IT14 Tax Return', client_name: 'MTN Group', status: 'Pending', days_variance: 147, performance: 'Late' },
      { job_name: 'Q3 VAT Return', client_name: 'Shoprite Holdings', status: 'Fully Allocated', days_variance: 144, performance: 'Late' },
      { job_name: 'AFS Preparation', client_name: 'Capitec Bank', status: 'Pending', days_variance: 139, performance: 'Late' },
      { job_name: 'ABC Corp Annual Audit', client_name: 'ABC Corporation', status: 'In Progress', days_variance: 129, performance: 'Late' },
      { job_name: 'XYZ Ltd Tax Review', client_name: 'XYZ Limited', status: 'Pending', days_variance: 129, performance: 'Late' },
      { job_name: 'DEF Inc Internal Audit', client_name: 'DEF Inc', status: 'Fully Allocated', days_variance: 129, performance: 'Late' },
    ],
  },
  'team-productivity': {
    summaryCards: [
      { label: '🔵 Team Size', key: 'team_size', color: 'bg-blue-50', info: { title: 'Team Size', description: 'The number of staff members represented in the included department or team rows.', formula: 'Count of included staff members in the team scope' } },
      { label: '🟢 Budget Adherence', key: 'budget_adherence', color: 'bg-green-50', info: BUDGET_ADHERENCE_INFO },
      { label: '🟣 On-Time Delivery', key: 'on_time_delivery', color: 'bg-purple-50', info: ON_TIME_DELIVERY_INFO },
      { label: '🟡 Jobs Assigned', key: 'jobs_assigned', color: 'bg-yellow-50', info: JOBS_ASSIGNED_INFO },
    ],
    columns: [
      { key: 'department_name', label: 'TEAM' },
      { key: 'team_size', label: 'TEAM SIZE' },
      {
        key: 'jobs_assigned',
        label: 'JOBS ASSIGNED',
        info: {
          title: 'Jobs Assigned',
          description: 'The total number of unique selected-month jobs represented in this department team.',
          formula: 'Count of unique job_ids linked to the team allocations for the selected month',
          example: 'If the team has allocations on 6 rows but they belong to 3 different jobs, Jobs Assigned is 3.',
        },
      },
      {
        key: 'budget_adherence',
        label: 'BUDGET ADHERENCE',
        info: {
          title: 'Budget Adherence',
          description: 'Shows how closely the team stays within planned hours compared with actual logged work.',
          formula: '(Budgeted Hours / Actual Hours) x 100, capped at 150%',
          example: 'If budgeted hours are 10h and actual hours are 4h, adherence is 250%, but the report caps it to 150%.',
        },
      },
      {
        key: 'on_time_delivery',
        label: 'ON-TIME DELIVERY',
        info: {
          title: 'On-Time Delivery',
          description: 'Shows what percentage of the team jobs were allocated on or before their deadline.',
          formula: '(On Time Jobs / Jobs Assigned) x 100',
          example: 'If 1 out of 2 jobs was allocated on time, On-Time Delivery is 50.0%.',
        },
      },
      {
        key: 'efficiency_score',
        label: 'EFFICIENCY SCORE',
        info: {
          title: 'Efficiency Score',
          description: 'A weighted score combining budget adherence and on-time delivery for the team.',
          formula: '(Budget Adherence x 0.6) + (On-Time Delivery x 0.4)',
          example: 'If Budget Adherence is 150% and On-Time Delivery is 50%, Efficiency Score is 110.0.',
        },
      },
    ],
    rows: [
      { department_name: 'Accounting', team_size: 0, jobs_assigned: 0, budget_adherence: 0, on_time_delivery: 0, efficiency_score: 0 },
    ],
  },
  'capacity-planning': {
    summaryCards: [
      { label: '🔵 Total Staff', key: 'total_staff', color: 'bg-blue-50', info: TOTAL_STAFF_INFO },
      { label: '🔴 Overloaded', key: 'overloaded_count', color: 'bg-red-50', filterKey: 'status', filterValue: 'Overloaded', info: { title: 'Overloaded', description: 'The number of staff whose workload exceeds the report’s healthy capacity threshold.', formula: 'Count of included staff where status = Overloaded' } },
      { label: '🟡 Underutilized', key: 'underutilized_count', color: 'bg-yellow-50', filterKey: 'status', filterValue: 'Underutilized', info: { title: 'Underutilized', description: 'The number of staff with significant spare capacity in the selected month.', formula: 'Count of included staff where status = Underutilized' } },
      { label: '🟢 Optimal', key: 'optimal_count', color: 'bg-green-50', filterKey: 'status', filterValue: 'Optimal', info: { title: 'Optimal', description: 'The number of staff whose workload sits inside the report’s healthy utilization band.', formula: 'Count of included staff where status = Optimal' } },
    ],
    columns: [
      { key: 'staff_name', label: 'STAFF' },
      { key: 'role', label: 'ROLE' },
      { key: 'department', label: 'DEPARTMENT' },
      { key: 'capacity_hours', label: 'CAPACITY', info: CAPACITY_INFO },
      { key: 'allocated_hours', label: 'ALLOCATED', info: ALLOCATED_HOURS_INFO },
      {
        key: 'utilization_percentage',
        label: 'UTILIZATION',
        info: { ...UTILIZATION_INFO, formula: '(Allocated Hours / Capacity Hours) x 100', example: 'If Capacity is 160h and Allocated is 80h, Utilization is 50.0%.' },
      },
      { key: 'status', label: 'STATUS', info: { title: 'Status', description: 'The workload health category assigned from utilization for the selected month.', formula: 'Overloaded if >100%, Underutilized if <50%, otherwise Optimal' } },
    ],
    rows: [
      { staff_name: 'Johan van der Merwe', role: 'Partner', department: 'Unassigned', capacity_hours: 84.0, allocated_hours: 0.0, utilization_percentage: 0.0, status: 'Under-utilized' },
      { staff_name: 'Thandi Nkosi', role: 'Director', department: 'Unassigned', capacity_hours: 97.5, allocated_hours: 0.0, utilization_percentage: 0.0, status: 'Under-utilized' },
      { staff_name: 'Pieter Botha', role: 'Manager', department: 'Unassigned', capacity_hours: 120.0, allocated_hours: 0.0, utilization_percentage: 0.0, status: 'Under-utilized' },
      { staff_name: 'Nomvula Dlamini', role: 'Senior Accountant', department: 'Unassigned', capacity_hours: 142.8, allocated_hours: 0.0, utilization_percentage: 0.0, status: 'Under-utilized' },
      { staff_name: 'David Kruger', role: 'Senior Accountant', department: 'Unassigned', capacity_hours: 142.8, allocated_hours: 0.0, utilization_percentage: 0.0, status: 'Under-utilized' },
      { staff_name: 'Lerato Molefe', role: 'Accountant', department: 'Unassigned', capacity_hours: 158.3, allocated_hours: 0.0, utilization_percentage: 0.0, status: 'Under-utilized' },
      { staff_name: 'Hennie Venter', role: 'Accountant', department: 'Unassigned', capacity_hours: 158.3, allocated_hours: 0.0, utilization_percentage: 0.0, status: 'Under-utilized' },
      { staff_name: 'Sipho Zulu', role: 'Junior Accountant', department: 'Unassigned', capacity_hours: 167.2, allocated_hours: 0.0, utilization_percentage: 0.0, status: 'Under-utilized' },
      { staff_name: 'Christine du Plessis', role: 'Junior Accountant', department: 'Unassigned', capacity_hours: 112.3, allocated_hours: 0.0, utilization_percentage: 0.0, status: 'Under-utilized' },
      { staff_name: 'Fatima Patel', role: 'Admin', department: 'Unassigned', capacity_hours: 167.2, allocated_hours: 0.0, utilization_percentage: 0.0, status: 'Under-utilized' },
      { staff_name: 'Mollen M', role: 'Partner', department: 'Unassigned', capacity_hours: 0.0, allocated_hours: 0.0, utilization_percentage: 0.0, status: 'Under-utilized' },
      { staff_name: 'Updated Test Staff Member', role: 'Accountant', department: 'Unassigned', capacity_hours: 0.0, allocated_hours: 0.0, utilization_percentage: 0.0, status: 'Under-utilized' },
      { staff_name: 'Updated Test Staff Member', role: 'Accountant', department: 'Unassigned', capacity_hours: 0.0, allocated_hours: 0.0, utilization_percentage: 0.0, status: 'Under-utilized' },
      { staff_name: 'Sarah Supervisor', role: 'Manager', department: 'Unassigned', capacity_hours: 0.0, allocated_hours: 0.0, utilization_percentage: 0.0, status: 'Under-utilized' },
      { staff_name: 'Tom Auditor', role: 'Senior Accountant', department: 'Unassigned', capacity_hours: 0.0, allocated_hours: 0.0, utilization_percentage: 0.0, status: 'Under-utilized' },
      { staff_name: 'Lisa Junior', role: 'Accountant', department: 'Unassigned', capacity_hours: 0.0, allocated_hours: 0.0, utilization_percentage: 0.0, status: 'Under-utilized' },
      { staff_name: 'Mike Trainee', role: 'Junior Accountant', department: 'Unassigned', capacity_hours: 0.0, allocated_hours: 0.0, utilization_percentage: 0.0, status: 'Under-utilized' },
    ],
  },
  'overtime-burnout': {
    summaryCards: [
      { label: '🔴 High Risk', key: 'high_risk_count', color: 'bg-red-50', filterKey: 'risk_level', filterValue: 'High', info: { title: 'High Risk', description: 'The number of staff flagged at high overtime or burnout risk in the selected period.', formula: 'Count of included staff where risk_level = High' } },
      { label: '🟠 Medium Risk', key: 'medium_risk_count', color: 'bg-orange-50', filterKey: 'risk_level', filterValue: 'Medium', info: { title: 'Medium Risk', description: 'The number of staff flagged at medium overtime or burnout risk.', formula: 'Count of included staff where risk_level = Medium' } },
      { label: '🟡 Low Risk', key: 'low_risk_count', color: 'bg-yellow-50', filterKey: 'risk_level', filterValue: 'Low', info: { title: 'Low Risk', description: 'The number of staff who remain within the report’s low-risk overtime range.', formula: 'Count of included staff where risk_level = Low' } },
      { label: '🟣 Total Overtime', key: 'total_overtime', color: 'bg-purple-50', info: { ...OVERTIME_INFO, title: 'Total Overtime', formula: 'Sum of overtime hours across the included staff rows' } },
    ],
    columns: [
      { key: 'staff_name', label: 'STAFF' },
      { key: 'role', label: 'ROLE' },
      { key: 'budgeted_hours', label: 'BUDGETED', info: BUDGETED_HOURS_INFO },
      { key: 'actual_hours', label: 'ACTUAL', info: ACTUAL_HOURS_INFO },
      { key: 'overtime_hours', label: 'OVERTIME', info: OVERTIME_INFO },
      { key: 'risk_level', label: 'RISK LEVEL', info: RISK_LEVEL_INFO },
    ],
    rows: [
      { staff_name: 'Johan van der Merwe', role: 'Partner', budgeted_hours: 0, actual_hours: 0, overtime_hours: 0, risk_level: 'Low' },
      { staff_name: 'Thandi Nkosi', role: 'Director', budgeted_hours: 0, actual_hours: 0, overtime_hours: 0, risk_level: 'Low' },
      { staff_name: 'Pieter Botha', role: 'Manager', budgeted_hours: 0, actual_hours: 0, overtime_hours: 0, risk_level: 'Low' },
      { staff_name: 'Nomvula Dlamini', role: 'Senior Accountant', budgeted_hours: 0, actual_hours: 0, overtime_hours: 0, risk_level: 'Low' },
      { staff_name: 'David Kruger', role: 'Senior Accountant', budgeted_hours: 0, actual_hours: 0, overtime_hours: 0, risk_level: 'Low' },
      { staff_name: 'Lerato Molefe', role: 'Accountant', budgeted_hours: 0, actual_hours: 0, overtime_hours: 0, risk_level: 'Low' },
      { staff_name: 'Hennie Venter', role: 'Accountant', budgeted_hours: 0, actual_hours: 0, overtime_hours: 0, risk_level: 'Low' },
      { staff_name: 'Sipho Zulu', role: 'Junior Accountant', budgeted_hours: 0, actual_hours: 0, overtime_hours: 0, risk_level: 'Low' },
      { staff_name: 'Christine du Plessis', role: 'Junior Accountant', budgeted_hours: 0, actual_hours: 0, overtime_hours: 0, risk_level: 'Low' },
      { staff_name: 'Fatima Patel', role: 'Admin', budgeted_hours: 0, actual_hours: 0, overtime_hours: 0, risk_level: 'Low' },
      { staff_name: 'Mollen M', role: 'Partner', budgeted_hours: 0, actual_hours: 0, overtime_hours: 0, risk_level: 'Low' },
      { staff_name: 'Updated Test Staff Member', role: 'Accountant', budgeted_hours: 0, actual_hours: 0, overtime_hours: 0, risk_level: 'Low' },
      { staff_name: 'Updated Test Staff Member', role: 'Accountant', budgeted_hours: 0, actual_hours: 0, overtime_hours: 0, risk_level: 'Low' },
      { staff_name: 'Sarah Supervisor', role: 'Manager', budgeted_hours: 0, actual_hours: 0, overtime_hours: 0, risk_level: 'Low' },
      { staff_name: 'Tom Auditor', role: 'Senior Accountant', budgeted_hours: 0, actual_hours: 0, overtime_hours: 0, risk_level: 'Low' },
      { staff_name: 'Lisa Junior', role: 'Accountant', budgeted_hours: 0, actual_hours: 0, overtime_hours: 0, risk_level: 'Low' },
      { staff_name: 'Mike Trainee', role: 'Junior Accountant', budgeted_hours: 0, actual_hours: 0, overtime_hours: 0, risk_level: 'Low' },
    ],
  },
  'quality-review': {
    summaryCards: [
      { label: '🔴 Total Exceptions', key: 'total_exceptions', color: 'bg-red-50', info: { title: 'Total Exceptions', description: 'The total number of jobs flagged for significant over-budget variance.', formula: 'Count of rows where Variance % > 30%' } },
      { label: '🟡 Staff with Issues', key: 'staff_with_issues', color: 'bg-yellow-50', drilldownDataset: 'quality-review-staff', info: { title: 'Staff with Issues', description: 'The number of staff members with at least one flagged quality-review exception.', formula: 'Count of unique staff with one or more exceptions' } },
      { label: '🟣 Avg Variance', key: 'avg_variance', color: 'bg-purple-50', drilldownDataset: 'quality-review-staff', info: AVG_VARIANCE_INFO },
    ],
    columns: [
      { key: 'staff_name', label: 'STAFF' },
      { key: 'job_name', label: 'JOB' },
      { key: 'variance_percentage', label: 'VARIANCE', info: { title: 'Variance %', description: 'Shows how far actual time exceeded budget for the flagged row.', formula: '((Actual Hours - Budgeted Hours) / Budgeted Hours) x 100' } },
      { key: 'issue', label: 'ISSUE', info: QUALITY_ISSUE_INFO },
    ],
    rows: [
      { staff_name: 'Christine du Plessis', job_name: 'Q3 VAT Return', variance_percentage: 31.1, issue: '🔴' },
    ],
  },
}

const REVENUE_PER_EMPLOYEE_TEAM_COLUMNS: TableColumn[] = [
  { key: 'department_name', label: 'TEAM' },
  { key: 'staff_count', label: 'STAFF' },
  { key: 'allocated_revenue', label: 'REVENUE', info: REVENUE_INFO },
  { key: 'estimated_cost', label: 'EST. COST', info: ESTIMATED_COST_INFO },
  { key: 'net_contribution', label: 'NET CONTRIBUTION', info: NET_CONTRIBUTION_INFO },
  { key: 'revenue_per_head', label: 'REVENUE / HEAD', info: REVENUE_PER_HEAD_INFO },
]

const QUALITY_REVIEW_STAFF_COLUMNS: TableColumn[] = [
  { key: 'staff_name', label: 'STAFF' },
  { key: 'exception_count', label: 'EXCEPTIONS', info: EXCEPTIONS_INFO },
  { key: 'average_variance_percentage', label: 'AVG VARIANCE', info: AVG_VARIANCE_INFO },
  { key: 'max_variance_percentage', label: 'MAX VARIANCE', info: MAX_VARIANCE_INFO },
  { key: 'training_recommendation', label: 'TRAINING FOCUS', info: TRAINING_FOCUS_INFO },
]

const SUMMARY_VALUES: Record<string, Record<string, string | number>> = {
  'utilization-productivity': {
    available_hours: '1 350h',
    allocated_hours: '0.0h',
    actual_hours: '0h',
    utilization: '0.0%',
    productivity: '0.0%',
  },
  'wip-status': {
    total_wip_value: 'R15 306,12',
    jobs_in_progress: 16,
    allocated_count: 1,
    pending_count: 13,
  },
  'firm-profitability': {
    total_revenue: 'R1 404 000,00',
    total_labor_cost: 'R5 175,00',
    total_gross_margin: 'R1 398 825,00',
    margin_percentage: '99.6%',
  },
  'actual-vs-budgeted': {
    budgeted_hours: '0.0h',
    actual_hours: '0h',
    efficiency_gap: '0.0h',
    jobs_over_budget: 0,
  },
  'turnaround-time': {
    total_jobs: 16,
    on_time_count: 0,
    late_count: 7,
    on_time_rate: '0.0%',
  },
  'team-productivity': {
    team_size: 17,
    budget_adherence: '100.0%',
    on_time_delivery: '100.0%',
    jobs_assigned: 0,
  },
  'capacity-planning': {
    total_staff: 17,
    overloaded_count: 0,
    underutilized_count: 17,
    optimal_count: 0,
  },
  'overtime-burnout': {
    high_risk_count: 0,
    medium_risk_count: 0,
    low_risk_count: 17,
    total_overtime: '0h',
  },
  'quality-review': {
    total_exceptions: 1,
    staff_with_issues: 1,
    avg_variance: '31.1%',
  },
}

type ReportsPageProps = {
  settings?: WorkflowSettings | null
  hidePageHeader?: boolean
}

export function ReportsPage({ settings, hidePageHeader = false }: ReportsPageProps) {
  const { setHeader } = useWorkflowPageHeader()
  const symbol = settings?.currency_symbol || 'R'
  const firmName = settings?.firm_name || 'Brendmo Chartered Accountants'
  const tagline = settings?.tagline || 'Accountability Partners'
  const logoUrl = (settings as Record<string, string | undefined | null>)?.logo_base64 || (settings as Record<string, string | undefined | null>)?.logo_url || (settings as Record<string, string | undefined | null>)?.logo
  const [activeReport, setActiveReport] = useState<ReportType>('utilization-productivity')
  const [periodType, setPeriodType] = useState<'monthly' | 'annual' | 'custom'>('monthly')
  const [month, setMonth] = useState(getCurrentMonth())
  const [startDate, setStartDate] = useState(`${new Date().getFullYear()}-01-01`)
  const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0])
  const [year, setYear] = useState(new Date().getFullYear().toString())
  const [drilldownModal, setDrilldownModal] = useState<DrilldownState>({ open: false, title: '', data: [], columns: [] })
  const [detailDrawer, setDetailDrawer] = useState<DetailDrawerState>({ open: false, row: null })
  const [utilizationReport, setUtilizationReport] = useState<any | null>(null)
  const [utilizationLoading, setUtilizationLoading] = useState(false)
  const [utilizationError, setUtilizationError] = useState<string | null>(null)
  const [wipReport, setWipReport] = useState<any | null>(null)
  const [wipLoading, setWipLoading] = useState(false)
  const [wipError, setWipError] = useState<string | null>(null)
  const [firmProfitabilityReport, setFirmProfitabilityReport] = useState<any | null>(null)
  const [firmProfitabilityLoading, setFirmProfitabilityLoading] = useState(false)
  const [firmProfitabilityError, setFirmProfitabilityError] = useState<string | null>(null)
  const [revenuePerEmployeeReport, setRevenuePerEmployeeReport] = useState<any | null>(null)
  const [revenuePerEmployeeLoading, setRevenuePerEmployeeLoading] = useState(false)
  const [revenuePerEmployeeError, setRevenuePerEmployeeError] = useState<string | null>(null)
  const [actualVsBudgetedReport, setActualVsBudgetedReport] = useState<any | null>(null)
  const [actualVsBudgetedLoading, setActualVsBudgetedLoading] = useState(false)
  const [actualVsBudgetedError, setActualVsBudgetedError] = useState<string | null>(null)
  const [turnaroundTimeReport, setTurnaroundTimeReport] = useState<any | null>(null)
  const [turnaroundTimeLoading, setTurnaroundTimeLoading] = useState(false)
  const [turnaroundTimeError, setTurnaroundTimeError] = useState<string | null>(null)
  const [teamProductivityReport, setTeamProductivityReport] = useState<any | null>(null)
  const [teamProductivityLoading, setTeamProductivityLoading] = useState(false)
  const [teamProductivityError, setTeamProductivityError] = useState<string | null>(null)
  const [capacityPlanningReport, setCapacityPlanningReport] = useState<any | null>(null)
  const [capacityPlanningLoading, setCapacityPlanningLoading] = useState(false)
  const [capacityPlanningError, setCapacityPlanningError] = useState<string | null>(null)
  const [overtimeBurnoutReport, setOvertimeBurnoutReport] = useState<any | null>(null)
  const [overtimeBurnoutLoading, setOvertimeBurnoutLoading] = useState(false)
  const [overtimeBurnoutError, setOvertimeBurnoutError] = useState<string | null>(null)
  const [qualityReviewReport, setQualityReviewReport] = useState<any | null>(null)
  const [qualityReviewLoading, setQualityReviewLoading] = useState(false)
  const [qualityReviewError, setQualityReviewError] = useState<string | null>(null)
  const [tableHeaderTooltip, setTableHeaderTooltip] = useState<{ info: SummaryCardInfo; top: number; left: number } | null>(null)

  const getPeriodLabel = useCallback(() => {
    if (periodType === 'monthly') {
      const [y, m] = month.split('-')
      return new Date(Number(y), Number(m) - 1).toLocaleDateString('en-ZA', { month: 'long', year: 'numeric' })
    }
    if (periodType === 'annual') return `Year ${year}`
    return `${startDate} to ${endDate}`
  }, [periodType, month, year, startDate, endDate])

  const reports: Array<{ id: ReportType; name: string; desc: string; icon: string }> = useMemo(() => [
    { id: 'utilization-productivity', name: 'Utilization & Productivity', desc: 'Staff utilization rates and productivity metrics', icon: '📊' },
    { id: 'wip-status', name: 'WIP Status', desc: 'Work in progress and job completion status', icon: '🔄' },
    { id: 'firm-profitability', name: 'Firm Profitability', desc: 'Overall profitability and margin analysis', icon: '💰' },
    { id: 'revenue-per-employee', name: 'Revenue per Employee', desc: 'Individual staff revenue contribution', icon: '👤' },
    { id: 'actual-vs-budgeted', name: 'Actual vs Budgeted', desc: 'Budget variance and performance tracking', icon: '⚖️' },
    { id: 'turnaround-time', name: 'Turnaround Time', desc: 'Job completion speed and deadlines', icon: '⏱️' },
    { id: 'team-productivity', name: 'Team Productivity', desc: 'Team-level performance metrics', icon: '👥' },
    { id: 'capacity-planning', name: 'Capacity Planning', desc: 'Resource availability and planning', icon: '📅' },
    { id: 'overtime-burnout', name: 'Overtime & Burnout', desc: 'Workload risk analysis', icon: '⚠️' },
    { id: 'quality-review', name: 'Quality Review', desc: 'Job quality and efficiency scores', icon: '✅' },
  ], [])

  const activeReportMeta = reports.find((report) => report.id === activeReport)

  useEffect(() => {
    if ((activeReport === 'utilization-productivity' || activeReport === 'wip-status' || activeReport === 'firm-profitability' || activeReport === 'revenue-per-employee' || activeReport === 'actual-vs-budgeted' || activeReport === 'turnaround-time' || activeReport === 'team-productivity' || activeReport === 'capacity-planning' || activeReport === 'overtime-burnout' || activeReport === 'quality-review') && periodType !== 'monthly') {
      setPeriodType('monthly')
    }
  }, [activeReport, periodType])

  const fetchUtilizationReport = useCallback(async () => {
    if (activeReport !== 'utilization-productivity') return

    setUtilizationLoading(true)
    setUtilizationError(null)
    try {
      const qs = new URLSearchParams({ month }).toString()
      const response = await api.get(`/reports/utilization-productivity?${qs}`)
      setUtilizationReport(response.data)
    } catch (err) {
      console.error(err)
      setUtilizationError('Utilization & Productivity data could not be loaded right now.')
    } finally {
      setUtilizationLoading(false)
    }
  }, [activeReport, month])

  useEffect(() => {
    void fetchUtilizationReport()
  }, [fetchUtilizationReport])

  const fetchWipReport = useCallback(async () => {
    if (activeReport !== 'wip-status') return

    setWipLoading(true)
    setWipError(null)
    try {
      const qs = new URLSearchParams({ month }).toString()
      const response = await api.get(`/reports/wip-status?${qs}`)
      setWipReport(response.data)
    } catch (err) {
      console.error(err)
      setWipError('WIP Status data could not be loaded right now.')
    } finally {
      setWipLoading(false)
    }
  }, [activeReport, month])

  useEffect(() => {
    void fetchWipReport()
  }, [fetchWipReport])

  const fetchFirmProfitabilityReport = useCallback(async () => {
    if (activeReport !== 'firm-profitability') return

    setFirmProfitabilityLoading(true)
    setFirmProfitabilityError(null)
    try {
      const qs = new URLSearchParams({ month }).toString()
      const response = await api.get(`/reports/firm-profitability?${qs}`)
      setFirmProfitabilityReport(response.data)
    } catch (err) {
      console.error(err)
      setFirmProfitabilityError('Firm Profitability data could not be loaded right now.')
    } finally {
      setFirmProfitabilityLoading(false)
    }
  }, [activeReport, month])

  useEffect(() => {
    void fetchFirmProfitabilityReport()
  }, [fetchFirmProfitabilityReport])

  const fetchRevenuePerEmployeeReport = useCallback(async () => {
    if (activeReport !== 'revenue-per-employee') return

    setRevenuePerEmployeeLoading(true)
    setRevenuePerEmployeeError(null)
    try {
      const qs = new URLSearchParams({ month }).toString()
      const response = await api.get(`/reports/revenue-per-employee?${qs}`)
      setRevenuePerEmployeeReport(response.data)
    } catch (err) {
      console.error(err)
      setRevenuePerEmployeeError('Revenue per Employee data could not be loaded right now.')
    } finally {
      setRevenuePerEmployeeLoading(false)
    }
  }, [activeReport, month])

  useEffect(() => {
    void fetchRevenuePerEmployeeReport()
  }, [fetchRevenuePerEmployeeReport])

  const fetchActualVsBudgetedReport = useCallback(async () => {
    if (activeReport !== 'actual-vs-budgeted') return

    setActualVsBudgetedLoading(true)
    setActualVsBudgetedError(null)
    try {
      const qs = new URLSearchParams({ month }).toString()
      const response = await api.get(`/reports/actual-vs-budgeted?${qs}`)
      setActualVsBudgetedReport(response.data)
    } catch (err) {
      console.error(err)
      setActualVsBudgetedError('Actual vs Budgeted data could not be loaded right now.')
    } finally {
      setActualVsBudgetedLoading(false)
    }
  }, [activeReport, month])

  useEffect(() => {
    void fetchActualVsBudgetedReport()
  }, [fetchActualVsBudgetedReport])

  const fetchTurnaroundTimeReport = useCallback(async () => {
    if (activeReport !== 'turnaround-time') return

    setTurnaroundTimeLoading(true)
    setTurnaroundTimeError(null)
    try {
      const qs = new URLSearchParams({ month }).toString()
      const response = await api.get(`/reports/turnaround-time?${qs}`)
      setTurnaroundTimeReport(response.data)
    } catch (err) {
      console.error(err)
      setTurnaroundTimeError('Turnaround Time data could not be loaded right now.')
    } finally {
      setTurnaroundTimeLoading(false)
    }
  }, [activeReport, month])

  useEffect(() => {
    void fetchTurnaroundTimeReport()
  }, [fetchTurnaroundTimeReport])

  const fetchTeamProductivityReport = useCallback(async () => {
    if (activeReport !== 'team-productivity') return

    setTeamProductivityLoading(true)
    setTeamProductivityError(null)
    try {
      const qs = new URLSearchParams({ month }).toString()
      const response = await api.get(`/reports/team-productivity?${qs}`)
      setTeamProductivityReport(response.data)
    } catch (err) {
      console.error(err)
      setTeamProductivityError('Team Productivity data could not be loaded right now.')
    } finally {
      setTeamProductivityLoading(false)
    }
  }, [activeReport, month])

  useEffect(() => {
    void fetchTeamProductivityReport()
  }, [fetchTeamProductivityReport])

  const fetchCapacityPlanningReport = useCallback(async () => {
    if (activeReport !== 'capacity-planning') return

    setCapacityPlanningLoading(true)
    setCapacityPlanningError(null)
    try {
      const qs = new URLSearchParams({ month }).toString()
      const response = await api.get(`/reports/capacity-planning?${qs}`)
      setCapacityPlanningReport(response.data)
    } catch (err) {
      console.error(err)
      setCapacityPlanningError('Capacity Planning data could not be loaded right now.')
    } finally {
      setCapacityPlanningLoading(false)
    }
  }, [activeReport, month])

  useEffect(() => {
    void fetchCapacityPlanningReport()
  }, [fetchCapacityPlanningReport])

  const fetchOvertimeBurnoutReport = useCallback(async () => {
    if (activeReport !== 'overtime-burnout') return

    setOvertimeBurnoutLoading(true)
    setOvertimeBurnoutError(null)
    try {
      const qs = new URLSearchParams({ month }).toString()
      const response = await api.get(`/reports/overtime-burnout?${qs}`)
      setOvertimeBurnoutReport(response.data)
    } catch (err) {
      console.error(err)
      setOvertimeBurnoutError('Overtime & Burnout data could not be loaded right now.')
    } finally {
      setOvertimeBurnoutLoading(false)
    }
  }, [activeReport, month])

  useEffect(() => {
    void fetchOvertimeBurnoutReport()
  }, [fetchOvertimeBurnoutReport])

  const fetchQualityReviewReport = useCallback(async () => {
    if (activeReport !== 'quality-review') return

    setQualityReviewLoading(true)
    setQualityReviewError(null)
    try {
      const qs = new URLSearchParams({ month }).toString()
      const response = await api.get(`/reports/quality-review?${qs}`)
      setQualityReviewReport(response.data)
    } catch (err) {
      console.error(err)
      setQualityReviewError('Quality Review data could not be loaded right now.')
    } finally {
      setQualityReviewLoading(false)
    }
  }, [activeReport, month])

  useEffect(() => {
    void fetchQualityReviewReport()
  }, [fetchQualityReviewReport])

  const activeConfig = useMemo(() => {
    const config = STATIC_REPORTS[activeReport]
    if (activeReport === 'utilization-productivity') {
      return {
        ...config,
        rows: utilizationReport?.staff_breakdown || [],
      }
    }
    if (activeReport === 'wip-status') {
      return {
        ...config,
        rows: wipReport?.jobs || [],
      }
    }
    if (activeReport === 'firm-profitability') {
      return {
        ...config,
        rows: firmProfitabilityReport?.service_lines || [],
      }
    }
    if (activeReport === 'revenue-per-employee') {
      return {
        ...config,
        rows: revenuePerEmployeeReport?.staff || [],
      }
    }
    if (activeReport === 'actual-vs-budgeted') {
      return {
        ...config,
        rows: actualVsBudgetedReport?.jobs || [],
      }
    }
    if (activeReport === 'turnaround-time') {
      return {
        ...config,
        rows: turnaroundTimeReport?.jobs || [],
      }
    }
    if (activeReport === 'team-productivity') {
      return {
        ...config,
        rows: teamProductivityReport?.teams || [],
      }
    }
    if (activeReport === 'capacity-planning') {
      return {
        ...config,
        rows: capacityPlanningReport?.staff || [],
      }
    }
    if (activeReport === 'overtime-burnout') {
      return {
        ...config,
        rows: overtimeBurnoutReport?.staff || [],
      }
    }
    if (activeReport === 'quality-review') {
      return {
        ...config,
        rows: qualityReviewReport?.exceptions || [],
      }
    }
    return {
      ...config,
    }
  }, [activeReport, utilizationReport, wipReport, firmProfitabilityReport, revenuePerEmployeeReport, actualVsBudgetedReport, turnaroundTimeReport, teamProductivityReport, capacityPlanningReport, overtimeBurnoutReport, qualityReviewReport])

  const activeSummaryValues = useMemo(() => {
    if (activeReport === 'utilization-productivity') {
      return utilizationReport?.summary || {}
    }
    if (activeReport === 'wip-status') {
      return wipReport?.summary || {}
    }
    if (activeReport === 'firm-profitability') {
      return firmProfitabilityReport?.summary || {}
    }
    if (activeReport === 'revenue-per-employee') {
      return revenuePerEmployeeReport?.summary || {}
    }
    if (activeReport === 'actual-vs-budgeted') {
      return actualVsBudgetedReport?.summary || {}
    }
    if (activeReport === 'turnaround-time') {
      return turnaroundTimeReport?.summary || {}
    }
    if (activeReport === 'team-productivity') {
      return teamProductivityReport?.summary || {}
    }
    if (activeReport === 'capacity-planning') {
      return capacityPlanningReport?.summary || {}
    }
    if (activeReport === 'overtime-burnout') {
      return overtimeBurnoutReport?.summary || {}
    }
    if (activeReport === 'quality-review') {
      return qualityReviewReport?.summary || {}
    }
    return SUMMARY_VALUES[activeReport] || {}
  }, [activeReport, utilizationReport, wipReport, firmProfitabilityReport, revenuePerEmployeeReport, actualVsBudgetedReport, turnaroundTimeReport, teamProductivityReport, capacityPlanningReport, overtimeBurnoutReport, qualityReviewReport])

  const handleDrilldown = (title: string, filterKey?: string, filterValue?: string, drilldownDataset: 'default' | 'quality-review-staff' = 'default') => {
    let filteredData: Record<string, unknown>[] = drilldownDataset === 'quality-review-staff'
      ? (qualityReviewReport?.staff_insights || [])
      : activeReport === 'firm-profitability'
        ? (firmProfitabilityReport?.jobs || activeConfig.rows)
        : activeConfig.rows

    if (filterKey && filterValue !== undefined) {
      filteredData = filteredData.filter((row: Record<string, unknown>) => {
        const rowVal = String(row[filterKey] || '')
        const normRow = normalizeStatusLabel(rowVal).toLowerCase().replace(/\s+/g, '-')
        const normFilter = filterValue.toLowerCase().replace(/\s+/g, '-')
        if (normRow === normFilter) return true
        if (rowVal.toLowerCase() === filterValue.toLowerCase()) return true
        return false
      })
    }
    setDrilldownModal({
      open: true,
      title,
      data: filteredData,
      columns: drilldownDataset === 'quality-review-staff'
        ? QUALITY_REVIEW_STAFF_COLUMNS.map((column) => column.key)
        : activeReport === 'firm-profitability'
          ? ['job_name', 'client_name', 'service_line', 'revenue', 'labor_cost', 'gross_margin', 'margin_percentage', 'actual_hours']
          : activeConfig.columns.map((c) => c.key).filter((k) => k !== 'empty'),
    })
  }

  // ====== EXPORT ======

  const exportToCSV = useCallback(() => {
    const reportName = reports.find((r) => r.id === activeReport)?.name || 'Report'
    let csvContent = `${escapeCsv(firmName)}\n${escapeCsv(tagline)}\n\n`
    csvContent += `${escapeCsv(`${reportName} - ${getPeriodLabel()}`)}\n\n`

    if (Object.keys(activeSummaryValues).length > 0) {
      csvContent += '"SUMMARY"\n'
      Object.entries(activeSummaryValues).forEach(([key, value]) => {
        csvContent += `${escapeCsv(key.replace(/_/g, ' '))},${escapeCsv(String(value))}\n`
      })
      csvContent += '\n'
    }

    if (activeConfig.rows.length > 0) {
      csvContent += '"DETAILED DATA"\n'
      const headers = activeConfig.columns.map((c) => c.key).filter((k) => k !== 'empty')
      csvContent += `${headers.map((h) => escapeCsv(h)).join(',')}\n`
      activeConfig.rows.forEach((row: Record<string, unknown>) => {
        csvContent += `${headers.map((h) => {
          const val = row[h]
          return escapeCsv(typeof val === 'number' ? val.toFixed(2) : (val || ''))
        }).join(',')}\n`
      })
    }

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = `${reportName.replace(/\s+/g, '_')}_${month}.csv`
    link.click()
    toast.success('Report exported to CSV')
  }, [activeConfig, activeReport, activeSummaryValues, reports, firmName, tagline, getPeriodLabel, month])

  const exportToPDF = useCallback(() => {
    const reportName = reports.find((r) => r.id === activeReport)?.name || 'Report'
    const printWindow = window.open('', '_blank')
    const content = document.getElementById('report-content')
    printWindow?.document.write(`
      <html><head><title>${reportName} - ${firmName}</title>
      <style>
        body { font-family: Arial, sans-serif; padding: 20px; }
        .header { display: flex; align-items: center; gap: 15px; border-bottom: 2px solid #333; padding-bottom: 15px; margin-bottom: 20px; }
        .header img { max-width: 80px; max-height: 80px; object-fit: contain; }
        .header-text h1 { margin: 0; color: #333; font-size: 24px; }
        .header-text p { margin: 5px 0 0 0; color: #666; font-size: 14px; }
        .report-title { color: #333; font-size: 20px; margin: 20px 0 5px 0; }
        .report-period { color: #666; font-size: 14px; margin-bottom: 20px; }
        table { width: 100%; border-collapse: collapse; margin-top: 20px; }
        th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
        th { background-color: #f5f5f5; }
        .footer { margin-top: 30px; padding-top: 15px; border-top: 1px solid #ddd; text-align: center; color: #999; font-size: 12px; }
      </style></head><body>
      <div class="header">${logoUrl ? `<img src="${logoUrl}" alt="Logo" />` : ''}<div class="header-text"><h1>${firmName}</h1><p>${tagline}</p></div></div>
      <h2 class="report-title">${reportName}</h2><p class="report-period">Period: ${getPeriodLabel()}</p>${content ? content.innerHTML : ''}<div class="footer">Generated by ${firmName} • ${new Date().toLocaleDateString()}</div></body></html>
    `)
    printWindow?.document.close()
    printWindow?.print()
    toast.success('Report sent to print/PDF')
  }, [activeReport, reports, firmName, logoUrl, getPeriodLabel, tagline])

  const reportHeaderActions: React.ReactNode = useMemo(() => (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <Button type="button" variant="outline" size="sm" className="rounded-xl">
          <Printer className="h-4 w-4" />Export | Print
        </Button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content align="end" sideOffset={4} className="z-50 w-56 overflow-hidden rounded-md border bg-popover p-1 text-popover-foreground shadow-md">
          <DropdownMenu.Item onSelect={exportToCSV} className="relative flex cursor-default select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none transition-colors focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50">📥 Export CSV</DropdownMenu.Item>
          <DropdownMenu.Item onSelect={() => { void exportToPDF() }} className="relative flex cursor-default select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none transition-colors focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50"><Printer className="h-4 w-4" />Print / PDF</DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  ), [exportToCSV, exportToPDF])

  useEffect(() => {
    setHeader((current) => ({ ...current, actions: reportHeaderActions }))
    return () => {
      setHeader((current) => ({ ...current, actions: undefined }))
    }
  }, [reportHeaderActions, setHeader])

  // ====== RENDER HELPERS ======

  const renderStaticTable = (columns: TableColumn[], rows: Record<string, unknown>[]) => {
    const displayColumns = columns.filter((c) => c.key !== 'empty')

    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-visible">
        {rows.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-gray-500">No records found for this period.</div>
        ) : (
          <div className="overflow-x-auto overflow-y-visible">
            <table className="min-w-full">
              <thead className="bg-gray-50">
                <tr>
                  {displayColumns.map((col) => (
                    <th key={col.key} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      <div className="flex items-center gap-2">
                        <span>{col.label}</span>
                        {col.info ? (() => {
                          const info = col.info
                          return (
                          <div className="relative normal-case" onClick={(event) => event.stopPropagation()}>
                            <button
                              type="button"
                              aria-label={`${info.title} info`}
                              className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-gray-300 bg-white text-[9px] font-semibold leading-none text-gray-600"
                              onMouseEnter={(event) => {
                                const rect = event.currentTarget.getBoundingClientRect()
                                const tooltipWidth = 288
                                const tooltipHeight = 170
                                const viewportPadding = 12
                                const left = Math.min(
                                  Math.max(viewportPadding, rect.left),
                                  Math.max(viewportPadding, window.innerWidth - tooltipWidth - viewportPadding),
                                )
                                const showAbove = rect.bottom + tooltipHeight > window.innerHeight - viewportPadding
                                const top = showAbove
                                  ? Math.max(viewportPadding, rect.top - tooltipHeight - 8)
                                  : rect.bottom + 8
                                setTableHeaderTooltip({ info, top, left })
                              }}
                              onMouseLeave={() => setTableHeaderTooltip(null)}
                              onFocus={(event) => {
                                const rect = event.currentTarget.getBoundingClientRect()
                                const tooltipWidth = 288
                                const tooltipHeight = 170
                                const viewportPadding = 12
                                const left = Math.min(
                                  Math.max(viewportPadding, rect.left),
                                  Math.max(viewportPadding, window.innerWidth - tooltipWidth - viewportPadding),
                                )
                                const showAbove = rect.bottom + tooltipHeight > window.innerHeight - viewportPadding
                                const top = showAbove
                                  ? Math.max(viewportPadding, rect.top - tooltipHeight - 8)
                                  : rect.bottom + 8
                                setTableHeaderTooltip({ info, top, left })
                              }}
                              onBlur={() => setTableHeaderTooltip(null)}
                            >
                              i
                            </button>
                          </div>
                          )
                        })() : null}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rows.map((row, i) => (
                  <tr key={i} className="hover:bg-gray-50">
                    {displayColumns.map((col) => {
                      const val = row[col.key]
                      const colLower = col.key.toLowerCase()
                      if (colLower.includes('status') || colLower.includes('risk_level') || colLower.includes('performance')) {
                        const normalized = normalizeStatusLabel(String(val || '-'))
                        return (
                          <td key={col.key} className="px-4 py-3 text-sm">
                            <span className={`px-2 py-1 rounded-full text-xs ${getStatusBadgeClass(normalized)}`}>
                              {normalized}
                            </span>
                          </td>
                        )
                      }
                      const displayVal = formatReportValue(col.key, val, symbol)
                      return <td key={col.key} className={`px-4 py-3 text-sm ${typeof val === 'number' ? 'font-medium' : ''} text-gray-900`}>{displayVal}</td>
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    )
  }

  // ====== REPORT CONTENT RENDERER ======

  const renderReportContent = () => {
    const config = activeConfig
    const summaryValues = activeSummaryValues
    const cards = config.summaryCards

    const renderCards = (compact = false) => {
      if (!cards || cards.length === 0) return null
      const gridCols = cards.length <= 4 ? `md:grid-cols-${cards.length}` : 'md:grid-cols-5'
      return (
        <div className={`grid grid-cols-2 ${gridCols} ${compact ? 'gap-3 xl:grid-cols-5' : 'gap-4'}`}>
          {cards.map((card) => (
            <MetricCard
              key={card.key}
              label={card.label}
              value={formatReportValue(card.key, summaryValues?.[card.key] ?? '', symbol)}
              color={card.color}
              info={card.info}
              compact={compact}
              onClick={() => handleDrilldown(card.label, card.filterKey, card.filterValue, card.drilldownDataset)}
            />
          ))}
        </div>
      )
    }

    if (activeReport === 'utilization-productivity' || activeReport === 'wip-status' || activeReport === 'firm-profitability' || activeReport === 'revenue-per-employee' || activeReport === 'actual-vs-budgeted' || activeReport === 'turnaround-time' || activeReport === 'team-productivity' || activeReport === 'capacity-planning' || activeReport === 'overtime-burnout' || activeReport === 'quality-review') {
      const isLoading = activeReport === 'utilization-productivity'
        ? utilizationLoading && !utilizationReport
        : activeReport === 'wip-status'
          ? wipLoading && !wipReport
          : activeReport === 'firm-profitability'
            ? firmProfitabilityLoading && !firmProfitabilityReport
            : activeReport === 'revenue-per-employee'
              ? revenuePerEmployeeLoading && !revenuePerEmployeeReport
              : activeReport === 'actual-vs-budgeted'
                ? actualVsBudgetedLoading && !actualVsBudgetedReport
                : activeReport === 'turnaround-time'
                  ? turnaroundTimeLoading && !turnaroundTimeReport
                  : activeReport === 'team-productivity'
                    ? teamProductivityLoading && !teamProductivityReport
                    : activeReport === 'capacity-planning'
                      ? capacityPlanningLoading && !capacityPlanningReport
                      : activeReport === 'overtime-burnout'
                        ? overtimeBurnoutLoading && !overtimeBurnoutReport
                        : qualityReviewLoading && !qualityReviewReport
      const errorMessage = activeReport === 'utilization-productivity'
        ? utilizationError
        : activeReport === 'wip-status'
          ? wipError
          : activeReport === 'firm-profitability'
            ? firmProfitabilityError
            : activeReport === 'revenue-per-employee'
              ? revenuePerEmployeeError
              : activeReport === 'actual-vs-budgeted'
                ? actualVsBudgetedError
                : activeReport === 'turnaround-time'
                  ? turnaroundTimeError
                  : activeReport === 'team-productivity'
                    ? teamProductivityError
                    : activeReport === 'capacity-planning'
                      ? capacityPlanningError
                      : activeReport === 'overtime-burnout'
                        ? overtimeBurnoutError
                        : qualityReviewError
      const loadingMessage = activeReport === 'utilization-productivity'
        ? 'Loading utilization report...'
        : activeReport === 'wip-status'
          ? 'Loading WIP report...'
          : activeReport === 'firm-profitability'
            ? 'Loading Firm Profitability report...'
            : activeReport === 'revenue-per-employee'
              ? 'Loading Revenue per Employee report...'
              : activeReport === 'actual-vs-budgeted'
                ? 'Loading Actual vs Budgeted report...'
                : activeReport === 'turnaround-time'
                  ? 'Loading Turnaround Time report...'
                  : activeReport === 'team-productivity'
                    ? 'Loading Team Productivity report...'
                    : activeReport === 'capacity-planning'
                      ? 'Loading Capacity Planning report...'
                      : activeReport === 'overtime-burnout'
                        ? 'Loading Overtime & Burnout report...'
                        : 'Loading Quality Review report...'

      if (isLoading) {
        return <div className="rounded-xl border border-gray-200 bg-white px-4 py-8 text-center text-sm text-gray-500">{loadingMessage}</div>
      }

      if (errorMessage) {
        return <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-8 text-center text-sm text-red-700">{errorMessage}</div>
      }
    }

    switch (activeReport) {
      case 'firm-profitability':
        return (
          <div className="space-y-6">
            {renderCards()}
            <div>
              <h4 className="text-lg font-semibold text-gray-900 mb-3">Profitability by Service Line</h4>
              {renderStaticTable(config.columns, config.rows)}
            </div>
          </div>
        )

      case 'revenue-per-employee':
        return (
          <div className="space-y-6">
            {renderCards(true)}
            <div>
              <h4 className="text-lg font-semibold text-gray-900 mb-3">Revenue by Staff</h4>
              {renderStaticTable(config.columns, config.rows)}
            </div>
            <div>
              <h4 className="text-lg font-semibold text-gray-900 mb-3">Revenue by Team</h4>
              {renderStaticTable(REVENUE_PER_EMPLOYEE_TEAM_COLUMNS, revenuePerEmployeeReport?.teams || [])}
            </div>
          </div>
        )

      case 'quality-review':
        return (
          <div className="space-y-6">
            {renderCards()}
            <div>
              <h4 className="text-lg font-semibold text-gray-900 mb-3">Quality Exceptions by Job</h4>
              {renderStaticTable(config.columns, config.rows)}
            </div>
            <div>
              <h4 className="text-lg font-semibold text-gray-900 mb-3">Staff Exception Insights</h4>
              {renderStaticTable(QUALITY_REVIEW_STAFF_COLUMNS, qualityReviewReport?.staff_insights || [])}
            </div>
          </div>
        )

      default:
        return (
          <div className="space-y-6">
            {renderCards()}
            {renderStaticTable(config.columns, config.rows)}
          </div>
        )
    }
  }

  // ====== MAIN RENDER ======

  return (
    <div className="space-y-6">
      {!hidePageHeader && <div><p className="text-gray-500">Advanced analytics and insights for your firm</p></div>}

      <div className="grid grid-cols-1 lg:grid-cols-[16rem_minmax(0,1fr)] gap-6">
        {/* LEFT SIDEBAR - Report Selector + Period Filter */}
        <div className="space-y-1">
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">Report Period</label>
            <div className="flex gap-1 bg-gray-100 rounded-xl p-1 mb-3">
              <button onClick={() => setPeriodType('monthly')} className={`flex-1 py-2 px-3 text-xs font-medium rounded-lg transition-all ${periodType === 'monthly' ? 'bg-white text-blue-600 shadow' : 'text-gray-600 hover:text-gray-900'}`}>Monthly</button>
              <button onClick={() => setPeriodType('annual')} className={`flex-1 py-2 px-3 text-xs font-medium rounded-lg transition-all ${periodType === 'annual' ? 'bg-white text-blue-600 shadow' : 'text-gray-600 hover:text-gray-900'}`}>Annual</button>
              <button onClick={() => setPeriodType('custom')} className={`flex-1 py-2 px-3 text-xs font-medium rounded-lg transition-all ${periodType === 'custom' ? 'bg-white text-blue-600 shadow' : 'text-gray-600 hover:text-gray-900'}`}>Custom</button>
            </div>
            {periodType === 'monthly' && <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm" />}
            {periodType === 'annual' && (
              <select value={year} onChange={(e) => setYear(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm">
                {[2022, 2023, 2024, 2025, 2026].map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
            )}
            {periodType === 'custom' && (
              <div className="space-y-2">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">From</label>
                  <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm" />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">To</label>
                  <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm" />
                </div>
              </div>
            )}
          </div>

          <div className="space-y-1">
            {reports.map((report) => (
              <button
                key={report.id}
                onClick={() => setActiveReport(report.id)}
                className={`w-full text-left px-4 py-3 rounded-xl text-sm font-medium transition-all flex items-center gap-3 ${
                  activeReport === report.id
                    ? 'bg-blue-50 text-blue-700 shadow-sm border border-blue-200'
                    : 'text-gray-700 hover:bg-gray-50 hover:text-gray-900'
                }`}
              >
                <span className="text-base">{report.icon}</span>
                <div className="flex flex-col">
                  <span>{report.name}</span>
                  <span className={`text-xs font-normal ${activeReport === report.id ? 'text-blue-500' : 'text-gray-400'}`}>{report.desc}</span>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* RIGHT CONTENT - Report Body */}
        <div>
          <div className="mb-4">
            <h3 className="text-lg font-semibold text-gray-900">{activeReportMeta?.name}</h3>
            <p className="text-sm text-gray-500">{getPeriodLabel()} &middot; <span className="text-gray-400">Click on any metric card to drill down</span></p>
          </div>

          <div id="report-content">
            {renderReportContent()}
          </div>
        </div>
      </div>

      {/* DETAIL DRAWER */}
      <Sheet open={detailDrawer.open} onOpenChange={(open) => setDetailDrawer({ open, row: open ? detailDrawer.row : null })}>
        <SheetContent side="right" className="w-full overflow-y-auto p-0 sm:max-w-lg">
          <SheetHeader className="border-b px-6 py-5">
            <SheetTitle>{String(detailDrawer.row?.job_name || 'WIP Details')}</SheetTitle>
            <SheetDescription>{String(detailDrawer.row?.client_name || 'Job information')}</SheetDescription>
          </SheetHeader>
          <div className="space-y-5 px-6 py-5">
            <div>
              <h4 className="text-sm font-semibold text-gray-900">Job Summary</h4>
              <div className="mt-3 rounded-lg border border-gray-100 bg-gray-50 p-4 grid grid-cols-2 gap-3">
                <div>
                  <p className="text-xs uppercase text-gray-500">Total Fee</p>
                  <p className="font-medium text-gray-900">{formatReportValue('total_fee', toNumber(detailDrawer.row?.total_fee), symbol)}</p>
                </div>
                <div>
                  <p className="text-xs uppercase text-gray-500">WIP Value</p>
                  <p className="font-medium text-gray-900">{formatReportValue('wip_value', toNumber(detailDrawer.row?.wip_value), symbol)}</p>
                </div>
                <div>
                  <p className="text-xs uppercase text-gray-500">Status</p>
                  <p className="font-medium text-gray-900">
                    <span className={`px-2 py-1 rounded-full text-xs ${getStatusBadgeClass(normalizeStatusLabel(String(detailDrawer.row?.status || 'Unknown')))}`}>
                      {normalizeStatusLabel(String(detailDrawer.row?.status || 'Unknown'))}
                    </span>
                  </p>
                </div>
                <div>
                  <p className="text-xs uppercase text-gray-500">Progress</p>
                  <p className="font-medium text-gray-900">{formatReportValue('progress_percentage', toNumber(detailDrawer.row?.progress_percentage), symbol)}</p>
                </div>
              </div>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* DRILLDOWN MODAL */}
      <Modal isOpen={drilldownModal.open} onClose={() => setDrilldownModal({ open: false, title: '', data: [], columns: [] })} title={drilldownModal.title} size="lg">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-500">{drilldownModal.data.length} records found</p>
            <button
              onClick={() => {
                const cols = drilldownModal.columns
                const csvContent = `${cols.join(',')}\n${drilldownModal.data.map((row: any) => cols.map((col: string) => { const val = row[col]; return typeof val === 'number' ? val.toFixed(2) : (val || '') }).join(',')).join('\n')}`
                const blob = new Blob([csvContent], { type: 'text/csv' })
                const link = document.createElement('a')
                link.href = URL.createObjectURL(blob)
                link.download = `${drilldownModal.title.replace(/\s+/g, '_')}.csv`
                link.click()
                toast.success('Drilldown data exported')
              }}
              className="text-sm text-blue-600 hover:text-blue-800 font-medium"
            >
              Export this data →
            </button>
          </div>
          {drilldownModal.data.length > 0 ? (
            <div className="overflow-x-auto max-h-96">
              <table className="min-w-full">
                <thead className="bg-gray-50 sticky top-0">
                  <tr>
                    {drilldownModal.columns.map((col: string, i: number) => (
                      <th key={i} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{col.replace(/_/g, ' ')}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {drilldownModal.data.map((row: any, i: number) => (
                    <tr key={i} className="hover:bg-gray-50">
                      {drilldownModal.columns.map((col: string, j: number) => {
                        const val = row[col]
                        const displayVal = formatReportValue(col, val, symbol)
                        return <td key={j} className="px-4 py-3 text-sm text-gray-900">{displayVal}</td>
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center py-8 text-gray-500">No data available for this selection</div>
          )}
        </div>
      </Modal>

      {tableHeaderTooltip && typeof document !== 'undefined'
        ? createPortal(
          <div
            className="pointer-events-none fixed z-[250] w-72 rounded-lg border border-gray-200 bg-white p-3 text-left shadow-2xl"
            style={{ top: `${tableHeaderTooltip.top}px`, left: `${tableHeaderTooltip.left}px` }}
          >
            <p className="text-xs font-semibold text-gray-900">{tableHeaderTooltip.info.title}</p>
            <p className="mt-1 text-xs leading-5 text-gray-600">{tableHeaderTooltip.info.description}</p>
            <p className="mt-2 text-xs font-medium text-gray-800">Calculation</p>
            <p className="mt-1 text-xs leading-5 text-gray-600">{tableHeaderTooltip.info.formula}</p>
            {tableHeaderTooltip.info.example ? (
              <>
                <p className="mt-2 text-xs font-medium text-gray-800">Example</p>
                <p className="mt-1 text-xs leading-5 text-gray-600">{tableHeaderTooltip.info.example}</p>
              </>
            ) : null}
          </div>,
          document.body,
        )
        : null}
    </div>
  )
}
