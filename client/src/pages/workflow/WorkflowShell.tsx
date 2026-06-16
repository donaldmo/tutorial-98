import { Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'

import { Icons, Sidebar } from '@/components/workflow/shared'
import { CreateOrganisationModal } from '@/components/workflow/CreateOrganisationModal'
import { inferRouteKey, routeKeyToPath } from '@/routes/workflowRoutes'
import type { RouteKey, WorkflowOrganisation, WorkflowSettings, WorkflowUser } from '@/types/workflow'
import { useEffect, useState } from 'react'
import api, { createAdminOrganisation, fetchUserOrganisations, selectUserOrganisation } from '@/services/api'
import { useWorkflowPageHeader } from './WorkflowPageHeaderContext'

interface WorkflowShellProps {
  isAuthenticated: boolean
  user: WorkflowUser | null
  isGuest: boolean
  hasFullAccess: boolean
  settings: WorkflowSettings | null
  onLogout: () => void
  onUserUpdate?: (user: WorkflowUser) => void
}

export function WorkflowShell({ isAuthenticated, user, isGuest, hasFullAccess, settings, onLogout, onUserUpdate }: WorkflowShellProps) {
  const navigate = useNavigate()
  const location = useLocation()
  const [isMobileOpen, setIsMobileOpen] = useState(false)
  const [isDesktopSidebarOpen, setIsDesktopSidebarOpen] = useState(true)
  const [bannerDismissed, setBannerDismissed] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [pwForm, setPwForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' })
  const [pwSaving, setPwSaving] = useState(false)
  const [organisations, setOrganisations] = useState<WorkflowOrganisation[]>([])
  const [selectedOrg, setSelectedOrg] = useState('')
  const [switchingOrg, setSwitchingOrg] = useState(false)
  const [unreadNotifications, setUnreadNotifications] = useState(0)
  const [isCreateOrgModalOpen, setIsCreateOrgModalOpen] = useState(false)
  const { header } = useWorkflowPageHeader()

  const showPasswordBanner = !isGuest && !bannerDismissed && Boolean(user?.mustChangePassword)

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault()
    if (pwForm.newPassword !== pwForm.confirmPassword) {
      toast.error('New passwords do not match')
      return
    }
    if (pwForm.newPassword.length < 12) {
      toast.error('Password must be at least 12 characters')
      return
    }
    setPwSaving(true)
    try {
      await api.put('/staff/me/password', {
        current_password: pwForm.currentPassword,
        new_password: pwForm.newPassword,
      })
      toast.success('Password updated successfully')
      const updated = { ...user!, mustChangePassword: false }
      localStorage.setItem('user', JSON.stringify(updated))
      onUserUpdate?.(updated)
      setBannerDismissed(true)
      setShowForm(false)
      setPwForm({ currentPassword: '', newPassword: '', confirmPassword: '' })
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Failed to update password')
    } finally {
      setPwSaving(false)
    }
  }

  const sessionUserType = localStorage.getItem('userType')

  useEffect(() => {
    setSelectedOrg(String(user?.organisation_id || ''))
  }, [user?.organisation_id])

  useEffect(() => {
    let mounted = true
    const hydrateOrganisations = async () => {
      const userOrgs = Array.isArray(user?.organisations) ? user.organisations : []
      if (userOrgs.length > 0 && mounted) {
        setOrganisations(userOrgs)
      }

      try {
        const result = await fetchUserOrganisations()
        if (!mounted) return

        setOrganisations(Array.isArray(result.organisations) ? result.organisations : userOrgs)
        if (result.active_organisation_id) {
          setSelectedOrg(String(result.active_organisation_id))
        }
      } catch {
        if (mounted && userOrgs.length === 0) {
          setOrganisations([])
        }
      }
    }

    hydrateOrganisations()

    return () => {
      mounted = false
    }
  }, [user?.organisations])

  useEffect(() => {
    let mounted = true

    const refreshUnreadNotifications = async () => {
      try {
        const response = await api.get('/notifications/unread-count')
        if (!mounted) return
        setUnreadNotifications(Number(response.data?.unread_count || 0))
      } catch {
        if (!mounted) return
        setUnreadNotifications(0)
      }
    }

    const handleUnreadRefresh = (event: Event) => {
      const customEvent = event as CustomEvent<{ unreadCount?: number }>
      const nextCount = customEvent.detail?.unreadCount
      if (typeof nextCount === 'number') {
        setUnreadNotifications(Math.max(0, nextCount))
        return
      }
      refreshUnreadNotifications()
    }

    refreshUnreadNotifications()
    window.addEventListener('notifications:refresh-unread', handleUnreadRefresh as EventListener)

    return () => {
      mounted = false
      window.removeEventListener('notifications:refresh-unread', handleUnreadRefresh as EventListener)
    }
  }, [location.pathname, user?.organisation_id])

  const handleOrganisationChange = async (nextOrgId: string) => {
    if (!nextOrgId || nextOrgId === selectedOrg) return

    try {
      setSwitchingOrg(true)
      const response = await selectUserOrganisation(nextOrgId)
      const nextUser = response?.admin ?? response?.user ?? null
      if (!nextUser) return

      localStorage.setItem('token', response?.token || localStorage.getItem('token') || '')
      localStorage.setItem('user', JSON.stringify(nextUser))
      localStorage.setItem('userType', 'admin')
      setSelectedOrg(String(nextUser.organisation_id || nextOrgId))
      setOrganisations(Array.isArray(nextUser.organisations) ? nextUser.organisations : organisations)
      onUserUpdate?.(nextUser)
      toast.success('Organisation switched successfully')
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Failed to switch organisation')
    } finally {
      setSwitchingOrg(false)
    }
  }

  const handleCreateOrganisation = async (payload: { firm_name: string }) => {
    try {
      const response = await createAdminOrganisation(payload)
      const nextUser = response?.admin ?? response?.user ?? null
      if (!nextUser) return

      localStorage.setItem('token', response?.token || localStorage.getItem('token') || '')
      localStorage.setItem('user', JSON.stringify(nextUser))
      localStorage.setItem('userType', 'admin')

      setSelectedOrg(String(nextUser.organisation_id || ''))
      setOrganisations(Array.isArray(nextUser.organisations) ? nextUser.organisations : organisations)
      onUserUpdate?.(nextUser)
      toast.success(`Organisation ${response?.organisation?.firm_name || payload.firm_name} created`)
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || 'Failed to create organisation')
    }
  }

  if (!isAuthenticated) {
    return <Navigate to="/auth/login" replace />
  }

  // Staff users belong in the staff shell, not here
  if (sessionUserType === 'staff') {
    return <Navigate to="/staff/dashboard" replace />
  }

  const activeTab = inferRouteKey(location.pathname)

  const navUser = user ?? (isGuest ? { name: 'Guest', role: 'Administrator', access_level: 'Full' } : null)

  const setActiveTab = (tab: string) => {
    if (!tab) {
      navigate(routeKeyToPath.dashboard)
      return
    }

    // If the tab is an absolute path, navigate directly
    if (tab.startsWith('/')) {
      navigate(tab)
      return
    }

    // Support encoded query-like ids such as "settings?tab=userManagement"
    const [base, query] = tab.split('?')
    const basePath = routeKeyToPath[(base || '') as RouteKey] ?? routeKeyToPath.dashboard
    navigate(query ? `${basePath}?${query}` : basePath)
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Sidebar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        isMobileOpen={isMobileOpen}
        setIsMobileOpen={setIsMobileOpen}
        isDesktopOpen={isDesktopSidebarOpen}
        setIsDesktopOpen={setIsDesktopSidebarOpen}
        user={navUser}
        hasFullAccess={hasFullAccess}
        onLogout={() => {
          onLogout()
          navigate('/auth/login', { replace: true })
        }}
        settings={settings}
        organisations={organisations}
        selectedOrg={selectedOrg}
        switchingOrg={switchingOrg}
        unreadCount={unreadNotifications}
        onOrganisationChange={handleOrganisationChange}
        onCreateOrganisation={() => setIsCreateOrgModalOpen(true)}
      />
      <div className={isDesktopSidebarOpen ? 'lg:ml-64' : ''}>
        <header className="sticky top-0 z-30 bg-white border-b border-gray-100 px-4 py-3 lg:px-8">
          <div className="flex items-center justify-between gap-4">
            <div className="flex min-w-0 items-center gap-3">
              <button
                type="button"
                className={`p-2 text-gray-600 hover:bg-gray-100 rounded-xl ${isMobileOpen ? 'hidden' : ''} ${isDesktopSidebarOpen ? 'lg:hidden' : ''}`}
                onClick={() => {
                  if (window.matchMedia('(min-width: 1024px)').matches) {
                    setIsDesktopSidebarOpen(true)
                    return
                  }
                  setIsMobileOpen(true)
                }}
                data-testid="mobile-menu-btn"
                aria-label="Open sidebar"
              >
                <Icons.Menu />
              </button>
              <div className="min-w-0">
                <p className="text-lg font-semibold text-gray-900">{header.title || (settings?.firm_name ?? 'Workflow Planner')}</p>
                <p className="text-sm text-gray-500">{header.description || (settings?.tagline ?? 'Manage your workflow and operations')}</p>
              </div>
            </div>
            {header.actions ? <div className="flex shrink-0 items-center gap-2">{header.actions}</div> : null}
          </div>
        </header>
        {showPasswordBanner && (
          <div className="bg-amber-50 border-b border-amber-200 px-4 py-3 lg:px-8">
            {!showForm ? (
              <div className="flex items-center justify-between gap-4">
                <p className="text-sm text-amber-800">
                  <span className="font-semibold">Security reminder:</span> You are still using your temporary seeded password.{' '}
                  <button
                    type="button"
                    onClick={() => setShowForm(true)}
                    className="underline font-medium hover:text-amber-900"
                  >
                    Change it now
                  </button>
                </p>
                <button
                  type="button"
                  onClick={() => setBannerDismissed(true)}
                  className="shrink-0 text-amber-600 hover:text-amber-800 p-1 rounded"
                  aria-label="Dismiss"
                >
                  ✕
                </button>
              </div>
            ) : (
              <form onSubmit={handleChangePassword} className="flex flex-wrap items-end gap-3">
                <div className="flex flex-col gap-1 min-w-[160px]">
                  <label className="text-xs font-medium text-amber-800">Current password</label>
                  <input
                    type="password"
                    required
                    value={pwForm.currentPassword}
                    onChange={(e) => setPwForm({ ...pwForm, currentPassword: e.target.value })}
                    className="px-3 py-1.5 text-sm border border-amber-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-amber-400"
                    placeholder="Current password"
                  />
                </div>
                <div className="flex flex-col gap-1 min-w-[160px]">
                  <label className="text-xs font-medium text-amber-800">New password</label>
                  <input
                    type="password"
                    required
                    value={pwForm.newPassword}
                    onChange={(e) => setPwForm({ ...pwForm, newPassword: e.target.value })}
                    className="px-3 py-1.5 text-sm border border-amber-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-amber-400"
                    placeholder="Min 12 characters"
                  />
                </div>
                <div className="flex flex-col gap-1 min-w-[160px]">
                  <label className="text-xs font-medium text-amber-800">Confirm new password</label>
                  <input
                    type="password"
                    required
                    value={pwForm.confirmPassword}
                    onChange={(e) => setPwForm({ ...pwForm, confirmPassword: e.target.value })}
                    className="px-3 py-1.5 text-sm border border-amber-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-amber-400"
                    placeholder="Repeat new password"
                  />
                </div>
                <div className="flex gap-2 pb-0.5">
                  <button
                    type="submit"
                    disabled={pwSaving}
                    className="px-4 py-1.5 text-sm bg-amber-600 text-white rounded-lg hover:bg-amber-700 disabled:opacity-60"
                  >
                    {pwSaving ? 'Saving…' : 'Save'}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setShowForm(false); setPwForm({ currentPassword: '', newPassword: '', confirmPassword: '' }) }}
                    className="px-3 py-1.5 text-sm text-amber-700 hover:text-amber-900 rounded-lg"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            )}
          </div>
        )}
        <main className="p-4 lg:p-8">
          <Outlet />
        </main>
      </div>
      <CreateOrganisationModal
        isOpen={isCreateOrgModalOpen}
        onClose={() => setIsCreateOrgModalOpen(false)}
        onSubmit={handleCreateOrganisation}
      />
    </div>
  )
}
