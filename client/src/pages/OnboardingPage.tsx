import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'

import api from '@/services/api'
import { Button } from '@/components/ui/button'
import { Label as _Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Icons as _Icons } from '@/components/workflow/shared'
import type { WorkflowDataState, WorkflowSettings, WorkflowUser } from '@/types/workflow'

interface OnboardingPageProps {
  state: WorkflowDataState
  settings: WorkflowSettings | null
  user: WorkflowUser | null
  onUserUpdate: (user: WorkflowUser) => void
}

export function OnboardingPage({ state, settings: _settings, user, onUserUpdate }: OnboardingPageProps) {
  const navigate = useNavigate()
  const toggleId = 'onboarding-toggle'
  const OnboardingSwitch = Switch as any
  const [mode] = useState<'welcome' | 'manual'>('manual')
  const [showOnboardingByDefault, setShowOnboardingByDefault] = useState(user?.show_onboarding ?? true)
  const [savingPreference, setSavingPreference] = useState(false)

  const firstName = user?.name?.split(' ')[0] || 'motswiri'

  useEffect(() => {
    setShowOnboardingByDefault(user?.show_onboarding ?? true)
  }, [user?.show_onboarding])

  const isFirmEmpty = useMemo(
    () =>
      state.staff.length === 0 &&
      state.jobs.length === 0 &&
      state.allocations.length === 0 &&
      state.clients.length === 0 &&
      state.departments.length === 0 &&
      state.jobTypes.length === 0,
    [state],
  )

  const steps = useMemo(
    () => [
      {
        title: 'Departments & Job Types',
        description:
          'Add your departments and job types to get started.',
        completed: state.departments.length > 0 || state.jobTypes.length > 0,
        actions: [
          { label: 'Add departments manually', path: '/app/departments' },
          { label: 'Add job types manually', path: '/app/jobs/types' },
        ],
      },
      {
        title: 'Clients & Staff',
        description: 'Add your first client and invite staff members.',
        completed: state.clients.length > 0 || state.staff.length > 0,
        actions: [
          { label: 'Go to clients', path: '/app/clients' },
          { label: 'Go to staff', path: '/app/staff' },
        ],
      },
      {
        title: 'Create jobs',
        description: 'Create engagement jobs so you can allocate them to people.',
        completed: state.jobs.length > 0,
        actions: [{ label: 'Create jobs', path: '/app/jobs' }],
      },
      {
        title: 'Allocate work',
        description: 'Assign staff to job work and start tracking capacity.',
        completed: state.allocations.length > 0,
        actions: [{ label: 'Allocate jobs', path: '/app/allocations' }],
      },
      {
        title: 'Review insights',
        description: 'View performance, utilization, and reporting across the firm.',
        completed: Boolean(state.allocations.length > 0),
        actions: [{ label: 'View analytics', path: '/app/analytics/efficiency' }],
      },
    ],
    [state],
  )

  const handleGoToDashboard = () => {
    navigate('/app/dashboard')
  }

  const handleShowOnboardingChange = async (checked: boolean) => {
    if (!user) return

    const previousValue = showOnboardingByDefault
    setShowOnboardingByDefault(checked)
    setSavingPreference(true)

    try {
      const response = await api.put('/auth/admin/me', { show_onboarding: checked })
      const updatedUser = response.data as WorkflowUser
      localStorage.setItem('user', JSON.stringify(updatedUser))
      onUserUpdate(updatedUser)
      setShowOnboardingByDefault(updatedUser.show_onboarding ?? true)
      toast.success('Onboarding preference updated')
    } catch (error: any) {
      setShowOnboardingByDefault(previousValue)
      toast.error(error?.response?.data?.detail || 'Failed to update onboarding preference')
    } finally {
      setSavingPreference(false)
    }
  }

  return (
    <div className="space-y-8" data-testid="onboarding-page">

      <section className="rounded-3xl border border-slate-200 bg-slate-50 p-8 text-sm text-slate-600 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold">Welcome, {firstName}</p>
            <p className="mt-2">Build your workflow step-by-step and customize your firm setup at your own pace. Follow the steps below to add departments and job types first.</p>
            {user ? (
              <div className="mt-4 flex items-start gap-3 text-sm">
                <OnboardingSwitch
                  id={toggleId}
                  checked={showOnboardingByDefault}
                  onCheckedChange={handleShowOnboardingChange}
                  disabled={savingPreference}
                  aria-label="Onboarding toggle"
                />
                <div className="space-y-1">
                  <label htmlFor={toggleId} className="text-sm font-medium text-slate-900">
                    Onboarding toggle
                  </label>
                  <p className="text-xs text-slate-500">Show onboarding when I sign in.</p>
                </div>
              </div>
            ) : null}
          </div>
          <Button variant="secondary" onClick={handleGoToDashboard}>
            Go to dashboard
          </Button>
        </div>
      </section>

      {mode !== 'welcome' && (
        <section className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">Onboarding steps</p>
              <h2 className="text-2xl font-bold text-slate-900">Your next actions</h2>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="ghost" onClick={handleGoToDashboard}>Skip to dashboard</Button>
              <span className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-2 text-sm text-slate-600">
                {isFirmEmpty ? 'Empty firm' : 'Existing setup'}
              </span>
            </div>
          </div>

          <div className="mt-8 grid gap-4 lg:grid-cols-2">
            {steps.map((step) => (
              <div key={step.title} className="rounded-3xl border border-slate-200 p-6 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-lg font-semibold text-slate-900">{step.title}</p>
                    <p className="mt-2 text-sm text-slate-500">{step.description}</p>
                  </div>
                  <span className={`rounded-full px-3 py-1 text-xs font-semibold ${step.completed ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>
                    {step.completed ? 'Complete' : 'Pending'}
                  </span>
                </div>

                <div className="mt-6 flex flex-wrap gap-2">
                  {step.actions.map((action) => (
                    <Button key={action.label} variant="secondary" size="sm" onClick={() => navigate(action.path)}>
                      {action.label}
                    </Button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
