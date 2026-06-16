import { useEffect, useMemo, useState } from 'react'

import type { WorkflowUser } from '@/types/workflow'

export function useWorkflowSession() {
  const [user, setUser] = useState<WorkflowUser | null>(null)
  const [isGuest, setIsGuest] = useState(false)
  const [ready, setReady] = useState(false)
  const [userType, setUserType] = useState<'admin' | 'staff' | null>(null)

  useEffect(() => {
    const token = localStorage.getItem('token')
    const savedUser = localStorage.getItem('user')
    const savedType = localStorage.getItem('userType') as 'admin' | 'staff' | null

    if (token && savedUser) {
      try {
        setUser(JSON.parse(savedUser) as WorkflowUser)
        setUserType(savedType)
      } catch {
        localStorage.removeItem('token')
        localStorage.removeItem('user')
        localStorage.removeItem('userType')
      }
    }

    setReady(true)
  }, [])

  useEffect(() => {
    const handleSessionExpired = () => {
      localStorage.removeItem('token')
      localStorage.removeItem('user')
      localStorage.removeItem('userType')
      setUser(null)
      setIsGuest(false)
      setUserType(null)
    }
    window.addEventListener('session:expired', handleSessionExpired)
    return () => window.removeEventListener('session:expired', handleSessionExpired)
  }, [])

  const onLogin = (userData: WorkflowUser) => {
    localStorage.setItem('user', JSON.stringify(userData))
    setUser(userData)
    setIsGuest(false)
    const savedType = localStorage.getItem('userType') as 'admin' | 'staff' | null
    setUserType(savedType)
  }

  const onSkipLogin = () => {
    setIsGuest(true)
    setUser(null)
    setUserType(null)
  }

  const onLogout = () => {
    localStorage.removeItem('token')
    localStorage.removeItem('user')
    localStorage.removeItem('userType')
    setUser(null)
    setIsGuest(false)
    setUserType(null)
  }

  const permissions = useMemo(() => {
    const isSupervisorAdmin = userType === 'admin' && user?.role === 'supervisor'
    const hasFullAccess =
      isGuest ||
      (userType === 'admin' && !isSupervisorAdmin) ||
      user?.access_level === 'Full' ||
      user?.access_level === 'Admin'
    const isSupervisor = user?.access_level === 'Supervisor' || isSupervisorAdmin

    return {
      hasFullAccess,
      isSupervisor,
      hasExtendedAccess: hasFullAccess || isSupervisor,
    }
  }, [isGuest, user, userType])

  return {
    user,
    isGuest,
    ready,
    userType,
    isAdmin: userType === 'admin',
    isStaff: userType === 'staff',
    onLogin,
    onSkipLogin,
    onLogout,
    ...permissions,
  }
}
