import { useState } from 'react'
import axios from 'axios'
import { Link, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'

import { API } from '@/lib/workflowApi'

export function StaffForgotPasswordPage() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email) return

    setLoading(true)
    try {
      const response = await axios.post(`${API}/auth/staff-forgot-password`, { email })
      const resetSessionId = String(response.data?.reset?.reset_session_id || '')
      const query = new URLSearchParams()
      query.set('email', email)
      if (resetSessionId) query.set('resetSessionId', resetSessionId)
      navigate(`/auth/staff-reset-password?${query.toString()}`)
      toast.success(response.data?.message || 'If your account exists, a reset PIN has been sent.')
    } catch (error: any) {
      toast.error(error.response?.data?.detail || 'Unable to process request')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl p-8">
        <h1 className="text-2xl font-bold text-gray-900 text-center">Staff Password Reset</h1>
        <p className="text-sm text-gray-500 mt-2 mb-6 text-center">
          Enter your staff email to receive a 4-digit reset PIN.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Staff Email</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-400"
              placeholder="staff@company.co.za"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:bg-gray-400 font-medium"
          >
            {loading ? 'Sending...' : 'Send 4-digit PIN'}
          </button>
        </form>

        <div className="mt-4 text-center">
          <Link to="/auth/login" className="text-sm text-gray-600 hover:text-gray-700">← Back to staff sign in</Link>
        </div>
      </div>
    </div>
  )
}
