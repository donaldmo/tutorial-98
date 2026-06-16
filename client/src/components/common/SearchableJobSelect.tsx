import { useCallback } from 'react'

import { SearchableSelect, type FetchResult } from './SearchableSelect'
import api from '@/services/api'

interface SearchableJobSelectProps {
  value: string
  onValueChange: (value: string) => void
  clientId: string
  placeholder?: string
  disabled?: boolean
  className?: string
  formatLabel?: (job: any) => string
  displayValue?: string
}

function extractJobs(response: any): any[] {
  const data = response?.data
  return Array.isArray(data) ? data : data?.data || []
}

const defaultFormatLabel = (job: any) => {
  const labels = (job.job_type_entries || []).map((e: any) => e.job_type_name).filter(Boolean)
  const labelStr = labels.length > 0 ? ` [${labels.join(', ')}]` : ''
  return `${job.name}${labelStr}${job.status ? ` · ${job.status}` : ''}`
}

export function SearchableJobSelect({
  value,
  onValueChange,
  clientId,
  placeholder = 'Choose a job…',
  disabled = false,
  className,
  formatLabel = defaultFormatLabel,
  displayValue,
}: SearchableJobSelectProps) {
  const fetchJobs = useCallback(async (search: string, page: number): Promise<FetchResult> => {
    if (!clientId) return { items: [], totalPages: 1 }
    const params = new URLSearchParams({ client_id: clientId, limit: '50', page: String(page) })
    if (search) params.set('search', search)
    const res = await api.get(`/jobs?${params}`)
    const items = extractJobs(res)
      .filter((j: any) => !['Completed', 'On Hold'].includes(j.status))
      .map((j: any) => ({
        value: String(j.id),
        label: formatLabel(j),
      }))
    const totalPages = res.data?.pagination?.total_pages || 1
    return { items, totalPages }
  }, [clientId, formatLabel])

  return (
    <SearchableSelect
      fetchItems={fetchJobs}
      value={value}
      onValueChange={onValueChange}
      placeholder={placeholder}
      disabled={disabled || !clientId}
      className={className}
      emptyMessage="No allocatable jobs for this client."
      searchPlaceholder="Search jobs..."
      displayValue={displayValue}
    />
  )
}
