import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'

import api from '@/services/api'
import { Icons, Modal } from '@/components/workflow/shared'
import { Pagination, PaginationContent, PaginationItem, PaginationLink, PaginationPrevious, PaginationNext } from '@/components/ui/pagination'

export function NotificationsPage({ user: _user, settings: _settings, hidePageHeader = false }: any) {
  const [notifications, setNotifications] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [unreadCount, setUnreadCount] = useState(0)
  const [selectedMonth, _setSelectedMonth] = useState('')
  const [filter, setFilter] = useState<'all' | 'unread' | 'read'>('all')
  const [selectedType, setSelectedType] = useState<string>('all')
  const [selectedNotification, setSelectedNotification] = useState<any | null>(null)
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false)
  const [currentPage, setCurrentPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)

  const broadcastUnreadCount = (count: number) => {
    window.dispatchEvent(new CustomEvent('notifications:refresh-unread', { detail: { unreadCount: Math.max(0, count) } }))
  }

    const fetchNotifications = useCallback(async () => {
      try {
        setLoading(true)
        const params: Record<string, string> = {};
        if (selectedMonth) {
          params.month = selectedMonth;
        }
        if (filter === 'unread') params.read_status = 'unread'
        if (filter === 'read') params.read_status = 'read'
        if (selectedType !== 'all') params.type = selectedType
        // Pagination parameters
        params.page = currentPage.toString()
        params.limit = '6' // Load 6 notifications per page

        const res = await api.get(`/notifications?${new URLSearchParams(params).toString()}`)
        setNotifications(res.data.data || [])
        // Set total pages from pagination metadata
        setTotalPages(res.data.pagination?.total_pages ?? 1)
        // unread count comes from dedicated endpoint; keep fetching separately
      } catch (error: any) {
        toast.error(error.response?.data?.detail || 'Failed to load notifications')
      } finally {
        setLoading(false)
      }
    }, [selectedMonth, filter, selectedType, currentPage])

  const fetchUnreadCount = useCallback(async () => {
    try {
      const res = await api.get('/notifications/unread-count')
      const nextCount = Number(res.data.unread_count || 0)
      setUnreadCount(nextCount)
      broadcastUnreadCount(nextCount)
    } catch {
      // Ignore errors
    }
  }, [])

  // Reset current page to 1 when filters change
  useEffect(() => {
    setCurrentPage(1)
  }, [selectedMonth, filter, selectedType])

  useEffect(() => {
    fetchNotifications()
    fetchUnreadCount()
  }, [fetchNotifications, fetchUnreadCount])

  const markAsRead = async (notificationId: string) => {
    const target = notifications.find((notification) => notification.id === notificationId)
    if (!target || target.is_read) return

    const optimisticUnread = Math.max(0, unreadCount - 1)
    setUnreadCount(optimisticUnread)
    broadcastUnreadCount(optimisticUnread)

    try {
      await api.put(`/notifications/${notificationId}/read`)
      setNotifications((prev) =>
        prev.map((n) =>
          n.id === notificationId ? { ...n, is_read: true, read_at: new Date().toISOString() } : n
        )
      )
      setSelectedNotification((prev: any) => (
        prev && prev.id === notificationId
          ? { ...prev, is_read: true, read_at: new Date().toISOString() }
          : prev
      ))
      fetchUnreadCount()
    } catch {
      fetchUnreadCount()
      toast.error('Failed to mark notification as read')
    }
  }

  const openNotificationDetails = (notification: any) => {
    setSelectedNotification(notification)
    setIsDetailModalOpen(true)
    if (!notification.is_read) {
      markAsRead(notification.id)
    }
  }

  const markAllAsRead = async () => {
    try {
      await api.put('/notifications/read-all')
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true, read_at: new Date().toISOString() })))
      setUnreadCount(0)
      broadcastUnreadCount(0)
      toast.success('All notifications marked as read')
    } catch {
      toast.error('Failed to mark all notifications as read')
    }
  }

  const deleteNotification = async (notificationId: string) => {
    try {
      const deletingNotification = notifications.find((notification) => notification.id === notificationId)
      await api.delete(`/notifications/${notificationId}`)
      setNotifications((prev) => prev.filter((n) => n.id !== notificationId))
      if (deletingNotification && !deletingNotification.is_read) {
        const nextCount = Math.max(0, unreadCount - 1)
        setUnreadCount(nextCount)
        broadcastUnreadCount(nextCount)
      }
      toast.success('Notification deleted')
    } catch {
      toast.error('Failed to delete notification')
    }
  }

  const getTypeColor = (type: string) => {
    const colors: Record<string, string> = {
      allocation_assigned: 'bg-blue-100 text-blue-800',
      allocation_accepted: 'bg-green-100 text-green-800',
      allocation_reassigned: 'bg-orange-100 text-orange-800',
      allocation_component_completed: 'bg-emerald-100 text-emerald-800',
      system_update: 'bg-gray-100 text-gray-800',
      deadline_approaching: 'bg-yellow-100 text-yellow-800',
      overdue_job: 'bg-red-100 text-red-800',
    }
    return colors[type] || 'bg-gray-100 text-gray-800'
  }

  const getTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      allocation_assigned: 'New Allocation',
      allocation_accepted: 'Allocation Accepted',
      allocation_reassigned: 'Allocation Reassigned',
      allocation_component_completed: 'Component Completed',
      system_update: 'System Update',
      deadline_approaching: 'Deadline Approaching',
      overdue_job: 'Overdue Job',
    }
    return labels[type] || type
  }

  const formatDateTime = (dateStr: string | null | undefined) => {
    if (!dateStr) return '—'
    const d = new Date(dateStr)
    return d.toLocaleString('en-ZA', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  return (
    <div className="space-y-6" data-testid="notifications-page">
      {!hidePageHeader && (
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <span className="text-purple-600"><Icons.Bell /></span>
              Notifications
              {unreadCount > 0 && (
                <span className="bg-red-600 text-white text-xs font-bold px-2 py-0.5 rounded-full">
                  {unreadCount}
                </span>
              )}
            </h2>
            <p className="text-gray-500 mt-1">Stay updated on job allocations and system events</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={markAllAsRead}
              disabled={unreadCount === 0}
              className="px-4 py-2 text-sm font-medium text-blue-700 bg-blue-50 rounded-xl hover:bg-blue-100 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Mark All Read
            </button>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Filter by Status</label>
            <div className="flex gap-1">
              {(['all', 'unread', 'read'] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${filter === f
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                >
                  {f.charAt(0).toUpperCase() + f.slice(1)}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Filter by Type</label>
            <select
              value={selectedType}
              onChange={(e) => setSelectedType(e.target.value)}
              className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm"
            >
              <option value="all">All Types</option>
              <option value="allocation_assigned">New Allocation</option>
              <option value="allocation_accepted">Allocation Accepted</option>
              <option value="allocation_reassigned">Allocation Reassigned</option>
              <option value="allocation_component_completed">Component Completed</option>
              <option value="system_update">System Update</option>
              <option value="deadline_approaching">Deadline Approaching</option>
              <option value="overdue_job">Overdue Job</option>
            </select>
          </div>
        </div>
      </div>

      {/* Notifications List */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
        </div>
      ) : notifications.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-12 text-center">
          <div className="mx-auto h-12 w-12 text-gray-300 flex items-center justify-center mb-4">
            <Icons.Bell />
          </div>
          <h3 className="text-lg font-medium text-gray-900">No Notifications</h3>
          <p className="text-gray-500 mt-2">You're all caught up!</p>
        </div>
      ) : (
        <>
          <div className="space-y-3">
            {notifications.map((notification) => (
              <div
                key={notification.id}
                className={`bg-white rounded-xl shadow-sm border p-4 transition-all ${notification.is_read ? 'border-gray-100 opacity-75' : 'border-blue-200 bg-blue-50/30'
                }`}
                onClick={() => {
                  openNotificationDetails(notification)
                }}
              >
                <div className="flex items-start gap-3">
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${getTypeColor(notification.type)}`}>
                    {notification.type === 'allocation_assigned' && <Icons.Briefcase />}
                    {notification.type === 'allocation_accepted' && <Icons.Check />}
                    {notification.type === 'allocation_reassigned' && <Icons.Swap />}
                    {notification.type === 'allocation_component_completed' && <Icons.Check />}
                    {notification.type === 'system_update' && <Icons.Settings />}
                    {notification.type === 'deadline_approaching' && <Icons.Clock />}
                    {notification.type === 'overdue_job' && <Icons.AlertCircle />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <h4 className="text-sm font-semibold text-gray-900 truncate">{notification.title}</h4>
                        <p className="text-sm text-gray-600 mt-1 line-clamp-2">{notification.message}</p>
                      </div>
                      <button
                        onClick={(event) => {
                          event.stopPropagation()
                          deleteNotification(notification.id)
                        }}
                        className="text-gray-400 hover:text-red-600 p-1"
                        title="Delete notification"
                      >
                        <Icons.Close />
                      </button>
                    </div>
                    <div className="flex items-center gap-3 mt-3 text-xs text-gray-500">
                      <span className="flex items-center gap-1">
                        <Icons.Calendar />
                        {formatDateTime(notification.created_at)}
                      </span>
                      {notification.is_read && (
                        <span className="flex items-center gap-1 text-green-600">
                          <Icons.Check /> Read
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex justify-center mt-4">
              <Pagination>
                <PaginationContent>
                  {/* Previous button */}
                  <PaginationPrevious
                    onClick={() => {
                      setCurrentPage(prev => Math.max(prev - 1, 1))
                    }}
                    disabled={currentPage === 1}
                  />
                  
                  {/* Page numbers */}
                  {/* We'll show a limited range of page numbers for brevity */}
                  {/* Calculate start and end page numbers to display */}
                  {/* Show first page, last page, and pages around current page */}
                  {/* We'll implement a simple version: show pages 1 to totalPages if totalPages <= 5, else show a window around current page */}
                  {/* For simplicity, we'll show all pages if totalPages <= 10, else show a window of 5 pages around current page */}
                  {/* But note: the requirement is just to have pagers, so we can show all pages if not too many. */}
                  {/* Let's assume totalPages won't be huge. We'll show all pages for simplicity. */}
                  {/* If we want to be more sophisticated, we can implement a paging separator. */}
                  {/* For now, we'll show all page numbers. */}
                  {Array.from({ length: totalPages }, (_, i) => i + 1).map(pageNumber => (
                    <PaginationItem key={pageNumber}>
                      <PaginationLink
                        isActive={pageNumber === currentPage}
                        onClick={() => setCurrentPage(pageNumber)}
                      >
                        {pageNumber}
                      </PaginationLink>
                    </PaginationItem>
                  ))}
                  
                  {/* Next button */}
                  <PaginationNext
                    onClick={() => {
                      setCurrentPage(prev => Math.min(prev + 1, totalPages))
                    }}
                    disabled={currentPage === totalPages}
                  />
                </PaginationContent>
              </Pagination>
            </div>
          )}
        </>
      )}

      <Modal
        isOpen={isDetailModalOpen}
        onClose={() => {
          setIsDetailModalOpen(false)
          setSelectedNotification(null)
        }}
        title="Notification Details"
        size="lg"
      >
        {selectedNotification && (
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-lg font-semibold text-gray-900">{selectedNotification.title}</h3>
              <span className={`px-2 py-1 text-xs font-semibold rounded-full ${getTypeColor(selectedNotification.type)}`}>
                {getTypeLabel(selectedNotification.type)}
              </span>
            </div>

            <div className="text-xs text-gray-500 flex items-center gap-3">
              <span className="flex items-center gap-1">
                <Icons.Calendar />
                {formatDateTime(selectedNotification.created_at)}
              </span>
              {selectedNotification.is_read ? (
                <span className="text-green-600 flex items-center gap-1">
                  <Icons.Check /> Read
                </span>
              ) : (
                <span className="text-blue-600">Unread</span>
              )}
            </div>

            <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
              <p className="text-sm text-gray-800 whitespace-pre-wrap">{selectedNotification.message}</p>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  setIsDetailModalOpen(false)
                  setSelectedNotification(null)
                }}
                className="px-4 py-2 text-sm border border-gray-200 rounded-xl text-gray-700 hover:bg-gray-50"
              >
                Close
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}