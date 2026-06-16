import { useState, useEffect, useCallback } from 'react'
import axios from 'axios'
import { toast } from 'sonner'

import { API } from '@/lib/workflowApi'
import { Icons, Modal } from '@/components/workflow/shared'
import { InviteTeamMemberModal } from '@/components/workflow/InviteTeamMemberModal'
import { EditProfileModal } from '@/components/workflow/EditProfileModal'

export function UserManagementPage({ staff, onRefresh, user, settings, hidePageHeader = false }: any) {
  const [activeTab, setActiveTab] = useState<'users' | 'organisation'>('users')
  const [selectedStaff, setSelectedStaff] = useState<any>(null)
  const [permissionModal, setPermissionModal] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [filterRole, setFilterRole] = useState('all')
  const [filterAccess, setFilterAccess] = useState('all')
  const primaryColor = settings?.primary_color || '#3B82F6'

  // ── Organisation tab state ───────────────────────────────────────────────────
  const [orgSettings, setOrgSettings] = useState<any>(null)
  const [orgSub, setOrgSub] = useState<any>(null)
  const [orgMembers, setOrgMembers] = useState<any[]>([])
  const [orgInvites, setOrgInvites] = useState<any[]>([])
  const [orgLoading, setOrgLoading] = useState(false)
  const [inviteModalOpen, setInviteModalOpen] = useState(false)
  const [editProfileOpen, setEditProfileOpen] = useState(false)

  const isOrgAdmin = user?.access_level === 'Full' || user?.access_level === 'Admin'

  const refreshOrgData = useCallback(async () => {
    if (!isOrgAdmin) return
    setOrgLoading(true)
    try {
      const [settingsRes, subRes, membersRes, invitesRes] = await Promise.all([
        axios.get(`${API}/settings`),
        axios.get(`${API}/settings/subscription`),
        axios.get(`${API}/authorization-requests/org/members`),
        axios.get(`${API}/authorization-requests/org/invites`),
      ])
      setOrgSettings(settingsRes.data)
      setOrgSub(subRes.data)
      setOrgMembers(membersRes.data || [])
      setOrgInvites(invitesRes.data || [])
    } catch {
      toast.error('Failed to load organisation data')
    } finally {
      setOrgLoading(false)
    }
  }, [isOrgAdmin])

  useEffect(() => {
    if (activeTab === 'organisation' || activeTab === 'users') refreshOrgData()
  }, [activeTab, refreshOrgData])

  const handleRevokeInvite = async (inviteId: string) => {
    try {
      await axios.post(`${API}/authorization-requests/org/invites/${inviteId}/revoke`)
      toast.success('Invite revoked')
      refreshOrgData()
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Failed to revoke invite')
    }
  }
  // ─────────────────────────────────────────────────────────────────────────────

  const filteredMembers = (orgMembers || []).filter((m: any) => {
    const name = m.staff?.name || m.name || ''
    const matchesSearch = name.toLowerCase().includes(searchTerm.toLowerCase())
      || (m.email || '').toLowerCase().includes(searchTerm.toLowerCase())
    const matchesRole = filterRole === 'all' || m.role_title === filterRole
    const matchesAccess = filterAccess === 'all' || m.role === filterAccess
    return matchesSearch && matchesRole && matchesAccess
  })

  const accessLevels = ['Admin', 'Supervisor']
  const roles = [...new Set((orgMembers || []).map((m: any) => m.role_title).filter(Boolean))]

  const getAccessLevelDescription = (level: string) => {
    const descriptions: Record<string, string> = {
      Admin: 'Complete system access, can manage all permissions, users, settings, jobs, and delete records',
      Supervisor: 'Can approve timesheets, view reports, team dashboards — but cannot manage users, settings, or delete records',
    }
    return descriptions[level] || ''
  }

  const accessLevelBadgeColors: Record<string, string> = {
    admin: 'bg-blue-100 text-blue-700 border-blue-200',
    supervisor: 'bg-purple-100 text-purple-700 border-purple-200',
  }

  const getAccessLevelBadge = (level: string) => {
    return accessLevelBadgeColors[level.toLowerCase()] || 'bg-gray-100 text-gray-700 border-gray-200'
  }

  const handleUpdatePermissions = async (staffId: string, accessLevel: string, canDelete: boolean) => {
    try {
      await axios.post(`${API}/staff/${staffId}/update-permissions?access_level=${accessLevel}&can_delete=${canDelete}&updater_id=${user?.id || ''}`)
      toast.success('Permissions updated successfully')
      setPermissionModal(false)
      setSelectedStaff(null)
      if (onRefresh) onRefresh()
    } catch (error: any) {
      toast.error(error.response?.data?.detail || 'Failed to update permissions')
    }
  }

  return (
    <div className="space-y-6" data-testid="user-management-page">
      {!hidePageHeader && (
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <span className="text-purple-600"><Icons.Shield /></span>
              User Management
            </h2>
            <p className="text-gray-500 mt-1">Manage user roles, permissions, and access levels</p>
          </div>
        </div>
      )}

      {/* Tab bar — only shown for org admins */}
      {isOrgAdmin && (
        <div className="flex gap-1 bg-gray-100 rounded-xl p-1 w-fit">
          {(['users', 'organisation'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-5 py-2 rounded-lg text-sm font-medium transition-all capitalize ${
                activeTab === tab
                  ? 'bg-white shadow-sm text-gray-900'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
              style={activeTab === tab ? { color: primaryColor } : undefined}
            >
              {tab === 'users' ? (
                <span className="flex items-center gap-2"><Icons.Users />{tab}</span>
              ) : (
                <span className="flex items-center gap-2"><Icons.Building />{tab}</span>
              )}
            </button>
          ))}
        </div>
      )}

      {/* ── Organisation Tab ───────────────────────────────────────────────── */}
      {activeTab === 'organisation' && isOrgAdmin && (
        <OrgTab
          orgSettings={orgSettings}
          orgSub={orgSub}
          orgMembers={orgMembers}
          orgInvites={orgInvites}
          orgLoading={orgLoading}
          onRevokeInvite={handleRevokeInvite}
          primaryColor={primaryColor}
          onInvite={() => setInviteModalOpen(true)}
        />
      )}

      {/* ── Users Tab ─────────────────────────────────────────────────────── */}
      {activeTab === 'users' && (<>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
        <h3 className="text-sm font-semibold text-gray-700 mb-3">Access Level Guide</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          {accessLevels.map((level) => (
            <div key={level} className={`p-3 rounded-lg border ${getAccessLevelBadge(level)}`}>
              <p className="font-medium text-sm">{level}</p>
              <p className="text-xs mt-1 opacity-80">{getAccessLevelDescription(level).split(' - ')[1]}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Search</label>
            <input
              type="text"
              placeholder="Search by name or email..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full px-4 py-2 border border-gray-200 rounded-xl text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
            <select value={filterRole} onChange={(e) => setFilterRole(e.target.value)} className="w-full px-4 py-2 border border-gray-200 rounded-xl text-sm">
              <option value="all">All Roles</option>
              {roles.map((role: any) => <option key={role} value={role}>{role}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Access Level</label>
            <select value={filterAccess} onChange={(e) => setFilterAccess(e.target.value)} className="w-full px-4 py-2 border border-gray-200 rounded-xl text-sm">
              <option value="all">All Access Levels</option>
              {accessLevels.map((level) => <option key={level} value={level}>{level}</option>)}
            </select>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredMembers.map((m: any) => {
          const name = m.staff?.name || m.name || '—'
          const initials = name !== '—' ? name.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase() : '?'
          const accessLevel = m.role === 'owner' ? 'Admin' : m.role === 'supervisor' ? 'Supervisor' : 'Admin'
          const canDelete = m.role_title === 'Admin' || m.role_title === 'Partner' || m.role_title === 'Director' || m.role_title === 'Manager'
          const isCurrentUser = user?._id && m.id === String(user._id)
          return (
          <div key={m.id} className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 hover:shadow-md transition-shadow">
            <div className="flex items-center gap-3 mb-3">
              {m.profile_picture_url ? (
                <img src={m.profile_picture_url} alt={name} className="h-10 w-10 rounded-full object-cover border border-gray-200" />
              ) : (
                <div className="h-10 w-10 rounded-full bg-blue-600 flex items-center justify-center text-white text-sm font-semibold shrink-0">
                  {initials}
                </div>
              )}
              <div className="min-w-0">
                <h3 className="font-semibold text-gray-900 text-sm truncate">{name}</h3>
                <p className="text-xs text-gray-500 truncate">{m.email}</p>
              </div>
            </div>

            <table className="w-full text-sm mb-4">
              <tbody>
                <tr className="border-b border-gray-50">
                  <td className="py-1.5 text-xs text-gray-500">Role</td>
                  <td className="py-1.5 text-xs font-medium text-gray-700 text-right">{m.role_title || m.role}</td>
                </tr>
                <tr className="border-b border-gray-50">
                  <td className="py-1.5 text-xs text-gray-500">Phone</td>
                  <td className="py-1.5 text-xs text-gray-700 text-right">{m.phone || '—'}</td>
                </tr>
                <tr className="border-b border-gray-50">
                  <td className="py-1.5 text-xs text-gray-500">Access Level</td>
                  <td className="py-1.5 text-right">
                    <span className={`inline-block px-2 py-0.5 text-xs font-medium rounded-full ${getAccessLevelBadge(m.role)}`}>
                      {accessLevel}
                    </span>
                  </td>
                </tr>
                <tr>
                  <td className="py-1.5 text-xs text-gray-500">Can Delete</td>
                  <td className={`py-1.5 text-xs font-medium text-right ${canDelete ? 'text-green-600' : 'text-red-600'}`}>
                    {canDelete ? 'Yes' : 'No'}
                  </td>
                </tr>
              </tbody>
            </table>

            {m.role !== 'owner' && (
              <button
                onClick={() => { setSelectedStaff(m); setPermissionModal(true) }}
                className="w-full px-4 py-2 text-sm font-medium rounded-xl border border-purple-200 text-purple-700 hover:bg-purple-50 transition-colors flex items-center justify-center gap-2"
              >
                <Icons.Edit />
                Edit Permissions
              </button>
            )}
            {isCurrentUser && (
              <button
                onClick={() => setEditProfileOpen(true)}
                className="w-full px-4 py-2 text-sm font-medium rounded-xl border border-gray-200 text-gray-700 hover:bg-gray-50 transition-colors flex items-center justify-center gap-2"
              >
                Edit Profile
              </button>
            )}
          </div>
          )
        })}
      </div>

      {filteredMembers.length === 0 && (
        <div className="text-center py-12 bg-white rounded-xl border border-gray-100">
          <div className="w-12 h-12 text-gray-300 mx-auto mb-3 flex items-center justify-center"><Icons.Users /></div>
          <p className="text-gray-500">No team members match your filters</p>
        </div>
      )}
      </>)}

      <Modal isOpen={permissionModal && selectedStaff} onClose={() => { setPermissionModal(false); setSelectedStaff(null) }} title="Edit User Permissions">
        {selectedStaff && (
          <PermissionEditForm
            staff={selectedStaff}
            onSave={handleUpdatePermissions}
            onCancel={() => { setPermissionModal(false); setSelectedStaff(null) }}
            accessLevels={accessLevels}
            getAccessLevelDescription={getAccessLevelDescription}
          />
        )}
      </Modal>

      {inviteModalOpen && (
        <InviteTeamMemberModal
          onClose={() => setInviteModalOpen(false)}
          onSuccess={refreshOrgData}
        />
      )}

      {editProfileOpen && (
        <EditProfileModal
          user={user}
          onClose={() => setEditProfileOpen(false)}
        />
      )}
    </div>
  )
}

function PermissionEditForm({ staff, onSave, onCancel, accessLevels, getAccessLevelDescription }: any) {
  const isAdminUser = 'role_title' in staff
  const [accessLevel, setAccessLevel] = useState(
    staff.role === 'admin' || staff.role === 'owner' ? 'Admin'
    : staff.role === 'supervisor' ? 'Supervisor'
    : staff.access_level || 'Standard'
  )
  const [canDelete, setCanDelete] = useState(staff.can_delete !== false && staff.role !== 'supervisor')
  const canDeleteByDefault = staff.role === 'admin' || staff.role === 'owner'

  if (isAdminUser) {
    return (
      <div className="space-y-4">
        <div className="bg-gray-50 rounded-xl p-4">
          <p className="font-medium text-gray-900">{staff.staff?.name || staff.name || '—'}</p>
          <p className="text-sm text-gray-500">{staff.role_title || staff.role} • {staff.email}</p>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between p-3 bg-white border border-gray-200 rounded-xl">
            <div>
              <p className="font-medium text-gray-900">Access Level</p>
              <p className="text-xs text-gray-500">{staff.role === 'owner' ? 'Admin' : staff.role === 'supervisor' ? 'Supervisor' : 'Admin'}</p>
            </div>
            <span className={`px-3 py-1 text-xs font-medium rounded-full border ${staff.role === 'supervisor' ? 'bg-purple-100 text-purple-700 border-purple-200' : 'bg-blue-100 text-blue-700 border-blue-200'}`}>
              {staff.role === 'owner' ? 'Admin' : staff.role === 'supervisor' ? 'Supervisor' : 'Admin'}
            </span>
          </div>
          <div className="flex items-center justify-between p-3 bg-white border border-gray-200 rounded-xl">
            <div>
              <p className="font-medium text-gray-900">Can Delete Records</p>
              <p className="text-xs text-gray-500">
                {canDeleteByDefault ? 'Admin users can delete records by default' : 'Supervisors cannot delete records by design'}
              </p>
            </div>
            <span className={`text-sm font-medium ${canDeleteByDefault ? 'text-green-600' : 'text-red-600'}`}>
              {canDeleteByDefault ? 'Yes' : 'No'}
            </span>
          </div>
        </div>

        <p className="text-xs text-gray-400 text-center pt-2">Permissions are managed through the Organisation tab.</p>

        <div className="flex gap-3 pt-2">
          <button onClick={onCancel} className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-xl hover:bg-gray-50">
            Close
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="bg-gray-50 rounded-xl p-4">
        <p className="font-medium text-gray-900">{staff.name}</p>
        <p className="text-sm text-gray-500">{staff.role} • {staff.email}</p>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Access Level</label>
        <div className="space-y-2">
          {accessLevels.map((level: string) => (
            <label key={level} className={`flex items-start gap-3 p-3 bg-white border rounded-xl cursor-pointer hover:bg-gray-50 transition-colors ${accessLevel === level ? 'border-purple-500 ring-1 ring-purple-500' : 'border-gray-200'}`}>
              <input
                type="radio"
                name="access_level"
                value={level}
                checked={accessLevel === level}
                onChange={(e) => setAccessLevel(e.target.value)}
                className="mt-0.5 text-purple-600"
              />
              <div className="flex-1">
                <p className="font-medium text-gray-900">{level}</p>
                <p className="text-xs text-gray-500">{getAccessLevelDescription(level)}</p>
              </div>
            </label>
          ))}
        </div>
      </div>

      <div>
        <label className="flex items-center gap-3 p-3 bg-white border border-gray-200 rounded-xl cursor-pointer hover:bg-gray-50">
          <input
            type="checkbox"
            checked={canDelete}
            onChange={(e) => setCanDelete(e.target.checked)}
            className="text-purple-600 rounded"
            disabled={accessLevel === 'Admin'}
          />
          <div>
            <p className="font-medium text-gray-900">Can Delete Records</p>
            <p className="text-xs text-gray-500">Allow this user to permanently delete staff, jobs, and allocations</p>
          </div>
        </label>
        {accessLevel === 'Admin' && (
          <p className="text-xs text-amber-600 mt-1 ml-2">Admin access level cannot delete records by design</p>
        )}
      </div>

      <div className="flex gap-3 pt-4">
        <button onClick={onCancel} className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-xl hover:bg-gray-50">
          Cancel
        </button>
        <button
          onClick={() => onSave(staff.id, accessLevel, accessLevel === 'Admin' ? false : canDelete)}
          className="flex-1 px-4 py-2 bg-purple-600 text-white rounded-xl hover:bg-purple-700"
        >
          Save Permissions
        </button>
      </div>
    </div>
  )
}

// ── Organisation Tab ───────────────────────────────────────────────────────────

const PLAN_BADGE: Record<string, string> = {
  free:         'bg-gray-100 text-gray-700 border-gray-200',
  starter:      'bg-blue-100 text-blue-700 border-blue-200',
  professional: 'bg-purple-100 text-purple-700 border-purple-200',
  enterprise:   'bg-yellow-100 text-yellow-800 border-yellow-200',
}

const STATUS_BADGE: Record<string, string> = {
  active:    'bg-green-100 text-green-700',
  pending:   'bg-yellow-100 text-yellow-700',
  suspended: 'bg-red-100 text-red-700',
  cancelled: 'bg-gray-100 text-gray-500',
  trial:     'bg-blue-100 text-blue-700',
  past_due:  'bg-orange-100 text-orange-700',
  expired:   'bg-red-100 text-red-600',
}

const ROLE_BADGE: Record<string, string> = {
  owner:  'bg-yellow-100 text-yellow-800 border-yellow-200',
  admin:  'bg-blue-100 text-blue-700 border-blue-200',
  member: 'bg-gray-100 text-gray-600 border-gray-200',
}

const INVITE_STATUS_BADGE: Record<string, string> = {
  active:  'bg-green-100 text-green-700',
  revoked: 'bg-gray-100 text-gray-500',
  used:    'bg-blue-100 text-blue-600',
  expired: 'bg-red-100 text-red-600',
}

function fmt(dateStr: string | null | undefined) {
  if (!dateStr) return '—'
  return new Date(dateStr).toLocaleDateString('en-ZA', { year: 'numeric', month: 'short', day: 'numeric' })
}

function OrgTab({ orgSettings, orgSub, orgMembers, orgInvites, orgLoading, onRevokeInvite, primaryColor, onInvite }: any) {
  if (orgLoading && !orgSettings) {
    return (
      <div className="flex items-center justify-center py-16 text-gray-400 gap-2">
        <Icons.Restore />
        <span className="text-sm">Loading organisation data…</span>
      </div>
    )
  }

  const plan = orgSub?.plan || 'free'
  const status = orgSub?.status || '—'
  const subStatus = orgSub?.subscription_status || '—'

  return (
    <div className="space-y-6">

      {/* ── Overview card ─────────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
        <div className="flex items-center gap-3 mb-4">
          <span className="text-gray-400"><Icons.Building /></span>
          <h3 className="text-base font-semibold text-gray-900">Organisation Overview</h3>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div>
            <p className="text-xs text-gray-500 mb-1">Firm Name</p>
            <p className="font-semibold text-gray-800 text-sm">{orgSettings?.firm_name || '—'}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500 mb-1">Plan</p>
            <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold border capitalize ${PLAN_BADGE[plan] || PLAN_BADGE.free}`}>
              {plan}
            </span>
          </div>
          <div>
            <p className="text-xs text-gray-500 mb-1">Status</p>
            <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium capitalize ${STATUS_BADGE[status] || 'bg-gray-100 text-gray-600'}`}>
              {status}
            </span>
          </div>
          <div>
            <p className="text-xs text-gray-500 mb-1">Subscription</p>
            <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium capitalize ${STATUS_BADGE[subStatus] || 'bg-gray-100 text-gray-600'}`}>
              {subStatus}
            </span>
          </div>
        </div>
        {orgSub?.trial_ends_at && (
          <p className="mt-3 text-xs text-amber-600 bg-amber-50 px-3 py-1.5 rounded-lg inline-block">
            Trial ends: {fmt(orgSub.trial_ends_at)}
          </p>
        )}
      </div>

      {/* ── Team Members ──────────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
        <h3 className="text-base font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <span className="text-gray-400"><Icons.Shield /></span>
          Team Members
        </h3>
        {orgMembers.length === 0 ? (
          <div className="text-center py-8 text-gray-400">
            <div className="flex justify-center mb-2"><Icons.Users /></div>
            <p className="text-sm">No members found</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left py-2 px-3 text-xs font-semibold text-gray-500">Name</th>
                  <th className="text-left py-2 px-3 text-xs font-semibold text-gray-500">Email</th>
                  <th className="text-left py-2 px-3 text-xs font-semibold text-gray-500">Role</th>
                  <th className="text-left py-2 px-3 text-xs font-semibold text-gray-500">Access Level</th>
                  <th className="text-left py-2 px-3 text-xs font-semibold text-gray-500">Accepted</th>
                </tr>
              </thead>
              <tbody>
                {orgMembers.map((m: any) => (
                  <tr key={m.id} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="py-3 px-3 font-medium text-gray-800">{m.staff?.name || '—'}</td>
                    <td className="py-3 px-3 text-gray-500">{m.staff?.email || '—'}</td>
                    <td className="py-3 px-3">
                      <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-semibold bg-gray-100 text-gray-700">{m.role_title || m.role}</span>
                    </td>
                    <td className="py-3 px-3">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold uppercase ${ROLE_BADGE[m.role] || ROLE_BADGE.member}`}>
                        {m.role}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-gray-400 text-xs">{fmt(m.accepted_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Invite button ─────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
        <h3 className="text-base font-semibold text-gray-900 mb-1 flex items-center gap-2">
          <span className="text-gray-400"><Icons.Key /></span>
          Invite Team Member
        </h3>
        <p className="text-xs text-gray-500 mb-4">Send an email invite to add a team member. Their role determines their access level.</p>
        <button
          type="button"
          onClick={onInvite}
          className="px-5 py-2 rounded-xl text-sm font-medium text-white transition-colors"
          style={{ backgroundColor: primaryColor }}
        >
          + Add Team Member
        </button>
      </div>

      {/* ── Pending Invites ───────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
        <h3 className="text-base font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <span className="text-gray-400"><Icons.Bell /></span>
          Pending Invites
          {orgInvites.length > 0 && (
            <span className="ml-1 bg-purple-100 text-purple-700 text-xs font-semibold px-2 py-0.5 rounded-full">{orgInvites.length}</span>
          )}
        </h3>
        {orgInvites.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-6">No invites sent yet</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left py-2 px-3 text-xs font-semibold text-gray-500">Email</th>
                  <th className="text-left py-2 px-3 text-xs font-semibold text-gray-500">Role</th>
                  <th className="text-left py-2 px-3 text-xs font-semibold text-gray-500">Status</th>
                  <th className="text-left py-2 px-3 text-xs font-semibold text-gray-500">Expires</th>
                  <th className="py-2 px-3"></th>
                </tr>
              </thead>
              <tbody>
                {orgInvites.map((inv: any) => (
                  <tr key={inv.id} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="py-3 px-3 text-gray-700">{inv.email}</td>
                    <td className="py-3 px-3">
                      <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-semibold bg-gray-100 text-gray-700">{inv.role_title || inv.invite_role || 'admin'}</span>
                    </td>
                    <td className="py-3 px-3">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium capitalize ${INVITE_STATUS_BADGE[inv.status] || 'bg-gray-100 text-gray-500'}`}>
                        {inv.status}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-gray-400 text-xs">{fmt(inv.expires_at)}</td>
                    <td className="py-3 px-3 text-right">
                      {inv.status === 'active' && (
                        <button
                          onClick={() => onRevokeInvite(inv.id)}
                          className="text-xs text-red-500 hover:text-red-700 font-medium px-2 py-1 rounded-lg hover:bg-red-50 transition-colors"
                        >
                          Revoke
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
