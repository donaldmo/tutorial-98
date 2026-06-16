import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import api from '@/services/api'
import { toast } from 'sonner'

interface FirmDetail {
  _id: string
  firm_name: string
  email: string
  plan: string
  status: string
  subdomain: string
  subscription_status: string
  trial_ends_at: string | null
  subscription_ends_at: string | null
  created_at: string
  stats: {
    admin_count: number
    staff_count: number
    payment_count: number
  }
  recent_payments: Array<{
    _id: string
    amount: number
    currency: string
    status: string
    plan: string
    billing_cycle: string
    created_at: string
  }>
  last_login: string | null
}

const VALID_PLANS = ['free', 'starter', 'professional', 'enterprise']

export function FirmDetailPage() {
  const { id } = useParams<{ id: string }>()
  const [firm, setFirm] = useState<FirmDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [changingStatus, setChangingStatus] = useState(false)
  const [changingPlan, setChangingPlan] = useState(false)

  useEffect(() => {
    if (!id) return
    let mounted = true
    const fetchFirm = async () => {
      try {
        const response = await api.get(`/saas/admin/organisations/${id}`)
        if (mounted) setFirm(response.data)
      } catch (err: any) {
        if (mounted) setError(err.response?.data?.detail || 'Failed to load firm')
      } finally {
        if (mounted) setLoading(false)
      }
    }
    fetchFirm()
    return () => { mounted = false }
  }, [id])

  const handleSuspend = async () => {
    if (!firm) return
    setChangingStatus(true)
    try {
      const response = await api.patch(`/saas/admin/organisations/${firm._id}/status`, { status: 'suspended' })
      setFirm(response.data)
      toast.success('Firm suspended')
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Failed to suspend firm')
    } finally {
      setChangingStatus(false)
    }
  }

  const handleActivate = async () => {
    if (!firm) return
    setChangingStatus(true)
    try {
      const response = await api.patch(`/saas/admin/organisations/${firm._id}/status`, { status: 'active' })
      setFirm(response.data)
      toast.success('Firm activated')
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Failed to activate firm')
    } finally {
      setChangingStatus(false)
    }
  }

  const handlePlanChange = async (newPlan: string) => {
    if (!firm || newPlan === firm.plan) return
    if (!window.confirm(`Change plan from "${firm.plan}" to "${newPlan}" for "${firm.firm_name}"?`)) return
    setChangingPlan(true)
    try {
      const response = await api.patch(`/saas/admin/organisations/${firm._id}/plan`, { plan: newPlan })
      setFirm(response.data)
      toast.success(`Plan changed to ${newPlan}`)
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Failed to change plan')
    } finally {
      setChangingPlan(false)
    }
  }

  if (loading) {
    return <div className="p-12 text-center"><p className="text-gray-500">Loading firm details...</p></div>
  }

  if (error) {
    return <div className="p-12 text-center"><p className="text-red-500">{error}</p></div>
  }

  if (!firm) return null

  const getStatusBadge = (status: string) => {
    const colors: Record<string, string> = {
      active: 'bg-green-100 text-green-800',
      pending: 'bg-yellow-100 text-yellow-800',
      suspended: 'bg-red-100 text-red-800',
      cancelled: 'bg-gray-100 text-gray-800',
    }
    return `px-2 py-1 rounded-full text-xs font-medium ${colors[status] || 'bg-gray-100 text-gray-800'}`
  }

  const getPaymentStatusBadge = (status: string) => {
    const colors: Record<string, string> = {
      completed: 'bg-green-100 text-green-800',
      pending: 'bg-yellow-100 text-yellow-800',
      failed: 'bg-red-100 text-red-800',
      refunded: 'bg-purple-100 text-purple-800',
    }
    return `px-2 py-1 rounded-full text-xs font-medium ${colors[status] || 'bg-gray-100 text-gray-800'}`
  }

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">{firm.firm_name}</h2>
            <p className="text-gray-500 mt-1">{firm.email} — {firm.subdomain}</p>
          </div>
          <div className="flex items-center gap-2">
            <span className={getStatusBadge(firm.status)}>{firm.status}</span>
            {firm.status === 'active' ? (
              <button
                onClick={handleSuspend}
                disabled={changingStatus}
                className="px-4 py-2 bg-red-600 text-white rounded-xl hover:bg-red-700 disabled:bg-gray-400 text-sm"
              >
                {changingStatus ? '...' : 'Suspend'}
              </button>
            ) : firm.status === 'suspended' ? (
              <button
                onClick={handleActivate}
                disabled={changingStatus}
                className="px-4 py-2 bg-green-600 text-white rounded-xl hover:bg-green-700 disabled:bg-gray-400 text-sm"
              >
                {changingStatus ? '...' : 'Activate'}
              </button>
            ) : null}
          </div>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-6">
          <div className="bg-gray-50 rounded-xl p-4">
            <p className="text-sm text-gray-500">Plan</p>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-lg font-bold text-gray-900 capitalize">{firm.plan}</span>
              <select
                value={firm.plan}
                onChange={(e) => handlePlanChange(e.target.value)}
                disabled={changingPlan}
                className="ml-2 px-2 py-1 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-purple-400"
              >
                {VALID_PLANS.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="bg-gray-50 rounded-xl p-4">
            <p className="text-sm text-gray-500">Subscription</p>
            <p className="text-lg font-bold text-gray-900 mt-1 capitalize">{firm.subscription_status}</p>
          </div>
          <div className="bg-gray-50 rounded-xl p-4">
            <p className="text-sm text-gray-500">Admins</p>
            <p className="text-lg font-bold text-gray-900 mt-1">{firm.stats.admin_count}</p>
          </div>
          <div className="bg-gray-50 rounded-xl p-4">
            <p className="text-sm text-gray-500">Staff</p>
            <p className="text-lg font-bold text-gray-900 mt-1">{firm.stats.staff_count}</p>
          </div>
        </div>

        {(firm.trial_ends_at || firm.subscription_ends_at) && (
          <div className="grid grid-cols-2 gap-4 mt-4">
            {firm.trial_ends_at && (
              <div className="bg-gray-50 rounded-xl p-4">
                <p className="text-sm text-gray-500">Trial Ends</p>
                <p className="font-medium text-gray-900 mt-1">
                  {new Date(firm.trial_ends_at).toLocaleDateString()}
                </p>
              </div>
            )}
            {firm.subscription_ends_at && (
              <div className="bg-gray-50 rounded-xl p-4">
                <p className="text-sm text-gray-500">Subscription Ends</p>
                <p className="font-medium text-gray-900 mt-1">
                  {new Date(firm.subscription_ends_at).toLocaleDateString()}
                </p>
              </div>
            )}
          </div>
        )}

        <div className="mt-4 bg-gray-50 rounded-xl p-4">
          <p className="text-sm text-gray-500">Last Login</p>
          <p className="font-medium text-gray-900 mt-1">
            {firm.last_login ? new Date(firm.last_login).toLocaleString() : 'Never'}
          </p>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Recent Payments</h3>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Amount</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Status</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Plan</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Cycle</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {firm.recent_payments.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-gray-500">No payments</td>
                </tr>
              ) : (
                firm.recent_payments.map((p) => (
                  <tr key={p._id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm font-medium text-gray-900">
                      {p.currency || 'ZAR'} {p.amount.toLocaleString()}
                    </td>
                    <td className="px-4 py-3">
                      <span className={getPaymentStatusBadge(p.status)}>{p.status}</span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500">{p.plan || '-'}</td>
                    <td className="px-4 py-3 text-sm text-gray-500">{p.billing_cycle || '-'}</td>
                    <td className="px-4 py-3 text-sm text-gray-500">
                      {new Date(p.created_at).toLocaleDateString()}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
