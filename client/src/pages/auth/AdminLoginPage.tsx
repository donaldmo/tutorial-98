import { useEffect, useState } from 'react'
import axios from 'axios'
import { toast } from 'sonner'
import { Link, useNavigate } from 'react-router-dom'
import { API } from '@/lib/workflowApi'
import { getBillingGatePath, requiresBillingCompletion } from '@/lib/billingGate'
import { PasswordField } from '@/components/auth/PasswordField'
import { getDefaultAppPath } from '@/routes/workflowRoutes'
import type { WorkflowUser } from '@/types/workflow'

interface AdminLoginPageProps {
  onLogin: (user: WorkflowUser) => void
}

type PublicSettings = {
  logo_base64?: string
  firm_name?: string
  tagline?: string
}

type AdminAuthPayload = {
  token?: string
  admin?: WorkflowUser
  user?: WorkflowUser
} & Partial<WorkflowUser>

const getAxiosErrorDetail = (error: unknown, fallback: string) => {
  if (axios.isAxiosError(error)) {
    return error.response?.data?.detail || fallback
  }
  return fallback
}

export function AdminLoginPage({ onLogin }: AdminLoginPageProps) {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [settings, setSettings] = useState<PublicSettings | null>(null)

  useEffect(() => {
    let cancelled = false
    let retryTimer: ReturnType<typeof setTimeout>
    const fetchSettings = async (attempt = 1) => {
      try {
        const res = await axios.get(`${API}/settings`)
        if (!cancelled) setSettings(res.data)
      } catch (err: unknown) {
        const unavailable =
          axios.isAxiosError(err) && (err.code === 'ECONNREFUSED' || err.response?.status === 503)
        if (unavailable && attempt < 8) retryTimer = setTimeout(() => fetchSettings(attempt + 1), 1500)
      }
    }
    fetchSettings()
    return () => {
      cancelled = true
      clearTimeout(retryTimer)
    }
  }, [])

  const persistSession = (payload: AdminAuthPayload) => {
    const authUser = payload.admin ?? payload.user ?? (payload as WorkflowUser)
    localStorage.setItem('token', payload?.token || '')
    localStorage.setItem('user', JSON.stringify(authUser))
    localStorage.setItem('userType', 'admin')
    onLogin(authUser)
    return authUser
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      const response = await axios.post(`${API}/auth/admin-login`, { email, password })
      const authUser = persistSession(response.data)
      let hasPendingPaidSignup = false
      try {
        const subscriptionResponse = await axios.get(`${API}/settings/subscription`, {
          headers: {
            Authorization: `Bearer ${response.data?.token || ''}`,
          },
        })
        hasPendingPaidSignup = requiresBillingCompletion(subscriptionResponse.data)
        if (hasPendingPaidSignup) {
          navigate(getBillingGatePath(subscriptionResponse.data), { replace: true })
          return
        }
      } catch {
        // A subscription lookup failure should not block a valid login.
      }

      if (authUser?.mustChangePassword) {
        toast.warning('You are using a temporary password. Please reset it to secure your account.', { duration: 8000 })
      } else {
        toast.success(`Welcome back, ${authUser.name}!`)
      }
      navigate(getDefaultAppPath(authUser, false), { replace: true })
    } catch (error: unknown) {
      if (axios.isAxiosError(error) && error.response?.status === 403 && error.response?.data?.code === 'EMAIL_NOT_VERIFIED') {
        const verification = error.response?.data?.verification || {}
        const targetEmail = verification.email || email
        const tokenId = verification.tokenId || ''
        toast.error('Email not verified. Redirecting to verify page…', { duration: 3000 })
        const query = new URLSearchParams({ email: targetEmail })
        if (tokenId) query.set('tokenId', tokenId)
        query.set('admin', 'true')
        navigate(`/auth/verify?${query.toString()}`)
        return
      }
      toast.error(getAxiosErrorDetail(error, 'Invalid credentials'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-2xl shadow-xl p-8">
          <div className="text-center mb-8">
            {settings?.logo_base64 ? (
              <img
                src={settings.logo_base64}
                alt={settings?.firm_name || 'Logo'}
                className="w-20 h-20 object-contain mx-auto mb-4 rounded-2xl"
              />
            ) : (
              <div className="w-16 h-16 bg-gradient-to-br from-indigo-500 to-indigo-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <span className="text-white font-bold text-2xl">
                  {settings?.firm_name?.split(' ').map((w: string) => w[0]).join('').substring(0, 2) || 'WP'}
                </span>
              </div>
            )}
            <h1 className="text-2xl font-bold text-gray-900">{settings?.firm_name || 'Workflow Planner'}</h1>
            <p className="text-gray-500 mt-1 text-sm">{settings?.tagline || 'SA Accounting & Consulting'}</p>
            <span className="inline-block mt-2 px-3 py-1 bg-indigo-50 text-indigo-700 text-xs font-semibold rounded-full border border-indigo-100 tracking-wide">Admin Login</span>
          </div>

          <>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-400"
                  placeholder="admin@company.co.za"
                  data-testid="admin-login-email"
                />
              </div>
              <PasswordField
                label="Password"
                required
                value={password}
                onChange={setPassword}
                className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-400"
                dataTestId="admin-login-password"
              />
              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 disabled:bg-gray-400 font-medium"
                data-testid="admin-login-submit"
              >
                {loading ? 'Signing in...' : 'Sign In as Admin'}
              </button>
            </form>
            <div className="mt-3 text-center">
              <button
                onClick={() => navigate('/auth/admin-forgot-password')}
                className="text-gray-500 hover:text-gray-700 text-sm"
              >
                Forgot password?
              </button>
            </div>
            <div className="mt-4 text-center">
              <Link to="/auth/register" className="text-indigo-600 hover:text-indigo-700 text-sm font-medium">
                Register a new firm (14-day free trial)
              </Link>
            </div>
            <div className="mt-6 pt-6 border-t border-gray-100">
              <Link
                to="/auth/login"
                className="flex items-center justify-center gap-2 w-full py-3 bg-blue-50 text-blue-700 font-medium rounded-xl border border-blue-100 hover:bg-blue-100 transition-colors text-sm"
              >
                <span>👤</span> Sign in as Staff Member
              </Link>
            </div>
          </>
        </div>
      </div>
    </div>
  )
}
