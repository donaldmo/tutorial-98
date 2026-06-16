import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams, Link } from 'react-router-dom'
import axios from 'axios'
import { toast } from 'sonner'
import { CheckIcon } from 'lucide-react'

import { API } from '@/lib/workflowApi'
import { formatPlanPrice, getPlanCardLines, isRecommendedPlan, normalizePlans, type SaasPlan } from '@/lib/saasPlans'
import { PasswordField } from '@/components/auth/PasswordField'

const getAxiosErrorDetail = (error: unknown, fallback: string) => {
  if (axios.isAxiosError(error)) {
    return error.response?.data?.detail || fallback
  }
  return fallback
}

export function RegisterPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const selectedPlanId = searchParams.get('plan')

  const [plans, setPlans] = useState<SaasPlan[]>([])
  const [plansLoading, setPlansLoading] = useState(true)
  const [plansLoadError, setPlansLoadError] = useState('')
  const [plansReloadToken, setPlansReloadToken] = useState(0)
  const [formData, setFormData] = useState({
    firm_name: '',
    owner_name: '',
    email: '',
    phone: '',
    password: '',
    confirmPassword: '',
  })
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    let cancelled = false
    const fetchPlans = async (attempt = 1) => {
      try {
        const res = await axios.get(`${API}/saas-plans`)
        const normalizedPlans = normalizePlans(res.data)
        if (!cancelled && normalizedPlans.length > 0) {
          setPlans(normalizedPlans)
          setPlansLoadError('')
          return
        }

        const legacyRes = await axios.get(`${API}/saas/plans`)
        const legacyPlans = normalizePlans(legacyRes.data)
        if (!cancelled && legacyPlans.length > 0) {
          setPlans(legacyPlans)
          setPlansLoadError('')
        } else if (!cancelled) {
          setPlans([])
          setPlansLoadError('Could not load SaaS plans. Please try again.')
        }
      } catch (err: unknown) {
        const unavailable =
          axios.isAxiosError(err) && (err.code === 'ECONNREFUSED' || err.response?.status === 503)
        if (unavailable && attempt < 8) {
          setTimeout(() => fetchPlans(attempt + 1), 1500)
          return
        }
        try {
          const legacyRes = await axios.get(`${API}/saas/plans`)
          const legacyPlans = normalizePlans(legacyRes.data)
          if (!cancelled && legacyPlans.length > 0) {
            setPlans(legacyPlans)
            setPlansLoadError('')
            return
          }
        } catch {
          // Show an explicit load failure below if both endpoints fail.
        }
        if (!cancelled) {
          setPlans([])
          setPlansLoadError('Could not load SaaS plans. Please try again.')
        }
      } finally {
        if (!cancelled) setPlansLoading(false)
      }
    }
    setPlansLoading(true)
    fetchPlans()
    return () => { cancelled = true }
  }, [plansReloadToken])

  const currentPlan = plans.find((p) => p.id === selectedPlanId)
  const isPaidPlan = Number(currentPlan?.price_monthly || 0) > 0

  const handleSelectPlan = (planId: string) => {
    navigate(`/auth/register?plan=${planId}`)
  }

  const handleChange = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (formData.password !== formData.confirmPassword) {
      toast.error('Passwords do not match')
      return
    }
    if (formData.password.length < 6) {
      toast.error('Password must be at least 6 characters')
      return
    }
    setSubmitting(true)
    try {
      const response = await axios.post(`${API}/saas/organisations/register`, {
        firm_name: formData.firm_name,
        owner_name: formData.owner_name,
        email: formData.email,
        password: formData.password,
        phone: formData.phone || null,
        plan: selectedPlanId || 'free',
      })

      const registeredEmail = response.data?.verification?.email || formData.email
      const tokenId = response.data?.verification?.tokenId || ''
      if (response.data?.verification?.warning) {
        toast.warning('Firm registered. Email delivery failed — use the verify page to resend your code.')
      } else if (response.data?.billing?.required) {
        toast.success(
          response.data?.resumed_purchase
            ? 'Existing paid signup found. Verify your email, then sign in to open the billing completion screen under Subscription.'
            : 'Organisation created. Verify your email, then sign in to open the billing completion screen under Subscription.',
        )
      } else {
        toast.success('Firm registered! Check your email for your 4-digit verification code.')
      }
      const query = new URLSearchParams({ email: registeredEmail })
      if (tokenId) query.set('tokenId', tokenId)
      if (response.data?.billing?.required) query.set('admin', 'true')
      navigate(`/auth/verify?${query.toString()}`)
    } catch (error: unknown) {
      toast.error(getAxiosErrorDetail(error, 'Registration failed. Please try again.'))
    } finally {
      setSubmitting(false)
    }
  }

  // ── Step 1: Plan selection ──────────────────────────────────────────────────
  if (!selectedPlanId) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 flex flex-col items-center justify-center p-6">
        <div className="w-full max-w-5xl">
          {/* Header */}
          <div className="text-center mb-10">
            <div className="w-14 h-14 bg-gradient-to-br from-blue-500 to-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <span className="text-white font-bold text-2xl">B</span>
            </div>
            <h1 className="text-3xl font-bold text-white mb-2">Choose your plan</h1>
            <p className="text-slate-400 text-base">
              Start your 14-day free trial — no credit card required.
            </p>
          </div>

          {/* Plan cards */}
          {plansLoading ? (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="bg-slate-800 rounded-2xl p-6 animate-pulse h-72" />
              ))}
            </div>
          ) : plansLoadError ? (
            <div className="max-w-md mx-auto bg-slate-800 border border-slate-700 rounded-2xl p-8 text-center">
              <h2 className="text-xl font-semibold text-white">Plans unavailable</h2>
              <p className="text-slate-400 text-sm mt-2">{plansLoadError}</p>
              <button
                onClick={() => setPlansReloadToken((value) => value + 1)}
                className="mt-5 px-5 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700"
              >
                Retry
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {plans.map((plan) => {
                const isRecommended = isRecommendedPlan(plan)
                const cardLines = getPlanCardLines(plan)
                const isFree = Number(plan.price_monthly || 0) === 0

                return (
                  <div
                    key={plan.id}
                    className={`relative rounded-2xl p-6 flex flex-col transition-all cursor-pointer hover:scale-[1.02] ${
                      isRecommended
                        ? 'bg-white ring-2 ring-blue-500 shadow-xl shadow-blue-500/20'
                        : 'bg-slate-800 border border-slate-700 hover:border-slate-500'
                    }`}
                  >
                    {isRecommended && (
                      <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                        <span className="bg-blue-500 text-white text-xs font-semibold px-3 py-1 rounded-full">
                          Most popular
                        </span>
                      </div>
                    )}

                    <div className="mb-4">
                      <h3 className={`text-lg font-bold ${isRecommended ? 'text-gray-900' : 'text-white'}`}>
                        {plan.name}
                      </h3>
                      <div className="mt-2 flex items-baseline gap-1">
                        {isFree ? (
                          <span className={`text-3xl font-bold ${isRecommended ? 'text-gray-900' : 'text-white'}`}>Free</span>
                        ) : (
                          <>
                            <span className={`text-3xl font-bold ${isRecommended ? 'text-gray-900' : 'text-white'}`}>
                              R{Number(plan.price_monthly).toLocaleString()}
                            </span>
                            <span className={`text-sm ${isRecommended ? 'text-gray-500' : 'text-slate-400'}`}>/mo</span>
                          </>
                        )}
                      </div>
                    </div>

                    <ul className="space-y-2.5 flex-1 mb-6">
                      {cardLines.map((line: string) => (
                        <li key={line} className="flex items-start gap-2">
                          <CheckIcon className={`w-4 h-4 mt-0.5 flex-shrink-0 ${isRecommended ? 'text-blue-500' : 'text-green-400'}`} />
                          <span className={`text-sm ${isRecommended ? 'text-gray-600' : 'text-slate-300'}`}>{line}</span>
                        </li>
                      ))}
                    </ul>

                    <button
                      onClick={() => handleSelectPlan(plan.id)}
                      className={`w-full py-2.5 rounded-xl text-sm font-semibold transition-colors ${
                        isRecommended
                          ? 'bg-blue-600 text-white hover:bg-blue-700'
                          : 'bg-slate-700 text-white hover:bg-slate-600'
                      }`}
                    >
                      {isFree ? 'Start free trial' : 'Continue with paid plan'}
                    </button>
                  </div>
                )
              })}
            </div>
          )}

          <div className="mt-8 text-center">
            <Link to="/auth/login" className="text-slate-400 hover:text-slate-200 text-sm transition-colors">
              ← Back to sign in
            </Link>
          </div>
        </div>
      </div>
    )
  }

  // ── Step 2: Registration form ───────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 flex items-center justify-center p-6">
      <div className="w-full max-w-lg">
        <div className="bg-white rounded-2xl shadow-xl p-8">
          {/* Header */}
          <div className="text-center mb-6">
            <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-3">
              <span className="text-white font-bold text-xl">B</span>
            </div>
            <h1 className="text-2xl font-bold text-gray-900">Register your firm</h1>
            {currentPlan && (
              <div className="mt-2 inline-flex items-center gap-1.5 bg-blue-50 text-blue-700 text-sm font-medium px-3 py-1 rounded-full border border-blue-100">
                <CheckIcon className="w-3.5 h-3.5" />
                {currentPlan.name} plan
                {` — ${formatPlanPrice(currentPlan.price_monthly)}`}
                {Number(currentPlan.price_monthly || 0) > 0 ? '/mo' : ''}
              </div>
            )}
            <p className="text-gray-500 text-sm mt-2">
              {isPaidPlan
                ? 'We create your organisation first, then continue to secure Paystack billing.'
                : '14-day free trial, no credit card required'}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Firm Name *</label>
                <input
                  type="text"
                  required
                  value={formData.firm_name}
                  onChange={(e) => handleChange('firm_name', e.target.value)}
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Acme Accounting"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Your Full Name *</label>
                <input
                  type="text"
                  required
                  value={formData.owner_name}
                  onChange={(e) => handleChange('owner_name', e.target.value)}
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Jane Doe"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Business Email *</label>
              <input
                type="email"
                required
                value={formData.email}
                onChange={(e) => handleChange('email', e.target.value)}
                className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="you@company.co.za"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Phone (optional)</label>
              <input
                type="tel"
                value={formData.phone}
                onChange={(e) => handleChange('phone', e.target.value)}
                className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="+27 11 123 4567"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <PasswordField
                label="Password *"
                required
                minLength={6}
                value={formData.password}
                onChange={(value) => handleChange('password', value)}
                className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <PasswordField
                label="Confirm Password *"
                required
                minLength={6}
                value={formData.confirmPassword}
                onChange={(value) => handleChange('confirmPassword', value)}
                className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full py-3 bg-blue-600 text-white rounded-xl font-semibold hover:bg-blue-700 disabled:bg-gray-400 transition-colors"
            >
              {submitting ? 'Creating account...' : isPaidPlan ? 'Create organisation →' : 'Create account →'}
            </button>
          </form>

          <div className="mt-5 flex items-center justify-between text-sm">
            <button
              onClick={() => navigate('/auth/register')}
              className="text-gray-500 hover:text-gray-700 transition-colors"
            >
              ← Change plan
            </button>
            <Link to="/auth/login" className="text-gray-500 hover:text-gray-700 transition-colors">
              Already have an account? Sign in
            </Link>
          </div>

          <p className="mt-4 text-xs text-gray-400 text-center">
            You become the owner &amp; admin automatically. Staff are invited by you.
          </p>
        </div>
      </div>
    </div>
  )
}
