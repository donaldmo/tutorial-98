import { useEffect, useState } from 'react'
import api from '@/services/api'

interface ActivityEntry {
  _id: string
  action: string
  firm_name: string | null
  performed_by: string
  metadata: Record<string, unknown>
  created_at: string
}

export function ActivityPage() {
  const [activities, setActivities] = useState<ActivityEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [actionFilter, setActionFilter] = useState('')

  useEffect(() => {
    let mounted = true
    const fetchActivity = async () => {
      setLoading(true)
      try {
        const params = new URLSearchParams()
        if (actionFilter) params.set('action', actionFilter)
        const response = await api.get(`/saas/admin/activity?${params.toString()}`)
        if (mounted) setActivities(response.data.data || response.data)
      } catch {
        // handled by interceptor
      } finally {
        if (mounted) setLoading(false)
      }
    }
    fetchActivity()
    return () => { mounted = false }
  }, [actionFilter])

  const getActionLabel = (action: string) => {
    const labels: Record<string, string> = {
      organisation_registered: 'Firm Registered',
      organisation_suspended: 'Firm Suspended',
      organisation_activated: 'Firm Activated',
      plan_changed: 'Plan Changed',
      payment_completed: 'Payment Completed',
      payment_refunded: 'Payment Refunded',
      announcement_sent: 'Announcement Sent',
    }
    return labels[action] || action
  }

  if (loading) {
    return (
      <div className="p-12 text-center">
        <p className="text-gray-500">Loading activity log...</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <select
          value={actionFilter}
          onChange={(e) => setActionFilter(e.target.value)}
          className="px-4 py-2 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-400"
        >
          <option value="">All Actions</option>
          <option value="organisation_registered">Firm Registered</option>
          <option value="organisation_suspended">Firm Suspended</option>
          <option value="organisation_activated">Firm Activated</option>
          <option value="plan_changed">Plan Changed</option>
          <option value="payment_completed">Payment Completed</option>
          <option value="payment_refunded">Payment Refunded</option>
          <option value="announcement_sent">Announcement Sent</option>
        </select>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Timestamp</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Action</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Firm</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Performed By</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {activities.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-6 py-12 text-center text-gray-500">No activity found</td>
                </tr>
              ) : (
                activities.map((entry) => (
                  <tr key={entry._id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 text-sm text-gray-500 whitespace-nowrap">
                      {new Date(entry.created_at).toLocaleString()}
                    </td>
                    <td className="px-6 py-4">
                      <span className="px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                        {getActionLabel(entry.action)}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900">{entry.firm_name || '-'}</td>
                    <td className="px-6 py-4 text-sm text-gray-500">{entry.performed_by}</td>
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
