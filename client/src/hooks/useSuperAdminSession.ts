import { useCallback, useEffect, useState } from 'react'

export interface SuperAdminUser {
  _id: string
  email: string
  name?: string
  is_active?: boolean
}

interface SuperAdminSession {
  admin: SuperAdminUser | null
  token: string | null
  isAuthenticated: boolean
  ready: boolean
  login: (token: string, admin: SuperAdminUser) => void
  logout: () => void
}

const STORAGE_TOKEN_KEY = 'super_admin_token'
const STORAGE_USER_KEY = 'super_admin_user'

export function useSuperAdminSession(): SuperAdminSession {
  const [admin, setAdmin] = useState<SuperAdminUser | null>(null)
  const [token, setToken] = useState<string | null>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const savedToken = localStorage.getItem(STORAGE_TOKEN_KEY)
    const savedUser = localStorage.getItem(STORAGE_USER_KEY)

    if (savedToken && savedUser) {
      try {
        const parsed = JSON.parse(savedUser) as SuperAdminUser
        setAdmin(parsed)
        setToken(savedToken)
      } catch {
        localStorage.removeItem(STORAGE_TOKEN_KEY)
        localStorage.removeItem(STORAGE_USER_KEY)
      }
    }

    setReady(true)
  }, [])

  const login = useCallback((newToken: string, newAdmin: SuperAdminUser) => {
    localStorage.setItem(STORAGE_TOKEN_KEY, newToken)
    localStorage.setItem(STORAGE_USER_KEY, JSON.stringify(newAdmin))
    setToken(newToken)
    setAdmin(newAdmin)
  }, [])

  const logout = useCallback(() => {
    localStorage.removeItem(STORAGE_TOKEN_KEY)
    localStorage.removeItem(STORAGE_USER_KEY)
    setToken(null)
    setAdmin(null)
  }, [])

  return {
    admin,
    token,
    isAuthenticated: Boolean(token && admin),
    ready,
    login,
    logout,
  }
}
