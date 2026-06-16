import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import api from '@/services/api'
import type { WorkflowUser } from '@/types/workflow'

interface StaffProfileEditorCardProps {
  user: WorkflowUser | null
  onUserUpdate?: (user: WorkflowUser) => void
  title?: string
  description?: string
}

const VALID_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/svg+xml', 'image/webp']
const MAX_IMAGE_SIZE = 5 * 1024 * 1024

export function StaffProfileEditorCard({
  user,
  onUserUpdate,
  title = 'My Profile',
  description = 'Keep your own contact details and profile picture up to date.',
}: StaffProfileEditorCardProps) {
  const [profileName, setProfileName] = useState(user?.name || '')
  const [profilePhone, setProfilePhone] = useState(user?.phone || '')
  const [profilePicPreview, setProfilePicPreview] = useState(user?.profile_picture_url || null)
  const [savingProfile, setSavingProfile] = useState(false)
  const [uploadingProfilePic, setUploadingProfilePic] = useState(false)

  useEffect(() => {
    setProfileName(user?.name || '')
    setProfilePhone(user?.phone || '')
    setProfilePicPreview(user?.profile_picture_url || null)
  }, [user])

  const initials = useMemo(() => {
    const name = String(profileName || user?.name || 'Staff').trim()
    return (
      name
        .split(' ')
        .filter(Boolean)
        .map((part) => part[0])
        .join('')
        .slice(0, 2)
        .toUpperCase() || 'ST'
    )
  }, [profileName, user?.name])

  const applyUserUpdate = (nextUser: Partial<WorkflowUser> | null | undefined) => {
    if (!onUserUpdate || !user) return
    onUserUpdate({ ...user, ...(nextUser || {}) })
  }

  const handleProfileSave = async () => {
    const nextName = String(profileName || '').trim()
    if (!nextName) {
      toast.error('Name is required')
      return
    }

    try {
      setSavingProfile(true)
      const response = await api.put('/auth/me', {
        name: nextName,
        phone: String(profilePhone || '').trim() || null,
      })
      applyUserUpdate(response.data)
      toast.success('Profile updated')
    } catch (error: any) {
      toast.error(error.response?.data?.detail || 'Failed to update profile')
    } finally {
      setSavingProfile(false)
    }
  }

  const handleProfilePictureUpload = async (file?: File | null) => {
    if (!file) return

    if (!VALID_IMAGE_TYPES.includes(file.type)) {
      toast.error('Invalid file type')
      return
    }

    if (file.size > MAX_IMAGE_SIZE) {
      toast.error('File size must be less than 5MB')
      return
    }

    try {
      setUploadingProfilePic(true)
      const formData = new FormData()
      formData.append('file', file)
      const response = await api.post('/settings/upload-profile-picture', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      const nextUrl = response.data?.profile_picture_url || null
      setProfilePicPreview(nextUrl)
      applyUserUpdate(response.data?.user || { profile_picture_url: nextUrl })
      toast.success('Profile picture updated')
    } catch (error: any) {
      toast.error(error.response?.data?.detail || 'Failed to upload profile picture')
    } finally {
      setUploadingProfilePic(false)
    }
  }

  const handleProfilePictureRemove = async () => {
    try {
      setUploadingProfilePic(true)
      await api.delete('/settings/profile-picture')
      setProfilePicPreview(null)
      applyUserUpdate({ profile_picture_url: undefined })
      toast.success('Profile picture removed')
    } catch (error: any) {
      toast.error(error.response?.data?.detail || 'Failed to remove profile picture')
    } finally {
      setUploadingProfilePic(false)
    }
  }

  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
      <div className="mb-5">
        <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
        <p className="mt-1 text-sm text-gray-500">{description}</p>
      </div>

      <div className="space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
          <div className="flex flex-col items-center gap-3">
            <Avatar className="h-24 w-24 border-2 border-gray-200">
              {profilePicPreview ? <AvatarImage src={profilePicPreview} alt={profileName || user?.name || 'Profile'} /> : null}
              <AvatarFallback className="bg-blue-600 text-2xl text-white">{initials}</AvatarFallback>
            </Avatar>
            <label className="cursor-pointer text-sm font-medium text-blue-600 hover:text-blue-700">
              <input
                type="file"
                accept="image/*"
                className="hidden"
                disabled={uploadingProfilePic}
                onChange={(event) => {
                  void handleProfilePictureUpload(event.target.files?.[0] || null)
                  event.target.value = ''
                }}
              />
              {uploadingProfilePic ? 'Uploading...' : profilePicPreview ? 'Change Photo' : 'Upload Photo'}
            </label>
            {profilePicPreview ? (
              <button
                type="button"
                onClick={() => void handleProfilePictureRemove()}
                disabled={uploadingProfilePic}
                className="text-sm font-medium text-red-500 hover:text-red-700 disabled:cursor-not-allowed disabled:text-gray-400"
              >
                Remove
              </button>
            ) : null}
          </div>

          <div className="grid flex-1 gap-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Name</label>
              <input
                type="text"
                value={profileName}
                onChange={(event) => setProfileName(event.target.value)}
                className="w-full rounded-xl border border-gray-200 px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Your full name"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Email</label>
              <input
                type="email"
                value={user?.email || ''}
                disabled
                className="w-full cursor-not-allowed rounded-xl border border-gray-200 bg-gray-50 px-4 py-2 text-sm text-gray-500"
              />
              <p className="mt-1 text-xs text-gray-400">Email cannot be changed here.</p>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Phone</label>
              <input
                type="text"
                value={profilePhone}
                onChange={(event) => setProfilePhone(event.target.value)}
                className="w-full rounded-xl border border-gray-200 px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Add your phone number"
              />
            </div>
          </div>
        </div>

        <div className="flex justify-end">
          <button
            type="button"
            disabled={savingProfile}
            onClick={() => void handleProfileSave()}
            className="rounded-xl bg-blue-600 px-5 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-300"
          >
            {savingProfile ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  )
}
