import { useMemo, useState } from 'react'
import axios from 'axios'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'

import { API } from '@/lib/workflowApi'
import { PasswordField } from '@/components/auth/PasswordField'
import {
  InputOTP as InputOTPBase,
  InputOTPGroup as InputOTPGroupBase,
  InputOTPSlot as InputOTPSlotBase,
} from '@/components/ui/input-otp'

 
const InputOTP = InputOTPBase as React.ComponentType<any>
 
const InputOTPGroup = InputOTPGroupBase as React.ComponentType<any>
 
const InputOTPSlot = InputOTPSlotBase as React.ComponentType<any>

export function StaffResetPasswordPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  const email = searchParams.get('email') || ''
  const resetSessionId = searchParams.get('resetSessionId') || ''

  const [pin, setPin] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)

  const canSubmit = useMemo(() => (
    pin.length === 4
    && password.length > 0
    && confirmPassword.length > 0
    && Boolean(resetSessionId)
  ), [pin, password, confirmPassword, resetSessionId])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!resetSessionId) {
      toast.error('Missing reset session. Start from forgot password page.')
      return
    }
    if (pin.length !== 4) {
      toast.error('Enter the 4-digit PIN sent to your email.')
      return
    }
    if (password !== confirmPassword) {
      toast.error('Passwords do not match')
      return
    }

    setLoading(true)
    try {
      await axios.post(`${API}/auth/staff-reset-password`, {
        resetSessionId,
        pin,
        password,
        confirmPassword,
      })
      toast.success('Password reset successful. Please sign in.')
      navigate('/auth/login', { replace: true })
    } catch (error: any) {
      toast.error(error.response?.data?.detail || 'Failed to reset password')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl p-8">
        <h1 className="text-2xl font-bold text-gray-900 text-center">Reset Staff Password</h1>
        <p className="text-sm text-gray-500 mt-2 mb-6 text-center">
          Enter the 4-digit PIN sent to {email || 'your email'}, then choose a new password.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="flex justify-center">
            <InputOTP maxLength={4} value={pin} onChange={setPin} disabled={loading}>
              <InputOTPGroup>
                <InputOTPSlot index={0} />
                <InputOTPSlot index={1} />
                <InputOTPSlot index={2} />
                <InputOTPSlot index={3} />
              </InputOTPGroup>
            </InputOTP>
          </div>

          <PasswordField
            label="New Password"
            required
            value={password}
            onChange={setPassword}
            className="w-full px-4 py-3 border border-gray-200 rounded-xl"
          />
          <PasswordField
            label="Confirm Password"
            required
            value={confirmPassword}
            onChange={setConfirmPassword}
            className="w-full px-4 py-3 border border-gray-200 rounded-xl"
          />

          <button
            type="submit"
            disabled={loading || !canSubmit}
            className="w-full py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:bg-gray-400 font-medium"
          >
            {loading ? 'Resetting...' : 'Reset password'}
          </button>
        </form>

        <div className="mt-4 text-center">
          <Link to="/auth/staff-forgot-password" className="text-sm text-gray-600 hover:text-gray-700">Request a new PIN</Link>
        </div>
      </div>
    </div>
  )
}
