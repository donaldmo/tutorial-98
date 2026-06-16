declare module '@/components/ui/sheet' {
  import * as React from 'react'

  type Side = 'top' | 'bottom' | 'left' | 'right'

  export const Sheet: React.FC<{
    open?: boolean
    onOpenChange?: (open: boolean) => void
    children?: React.ReactNode
  } & React.HTMLAttributes<HTMLElement>>

  export const SheetPortal: React.FC<any>

  export const SheetOverlay: React.FC<React.HTMLAttributes<HTMLElement>>

  export const SheetTrigger: React.FC<any>

  export const SheetClose: React.FC<any>

  export const SheetContent: React.FC<React.HTMLAttributes<HTMLElement> & { side?: Side; children?: React.ReactNode }>

  export const SheetHeader: React.FC<React.HTMLAttributes<HTMLElement> & { children?: React.ReactNode }>

  export const SheetFooter: React.FC<React.HTMLAttributes<HTMLElement> & { children?: React.ReactNode }>

  export const SheetTitle: React.FC<React.HTMLAttributes<HTMLElement> & { children?: React.ReactNode }>

  export const SheetDescription: React.FC<React.HTMLAttributes<HTMLElement> & { children?: React.ReactNode }>
}
