declare module '@/components/ui/select' {
  import * as React from 'react'

  export const Select: React.ComponentType<any>
  export const SelectGroup: React.ComponentType<any>
  export const SelectValue: React.ComponentType<any>
  export const SelectTrigger: React.ComponentType<React.HTMLAttributes<HTMLElement> & { children?: React.ReactNode }>
  export const SelectContent: React.ComponentType<React.HTMLAttributes<HTMLElement> & { children?: React.ReactNode }>
  export const SelectLabel: React.ComponentType<any>
  export const SelectItem: React.ComponentType<any>
  export const SelectSeparator: React.ComponentType<any>
  export const SelectScrollUpButton: React.ComponentType<any>
  export const SelectScrollDownButton: React.ComponentType<any>
}
