import { useEffect, useState } from 'react'
import axios from 'axios'
import { toast } from 'sonner'
import { Link, useNavigate } from 'react-router-dom'

import { API } from '@/lib/workflowApi'
import { PasswordField } from '@/components/auth/PasswordField'
import type { WorkflowUser } from '@/types/workflow'

interface LoginPageProps {
  onLogin: (user: WorkflowUser) => void
  onSkipLogin?: () => void
}

export function LoginPage({ onLogin, onSkipLogin: _onSkipLogin }: LoginPageProps) {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [mode, setMode] = useState<'login' | 'invite' | 'staff-invite'>('login')
  const [flowToken, setFlowToken] = useState('')
  const [loading, setLoading] = useState(false)
  const [inviteData, setInviteData] = useState({ name: '', password: '', confirmPassword: '' })
  const [inviteLoading, setInviteLoading] = useState(false)
  const [staffInviteLoading, setStaffInviteLoading] = useState(false)
  const [settings, setSettings] = useState<any>(null)

  const clearStoredSession = () => {
    localStorage.removeItem('token')
    localStorage.removeItem('user')
    localStorage.removeItem('userType')
  }

  const persistSession = (payload: any) => {
    const authUser = payload?.user ?? payload
    localStorage.setItem('token', payload?.token || '')
    localStorage.setItem('user', JSON.stringify(authUser))
    localStorage.setItem('userType', 'staff')
    onLogin(authUser)
    return authUser
  }

  useEffect(() => {
    let cancelled = false
    let retryTimer: ReturnType<typeof setTimeout>

    const fetchSettings = async (attempt = 1) => {
      try {
        const res = await axios.get(`${API}/settings`)
        if (!cancelled) setSettings(res.data)
      } catch (err: any) {
        const unavailable = err?.code === 'ECONNREFUSED' || err?.response?.status === 503
        if (unavailable && attempt < 8) {
          retryTimer = setTimeout(() => fetchSettings(attempt + 1), 1500)
        }
      }
    }

    fetchSettings()
    return () => {
      cancelled = true
      clearTimeout(retryTimer)
    }
  }, [])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const token = params.get('token') || ''
    const isInvite = params.get('invite_token') === 'true'
    const isStaffInvite = params.get('staff_invite') === 'true'

    if (isInvite && token) {
      clearStoredSession()
      setFlowToken(token)
      setMode('invite')
      return
    }

    if (isStaffInvite && token) {
      clearStoredSession()
      setFlowToken(token)
      setMode('staff-invite')
      return
    }

  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      const response = await axios.post(`${API}/auth/login`, { email, password })
      const authUser = persistSession(response.data)
      if (authUser?.mustChangePassword) {
        toast.warning('You are using a temporary password. Please reset it to secure your account.', { duration: 8000 })
      } else {
        toast.success(`Welcome back, ${authUser.name}!`)
      }
    } catch (error: any) {
      if (error.response?.status === 403 && error.response?.data?.code === 'EMAIL_NOT_VERIFIED') {
        const verification = error.response?.data?.verification || {}
        const targetEmail = verification.email || email
        const tokenId = verification.tokenId || ''
        toast.error('Email not verified. Redirecting to verify page…', { duration: 3000 })
        const query = new URLSearchParams({ email: targetEmail })
        if (tokenId) query.set('tokenId', tokenId)
        navigate(`/auth/verify?${query.toString()}`)
        return
      }
      if (error.response?.status === 403 && error.response?.data?.code === 'INVITATION_PENDING') {
        toast.error('Account not yet activated. Check your email for the activation link.', { duration: 6000 })
        return
      }
      toast.error(error.response?.data?.detail || 'Invalid credentials')
    } finally {
      setLoading(false)
    }
  }

  const handleAcceptInvite = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!flowToken) {
      toast.error('Missing invite token')
      return
    }
    if (inviteData.password !== inviteData.confirmPassword) {
      toast.error('Passwords do not match')
      return
    }

    setInviteLoading(true)
    try {
      const response = await axios.post(`${API}/auth/accept-invite`, {
        token: flowToken,
        name: inviteData.name || undefined,
        password: inviteData.password || undefined,
      })
      // acceptInvite returns { token, admin } — set userType as admin
      const authUser = response.data?.admin ?? response.data?.user ?? response.data
      localStorage.setItem('token', response.data?.token || '')
      localStorage.setItem('user', JSON.stringify(authUser))
      localStorage.setItem('userType', 'admin')
      onLogin(authUser)
      toast.success(`Welcome, ${authUser?.name ?? 'Admin'}! Your account is ready.`)
      window.history.replaceState({}, document.title, '/auth/login')
      navigate('/app/dashboard', { replace: true })
    } catch (error: any) {
      toast.error(error.response?.data?.detail || 'Failed to accept invite')
    } finally {
      setInviteLoading(false)
    }
  }

  const handleAcceptStaffInvite = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!flowToken) {
      toast.error('Missing invite token')
      return
    }
    setStaffInviteLoading(true)
    try {
      const response = await axios.post(`${API}/auth/accept-staff-invite`, {
        token: flowToken,
      })
      const authUser = response.data?.user ?? response.data
      localStorage.setItem('token', response.data?.token || '')
      localStorage.setItem('user', JSON.stringify(authUser))
      localStorage.setItem('userType', 'staff')
      onLogin(authUser)
      toast.success(`Welcome, ${authUser?.name ?? 'there'}! Your account is now active.`)
      window.history.replaceState({}, document.title, '/auth/login')
      navigate('/staff/dashboard', { replace: true })
    } catch (error: any) {
      toast.error(error.response?.data?.detail || 'Failed to activate account')
    } finally {
      setStaffInviteLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 flex items-center justify-center p-4" data-testid="login-page">
      <div className="w-full max-w-md"><div className="bg-white rounded-2xl shadow-xl p-8">
        <div className="text-center mb-8">
          {settings?.logo_base64 ? (
            <img src={settings.logo_base64} alt={settings?.firm_name || 'Company Logo'} className="w-20 h-20 object-contain mx-auto mb-4 rounded-2xl" />
          ) : (
            <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <span className="text-white font-bold text-2xl">{settings?.firm_name?.split(' ').map((w: string) => w[0]).join('').substring(0, 2) || 'WP'}</span>
            </div>
          )}
          <h1 className="text-2xl font-bold text-gray-900">{settings?.firm_name || 'Workflow Planner'}</h1>
          <p className="text-gray-500 mt-1 text-sm">{settings?.tagline || 'SA Accounting & Consulting'}</p>
          <span className="inline-block mt-2 px-3 py-1 bg-blue-50 text-blue-700 text-xs font-semibold rounded-full border border-blue-100 tracking-wide">Staff Login</span>
        </div>

        {mode === 'login' ? (
          <>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Email</label><input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="w-full px-4 py-3 border border-gray-200 rounded-xl" placeholder="your@email.co.za" data-testid="login-email" /></div>
              <PasswordField
                label="Password"
                required
                value={password}
                onChange={setPassword}
                className="w-full px-4 py-3 border border-gray-200 rounded-xl"
                dataTestId="login-password"
              />
              <button type="submit" disabled={loading} className="w-full py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:bg-gray-400" data-testid="login-submit">{loading ? 'Signing in...' : 'Sign In'}</button>
            </form>
            <div className="mt-4 text-center">
              <Link to="/auth/register" className="text-blue-600 hover:text-blue-700 text-sm font-medium">
                Register a new firm (as admin) (14-day free trial)
              </Link>
            </div>
            <div className="mt-2 text-center">
              <button onClick={() => navigate('/auth/staff-forgot-password')} className="text-gray-600 hover:text-gray-700 text-sm font-medium">Forgot password?</button>
            </div>
            <p className="mt-4 text-xs text-gray-500 text-center">Staff members cannot self-register. They must be invited by an organization admin.</p>
            <div className="mt-6 pt-6 border-t border-gray-100 space-y-3">
              <Link
                to="/auth/admin-login"
                className="flex items-center justify-center gap-2 w-full py-3 bg-indigo-50 text-indigo-700 font-medium rounded-xl border border-indigo-100 hover:bg-indigo-100 transition-colors text-sm"
              >
                <span>🔐</span> Sign in as Admin / Firm Owner
              </Link>
            </div>
          </>
        ) : mode === 'staff-invite' ? (
          <>
            <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-xl text-center">
              <p className="text-green-800 font-semibold text-sm">🎉 Activate Your Account</p>
              <p className="text-green-700 text-xs mt-1">Click the button below to activate your account.</p>
            </div>
            <form onSubmit={handleAcceptStaffInvite} className="space-y-4">
              <button type="submit" disabled={staffInviteLoading} className="w-full py-3 bg-green-600 text-white rounded-xl hover:bg-green-700 disabled:bg-gray-400 font-semibold">{staffInviteLoading ? 'Activating...' : 'Activate My Account'}</button>
            </form>
            <div className="mt-4 text-center">
              <button onClick={() => setMode('login')} className="text-gray-600 hover:text-gray-700 text-sm font-medium">Back to sign in</button>
            </div>
          </>
        ) : (
          <>
            <form onSubmit={handleAcceptInvite} className="space-y-4">
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Full Name (new users)</label><input type="text" value={inviteData.name} onChange={(e) => setInviteData({ ...inviteData, name: e.target.value })} className="w-full px-4 py-3 border border-gray-200 rounded-xl" placeholder="Jane Doe" /></div>
              <PasswordField
                label="Password (new users)"
                value={inviteData.password}
                onChange={(value) => setInviteData({ ...inviteData, password: value })}
                className="w-full px-4 py-3 border border-gray-200 rounded-xl"
              />
              <PasswordField
                label="Confirm Password"
                value={inviteData.confirmPassword}
                onChange={(value) => setInviteData({ ...inviteData, confirmPassword: value })}
                className="w-full px-4 py-3 border border-gray-200 rounded-xl"
              />
              <button type="submit" disabled={inviteLoading} className="w-full py-3 bg-green-600 text-white rounded-xl hover:bg-green-700 disabled:bg-gray-400">{inviteLoading ? 'Accepting...' : 'Accept invite'}</button>
            </form>
            <div className="mt-4 text-center">
              <button onClick={() => setMode('login')} className="text-gray-600 hover:text-gray-700 text-sm font-medium">Back to sign in</button>
            </div>
          </>
        )}
      </div></div>
    </div>
  )
}
