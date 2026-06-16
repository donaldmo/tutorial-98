import { Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { SuperAdminSidebar } from './SuperAdminSidebar'
import { useState } from 'react'
import type { SuperAdminUser } from '@/hooks/useSuperAdminSession'

interface SuperAdminShellProps {
  admin: SuperAdminUser | null
  isAuthenticated: boolean
  onLogout: () => void
}

export function SuperAdminShell({ admin, isAuthenticated, onLogout }: SuperAdminShellProps) {
  const navigate = useNavigate()
  const location = useLocation()
  const [isMobileOpen, setIsMobileOpen] = useState(false)
  const [isDesktopSidebarOpen, setIsDesktopSidebarOpen] = useState(true)

  if (!isAuthenticated) {
    return <Navigate to="/super-admin/login" replace />
  }

  const handleLogout = () => {
    onLogout()
    navigate('/super-admin/login', { replace: true })
  }

  const pageTitles: Record<string, string> = {
    dashboard: 'Dashboard',
    firms: 'Firms',
    payments: 'Payments',
    activity: 'Activity Log',
    announcements: 'Announcements',
  }

  const currentPath = location.pathname.replace('/super-admin/', '').split('/')[0] || 'dashboard'
  const pageTitle = pageTitles[currentPath] || 'Super Admin'

  return (
    <div className="min-h-screen bg-gray-50">
      <SuperAdminSidebar
        activeTab={currentPath}
        isMobileOpen={isMobileOpen}
        setIsMobileOpen={setIsMobileOpen}
        isDesktopOpen={isDesktopSidebarOpen}
        setIsDesktopOpen={setIsDesktopSidebarOpen}
        admin={admin}
        onLogout={handleLogout}
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
                aria-label="Open sidebar"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </button>
              <div className="min-w-0">
                <p className="text-lg font-semibold text-gray-900">Super Admin — {pageTitle}</p>
                <p className="text-sm text-gray-500">Platform administration &amp; oversight</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-sm text-gray-500">{admin?.email}</span>
            </div>
          </div>
        </header>
        <main className="p-4 lg:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
