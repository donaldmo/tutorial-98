import { useCallback, useEffect, useRef, useState } from 'react'
import { Check, ChevronDown, Loader2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { cn } from '@/lib/utils'

export interface SearchableItem {
  value: string
  label: string
}

export interface FetchResult {
  items: SearchableItem[]
  totalPages: number
}

interface SearchableSelectProps {
  fetchItems: (search: string, page: number) => Promise<FetchResult>
  value: string
  onValueChange: (value: string) => void
  placeholder?: string
  emptyMessage?: string
  searchPlaceholder?: string
  disabled?: boolean
  className?: string
  footer?: React.ReactNode
  displayValue?: string
  renderItem?: (item: SearchableItem, isSelected: boolean) => React.ReactNode
}

export function SearchableSelect({
  fetchItems,
  value,
  onValueChange,
  placeholder = 'Select...',
  emptyMessage = 'No results found.',
  searchPlaceholder = 'Search...',
  disabled = false,
  className,
  footer,
  displayValue,
  renderItem,
}: SearchableSelectProps) {
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<SearchableItem[]>([])
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [search, setSearch] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined)

  const hasMore = currentPage < totalPages

  const selectedLabel = items.find((i) => i.value === value)?.label || ''

  const doFetch = useCallback(async (term: string, page: number, append: boolean) => {
    if (append) {
      setLoadingMore(true)
    } else {
      setLoading(true)
    }
    try {
      const result = await fetchItems(term, page)
      if (append) {
        setItems((prev) => [...prev, ...result.items])
      } else {
        setItems(result.items)
      }
      setCurrentPage(page)
      setTotalPages(result.totalPages)
    } catch {
      if (!append) setItems([])
    } finally {
      setLoading(false)
      setLoadingMore(false)
    }
  }, [fetchItems])

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      doFetch(search, 1, false)
    }, 300)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [search, doFetch])

  useEffect(() => {
    if (open) {
      setSearch('')
      setItems([])
      setCurrentPage(1)
      setTotalPages(1)
      doFetch('', 1, false)
    }
  }, [open, doFetch])

  const handleLoadMore = () => {
    if (!hasMore || loadingMore) return
    doFetch(search, currentPage + 1, true)
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild disabled={disabled}>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn(
            'w-full justify-between font-normal px-4 py-2 h-auto border border-gray-200 rounded-xl text-sm text-left',
            !value && 'text-gray-400',
            className,
          )}
        >
          <span className="truncate">
            {value ? selectedLabel || displayValue || value : placeholder}
          </span>
          <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[var(--radix-popover-trigger-width)] p-0 bg-white border border-gray-200"
        align="start"
      >
        <Command shouldFilter={false}>
          <CommandInput
            placeholder={searchPlaceholder}
            value={search}
            onValueChange={setSearch}
            className="border-b border-gray-200"
          />
          <CommandList className="max-h-[260px]">
            {loading ? (
              <div className="flex items-center justify-center py-6">
                <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
              </div>
            ) : items.length === 0 ? (
              <CommandEmpty>{emptyMessage}</CommandEmpty>
            ) : (
              <CommandGroup>
                  {items.map((item) => (
                  <CommandItem
                    key={item.value}
                    value={item.value}
                    onSelect={(currentValue: string) => {
                      onValueChange(currentValue)
                      setOpen(false)
                    }}
                    className={cn('text-sm', renderItem ? '' : 'text-gray-700')}
                  >
                    {renderItem ? (
                      renderItem(item, value === item.value)
                    ) : (
                      <>
                        <Check
                          className={cn(
                            'mr-2 h-4 w-4',
                            value === item.value ? 'opacity-100' : 'opacity-0',
                          )}
                        />
                        {item.label}
                      </>
                    )}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            {!loading && hasMore && (
              <div className="border-t border-gray-100">
                <CommandItem
                  value="__load_more__"
                  onSelect={handleLoadMore}
                  disabled={loadingMore}
                  className="justify-center text-sm text-blue-600 font-medium"
                >
                  {loadingMore ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <span className="mr-2 text-gray-400">···</span>
                  )}
                  Load more…
                </CommandItem>
              </div>
            )}
          </CommandList>
          {footer}
        </Command>
      </PopoverContent>
    </Popover>
  )
}
