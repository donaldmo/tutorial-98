declare module '@/components/ui/popover' {
  import * as React from 'react'

  export const Popover: React.ComponentType<any>
  export const PopoverTrigger: React.ComponentType<any>
  export const PopoverContent: React.ComponentType<React.HTMLAttributes<HTMLElement> & { children?: React.ReactNode; align?: 'start' | 'center' | 'end'; sideOffset?: number }>
  export const PopoverAnchor: React.ComponentType<any>
}
