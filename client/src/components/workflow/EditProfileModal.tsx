import { useState, useEffect } from 'react'
import { toast } from 'sonner'
import api from '@/services/api'
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar'
import { Modal } from '@/components/workflow/shared'
import type { WorkflowUser } from '@/types/workflow'

type Props = {
  user: any
  onClose: () => void
  onUserUpdate?: (user: any) => void
}

const VALID_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/svg+xml', 'image/webp']
const MAX_IMAGE_SIZE = 5 * 1024 * 1024

export function EditProfileModal({ user, onClose, onUserUpdate }: Props) {
  const [name, setName] = useState(user?.name || '')
  const [phone, setPhone] = useState(user?.phone || '')
  const [picPreview, setPicPreview] = useState(user?.profile_picture_url || null)
  const [uploadingPic, setUploadingPic] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!user) return
    setName(user.name || '')
    setPhone(user.phone || '')
    setPicPreview(user.profile_picture_url || null)
  }, [user])

  const handleUploadPic = async (file: File) => {
    if (!VALID_IMAGE_TYPES.includes(file.type)) { toast.error('Invalid file type'); return }
    if (file.size > MAX_IMAGE_SIZE) { toast.error('File size must be less than 5MB'); return }
    setUploadingPic(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const response = await api.post('/settings/upload-profile-picture', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      setPicPreview(response.data.profile_picture_url)
      if (onUserUpdate && response.data.user) onUserUpdate(response.data.user)
      toast.success('Profile picture updated')
    } catch (error: any) {
      toast.error(error.response?.data?.detail || 'Failed to upload profile picture')
    } finally {
      setUploadingPic(false)
    }
  }

  const handleRemovePic = async () => {
    try {
      await api.delete('/settings/profile-picture')
      setPicPreview(null)
      if (onUserUpdate && user) onUserUpdate({ ...user, profile_picture_url: null } as WorkflowUser)
      toast.success('Profile picture removed')
    } catch (error: any) {
      toast.error(error.response?.data?.detail || 'Failed to remove profile picture')
    }
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const response = await api.put('/auth/me', { name, phone })
      if (onUserUpdate) onUserUpdate(response.data)
      toast.success('Profile updated')
      onClose()
    } catch (error: any) {
      toast.error(error.response?.data?.detail || 'Failed to update profile')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal isOpen onClose={onClose} title="Edit Profile">
      <div className="space-y-6">
        <div className="flex items-start gap-6">
          <div className="flex flex-col items-center gap-3 shrink-0">
            <div className="relative">
              <Avatar className="h-24 w-24 border-2 border-gray-200">
                {picPreview ? (
                  <AvatarImage src={picPreview} alt={name || 'Profile'} />
                ) : null}
                <AvatarFallback className="text-2xl bg-blue-600 text-white">
                  {(name || user?.name || 'U').charAt(0).toUpperCase()}
                </AvatarFallback>
              </Avatar>
            </div>
            <label className="cursor-pointer">
              <input
                type="file"
                accept="image/*"
                className="hidden"
                disabled={uploadingPic}
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) handleUploadPic(file)
                }}
              />
              <span className="text-sm text-blue-600 hover:text-blue-700 font-medium cursor-pointer">
                {uploadingPic ? 'Uploading…' : picPreview ? 'Change Photo' : 'Upload Photo'}
              </span>
            </label>
            {picPreview && (
              <button
                type="button"
                onClick={handleRemovePic}
                className="text-sm text-red-500 hover:text-red-700 font-medium"
              >
                Remove
              </button>
            )}
          </div>
          <div className="flex-1 space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-4 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input
                type="email"
                value={user?.email || ''}
                disabled
                className="w-full px-4 py-2 border border-gray-200 rounded-xl text-sm bg-gray-50 text-gray-500 cursor-not-allowed"
              />
              <p className="text-xs text-gray-400 mt-1">Email cannot be changed</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
              <input
                type="text"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full px-4 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
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
            disabled={saving}
            onClick={handleSave}
            className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:bg-gray-300"
          >
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </div>
    </Modal>
  )
}
