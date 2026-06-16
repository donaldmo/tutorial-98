import { Navigate } from 'react-router-dom'
import { SuperAdminLoginPage } from './SuperAdminLoginPage'

interface SuperAdminLoginRouteProps {
  isAuthenticated: boolean
  onLogin: (token: string, admin: { _id: string; email: string; name?: string }) => void
}

export function SuperAdminLoginRoute({ isAuthenticated, onLogin }: SuperAdminLoginRouteProps) {
  if (isAuthenticated) {
    return <Navigate to="/super-admin/dashboard" replace />
  }
  return <SuperAdminLoginPage onLogin={onLogin} />
}
