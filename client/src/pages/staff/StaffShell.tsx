import { Navigate, Link, Outlet, useNavigate, useLocation } from 'react-router-dom'
import { LayoutDashboard, Briefcase, Clock3, Bell, Menu, X, AlertTriangle, LogOut, FolderKanban, Tags, Settings } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import type { WorkflowOrganisation, WorkflowSettings, WorkflowUser } from '@/types/workflow'
import { fetchStaffOrganisations, selectStaffOrganisation } from '@/services/api'
import api from '@/services/api'
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'

interface StaffShellProps {
  isAuthenticated: boolean
  user: WorkflowUser | null
  settings?: WorkflowSettings | null
  onLogout: () => void
  onUserUpdate: (user: WorkflowUser) => void
}

export function StaffShell({ isAuthenticated, user, settings, onLogout, onUserUpdate }: StaffShellProps) {
  const navigate = useNavigate()
  const location = useLocation()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [isDesktopSidebarOpen, setIsDesktopSidebarOpen] = useState(true)
  const [organisations, setOrganisations] = useState<WorkflowOrganisation[]>([])
  const [selectedOrg, setSelectedOrg] = useState('')
  const [switchingOrg, setSwitchingOrg] = useState(false)
  const [unreadNotifications, setUnreadNotifications] = useState(0)
  const primaryColor = settings?.primary_color || '#3B82F6'
  const logoUrl = settings?.logo_url || settings?.logo_base64 || settings?.logo
  const firmName = settings?.firm_name || 'Staff Portal'
  const tagline = settings?.tagline || 'Workflow'

  const userType = localStorage.getItem('userType')

  useEffect(() => {
    setSelectedOrg(String(user?.organisation_id || ''))
  }, [user?.organisation_id])

  useEffect(() => {
    let mounted = true

    const hydrateOrganisations = async () => {
      const userOrgs = Array.isArray(user?.organisations) ? user.organisations : []
      if (userOrgs.length > 0) {
        if (mounted) setOrganisations(userOrgs)
      }

      try {
        const result = await fetchStaffOrganisations()
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

  const organisationLabel = useMemo(() => {
    const match = organisations.find((item) => String(item.organisation_id) === String(selectedOrg || user?.organisation_id || ''))
    return match?.firm_name || 'Current organisation'
  }, [organisations, selectedOrg, user?.organisation_id])

  const handleOrganisationChange = async (nextOrgId: string) => {
    if (!nextOrgId || nextOrgId === selectedOrg) return

    try {
      setSwitchingOrg(true)
      const response = await selectStaffOrganisation(nextOrgId)
      const nextUser = response?.user ?? null
      if (!nextUser) return

      localStorage.setItem('token', response?.token || localStorage.getItem('token') || '')
      localStorage.setItem('user', JSON.stringify(nextUser))
      setSelectedOrg(String(nextUser.organisation_id || nextOrgId))
      setOrganisations(Array.isArray(nextUser.organisations) ? nextUser.organisations : organisations)
      onUserUpdate(nextUser)
    } finally {
      setSwitchingOrg(false)
    }
  }

  if (!isAuthenticated) return <Navigate to="/auth/login" replace />
  if (userType === 'admin') return <Navigate to="/app/dashboard" replace />

  const isActive = (path: string) => location.pathname === path

  const navLinks = [
    { to: '/staff/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { to: '/staff/allocations', label: 'Allocations', icon: Briefcase },
    { to: '/staff/jobs', label: 'Jobs', icon: FolderKanban },
    { to: '/staff/job-types', label: 'Job Types', icon: Tags },
    { to: '/staff/timesheet', label: 'Timesheet', icon: Clock3 },
    { to: '/staff/notifications', label: 'Notifications', icon: Bell, unreadCount: unreadNotifications },
    { to: '/staff/settings', label: 'Settings', icon: Settings },
  ]

  const SidebarContent = () => (
    <div className="flex h-full flex-col bg-slate-950 text-white">
      <div className="flex items-center justify-between gap-3 border-b border-slate-800 p-4">
        <div className="flex items-center gap-3 min-w-0">
          {logoUrl ? (
            <img
              src={logoUrl}
              alt="Logo"
            className="h-10 w-10 rounded-xl object-contain"
              onError={(e: any) => {
                e.target.style.display = 'none'
                e.target.nextSibling.style.display = 'flex'
              }}
            />
          ) : null}
          <div className="h-10 w-10 items-center justify-center rounded-xl" style={{ backgroundColor: primaryColor, display: logoUrl ? 'none' : 'flex' }}>
            <span className="text-white font-bold text-lg">{firmName.substring(0, 2).toUpperCase()}</span>
          </div>
          <div className="min-w-0">
            <h1 className="truncate text-base font-bold text-white">{firmName.split(' ')[0]}</h1>
            <p className="truncate text-xs text-slate-400">{tagline}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => {
            setMobileOpen(false)
            setIsDesktopSidebarOpen(false)
          }}
          className="rounded-xl p-2 text-slate-300 hover:bg-slate-800 hover:text-white"
          aria-label="Close sidebar"
        >
          <X className="w-5 h-5" />
        </button>
      </div>
      <nav className="flex-1 space-y-1 overflow-y-auto px-4 py-6">
        {navLinks.map(({ to, label, icon: Icon, unreadCount }) => (
          <Link
            key={to}
            to={to}
            onClick={() => setMobileOpen(false)}
            className={`flex items-center gap-3 rounded-lg px-3 py-2 text-xs font-medium transition-all ${
              isActive(to)
                ? 'text-white shadow-lg'
                : 'text-slate-400 hover:bg-slate-800 hover:text-white'
            }`}
            style={isActive(to) ? { backgroundColor: primaryColor, boxShadow: `0 10px 15px -3px ${primaryColor}50` } : {}}
          >
            <Icon className="h-4 w-4 shrink-0" />
            <span className="flex-1">{label}</span>
            {to === '/staff/notifications' && Number(unreadCount || 0) > 0 && (
              <span className="bg-red-600 text-white text-xs font-bold px-2 py-0.5 rounded-full">
                {unreadCount}
              </span>
            )}
          </Link>
        ))}
      </nav>
      <div className="border-t border-slate-800 p-4">
        <div className="mb-3 px-3">
          <p className="truncate text-sm font-medium text-white">{user?.name ?? 'Staff'}</p>
          {user?.email && <p className="truncate text-xs text-slate-400">{String(user.email)}</p>}
          {user?.role && <p className="text-xs text-slate-400">{String(user.role)}</p>}
        </div>
        <div className="mb-3 px-3">
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Organisation</p>
          <Select
            value={selectedOrg || String(user?.organisation_id || '')}
            onValueChange={(value: string) => handleOrganisationChange(value)}
            disabled={switchingOrg || organisations.length <= 1}
          >
            <SelectTrigger className="w-full rounded-lg border border-slate-800 bg-slate-900 px-2 py-2 text-xs text-slate-200 focus:outline-none focus:ring-2 focus:ring-slate-700">
              <SelectValue placeholder={organisationLabel} />
            </SelectTrigger>
            <SelectContent className="border border-slate-800 bg-slate-900 text-slate-200">
              {(organisations.length > 0 ? organisations : [{
                id: String(user?.organisation_id || 'default-org'),
                organisation_id: String(user?.organisation_id || ''),
                firm_name: organisationLabel,
              }]).map((org) => (
                <SelectItem key={org.id} value={String(org.organisation_id)}>
                  {org.firm_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="px-3">
          <div className="flex items-center gap-3">
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="rounded-full bg-slate-800 p-0 text-white hover:bg-slate-700"
                  aria-label="Open user menu"
                >
                  <Avatar className="h-10 w-10 bg-blue-600 text-white">
                    {user?.profile_picture_url ? (
                      <AvatarImage src={user.profile_picture_url} alt={user.name || 'User'} />
                    ) : null}
                    <AvatarFallback>{user?.name?.charAt(0).toUpperCase() ?? 'S'}</AvatarFallback>
                  </Avatar>
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-56 border border-slate-200 bg-white p-3">
                <div className="space-y-3">
                  <div>
                    <p className="text-sm font-semibold text-gray-900 truncate">{user?.name ?? 'Staff'}</p>
                    {user?.email && <p className="text-xs text-gray-500 truncate">{user.email}</p>}
                    {user?.role && <p className="text-xs text-gray-500 truncate">{user.role}</p>}
                  </div>
                </div>
              </PopoverContent>
            </Popover>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-white">{user?.name ?? 'Staff'}</p>
              {user?.email && <p className="truncate text-xs text-slate-400">{user.email}</p>}
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="ml-auto h-10 w-10 shrink-0 rounded-full bg-red-50 text-red-600 hover:bg-red-100 hover:text-red-700"
              onClick={() => {
                onLogout()
                navigate('/auth/login', { replace: true })
              }}
              aria-label="Sign out"
            >
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Desktop sidebar */}
      <aside className={`fixed inset-y-0 left-0 z-20 hidden w-64 transform flex-col border-r border-slate-900 bg-slate-950 transition-transform duration-300 ease-in-out lg:flex ${isDesktopSidebarOpen ? 'lg:translate-x-0' : 'lg:-translate-x-full'}`}>
        <SidebarContent />
      </aside>

      {/* Mobile sidebar overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="relative flex h-full w-64 flex-col bg-slate-950 shadow-xl">
            <SidebarContent />
          </aside>
        </div>
      )}

      {/* Main content */}
      {!isDesktopSidebarOpen && (
        <button
          type="button"
          onClick={() => setIsDesktopSidebarOpen(true)}
          className="fixed left-4 top-4 z-30 hidden rounded-xl border border-gray-200 bg-white p-2 text-gray-600 hover:bg-gray-100 lg:inline-flex"
          aria-label="Open sidebar"
        >
          <Menu className="w-5 h-5" />
        </button>
      )}
      <div className={`flex-1 ${isDesktopSidebarOpen ? 'lg:ml-64' : ''} flex flex-col min-h-screen`}>
        {/* Mobile header */}
        <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-gray-100 bg-white px-4 py-3 lg:hidden">
          <button
            onClick={() => setMobileOpen(true)}
            className="p-2 text-gray-600 hover:bg-gray-100 rounded-xl"
            aria-label="Open menu"
          >
            <Menu className="w-5 h-5" />
          </button>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-gray-900">{firmName || 'Staff Portal'}</p>
            <p className="truncate text-xs text-gray-500">{tagline || 'Workflow'}</p>
          </div>
          <Link
            to="/staff/notifications"
            className="ml-auto relative p-2 text-gray-600 hover:bg-gray-100 rounded-xl"
            aria-label="Open notifications"
          >
            <Bell className="w-5 h-5" />
            {unreadNotifications > 0 && (
              <span className="absolute -top-1 -right-1 bg-red-600 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none">
                {unreadNotifications}
              </span>
            )}
          </Link>
        </header>
        <main className="flex-1 p-6 lg:p-8">
          {user?.mustChangePassword && (
            <div className="mb-6 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
              <span>
                You&apos;re using a temporary password.{' '}
                <Link to="/staff/change-password" className="font-semibold underline underline-offset-2 hover:text-amber-900">
                  Change your password now
                </Link>{' '}to secure your account.
              </span>
            </div>
          )}
          <Outlet />
        </main>
      </div>
    </div>
  )
}
