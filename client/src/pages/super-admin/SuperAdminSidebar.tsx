import type { SuperAdminUser } from '@/hooks/useSuperAdminSession'

interface NavItem {
  id: string
  label: string
  icon: React.ReactNode
}

interface SuperAdminSidebarProps {
  activeTab: string
  isMobileOpen: boolean
  setIsMobileOpen: (open: boolean) => void
  isDesktopOpen: boolean
  setIsDesktopOpen: (open: boolean) => void
  admin: SuperAdminUser | null
  onLogout: () => void
}

function DashboardIcon() {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
    </svg>
  )
}

function BuildingIcon() {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
    </svg>
  )
}

function PaymentsIcon() {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
    </svg>
  )
}

function ActivityIcon() {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
    </svg>
  )
}

function AnnouncementIcon() {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z" />
    </svg>
  )
}

function CloseIcon() {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
    </svg>
  )
}

function LogoutIcon() {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
    </svg>
  )
}

const navItems: NavItem[] = [
  { id: 'dashboard', label: 'Dashboard', icon: <DashboardIcon /> },
  { id: 'firms', label: 'Firms', icon: <BuildingIcon /> },
  { id: 'payments', label: 'Payments', icon: <PaymentsIcon /> },
  { id: 'activity', label: 'Activity Log', icon: <ActivityIcon /> },
  { id: 'announcements', label: 'Announcements', icon: <AnnouncementIcon /> },
]

const navigateTo = (path: string) => {
  window.location.href = `/super-admin/${path}`
}

export function SuperAdminSidebar({
  activeTab,
  isMobileOpen,
  setIsMobileOpen,
  isDesktopOpen,
  setIsDesktopOpen,
  admin,
  onLogout,
}: SuperAdminSidebarProps) {
  return (
    <>
      {isMobileOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-40 lg:hidden" onClick={() => setIsMobileOpen(false)} />
      )}
      <aside
        className={`fixed top-0 left-0 z-50 h-full w-64 bg-slate-900 transform transition-transform duration-300 ease-in-out ${
          isMobileOpen ? 'translate-x-0' : '-translate-x-full'
        } ${isDesktopOpen ? 'lg:translate-x-0' : 'lg:-translate-x-full'}`}
      >
        <div className="flex flex-col h-full">
          <div className="flex items-center justify-between px-4 py-5 border-b border-slate-800">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-purple-600 flex items-center justify-center">
                <span className="text-white font-bold text-lg">SA</span>
              </div>
              <div>
                <h1 className="text-white font-bold text-lg">Super Admin</h1>
                <p className="text-slate-400 text-xs">Platform Control</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                setIsMobileOpen(false)
                setIsDesktopOpen(false)
              }}
              className="p-2 text-slate-300 hover:text-white hover:bg-slate-800 rounded-xl"
              aria-label="Close sidebar"
            >
              <CloseIcon />
            </button>
          </div>

          <nav className="flex-1 px-4 py-6 space-y-1 overflow-y-auto">
            {navItems.map((item) => (
              <button
                key={item.id}
                onClick={() => {
                  navigateTo(item.id)
                  setIsMobileOpen(false)
                }}
                className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-all ${
                  activeTab === item.id
                    ? 'text-white bg-purple-600 shadow-lg'
                    : 'text-slate-400 hover:bg-slate-800 hover:text-white'
                }`}
              >
                {item.icon}
                <span className="flex-1 text-left">{item.label}</span>
              </button>
            ))}
          </nav>

          <div className="px-4 pb-4 pt-3 border-t border-slate-800">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-slate-700 flex items-center justify-center">
                <span className="text-white font-bold text-sm">
                  {admin?.email?.charAt(0).toUpperCase() || 'S'}
                </span>
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-slate-100 truncate">
                  {admin?.name || 'Super Admin'}
                </p>
                <p className="text-xs text-slate-400 truncate">{admin?.email || ''}</p>
              </div>
              <button
                type="button"
                className="shrink-0 text-red-400 hover:bg-slate-800 hover:text-white p-2 rounded-lg"
                onClick={onLogout}
                aria-label="Sign out"
              >
                <LogoutIcon />
              </button>
            </div>
          </div>
        </div>
      </aside>
    </>
  )
}
