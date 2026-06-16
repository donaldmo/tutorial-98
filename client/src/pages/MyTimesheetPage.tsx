import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'

import { DestructiveConfirmModal } from '@/components/common/DestructiveConfirmModal'
import { Icons } from '@/components/workflow/shared'
import api from '@/services/api'

const getCurrentMonth = () => new Date().toISOString().slice(0, 7)

const getStaffId = (staff: any) => String(staff?.id || staff?._id || '')

export function MyTimesheetPage({ user, staff = [], canSelectStaff = false, hidePageHeader = false }: any) {
  const [loading, setLoading] = useState(true)
  const [selectedMonth, setSelectedMonth] = useState(getCurrentMonth())
  const [entries, setEntries] = useState<any[]>([])
  const [pendingDeleteEntry, setPendingDeleteEntry] = useState<any>(null)
  const [deleteSubmitting, setDeleteSubmitting] = useState(false)
  const [isStaffPickerOpen, setIsStaffPickerOpen] = useState(false)
  const [staffSearch, setStaffSearch] = useState('')
  const staffId = user?.staff_id || user?.id
  const [selectedStaffId, setSelectedStaffId] = useState(canSelectStaff ? '' : String(staffId || ''))

  useEffect(() => {
    if (!canSelectStaff) {
      setSelectedStaffId(String(staffId || ''))
    }
  }, [staffId, canSelectStaff])

  const staffOptions = useMemo(() => (
    (staff || [])
      .map((row: any) => ({ id: getStaffId(row), name: row?.name || 'Unknown Staff' }))
      .filter((row: any) => !!row.id)
      .sort((a: any, b: any) => a.name.localeCompare(b.name))
  ), [staff])

  const staffMap = useMemo(() => {
    const nextMap: Record<string, string> = {}
    staffOptions.forEach((s: any) => { nextMap[s.id] = s.name })
    return nextMap
  }, [staffOptions])

  const filteredStaffOptions = staffOptions.filter((member: any) => member.name.toLowerCase().includes(staffSearch.trim().toLowerCase()))

  const activeStaffId = canSelectStaff ? selectedStaffId : String(staffId || '')
  const activeStaffName = staffOptions.find((member: any) => member.id === activeStaffId)?.name || user?.name || 'Selected Staff'

  const fetchTimesheet = useCallback(async () => {
    try {
      setLoading(true)
      const entriesParams: Record<string, any> = { month: selectedMonth, limit: 200 }
      const allocParams: Record<string, any> = { month: selectedMonth, status: 'all', limit: 200 }
      if (activeStaffId) {
        entriesParams.staff_id = activeStaffId
        allocParams.staff_id = activeStaffId
      }
      const [entriesRes, allocRes] = await Promise.all([
        api.get('/time-entries', { params: entriesParams }),
        api.get('/allocations', { params: allocParams }),
      ])

      const allocMap: Record<string, { job_name: string; client_name: string }> = {}
      ;(allocRes.data?.data || []).forEach((alloc: any) => {
        const id = String(alloc.id || alloc._id || '')
        if (id) {
          allocMap[id] = {
            job_name: alloc.job_name || 'Untitled Job',
            client_name: alloc.client_name || 'Unknown Client',
          }
        }
      })

      const rows = (entriesRes.data?.data || []).map((entry: any) => {
        const allocInfo = allocMap[String(entry.allocation_id || '')] || {}
        const entryStaffId = String(entry.staff_id || '')
        const resolvedStaffName =
          entry?.staff_name
          || staffMap[entryStaffId]
          || (entryStaffId && entryStaffId === String(activeStaffId || '') ? activeStaffName : '')
          || (entryStaffId && entryStaffId === String(staffId || '') ? user?.name : '')
          || 'Unknown'
        return {
          id: entry.id || entry._id,
          date: entry.date || '',
          hours_worked: Number(entry.hours_worked || 0),
          description: entry.description || '',
          job_name: allocInfo.job_name,
          client_name: allocInfo.client_name,
          allocation_id: entry.allocation_id,
          staff_name: resolvedStaffName,
        }
      })

      setEntries(rows)
    } catch {
      toast.error('Failed to load timesheet')
    } finally {
      setLoading(false)
    }
  }, [activeStaffId, activeStaffName, selectedMonth, staffId, staffMap, user?.name])

  useEffect(() => {
    fetchTimesheet()
  }, [fetchTimesheet])

  const handleDeleteEntry = async (entry: any) => {
    try {
      await api.delete(`/time-entries/${entry.id}`)
      toast.success('Time entry deleted')
      fetchTimesheet()
    } catch (error: any) {
      const detail = String(error?.response?.data?.detail || '')
      toast.error(detail || 'Failed to delete entry')
    }
  }

  return (
    <div className="space-y-6" data-testid="my-timesheet-page">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        {!hidePageHeader && (
          <div>
            <h2 className="text-2xl font-bold text-gray-900">My Timesheet</h2>
            <p className="text-gray-500 mt-1">View your time entries</p>
          </div>
        )}
        <div className="flex flex-col sm:flex-row gap-2">
          {canSelectStaff && staffOptions.length > 0 && (
            <button
              type="button"
              onClick={() => setIsStaffPickerOpen(true)}
              className="px-4 py-2 border border-gray-200 rounded-xl bg-white text-left min-w-[220px]"
            >
              <span className="block text-xs text-gray-500">Tracking staff</span>
              <span className="block text-sm font-medium text-gray-900 truncate">{activeStaffId ? activeStaffName : 'All Staff'}</span>
            </button>
          )}
          <input type="month" value={selectedMonth} onChange={(e) => setSelectedMonth(e.target.value)} className="px-4 py-2 border border-gray-200 rounded-xl" />
        </div>
      </div>

      {loading ? (
        <div className="animate-pulse space-y-4"><div className="h-32 bg-gray-100 rounded-xl" /><div className="h-32 bg-gray-100 rounded-xl" /></div>
      ) : entries.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-12 text-center">
          <div className="mx-auto h-12 w-12 text-gray-300 flex items-center justify-center"><Icons.Calendar /></div>
          <h3 className="mt-4 text-lg font-medium text-gray-900">No Time Entries</h3>
          <p className="text-gray-500 mt-2">No time entries found for {selectedMonth}{activeStaffId ? '' : ' across all staff'}</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Date</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Staff</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Hours</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Job / Client</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Description</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {entries.map((entry) => (
                <tr key={entry.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm text-gray-900 whitespace-nowrap">{entry.date}</td>
                  <td className="px-4 py-3 text-sm text-gray-600 whitespace-nowrap">{entry.staff_name}</td>
                  <td className="px-4 py-3 text-sm font-medium text-gray-900 whitespace-nowrap">{entry.hours_worked.toFixed(2)}h</td>
                  <td className="px-4 py-3 text-sm text-gray-600">
                    {entry.job_name}{entry.client_name ? ` / ${entry.client_name}` : ''}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600 max-w-xs truncate">{entry.description}</td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => setPendingDeleteEntry(entry)}
                      className="p-1 text-gray-400 hover:text-red-600"
                    >
                      <Icons.Trash />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ModalStaffPicker
        isOpen={canSelectStaff && isStaffPickerOpen}
        onClose={() => setIsStaffPickerOpen(false)}
        staffOptions={filteredStaffOptions}
        staffSearch={staffSearch}
        onSearchChange={setStaffSearch}
        activeStaffId={activeStaffId}
        onSelect={(id: string) => { setSelectedStaffId(id); setIsStaffPickerOpen(false) }}
      />

      <DestructiveConfirmModal
        isOpen={!!pendingDeleteEntry}
        onClose={() => !deleteSubmitting && setPendingDeleteEntry(null)}
        onConfirm={async () => {
          if (!pendingDeleteEntry) return
          try {
            setDeleteSubmitting(true)
            await handleDeleteEntry(pendingDeleteEntry)
            setPendingDeleteEntry(null)
          } finally {
            setDeleteSubmitting(false)
          }
        }}
        title="Delete Time Entry"
        description="Delete this time entry?"
        confirmLabel="Delete Entry"
        isSubmitting={deleteSubmitting}
      />
    </div>
  )
}

function ModalStaffPicker({ isOpen, onClose, staffOptions, staffSearch, onSearchChange, activeStaffId, onSelect }: {
  isOpen: boolean
  onClose: () => void
  staffOptions: { id: string; name: string }[]
  staffSearch: string
  onSearchChange: (v: string) => void
  activeStaffId: string
  onSelect: (id: string) => void
}) {
  return (
    <div className={`fixed inset-0 z-50 flex items-center justify-center ${isOpen ? '' : 'hidden'}`}>
      <div className="fixed inset-0 bg-black/30" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-xl max-w-md w-full mx-4 p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900">Select Staff to Track</h3>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600"><Icons.Close /></button>
        </div>
        <input
          type="text"
          value={staffSearch}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search staff by name"
          className="w-full px-3 py-2 border border-gray-200 rounded-lg mb-3"
        />
        <div className="max-h-72 overflow-y-auto border border-gray-100 rounded-lg divide-y divide-gray-100">
          <button
            type="button"
            onClick={() => onSelect('')}
            className={`w-full px-3 py-2 text-left hover:bg-gray-50 ${activeStaffId === '' ? 'bg-blue-50' : 'bg-white'}`}
          >
            <p className={`text-sm ${activeStaffId === '' ? 'font-semibold text-blue-700' : 'text-gray-900'}`}>All Staff</p>
          </button>
          {staffOptions.length > 0 ? staffOptions.map((member: any) => {
            const isSelected = member.id === activeStaffId
            return (
              <button
                key={member.id}
                type="button"
                onClick={() => onSelect(member.id)}
                className={`w-full px-3 py-2 text-left hover:bg-gray-50 ${isSelected ? 'bg-blue-50' : 'bg-white'}`}
              >
                <p className={`text-sm ${isSelected ? 'font-semibold text-blue-700' : 'text-gray-900'}`}>{member.name}</p>
              </button>
            )
          }) : (
            <p className="px-3 py-6 text-center text-sm text-gray-500">No staff found.</p>
          )}
        </div>
      </div>
    </div>
  )
}
