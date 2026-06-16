import { useEffect, useState } from 'react'
import api from '@/services/api'
import StatCard from '@/components/common/StatCard'

interface DashboardData {
  organisations: {
    total: number
    active: number
    pending: number
    suspended: number
  }
  revenue: {
    total: number
    monthly: number
    currency: string
  }
}

export function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let mounted = true
    const fetchDashboard = async () => {
      try {
        const response = await api.get('/saas/admin/dashboard')
        if (mounted) setData(response.data)
      } catch (err: any) {
        if (mounted) setError(err.response?.data?.detail || 'Failed to load dashboard')
      } finally {
        if (mounted) setLoading(false)
      }
    }
    fetchDashboard()
    return () => { mounted = false }
  }, [])

  if (loading) {
    return (
      <div className="p-12 text-center">
        <p className="text-gray-500">Loading dashboard...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-12 text-center">
        <p className="text-red-500">{error}</p>
      </div>
    )
  }

  if (!data) return null

  const formatCurrency = (amount: number, currency: string) => {
    return `${currency}${amount.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Total Firms"
          value={data.organisations.total}
          color="blue"
          subtitle={undefined}
          icon={undefined}
          onClick={undefined}
        />
        <StatCard
          title="Active"
          value={data.organisations.active}
          color="green"
          subtitle={undefined}
          icon={undefined}
          onClick={undefined}
        />
        <StatCard
          title="Pending"
          value={data.organisations.pending}
          color="yellow"
          subtitle={undefined}
          icon={undefined}
          onClick={undefined}
        />
        <StatCard
          title="Suspended"
          value={data.organisations.suspended}
          color="red"
          subtitle={undefined}
          icon={undefined}
          onClick={undefined}
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <StatCard
          title="Monthly Revenue (MRR)"
          value={formatCurrency(data.revenue.monthly, data.revenue.currency)}
          color="purple"
          subtitle={undefined}
          icon={undefined}
          onClick={undefined}
        />
        <StatCard
          title="Total Revenue"
          value={formatCurrency(data.revenue.total, data.revenue.currency)}
          color="gray"
          subtitle={undefined}
          icon={undefined}
          onClick={undefined}
        />
      </div>
    </div>
  )
}
