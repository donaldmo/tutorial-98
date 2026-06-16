import { useCallback } from 'react'
import { Plus } from 'lucide-react'

import { CommandGroup, CommandItem } from '@/components/ui/command'
import { SearchableSelect, type FetchResult } from './SearchableSelect'
import api from '@/services/api'

interface SearchableClientSelectProps {
  value: string
  onValueChange: (value: string) => void
  placeholder?: string
  disabled?: boolean
  className?: string
  onCreateNew?: () => void
  useClientName?: boolean
  clientName?: string
}

function extractClients(response: any): any[] {
  const data = response?.data
  return Array.isArray(data) ? data : data?.data || []
}

export function SearchableClientSelect({
  value,
  onValueChange,
  placeholder = 'Choose a client…',
  disabled = false,
  className,
  onCreateNew,
  useClientName = false,
  clientName,
}: SearchableClientSelectProps) {
  const fetchClients = useCallback(async (search: string, page: number): Promise<FetchResult> => {
    const params = new URLSearchParams({ active_only: 'true', limit: '50', page: String(page) })
    if (search) params.set('search', search)
    const res = await api.get(`/clients?${params}`)
    const items = extractClients(res).map((c: any) => ({
      value: useClientName ? c.name : String(c.id),
      label: c.name,
    }))
    const totalPages = res.data?.pagination?.total_pages || 1
    return { items, totalPages }
  }, [useClientName])

  const renderFooter = onCreateNew ? (
    <CommandGroup>
      <CommandItem
        value="__create_new__"
        onSelect={() => {
          onCreateNew()
        }}
        className="text-sm font-medium text-blue-600"
      >
        <Plus className="mr-2 h-4 w-4" />
        Create New Client…
      </CommandItem>
    </CommandGroup>
  ) : undefined

  return (
    <SearchableSelect
      fetchItems={fetchClients}
      value={value}
      onValueChange={onValueChange}
      placeholder={placeholder}
      disabled={disabled}
      className={className}
      emptyMessage="No clients found."
      searchPlaceholder="Search clients..."
      footer={renderFooter}
      displayValue={clientName}
    />
  )
}
