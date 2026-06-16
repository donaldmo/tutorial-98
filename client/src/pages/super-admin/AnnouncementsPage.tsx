import { useState } from 'react'
import api from '@/services/api'
import { toast } from 'sonner'

export function AnnouncementsPage() {
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [segmentStatus, setSegmentStatus] = useState('')
  const [segmentPlan, setSegmentPlan] = useState('')
  const [sending, setSending] = useState(false)

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!subject.trim() || !body.trim()) {
      toast.error('Subject and body are required')
      return
    }

    setSending(true)
    try {
      const segment: Record<string, string> = {}
      if (segmentStatus) segment.status = segmentStatus
      if (segmentPlan) segment.plan = segmentPlan

      const response = await api.post('/saas/admin/announcements', {
        subject,
        body,
        segment: Object.keys(segment).length > 0 ? segment : undefined,
      })
      toast.success(`Announcement sent to ${response.data.recipients} recipients`)
      setSubject('')
      setBody('')
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Failed to send announcement')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="max-w-2xl">
      <form onSubmit={handleSend} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Subject</label>
          <input
            type="text"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-400"
            placeholder="Announcement subject"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Message Body</label>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={8}
            className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-400"
            placeholder="Write your announcement message here..."
            required
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Filter by Status</label>
            <select
              value={segmentStatus}
              onChange={(e) => setSegmentStatus(e.target.value)}
              className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-400"
            >
              <option value="">All Statuses</option>
              <option value="active">Active</option>
              <option value="pending">Pending</option>
              <option value="suspended">Suspended</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Filter by Plan</label>
            <select
              value={segmentPlan}
              onChange={(e) => setSegmentPlan(e.target.value)}
              className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-400"
            >
              <option value="">All Plans</option>
              <option value="free">Free</option>
              <option value="starter">Starter</option>
              <option value="professional">Professional</option>
              <option value="enterprise">Enterprise</option>
            </select>
          </div>
        </div>

        <button
          type="submit"
          disabled={sending}
          className="px-6 py-3 bg-purple-600 text-white rounded-xl hover:bg-purple-700 disabled:bg-gray-400 font-medium"
        >
          {sending ? 'Sending...' : 'Send Announcement'}
        </button>
      </form>
    </div>
  )
}
