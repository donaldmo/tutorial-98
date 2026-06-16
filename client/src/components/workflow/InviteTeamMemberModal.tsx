import { useState } from 'react'
import { toast } from 'sonner'
import api from '@/services/api'
import { Modal } from '@/components/workflow/shared'

type Props = {
  onClose: () => void
  onSuccess?: () => void
}

const ROLES = ['Admin', 'Partner', 'Director', 'Manager', 'Senior Accountant'] as const

export function InviteTeamMemberModal({ onClose, onSuccess }: Props) {
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<string>('Admin')
  const [sending, setSending] = useState(false)

  const handleSend = async () => {
    if (!email.trim()) return
    setSending(true)
    try {
      const response = await api.post('/settings/organisation/members/invite', { email: email.trim(), role })
      if (response.data?.email_queued) {
        toast.success(response.data?.message || `Invite queued for ${email.trim()}`)
      } else {
        toast(response.data?.message || `Invite created for ${email.trim()}, but email queue failed`)
      }
      onSuccess?.()
      onClose()
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Failed to send invite')
    } finally {
      setSending(false)
    }
  }

  return (
    <Modal isOpen onClose={onClose} title="Invite Team Member">
      <div className="space-y-4">
        <p className="text-sm text-gray-500">Send an email invite to add a team member. Their role determines their access level.</p>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Email address</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !sending && email.trim() && handleSend()}
            placeholder="team@example.com"
            className="w-full px-4 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value)}
            className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
          >
            {ROLES.map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
        </div>
        <div className="flex gap-3 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-xl hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={sending || !email.trim()}
            onClick={handleSend}
            className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:bg-gray-300"
          >
            {sending ? 'Sending…' : 'Send Invite'}
          </button>
        </div>
      </div>
    </Modal>
  )
}
