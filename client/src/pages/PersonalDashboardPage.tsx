import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'

import { Icons } from '@/components/workflow/shared'
import { DeadlineWidget } from '@/components/workflow/analyticsShared'
import { StaffProfileEditorCard } from '@/components/staff/StaffProfileEditorCard'
import api from '@/services/api'
import type { WorkflowUser } from '@/types/workflow'

interface PersonalDashboardPageProps {
  user: WorkflowUser | null
  settings?: any
  hidePageHeader?: boolean
  onUserUpdate?: (user: WorkflowUser) => void
}

interface PersonalSummary {
  assigned_allocations: number
  assigned_jobs: number
  total_adjusted_hours: number
  completed_allocations: number
  total_logged_hours: number
}

export function PersonalDashboardPage({ user, settings: _settings, hidePageHeader = false, onUserUpdate }: PersonalDashboardPageProps) {
  const [dashboardData, setDashboardData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const staffId = user?.staff_id || user?.id

  const fetchDashboard = useCallback(async () => {
    if (!staffId) {
      setDashboardData(null)
      setLoading(false)
      return
    }

    try {
      setLoading(true)
      const response = await api.get(`/dashboard/personal/${staffId}`)
      setDashboardData(response.data)
    } catch {
      toast.error('Failed to load dashboard')
    } finally {
      setLoading(false)
    }
  }, [staffId])

  useEffect(() => { if (staffId) fetchDashboard() }, [fetchDashboard, staffId])

  const summary = useMemo<PersonalSummary>(() => ({
    assigned_allocations: Number(dashboardData?.summary?.assigned_allocations || 0),
    assigned_jobs: Number(dashboardData?.summary?.assigned_jobs || 0),
    total_adjusted_hours: Number(dashboardData?.summary?.total_adjusted_hours || 0),
    completed_allocations: Number(dashboardData?.summary?.completed_allocations || 0),
    total_logged_hours: Number(dashboardData?.summary?.total_logged_hours || 0),
  }), [dashboardData])

  const quickLinks = [
    {
      to: '/app/my-allocations',
      title: 'My Allocations',
      description: 'View your assigned work, update workflow status, and log time from allocations.',
      icon: Icons.Calendar,
      tone: 'bg-blue-50 text-blue-700 border-blue-100',
    },
    {
      to: '/app/my-timesheet',
      title: 'My Timesheet',
      description: 'Review your own time entries without any cross-staff access.',
      icon: Icons.Clock,
      tone: 'bg-emerald-50 text-emerald-700 border-emerald-100',
    },
    {
      to: '/app/notifications',
      title: 'Notifications',
      description: 'See alerts and workflow updates that apply to you.',
      icon: Icons.Bell,
      tone: 'bg-amber-50 text-amber-700 border-amber-100',
    },
  ]

  if (loading) return <div className="flex h-64 items-center justify-center"><div className="h-12 w-12 animate-spin rounded-full border-b-2 border-blue-600" /></div>

  return (
    <div className="space-y-6" data-testid="personal-dashboard">
      <div className="rounded-2xl bg-gradient-to-r from-slate-800 to-slate-900 p-6 text-white">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            {!hidePageHeader ? <h2 className="text-2xl font-bold">My Workflow Dashboard</h2> : null}
            <p className="mt-2 text-lg font-semibold text-white">{user?.name || dashboardData?.staff?.name || 'Staff member'}</p>
            <p className="mt-1 text-sm text-slate-300">
              This dashboard only shows your own workload, time, and deadlines.
            </p>
          </div>
          <div className="flex flex-wrap gap-6 text-sm text-slate-300">
            <div>
              <span className="text-slate-400">Email: </span>
              <span className="font-medium text-white">{user?.email || dashboardData?.staff?.email || 'Not available'}</span>
            </div>
            <div>
              <span className="text-slate-400">Role: </span>
              <span className="font-medium text-white">{user?.role || dashboardData?.staff?.role || 'Staff'}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
          <p className="text-sm font-medium text-gray-500">Assigned Allocations</p>
          <p className="mt-2 text-3xl font-bold text-gray-900">{summary.assigned_allocations}</p>
          <p className="mt-2 text-xs text-gray-500">Only your own active workload is counted.</p>
        </div>
        <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
          <p className="text-sm font-medium text-gray-500">Assigned Jobs</p>
          <p className="mt-2 text-3xl font-bold text-gray-900">{summary.assigned_jobs}</p>
          <p className="mt-2 text-xs text-gray-500">Unique jobs linked to your current allocations.</p>
        </div>
        <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
          <p className="text-sm font-medium text-gray-500">Planned Hours</p>
          <p className="mt-2 text-3xl font-bold text-gray-900">{summary.total_adjusted_hours.toFixed(1)}h</p>
          <p className="mt-2 text-xs text-gray-500">Total adjusted hours assigned to you.</p>
        </div>
        <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
          <p className="text-sm font-medium text-gray-500">Completed Allocations</p>
          <p className="mt-2 text-3xl font-bold text-gray-900">{summary.completed_allocations}</p>
          <p className="mt-2 text-xs text-gray-500">Components you have already completed.</p>
        </div>
        <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
          <p className="text-sm font-medium text-gray-500">Logged Hours</p>
          <p className="mt-2 text-3xl font-bold text-gray-900">{summary.total_logged_hours.toFixed(1)}h</p>
          <p className="mt-2 text-xs text-gray-500">Time entries in the active organisation.</p>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.2fr,0.8fr]">
        <div className="space-y-6">
          <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
            <h3 className="mb-2 flex items-center gap-2 text-lg font-semibold text-gray-900">
              <Icons.Bell />
              My Upcoming Deadlines
            </h3>
            <p className="mb-4 text-sm text-gray-500">Only deadlines linked to your own assigned work appear here.</p>
            <DeadlineWidget staffId={staffId} />
          </div>

          <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
            <h3 className="text-lg font-semibold text-gray-900">Quick Links</h3>
            <p className="mt-1 text-sm text-gray-500">Open the self-service pages you already have permission to use.</p>
            <div className="mt-5 grid gap-4 md:grid-cols-3">
              {quickLinks.map(({ to, title, description, icon: Icon, tone }) => (
                <Link
                  key={to}
                  to={to}
                  className={`rounded-2xl border p-4 transition hover:shadow-sm ${tone}`}
                >
                  <div className="flex items-center gap-3">
                    <div className="rounded-xl bg-white/80 p-2">
                      <Icon className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="font-semibold">{title}</p>
                      <p className="mt-1 text-xs leading-5 text-slate-600">{description}</p>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </div>

        <StaffProfileEditorCard
          user={user}
          onUserUpdate={onUserUpdate}
          title="My Profile"
          description="Update your own name, phone number, and profile picture from here."
        />
      </div>
    </div>
  )
}
