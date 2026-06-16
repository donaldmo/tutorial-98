import { useEffect } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'

import { LoginPage } from '@/pages/auth/LoginPage'
import { getDefaultAppPath } from '@/routes/workflowRoutes'
import type { WorkflowUser } from '@/types/workflow'

interface LoginRouteProps {
  isAuthenticated: boolean
  user: WorkflowUser | null
  isGuest: boolean
  onLogin: (user: WorkflowUser) => void
  onSkipLogin: () => void
}

export function LoginRoute({ isAuthenticated, user, isGuest, onLogin, onSkipLogin }: LoginRouteProps) {
  const navigate = useNavigate()
  const params = new URLSearchParams(window.location.search)
  const token = params.get('token') || ''
  const isInviteFlow =
    Boolean(token) &&
    (params.get('invite_token') === 'true' || params.get('staff_invite') === 'true')

  useEffect(() => {
    if (!isInviteFlow) return
    localStorage.removeItem('token')
    localStorage.removeItem('user')
    localStorage.removeItem('userType')
    window.dispatchEvent(new Event('session:expired'))
  }, [isInviteFlow])

  if (isAuthenticated && !isInviteFlow) {
    return <Navigate to={getDefaultAppPath(user, isGuest)} replace />
  }

  return (
    <LoginPage
      onLogin={(userData: WorkflowUser) => {
        onLogin(userData)
        navigate(getDefaultAppPath(userData, false), { replace: true })
      }}
      onSkipLogin={() => {
        onSkipLogin()
        navigate(getDefaultAppPath(null, true), { replace: true })
      }}
    />
  )
}
