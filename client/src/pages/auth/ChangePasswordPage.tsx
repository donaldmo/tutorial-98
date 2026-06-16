import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import api from '@/services/api'
import { PasswordField } from '@/components/auth/PasswordField'

interface Props {
  user: { name?: string; email?: string } | null
  onPasswordChanged: () => void
}

export function ChangePasswordPage({ user, onPasswordChanged }: Props) {
  const navigate = useNavigate()
  const [form, setForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' })
  const [saving, setSaving] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (form.newPassword !== form.confirmPassword) {
      toast.error('New passwords do not match')
      return
    }
    if (form.newPassword.length < 8) {
      toast.error('Password must be at least 8 characters')
      return
    }
    setSaving(true)
    try {
      await api.put('/staff/me/password', {
        current_password: form.currentPassword,
        new_password: form.newPassword,
      })
      toast.success('Password changed successfully')
      onPasswordChanged()
      const userType = localStorage.getItem('userType')
      navigate(userType === 'staff' ? '/staff/dashboard' : '/app/dashboard', { replace: true })
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Failed to change password')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-8 w-full max-w-md">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Set Your Password</h1>
          <p className="text-sm text-gray-500 mt-1">
            Welcome{user?.name ? `, ${user.name}` : ''}! For security, please set a new password before continuing.
          </p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <PasswordField
            label="Current Password"
            required
            value={form.currentPassword}
            onChange={(value) => setForm({ ...form, currentPassword: value })}
            className="w-full px-4 py-2 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
            autoComplete="current-password"
          />
          <PasswordField
            label="New Password"
            required
            value={form.newPassword}
            onChange={(value) => setForm({ ...form, newPassword: value })}
            className="w-full px-4 py-2 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
            autoComplete="new-password"
          />
          <PasswordField
            label="Confirm New Password"
            required
            value={form.confirmPassword}
            onChange={(value) => setForm({ ...form, confirmPassword: value })}
            className="w-full px-4 py-2 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
            autoComplete="new-password"
          />
          <button
            type="submit"
            disabled={saving}
            className="w-full py-2.5 bg-blue-600 text-white rounded-xl font-medium text-sm hover:bg-blue-700 disabled:bg-gray-400 transition-colors"
          >
            {saving ? 'Saving...' : 'Set New Password'}
          </button>
        </form>
      </div>
    </div>
  )
}
