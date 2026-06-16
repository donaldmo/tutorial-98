import { Navigate } from 'react-router-dom'
import { AdminLoginPage } from '@/pages/auth/AdminLoginPage'
import { getDefaultAppPath } from '@/routes/workflowRoutes'
import type { WorkflowUser } from '@/types/workflow'

interface AdminLoginRouteProps {
  isAuthenticated: boolean
  user: WorkflowUser | null
  onLogin: (user: WorkflowUser) => void
}

export function AdminLoginRoute({ isAuthenticated, user, onLogin }: AdminLoginRouteProps) {
  if (isAuthenticated) {
    const userType = localStorage.getItem('userType')
    return <Navigate to={userType === 'staff' ? '/staff/dashboard' : getDefaultAppPath(user, false)} replace />
  }
  return <AdminLoginPage onLogin={onLogin} />
}
