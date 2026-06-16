import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'

import { DestructiveConfirmModal } from '@/components/common/DestructiveConfirmModal'
import { Search } from 'lucide-react'
import { Icons, Modal, TableLoading } from '@/components/workflow/shared'
import api from '@/services/api'

export function ClientsPage({ onRefresh, hidePageHeader = false, settings: _settings, addTriggerKey }: any) {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const returnTo = searchParams.get('returnTo')
  const [clients, setClients] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingClient, setEditingClient] = useState<any>(null)
  const [pendingDeleteClient, setPendingDeleteClient] = useState<any>(null)
  const [confirmSubmitting, setConfirmSubmitting] = useState(false)
  const [formData, setFormData] = useState({ name: '', contact_person: '', email: '', phone: '', address: '', industry: '', notes: '' })
  const [clientsTotal, setClientsTotal] = useState(0)
  const [loadedClientsPage, setLoadedClientsPage] = useState(0)
  const [clientsHasMore, setClientsHasMore] = useState(true)
  const sentinelRef = useRef<HTMLDivElement>(null)
  const loadingRef = useRef(loading)
  loadingRef.current = loading
  const clientsPageRef = useRef(loadedClientsPage)
  clientsPageRef.current = loadedClientsPage
  const clientsHasMoreRef = useRef(clientsHasMore)
  clientsHasMoreRef.current = clientsHasMore
  const [searchQuery, setSearchQuery] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const filtersRef = useRef({ search: '' })

  const fetchClientsPage = useCallback(async (page: number, search?: string) => {
    try {
      setLoading(true)
      const params = new URLSearchParams({ page: page.toString(), limit: '6' })
      const searchVal = search ?? filtersRef.current.search
      if (searchVal) params.append('search', searchVal)
      const response = await api.get(`/clients?${params}`)
      const items = response.data.data || []
      const total = response.data.pagination?.total ?? 0
      const totalPages = response.data.pagination?.total_pages ?? 1

      if (page === 1) {
        setClients(items)
      } else {
        setClients(prev => {
          const existingIds = new Set(prev.map((c: any) => c.id))
          return [...prev, ...items.filter((c: any) => !existingIds.has(c.id))]
        })
      }
      setClientsTotal(total)
      setClientsHasMore(page < totalPages)
      setLoadedClientsPage(page)
    } catch {
      toast.error('Failed to load clients')
    } finally {
      setLoading(false)
    }
  }, [])

  const triggerFetch = useCallback(() => {
    filtersRef.current.search = debouncedSearch
    fetchClientsPage(1)
  }, [debouncedSearch, fetchClientsPage])

  useEffect(() => {
    triggerFetch()
  }, [triggerFetch])

  useEffect(() => {
    if (returnTo) {
      setEditingClient(null)
      setFormData({ name: '', contact_person: '', email: '', phone: '', address: '', industry: '', notes: '' })
      setIsModalOpen(true)
    }
  }, [returnTo])

  useEffect(() => {
    if (addTriggerKey && addTriggerKey > 0) {
      setEditingClient(null)
      setFormData({ name: '', contact_person: '', email: '', phone: '', address: '', industry: '', notes: '' })
      setIsModalOpen(true)
    }
  }, [addTriggerKey])

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchQuery), 300)
    return () => clearTimeout(timer)
  }, [searchQuery])

  useEffect(() => {
    if (!clientsHasMoreRef.current || loadingRef.current) return
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !loadingRef.current && clientsHasMoreRef.current) {
          fetchClientsPage(clientsPageRef.current + 1)
        }
      },
      { rootMargin: '200px' }
    )
    const el = sentinelRef.current
    if (el) observer.observe(el)
    return () => observer.disconnect()
  }, [loading, clientsHasMore, fetchClientsPage])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (isSubmitting) return
    setIsSubmitting(true)
    try {
      if (editingClient) {
        await api.put(`/clients/${editingClient.id}`, formData)
        toast.success('Client updated successfully')
        setIsModalOpen(false)
        setEditingClient(null)
        setFormData({ name: '', contact_person: '', email: '', phone: '', address: '', industry: '', notes: '' })
        fetchClientsPage(1)
        if (onRefresh) onRefresh()
      } else {
        const response = await api.post('/clients', formData)
        toast.success('Client created successfully')
        if (returnTo) {
          const newId = response.data.id || response.data._id
          navigate(`${returnTo}?clientId=${newId}`)
          return
        }
        setIsModalOpen(false)
        setFormData({ name: '', contact_person: '', email: '', phone: '', address: '', industry: '', notes: '' })
        fetchClientsPage(1)
        if (onRefresh) onRefresh()
      }
    } catch (error: any) {
      toast.error(error.response?.data?.detail || 'Failed to save client')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleDelete = async (clientId: string) => {
    try {
      await api.delete(`/clients/${clientId}`)
      toast.success('Client deactivated')
      fetchClientsPage(1)
    } catch (error: any) {
      toast.error(error.response?.data?.detail || 'Failed to deactivate client')
    }
  }

  const openEditModal = (client: any) => {
    setEditingClient(client)
    setFormData({
      name: client.name,
      contact_person: client.contact_person || '',
      email: client.email || '',
      phone: client.phone || '',
      address: client.address || '',
      industry: client.industry || '',
      notes: client.notes || '',
    })
    setIsModalOpen(true)
  }

  const openSingleJobForClient = async (client: any) => {
    try {
      const request = client.id
        ? api.get(`/jobs?client_id=${encodeURIComponent(String(client.id))}&limit=200`)
        : api.get(`/jobs?search=${encodeURIComponent(String(client.name || ''))}&limit=200`)

      const res = await request
      const jobs: any[] = Array.isArray(res.data) ? res.data : (res.data?.data || [])
      const scoped = jobs.filter((job) => {
        if (client.id && job.client_id) return String(job.client_id) === String(client.id)
        return String(job.client_name || '').trim().toLowerCase() === String(client.name || '').trim().toLowerCase()
      })

      if (!scoped.length) {
        toast.info(`No jobs found for ${client.name}. Create one from Jobs first.`)
        return
      }

      const now = new Date()
      const toStamp = (job: any) => new Date(job.createdAt || job.created_at || 0).getTime()
      const currentMonth = scoped.filter((job) => {
        const stamp = toStamp(job)
        if (!Number.isFinite(stamp) || stamp <= 0) return false
        const d = new Date(stamp)
        return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()
      })

      const sortDesc = (a: any, b: any) => toStamp(b) - toStamp(a)
      const target = (currentMonth.length ? [...currentMonth].sort(sortDesc) : [...scoped].sort(sortDesc))[0]
      if (!target?.id) {
        toast.error('Could not determine a job to open')
        return
      }
      navigate(`/app/jobs/${target.id}`)
    } catch {
      toast.error('Failed to open job for this client')
    }
  }

  return (
    <div className="space-y-6" data-testid="clients-page">
      <div>
        {!hidePageHeader && (
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Client Management</h2>
            <p className="text-gray-500 mt-1">Manage your client list for job creation</p>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search clients..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 text-center"><p className="text-3xl font-bold text-blue-600">{clients.filter((c) => c.is_active).length}</p><p className="text-sm text-gray-500">On This Page</p></div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 text-center"><p className="text-3xl font-bold text-gray-600">{clients.filter((c) => !c.is_active).length}</p><p className="text-sm text-gray-500">Inactive on Page</p></div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 text-center"><p className="text-3xl font-bold text-green-600">{[...new Set(clients.filter((c) => c.industry).map((c) => c.industry))].length}</p><p className="text-sm text-gray-500">Industries on Page</p></div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 text-center"><p className="text-3xl font-bold text-purple-600">{clients.length} / {clientsTotal}</p><p className="text-sm text-gray-500">Loaded / Total</p></div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100"><tr><th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase">Client Name</th><th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase">Contact Person</th><th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase">Email</th><th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase">Phone</th><th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase">Industry</th><th className="px-4 py-2.5 text-right text-xs font-semibold text-gray-500 uppercase">Actions</th></tr></thead>
            <tbody className="divide-y divide-gray-100">
              {loading && clients.length === 0 ? (
                <TableLoading colSpan={6} />
              ) : clients.filter((c) => c.is_active).length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-16 text-center">
                    <div className="w-16 h-16 text-gray-300 mx-auto mb-4 flex items-center justify-center"><Icons.Building /></div>
                    <h3 className="text-lg font-medium text-gray-900 mb-2">No Clients Yet</h3>
                    <p className="text-gray-500 mb-4">Add clients to select them when creating jobs</p>
                    <button onClick={() => setIsModalOpen(true)} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium">Add First Client</button>
                  </td>
                </tr>
              ) : (
                clients.filter((c) => c.is_active).map((client) => (
                  <tr key={client.id} className="hover:bg-gray-50">
                    <td className="px-4 py-2.5"><p className="font-medium text-gray-900">{client.name}</p></td>
                    <td className="px-4 py-2.5 text-gray-600">{client.contact_person || '-'}</td>
                    <td className="px-4 py-2.5 text-gray-600">{client.email || '-'}</td>
                    <td className="px-4 py-2.5 text-gray-600">{client.phone || '-'}</td>
                    <td className="px-4 py-2.5">{client.industry && <span className="px-2 py-1 text-xs font-medium bg-blue-50 text-blue-700 rounded-full">{client.industry}</span>}</td>
                    <td className="px-4 py-2.5"><div className="flex items-center justify-end gap-2"><button onClick={() => openSingleJobForClient(client)} className="p-2 text-gray-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg" title="Open Client Job"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg></button><button onClick={() => openEditModal(client)} className="p-2 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg" title="Edit"><Icons.Edit /></button><button onClick={() => setPendingDeleteClient(client)} className="p-2 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg" title="Deactivate"><Icons.Trash /></button></div></td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {clientsHasMore && clients.length > 0 && (
          <div ref={sentinelRef} className="flex justify-center py-4">
            {loading && (
              <div className="flex items-center gap-2 text-sm text-gray-500">
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Loading more...
              </div>
            )}
          </div>
        )}
      </div>

      <Modal isOpen={isModalOpen} onClose={() => { if (!isSubmitting) setIsModalOpen(false) }} title={editingClient ? 'Edit Client' : 'Add Client'}>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div><label className="block text-sm font-medium text-gray-700 mb-1">Client Name *</label><input type="text" required disabled={isSubmitting} value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} className="w-full px-4 py-2 border border-gray-200 rounded-xl disabled:bg-gray-100 disabled:text-gray-500" placeholder="ABC Corporation" /></div>
          <div className="grid grid-cols-2 gap-4"><div><label className="block text-sm font-medium text-gray-700 mb-1">Contact Person</label><input type="text" disabled={isSubmitting} value={formData.contact_person} onChange={(e) => setFormData({ ...formData, contact_person: e.target.value })} className="w-full px-4 py-2 border border-gray-200 rounded-xl disabled:bg-gray-100 disabled:text-gray-500" placeholder="John Smith" /></div><div><label className="block text-sm font-medium text-gray-700 mb-1">Industry *</label><input type="text" required disabled={isSubmitting} value={formData.industry} onChange={(e) => setFormData({ ...formData, industry: e.target.value })} className="w-full px-4 py-2 border border-gray-200 rounded-xl disabled:bg-gray-100 disabled:text-gray-500" placeholder="Manufacturing" /></div></div>
          <div className="grid grid-cols-2 gap-4"><div><label className="block text-sm font-medium text-gray-700 mb-1">Email (optional)</label><input type="email" disabled={isSubmitting} value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} className="w-full px-4 py-2 border border-gray-200 rounded-xl disabled:bg-gray-100 disabled:text-gray-500" placeholder="contact@abc.co.za" /></div><div><label className="block text-sm font-medium text-gray-700 mb-1">Phone</label><input type="tel" disabled={isSubmitting} value={formData.phone} onChange={(e) => setFormData({ ...formData, phone: e.target.value })} className="w-full px-4 py-2 border border-gray-200 rounded-xl disabled:bg-gray-100 disabled:text-gray-500" placeholder="+27 11 123 4567" /></div></div>
          <div><label className="block text-sm font-medium text-gray-700 mb-1">Address</label><input type="text" disabled={isSubmitting} value={formData.address} onChange={(e) => setFormData({ ...formData, address: e.target.value })} className="w-full px-4 py-2 border border-gray-200 rounded-xl disabled:bg-gray-100 disabled:text-gray-500" placeholder="123 Main Street, Johannesburg" /></div>
          <div><label className="block text-sm font-medium text-gray-700 mb-1">Notes</label><textarea disabled={isSubmitting} value={formData.notes} onChange={(e) => setFormData({ ...formData, notes: e.target.value })} className="w-full px-4 py-2 border border-gray-200 rounded-xl disabled:bg-gray-100 disabled:text-gray-500" rows={2} placeholder="Additional notes about this client..." /></div>
          <div className="flex gap-3 pt-4"><button type="button" disabled={isSubmitting} onClick={() => setIsModalOpen(false)} className="flex-1 px-4 py-2 border border-gray-200 text-gray-700 rounded-xl hover:bg-gray-50 disabled:opacity-60 disabled:cursor-not-allowed">Cancel</button><button type="submit" disabled={isSubmitting} className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:opacity-70 disabled:cursor-not-allowed">{isSubmitting ? (editingClient ? 'Updating...' : 'Adding...') : (editingClient ? 'Update' : 'Add')}</button></div>
        </form>
      </Modal>

      <DestructiveConfirmModal
        isOpen={!!pendingDeleteClient}
        onClose={() => !confirmSubmitting && setPendingDeleteClient(null)}
        onConfirm={async () => {
          if (!pendingDeleteClient?.id) return
          try {
            setConfirmSubmitting(true)
            await handleDelete(pendingDeleteClient.id)
            setPendingDeleteClient(null)
          } finally {
            setConfirmSubmitting(false)
          }
        }}
        title="Deactivate Client"
        description={`Deactivate ${pendingDeleteClient?.name || 'this client'}? They will be hidden but kept for historical records.`}
        confirmLabel="Deactivate"
        isSubmitting={confirmSubmitting}
        tone="warning"
      />

    </div>
  )
}
