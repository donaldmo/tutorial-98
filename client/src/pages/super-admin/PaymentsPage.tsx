import { useEffect, useState } from 'react'
import api from '@/services/api'

interface Payment {
  _id: string
  organisation_id?: { _id: string; firm_name: string; email: string }
  amount: number
  currency: string
  status: string
  plan: string
  billing_cycle: string
  created_at: string
}

export function PaymentsPage() {
  const [payments, setPayments] = useState<Payment[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('')

  useEffect(() => {
    let mounted = true
    const fetchPayments = async () => {
      setLoading(true)
      try {
        const params = new URLSearchParams()
        if (statusFilter) params.set('status', statusFilter)
        const response = await api.get(`/saas/admin/payments?${params.toString()}`)
        if (mounted) setPayments(response.data)
      } catch {
        // handled by interceptor
      } finally {
        if (mounted) setLoading(false)
      }
    }
    fetchPayments()
    return () => { mounted = false }
  }, [statusFilter])

  const getStatusBadge = (status: string) => {
    const colors: Record<string, string> = {
      completed: 'bg-green-100 text-green-800',
      pending: 'bg-yellow-100 text-yellow-800',
      failed: 'bg-red-100 text-red-800',
      refunded: 'bg-purple-100 text-purple-800',
    }
    return `px-2 py-1 rounded-full text-xs font-medium ${colors[status] || 'bg-gray-100 text-gray-800'}`
  }

  if (loading) {
    return (
      <div className="p-12 text-center">
        <p className="text-gray-500">Loading payments...</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-4 py-2 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-400"
        >
          <option value="">All Statuses</option>
          <option value="completed">Completed</option>
          <option value="pending">Pending</option>
          <option value="failed">Failed</option>
          <option value="refunded">Refunded</option>
        </select>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Firm</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Amount</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Status</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Plan</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Billing Cycle</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {payments.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-gray-500">No payments found</td>
                </tr>
              ) : (
                payments.map((payment) => (
                  <tr key={payment._id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 text-sm text-gray-900">
                      {payment.organisation_id?.firm_name || 'Unknown'}
                    </td>
                    <td className="px-6 py-4 text-sm font-medium text-gray-900">
                      {payment.currency || 'ZAR'} {payment.amount.toLocaleString()}
                    </td>
                    <td className="px-6 py-4">
                      <span className={getStatusBadge(payment.status)}>{payment.status}</span>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500">{payment.plan || '-'}</td>
                    <td className="px-6 py-4 text-sm text-gray-500">{payment.billing_cycle || '-'}</td>
                    <td className="px-6 py-4 text-sm text-gray-500">
                      {new Date(payment.created_at).toLocaleDateString()}
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
