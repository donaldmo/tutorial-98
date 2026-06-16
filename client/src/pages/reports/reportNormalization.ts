const toKey = (value: string) => String(value || '').trim().toLowerCase().replace(/[\s-]+/g, '_')

export const normalizeStatusLabel = (raw: string) => {
  const trimmed = String(raw || '').trim()
  if (!trimmed) return 'Unknown'
  if (trimmed === 'Doing') return 'In Progress'
  if (trimmed === 'On Track') return 'On Track'
  if (trimmed === 'No Deadline') return 'No Deadline'
  return trimmed
}

export const normalizeStatusKey = (raw: string) => toKey(normalizeStatusLabel(raw))

export const getStatusBadgeClass = (rawStatus: string) => {
  const key = normalizeStatusKey(rawStatus)
  const map: Record<string, string> = {
    pending: 'bg-gray-100 text-gray-800',
    partially_allocated: 'bg-orange-100 text-orange-800',
    fully_allocated: 'bg-blue-100 text-blue-800',
    in_progress: 'bg-purple-100 text-purple-800',
    completed: 'bg-green-100 text-green-800',
    on_hold: 'bg-yellow-100 text-yellow-800',
    overloaded: 'bg-red-100 text-red-800',
    underutilized: 'bg-yellow-100 text-yellow-800',
    optimal: 'bg-green-100 text-green-800',
    high: 'bg-red-100 text-red-800',
    medium: 'bg-orange-100 text-orange-800',
    low: 'bg-green-100 text-green-800',
    over_budget: 'bg-red-100 text-red-800',
    on_track: 'bg-green-100 text-green-800',
    late: 'bg-red-100 text-red-800',
    on_time: 'bg-green-100 text-green-800',
    no_deadline: 'bg-gray-100 text-gray-800',
  }
  return map[key] || 'bg-gray-100 text-gray-800'
}
