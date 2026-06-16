import { useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'

export function RegisterBillingPage() {
  const navigate = useNavigate()

  useEffect(() => {
    const isAdminSession = localStorage.getItem('userType') === 'admin' && Boolean(localStorage.getItem('token'))
    navigate(isAdminSession ? '/app/settings?tab=subscription' : '/auth/admin-login', { replace: true })
  }, [navigate])

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 flex items-center justify-center p-6">
      <div className="w-full max-w-lg bg-white rounded-2xl shadow-xl p-8 text-center">
        <h1 className="text-2xl font-bold text-gray-900">Billing moved into your account</h1>
        <p className="text-sm text-gray-500 mt-3">
          Paid plan checkout is now completed after email verification and admin sign-in.
        </p>
        <div className="mt-6 flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            to="/auth/admin-login"
            className="px-5 py-3 rounded-xl bg-blue-600 text-white font-medium hover:bg-blue-700"
          >
            Sign in as admin
          </Link>
          <Link
            to="/auth/register"
            className="px-5 py-3 rounded-xl border border-slate-200 text-gray-700 font-medium hover:bg-slate-50"
          >
            Back to registration
          </Link>
        </div>
      </div>
    </div>
  )
}
