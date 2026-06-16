import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams, Link } from 'react-router-dom'
import axios from 'axios'
import { toast } from 'sonner'
import { MailIcon, RefreshCwIcon } from 'lucide-react'

import { API } from '@/lib/workflowApi'
import {
  InputOTP as InputOTPBase,
  InputOTPGroup as InputOTPGroupBase,
  InputOTPSlot as InputOTPSlotBase,
} from '@/components/ui/input-otp'

const getAxiosErrorDetail = (error: unknown, fallback: string) => {
  if (axios.isAxiosError(error)) {
    return error.response?.data?.detail || fallback
  }
  return fallback
}

// Cast to any to work with untyped .jsx component
 
const InputOTP = InputOTPBase as React.ComponentType<any>
 
const InputOTPGroup = InputOTPGroupBase as React.ComponentType<any>
 
const InputOTPSlot = InputOTPSlotBase as React.ComponentType<any>

export function VerifyEmailPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const email = searchParams.get('email') || ''
  const tokenId = searchParams.get('tokenId') || ''
  const isAdminFlow = searchParams.get('admin') === 'true'

  const [pin, setPin] = useState('')
  const [verifying, setVerifying] = useState(false)
  const [resending, setResending] = useState(false)

  // Auto-submit when all 4 digits entered
  useEffect(() => {
    if (pin.length === 4) {
      handleVerifyPin(pin)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pin])

  const handleVerifyPin = async (code: string) => {
    if (!tokenId) {
      toast.error('No verification session found. Please resend a new code.')
      return
    }
    setVerifying(true)
    try {
      const response = await axios.post(`${API}/auth/verify-pin`, { tokenId, pin: code })
      const entityType = String(response.data?.entity_type || '').toLowerCase()
      toast.success('Email verified! You can now sign in.')
      navigate(entityType === 'admin' ? '/auth/admin-login' : '/auth/login')
    } catch (err: unknown) {
      toast.error(getAxiosErrorDetail(err, 'Invalid or expired code.'))
      setPin('')
    } finally {
      setVerifying(false)
    }
  }

  const handleResend = async () => {
    if (!email) {
      toast.error('No email address found. Please go back and re-register.')
      return
    }
    setResending(true)
    try {
      const res = await axios.post(`${API}/auth/resend-verification`, { email })
      const refreshedTokenId = res.data?.verification?.tokenId
      toast.success(res.data?.message || 'A new code has been sent to your email.')
      if (refreshedTokenId) {
        const query = new URLSearchParams()
        if (email) query.set('email', email)
        query.set('tokenId', refreshedTokenId)
        if (isAdminFlow) query.set('admin', 'true')
        navigate(`/auth/verify?${query.toString()}`, { replace: true })
      }
      setPin('')
    } catch (err: unknown) {
      toast.error(getAxiosErrorDetail(err, 'Failed to resend. Please try again.'))
    } finally {
      setResending(false)
    }
  }

  // ── PIN input flow ──────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 flex items-center justify-center p-6">
      <div className="bg-white rounded-2xl shadow-xl p-10 w-full max-w-md text-center">
        {/* Icon */}
        <div className="w-16 h-16 rounded-2xl bg-blue-50 flex items-center justify-center mx-auto mb-5">
          <MailIcon className="w-8 h-8 text-blue-500" />
        </div>

        <h1 className="text-2xl font-bold text-gray-900 mb-2">Check your email</h1>
        <p className="text-gray-500 text-sm mb-1">
          We sent a 4-digit verification code to
        </p>
        {email ? (
          <p className="font-semibold text-gray-800 text-sm mb-7 break-all">{email}</p>
        ) : (
          <p className="text-gray-400 text-sm mb-7 italic">your registered email address</p>
        )}

        {/* OTP input */}
        <div className="flex justify-center mb-6">
          <InputOTP
            maxLength={4}
            value={pin}
            onChange={setPin}
            disabled={verifying}
          >
            <InputOTPGroup>
              <InputOTPSlot index={0} />
              <InputOTPSlot index={1} />
              <InputOTPSlot index={2} />
              <InputOTPSlot index={3} />
            </InputOTPGroup>
          </InputOTP>
        </div>

        {verifying && (
          <p className="text-sm text-blue-600 mb-4 flex items-center justify-center gap-2">
            <RefreshCwIcon className="w-4 h-4 animate-spin" /> Verifying…
          </p>
        )}

        <p className="text-xs text-gray-400 mb-6">
          The code expires in 15m. Didn't receive it?{' '}
          <button
            onClick={handleResend}
            disabled={resending}
            className="text-blue-600 font-medium hover:underline disabled:opacity-60"
          >
            {resending ? 'Sending…' : 'Resend code'}
          </button>
        </p>

        <div className="pt-4 border-t border-gray-100">
          <Link to={isAdminFlow ? '/auth/admin-login' : '/auth/login'} className="text-sm text-gray-500 hover:text-gray-700 transition-colors">
            ← Back to sign in
          </Link>
        </div>
      </div>
    </div>
  )
}
