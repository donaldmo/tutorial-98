import { useEffect, useState } from 'react'
import { BrowserRouter, Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom'
import { Toaster } from 'sonner'

import './App.css'
import { useWorkflowData } from '@/hooks/useWorkflowData'
import { useWorkflowSession } from '@/hooks/useWorkflowSession'
import { useSuperAdminSession } from '@/hooks/useSuperAdminSession'
import { getBillingGatePath, isBillingGateLocation, requiresBillingCompletion } from '@/lib/billingGate'
import { AdminLoginRoute } from '@/pages/auth/AdminLoginRoute'
import { AdminForgotPasswordPage } from '@/pages/auth/AdminForgotPasswordPage'
import { AdminResetPasswordPage } from '@/pages/auth/AdminResetPasswordPage'
import { LoginRoute } from '@/pages/auth/LoginRoute'
import { RegisterBillingPage } from '@/pages/auth/RegisterBillingPage'
import { RegisterPage } from '@/pages/auth/RegisterPage'
import { JobsPage } from '@/pages/JobsPage'
import { JobTypesPage } from '@/pages/JobTypesPage'
import { StaffForgotPasswordPage } from '@/pages/auth/StaffForgotPasswordPage'
import { StaffResetPasswordPage } from '@/pages/auth/StaffResetPasswordPage'
import { VerifyEmailPage } from '@/pages/auth/VerifyEmailPage'
import { MyAllocationsPage } from '@/pages/MyAllocationsPage'
import { MyTimesheetPage } from '@/pages/MyTimesheetPage'
import { StaffDashboard } from '@/pages/staff/StaffDashboard'
import { StaffSettingsPage } from '@/pages/staff/StaffSettingsPage'
import { StaffShell } from '@/pages/staff/StaffShell'
import { ChangePasswordPage } from '@/pages/auth/ChangePasswordPage'
import { NotificationsPage } from '@/pages/NotificationsPage'
import { WorkflowPageHeaderProvider } from '@/pages/workflow/WorkflowPageHeaderContext'
import { WorkflowPageOutlet } from '@/pages/workflow/WorkflowPageOutlet'
import { WorkflowShell } from '@/pages/workflow/WorkflowShell'
import { getDefaultAppPath } from '@/routes/workflowRoutes'
import { SuperAdminLoginRoute } from '@/pages/super-admin/SuperAdminLoginRoute'
import { SuperAdminShell } from '@/pages/super-admin/SuperAdminShell'
import { DashboardPage } from '@/pages/super-admin/DashboardPage'
import { FirmsPage } from '@/pages/super-admin/FirmsPage'
import { FirmDetailPage } from '@/pages/super-admin/FirmDetailPage'
import { PaymentsPage } from '@/pages/super-admin/PaymentsPage'
import { ActivityPage } from '@/pages/super-admin/ActivityPage'
import { AnnouncementsPage } from '@/pages/super-admin/AnnouncementsPage'
import api from '@/services/api'
import type { RouteKey, WorkflowUser } from '@/types/workflow'

function renderWorkflowPage(
  routeKey: RouteKey,
  session: ReturnType<typeof useWorkflowSession>,
  state: ReturnType<typeof useWorkflowData>['state'],
  actions: ReturnType<typeof useWorkflowData>['actions'],
  effectiveUser: WorkflowUser | null,
) {
  return (
    <WorkflowPageOutlet
      routeKey={routeKey}
      state={state}
      isAdmin={session.isAdmin}
      hasFullAccess={session.hasFullAccess}
      hasExtendedAccess={session.hasExtendedAccess}
      user={session.user}
      effectiveUser={effectiveUser}
      onSeedData={actions.handleSeedData}
      onCreateStaff={actions.handleCreateStaff}
      onUpdateStaff={actions.handleUpdateStaff}
      onDeleteStaff={actions.handleDeleteStaff}
      onCreateJob={actions.handleCreateJob}
      onUpdateJob={actions.handleUpdateJob}
      onDeleteJob={actions.handleDeleteJob}
      onCreateAllocation={actions.handleCreateAllocation}
      onDeleteAllocation={actions.handleDeleteAllocation}
      onUpdateAllocation={actions.handleUpdateAllocation}
      onUpdateSettings={actions.handleUpdateSettings}
      onRefresh={actions.fetchData}
      setSelectedMonth={actions.setSelectedMonth}
      setSelectedDepartmentId={actions.setSelectedDepartmentId}
      onUserUpdate={session.onLogin}
    />
  )
}

function AdminBillingGate({ session }: { session: ReturnType<typeof useWorkflowSession> }) {
  const location = useLocation()
  const [_loading, setLoading] = useState(false)
  const [gatePath, setGatePath] = useState('/app/settings?tab=subscription')
  const [billingRequired, setBillingRequired] = useState(false)

  useEffect(() => {
    if (!session.ready || !session.user || session.isGuest || !session.isAdmin) {
      setBillingRequired(false)
      setLoading(false)
      return
    }

    let cancelled = false
    const syncBillingGate = async () => {
      setLoading(true)
      try {
        const response = await api.get('/settings/subscription')
        if (cancelled) return
        setBillingRequired(requiresBillingCompletion(response.data))
        setGatePath(getBillingGatePath(response.data))
      } catch {
        if (!cancelled) {
          setBillingRequired(false)
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void syncBillingGate()

    const handleFocus = () => { void syncBillingGate() }
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        void syncBillingGate()
      }
    }

    window.addEventListener('focus', handleFocus)
    document.addEventListener('visibilitychange', handleVisibility)
    return () => {
      cancelled = true
      window.removeEventListener('focus', handleFocus)
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [session.ready, session.user, session.isGuest, session.isAdmin])

  // Do not block route rendering while billing check runs — allow children to mount.
  // The billingRequired redirect below still enforces required billing pages.

  if (billingRequired && !isBillingGateLocation(location.pathname, location.search)) {
    return <Navigate to={gatePath} replace />
  }

  return <Outlet />
}

function RoutedWorkflowApp() {
  const session = useWorkflowSession()
  const superAdminSession = useSuperAdminSession()
  const isAuthenticated = session.isGuest || Boolean(session.user)
  const { state, actions, getEffectiveUser } = useWorkflowData(isAuthenticated)
  const effectiveUser = getEffectiveUser(session.user, session.isGuest)
  const defaultAppPath = getDefaultAppPath(session.user, session.isGuest)

  if (!session.ready || !superAdminSession.ready) {
    return <div className="min-h-screen bg-gray-50" />
  }

  const handleSuperAdminLogin = (token: string, admin: { _id: string; email: string; name?: string }) => {
    superAdminSession.login(token, admin)
  }

  return (
    <>
      <Toaster position="top-right" richColors />
      <Routes>
        <Route
          path="/auth/login"
          element={
            <LoginRoute
              isAuthenticated={isAuthenticated}
              user={session.user}
              isGuest={session.isGuest}
              onLogin={session.onLogin}
              onSkipLogin={session.onSkipLogin}
            />
          }
        />
        <Route
          path="/auth/admin-login"
          element={
            <AdminLoginRoute
              isAuthenticated={isAuthenticated}
              user={session.user}
              onLogin={session.onLogin}
            />
          }
        />
        <Route path="/auth/admin-forgot-password" element={<AdminForgotPasswordPage />} />
        <Route path="/auth/admin-reset-password" element={<AdminResetPasswordPage />} />
        <Route path="/auth/staff-forgot-password" element={<StaffForgotPasswordPage />} />
        <Route path="/auth/staff-reset-password" element={<StaffResetPasswordPage />} />
        <Route path="/auth/register" element={<RegisterPage />} />
        <Route path="/auth/register/billing" element={<RegisterBillingPage />} />
        <Route path="/auth/verify" element={<VerifyEmailPage />} />

        <Route
          path="/super-admin/login"
          element={
            <SuperAdminLoginRoute
              isAuthenticated={superAdminSession.isAuthenticated}
              onLogin={handleSuperAdminLogin}
            />
          }
        />
        <Route
          path="/super-admin"
          element={
            <SuperAdminShell
              admin={superAdminSession.admin}
              isAuthenticated={superAdminSession.isAuthenticated}
              onLogout={superAdminSession.logout}
            />
          }
        >
          <Route index element={<Navigate to="dashboard" replace />} />
          <Route path="dashboard" element={<DashboardPage />} />
          <Route path="firms" element={<FirmsPage />} />
          <Route path="firms/:id" element={<FirmDetailPage />} />
          <Route path="payments" element={<PaymentsPage />} />
          <Route path="activity" element={<ActivityPage />} />
          <Route path="announcements" element={<AnnouncementsPage />} />
        </Route>

        <Route
          path="/app"
          element={
            <WorkflowPageHeaderProvider>
              <WorkflowShell
                isAuthenticated={isAuthenticated}
                user={session.user}
                isGuest={session.isGuest}
                hasFullAccess={session.hasFullAccess}
                settings={state.settings}
                onLogout={session.onLogout}
                onUserUpdate={session.onLogin}
              />
            </WorkflowPageHeaderProvider>
          }
        >
          <Route element={<AdminBillingGate session={session} />}>
            <Route index element={<Navigate to={defaultAppPath} replace />} />
            <Route path="dashboard" element={renderWorkflowPage('dashboard', session, state, actions, effectiveUser)} />
            <Route path="onboarding" element={renderWorkflowPage('onboarding', session, state, actions, effectiveUser)} />
            <Route path="my">
              <Route path="timesheet" element={renderWorkflowPage('my-timesheet', session, state, actions, effectiveUser)} />
              <Route path="allocations" element={renderWorkflowPage('my-allocations', session, state, actions, effectiveUser)} />
            </Route>
            <Route path="staff">
              <Route index element={renderWorkflowPage('staff', session, state, actions, effectiveUser)} />
              <Route path="import" element={renderWorkflowPage('staff-import', session, state, actions, effectiveUser)} />
              <Route path="users" element={renderWorkflowPage('staff-users', session, state, actions, effectiveUser)} />
              <Route path=":id" element={renderWorkflowPage('staff-detail', session, state, actions, effectiveUser)} />
            </Route>
            <Route path="clients">
              <Route index element={renderWorkflowPage('clients', session, state, actions, effectiveUser)} />
              <Route path="import" element={renderWorkflowPage('client-import', session, state, actions, effectiveUser)} />
            </Route>
            <Route path="jobs">
              <Route index element={renderWorkflowPage('jobs', session, state, actions, effectiveUser)} />
              <Route path="add" element={renderWorkflowPage('jobs-add', session, state, actions, effectiveUser)} />
              <Route path="import" element={renderWorkflowPage('jobs-import', session, state, actions, effectiveUser)} />
              <Route path="templates" element={<Navigate to="/app/templates" replace />} />
              <Route path="types">
                <Route index element={renderWorkflowPage('jobs-types', session, state, actions, effectiveUser)} />
                <Route path="import" element={renderWorkflowPage('job-types-import', session, state, actions, effectiveUser)} />
              </Route>
              <Route path=":id">
                <Route index element={renderWorkflowPage('jobs-detail', session, state, actions, effectiveUser)} />
                <Route path="edit" element={renderWorkflowPage('jobs-edit', session, state, actions, effectiveUser)} />
              </Route>
            </Route>
            <Route path="templates">
              <Route index element={renderWorkflowPage('templates', session, state, actions, effectiveUser)} />
              <Route path=":template_ref" element={renderWorkflowPage('templates', session, state, actions, effectiveUser)} />
            </Route>
            <Route path="job-templates" element={renderWorkflowPage('job-templates', session, state, actions, effectiveUser)} />
            <Route path="allocations" element={renderWorkflowPage('allocations', session, state, actions, effectiveUser)} />
            <Route path="allocations/add" element={renderWorkflowPage('allocations-add', session, state, actions, effectiveUser)} />
            <Route path="departments" element={renderWorkflowPage('departments', session, state, actions, effectiveUser)} />
            <Route path="reports" element={renderWorkflowPage('reports', session, state, actions, effectiveUser)} />
            <Route path="analytics">
              <Route path="efficiency" element={renderWorkflowPage('efficiency', session, state, actions, effectiveUser)} />
            </Route>
            <Route path="notifications" element={renderWorkflowPage('notifications', session, state, actions, effectiveUser)} />
            <Route path="settings" element={renderWorkflowPage('settings', session, state, actions, effectiveUser)} />
          </Route>
        </Route>
        <Route
          path="/staff"
          element={
            <StaffShell
              isAuthenticated={isAuthenticated}
              user={session.user}
              settings={state.settings}
              onLogout={session.onLogout}
              onUserUpdate={session.onLogin}
            />
          }
        >
          <Route index element={<Navigate to="dashboard" replace />} />
          <Route path="dashboard" element={<StaffDashboard user={session.user} settings={state.settings} />} />
          <Route
            path="allocations"
            element={<MyAllocationsPage user={session.user} settings={state.settings} hidePageHeader />}
          />
          <Route
            path="jobs"
            element={<JobsPage settings={state.settings} onRefresh={actions.fetchData} hidePageHeader readOnly />}
          />
          <Route
            path="job-types"
            element={<JobTypesPage settings={state.settings} onRefresh={actions.fetchData} hidePageHeader readOnly />}
          />
          <Route
            path="notifications"
            element={<NotificationsPage user={session.user} settings={state.settings} hidePageHeader />}
          />
          <Route
            path="timesheet"
            element={<MyTimesheetPage user={session.user} settings={state.settings} canSelectStaff={false} hidePageHeader />}
          />
          <Route
            path="settings"
            element={<StaffSettingsPage user={session.user} onUserUpdate={session.onLogin} />}
          />
          <Route
            path="change-password"
            element={
              <ChangePasswordPage
                user={session.user}
                onPasswordChanged={() => {
                  // Update localStorage so the banner disappears immediately
                  const stored = localStorage.getItem('user')
                  if (stored) {
                    try {
                      const parsed = JSON.parse(stored)
                      parsed.mustChangePassword = false
                      localStorage.setItem('user', JSON.stringify(parsed))
                      session.onLogin({ ...parsed })
                    } catch { /* ignore */ }
                  }
                }}
              />
            }
          />
        </Route>
        <Route path="/" element={<Navigate to={defaultAppPath} replace />} />
        <Route path="*" element={<Navigate to={defaultAppPath} replace />} />
      </Routes>
    </>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <RoutedWorkflowApp />
    </BrowserRouter>
  )
}
