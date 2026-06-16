import { useMemo, useState } from 'react'

import { StaffProfileEditorCard } from '@/components/staff/StaffProfileEditorCard'
import type { WorkflowUser } from '@/types/workflow'

interface StaffSettingsPageProps {
  user: WorkflowUser | null
  onUserUpdate?: (user: WorkflowUser) => void
}

type StaffSettingsTab = 'profile'

export function StaffSettingsPage({ user, onUserUpdate }: StaffSettingsPageProps) {
  const [activeTab, setActiveTab] = useState<StaffSettingsTab>('profile')

  const tabs = useMemo(() => ([
    { id: 'profile' as const, label: 'Profile', description: 'Update your own contact details and profile photo.' },
  ]), [])

  return (
    <div className="space-y-6" data-testid="staff-settings-page">
      <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
        <p className="mt-2 text-sm text-gray-500">
          Manage only your own staff account settings from here.
        </p>
      </div>

      <div className="rounded-2xl border border-gray-100 bg-white shadow-sm">
        <div className="border-b border-gray-100 px-6 py-4">
          <div className="flex gap-2 rounded-xl bg-gray-100 p-1 w-fit">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                  activeTab === tab.id
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <p className="mt-3 text-sm text-gray-500">
            {tabs.find((tab) => tab.id === activeTab)?.description}
          </p>
        </div>

        <div className="p-6">
          {activeTab === 'profile' ? (
            <StaffProfileEditorCard
              user={user}
              onUserUpdate={onUserUpdate}
              title="My Profile"
              description="Update your own name, phone number, and profile picture from the staff settings page."
            />
          ) : null}
        </div>
      </div>
    </div>
  )
}
