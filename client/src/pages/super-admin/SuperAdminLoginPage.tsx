import { useState } from 'react'
import axios from 'axios'
import { toast } from 'sonner'
import { API_BASE_URL } from '@/config/env'

interface SuperAdminLoginPageProps {
  onLogin: (token: string, admin: { _id: string; email: string; name?: string }) => void
}

export function SuperAdminLoginPage({ onLogin }: SuperAdminLoginPageProps) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      const response = await axios.post(`${API_BASE_URL}/saas/admin/login`, { email, password })
      const { token, admin } = response.data
      onLogin(token, admin)
      toast.success(`Welcome, ${admin.name || 'Super Admin'}!`)
    } catch (error: unknown) {
      const detail = axios.isAxiosError(error)
        ? error.response?.data?.detail || 'Invalid credentials'
        : 'Login failed'
      toast.error(detail)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-2xl shadow-xl p-8">
          <div className="text-center mb-8">
            <div className="w-16 h-16 bg-gradient-to-br from-purple-500 to-purple-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <span className="text-white font-bold text-2xl">SA</span>
            </div>
            <h1 className="text-2xl font-bold text-gray-900">Super Admin</h1>
            <p className="text-gray-500 mt-1 text-sm">Platform administration panel</p>
            <span className="inline-block mt-2 px-3 py-1 bg-purple-50 text-purple-700 text-xs font-semibold rounded-full border border-purple-100 tracking-wide">
              Super Admin Login
            </span>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-400"
                placeholder="admin@platform.com"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-400"
                placeholder="Enter your password"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-purple-600 text-white rounded-xl hover:bg-purple-700 disabled:bg-gray-400 font-medium"
            >
              {loading ? 'Signing in...' : 'Sign in as Super Admin'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
