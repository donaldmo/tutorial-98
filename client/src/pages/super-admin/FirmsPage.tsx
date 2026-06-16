import { useEffect, useState } from 'react'
import api from '@/services/api'

interface Organisation {
  _id: string
  firm_name: string
  email: string
  plan: string
  status: string
  subdomain: string
  created_at: string
}

export function FirmsPage() {
  const [firms, setFirms] = useState<Organisation[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('')
  const [planFilter, setPlanFilter] = useState('')
  const [search, setSearch] = useState('')

  useEffect(() => {
    let mounted = true
    const fetchFirms = async () => {
      setLoading(true)
      try {
        const params = new URLSearchParams()
        if (statusFilter) params.set('status', statusFilter)
        if (planFilter) params.set('plan', planFilter)
        if (search) params.set('search', search)
        const response = await api.get(`/saas/admin/organisations?${params.toString()}`)
        if (mounted) setFirms(response.data)
      } catch {
        // handled by interceptor
      } finally {
        if (mounted) setLoading(false)
      }
    }
    fetchFirms()
    return () => { mounted = false }
  }, [statusFilter, planFilter, search])

  const getStatusBadge = (status: string) => {
    const colors: Record<string, string> = {
      active: 'bg-green-100 text-green-800',
      pending: 'bg-yellow-100 text-yellow-800',
      suspended: 'bg-red-100 text-red-800',
      cancelled: 'bg-gray-100 text-gray-800',
    }
    return `px-2 py-1 rounded-full text-xs font-medium ${colors[status] || 'bg-gray-100 text-gray-800'}`
  }

  const getPlanBadge = (plan: string) => {
    const colors: Record<string, string> = {
      free: 'bg-gray-100 text-gray-800',
      starter: 'bg-blue-100 text-blue-800',
      professional: 'bg-purple-100 text-purple-800',
      enterprise: 'bg-amber-100 text-amber-800',
    }
    return `px-2 py-1 rounded-full text-xs font-medium ${colors[plan] || 'bg-gray-100 text-gray-800'}`
  }

  const exportCSV = () => {
    const params = new URLSearchParams()
    if (statusFilter) params.set('status', statusFilter)
    if (planFilter) params.set('plan', planFilter)
    if (search) params.set('search', search)
    window.open(`/api/saas/admin/organisations/export?${params.toString()}`, '_blank')
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="text"
          placeholder="Search firms..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="px-4 py-2 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-400 w-64"
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-4 py-2 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-400"
        >
          <option value="">All Statuses</option>
          <option value="active">Active</option>
          <option value="pending">Pending</option>
          <option value="suspended">Suspended</option>
          <option value="cancelled">Cancelled</option>
        </select>
        <select
          value={planFilter}
          onChange={(e) => setPlanFilter(e.target.value)}
          className="px-4 py-2 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-400"
        >
          <option value="">All Plans</option>
          <option value="free">Free</option>
          <option value="starter">Starter</option>
          <option value="professional">Professional</option>
          <option value="enterprise">Enterprise</option>
        </select>
        <button
          onClick={exportCSV}
          className="px-4 py-2 bg-purple-600 text-white rounded-xl hover:bg-purple-700 text-sm font-medium"
        >
          Export CSV
        </button>
      </div>

      {loading ? (
        <div className="p-12 text-center">
          <p className="text-gray-500">Loading firms...</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Firm Name</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Email</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Plan</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Registered</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {firms.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-12 text-center text-gray-500">
                      No firms found
                    </td>
                  </tr>
                ) : (
                  firms.map((firm) => (
                    <tr key={firm._id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 text-sm font-medium text-gray-900">{firm.firm_name}</td>
                      <td className="px-6 py-4 text-sm text-gray-500">{firm.email}</td>
                      <td className="px-6 py-4">
                        <span className={getPlanBadge(firm.plan)}>{firm.plan}</span>
                      </td>
                      <td className="px-6 py-4">
                        <span className={getStatusBadge(firm.status)}>{firm.status}</span>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-500">
                        {new Date(firm.created_at).toLocaleDateString()}
                      </td>
                      <td className="px-6 py-4">
                        <a
                          href={`/super-admin/firms/${firm._id}`}
                          className="text-purple-600 hover:text-purple-800 text-sm font-medium"
                        >
                          View
                        </a>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
