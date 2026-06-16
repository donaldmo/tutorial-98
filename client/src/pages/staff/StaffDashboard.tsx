import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'

import { DeadlineWidget } from '@/components/workflow/analyticsShared'
import api from '@/services/api'
import type { WorkflowUser } from '@/types/workflow'

interface StaffDashboardProps {
  user: WorkflowUser | null
  settings?: { currency_symbol?: string } | null
}

interface StaffMonthlySummary {
  staff_name?: string
  derived_totals?: {
    job_fee_total?: number
    budgeted_wip_total?: number
    budgeted_hours_total?: number
    logged_hours_total?: number
  }
  summary?: {
    total_allocations?: number
    total_allocated_fee?: number
    total_scheduled_hours?: number
    capacity_hours?: number
    remaining_capacity?: number
    utilization_percentage?: number
  }
}

const getCurrentMonth = () => new Date().toISOString().slice(0, 7)

const formatCurrency = (value: number, symbol: string) => `${symbol}${Number(value || 0).toLocaleString()}`

export function StaffDashboard({ user, settings }: StaffDashboardProps) {
  const [summary, setSummary] = useState<StaffMonthlySummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [selectedMonth, setSelectedMonth] = useState(getCurrentMonth())
  const staffId = user?.staff_id || user?.id
  const displayName = user?.name || 'Staff Member'
  const symbol = settings?.currency_symbol || 'R'

  const fetchDashboard = useCallback(async () => {
    if (!staffId) {
      setSummary(null)
      setLoading(false)
      return
    }

    try {
      setLoading(true)
      const response = await api.get(`/staff/${staffId}/monthly-summary`, {
        params: { month: selectedMonth },
      })
      setSummary(response.data || null)
    } catch {
      toast.error('Failed to load your dashboard')
    } finally {
      setLoading(false)
    }
  }, [selectedMonth, staffId])

  useEffect(() => {
    void fetchDashboard()
  }, [fetchDashboard])

  const statCards = useMemo(() => ([
    {
      label: 'Job Fee',
      value: formatCurrency(Number(summary?.derived_totals?.job_fee_total || 0), symbol),
      helper: 'Total unique job fee across your selected-month allocations.',
    },
    {
      label: 'Budgeted WIP',
      value: formatCurrency(Number(summary?.derived_totals?.budgeted_wip_total || 0), symbol),
      helper: 'Hourly rate multiplied by budgeted hours.',
    },
    {
      label: 'Budgeted Hrs',
      value: `${Number(summary?.derived_totals?.budgeted_hours_total || 0).toFixed(2)}h`,
      helper: 'Allocated fee multiplied by efficiency, divided by hourly rate.',
    },
    {
      label: 'Logged Hours',
      value: `${Number(summary?.derived_totals?.logged_hours_total || 0).toFixed(2)}h`,
      helper: `Total logged time against your ${selectedMonth} allocations.`,
    },
  ]), [selectedMonth, summary, symbol])

  const quickLinks = [
    {
      to: '/staff/allocations',
      title: 'Open Allocations',
      description: 'Review your own assigned work and update workflow status.',
      tone: 'border-blue-100 bg-blue-50 text-blue-700',
    },
    {
      to: '/staff/timesheet',
      title: 'Open Timesheet',
      description: 'Log and review only your own time entries.',
      tone: 'border-emerald-100 bg-emerald-50 text-emerald-700',
    },
    {
      to: '/staff/notifications',
      title: 'View Notifications',
      description: 'Check the alerts and workflow updates relevant to you.',
      tone: 'border-amber-100 bg-amber-50 text-amber-700',
    },
    {
      to: '/staff/settings',
      title: 'Open Settings',
      description: 'Manage your profile details and profile picture.',
      tone: 'border-violet-100 bg-violet-50 text-violet-700',
    },
    {
      to: '/staff/change-password',
      title: 'Change Password',
      description: 'Secure your account and update any temporary password.',
      tone: 'border-slate-100 bg-slate-50 text-slate-700',
    },
  ]

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-sky-100 bg-gradient-to-r from-sky-50 via-cyan-50 to-blue-50 p-6 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-600">Staff Self-Service</p>
            <p className="mt-2 truncate text-2xl font-semibold text-slate-900">
              Welcome back{displayName ? `, ${displayName}` : ''}!
            </p>
            <p className="mt-2 max-w-2xl text-sm text-slate-600">
              This space only shows your own workload, deadlines, profile details, notifications, and timesheet activity.
            </p>
          </div>
          <div className="rounded-2xl border border-sky-100 bg-white/80 px-4 py-3 text-sm text-slate-600 shadow-sm">
            <p className="font-medium text-slate-900">{user?.role || 'Staff'}</p>
            <p className="truncate">{user?.email || 'No email available'}</p>
          </div>
        </div>
        <div className="mt-4 flex items-center gap-2">
          <label className="text-xs font-semibold uppercase tracking-wide text-sky-700">Month</label>
          <input
            type="month"
            value={selectedMonth}
            onChange={(event) => setSelectedMonth(event.target.value)}
            className="rounded-lg border border-sky-200 bg-white px-3 py-1.5 text-sm text-slate-700"
          />
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {statCards.map((card) => (
          <div key={card.label} className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
            <p className="text-sm font-medium text-gray-500">{card.label}</p>
            {loading ? (
              <div className="mt-3 h-10 w-20 animate-pulse rounded-lg bg-gray-100" />
            ) : (
              <p className="mt-2 text-3xl font-bold text-gray-900">{card.value}</p>
            )}
            <p className="mt-2 text-xs text-gray-500">{card.helper}</p>
          </div>
        ))}
      </div>

      <div className="space-y-6">
        <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-bold text-gray-900">Quick Links</h2>
          <p className="mt-1 text-sm text-gray-500">Open the self-service pages you already have access to.</p>
          <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {quickLinks.map((link) => (
              <Link
                key={link.to}
                to={link.to}
                className={`rounded-2xl border p-4 transition hover:shadow-sm ${link.tone}`}
              >
                <p className="font-semibold">{link.title}</p>
                <p className="mt-2 text-xs leading-5 text-slate-600">{link.description}</p>
              </Link>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-bold text-gray-900">My Upcoming Deadlines</h2>
          <p className="mt-1 text-sm text-gray-500">Only deadlines linked to your own assigned work appear here.</p>
          <div className="mt-5">
            <DeadlineWidget staffId={staffId} />
          </div>
        </div>
      </div>
    </div>
  )
}
