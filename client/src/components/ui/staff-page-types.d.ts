declare module '@/components/ui/dialog' {
  import * as React from 'react'

  export const Dialog: React.ComponentType<any>
  export const DialogTrigger: React.ComponentType<any>
  export const DialogPortal: React.ComponentType<any>
  export const DialogClose: React.ComponentType<any>
  export const DialogOverlay: React.ComponentType<any>
  export const DialogContent: React.ComponentType<React.HTMLAttributes<HTMLElement> & { children?: React.ReactNode }>
  export const DialogHeader: React.ComponentType<React.HTMLAttributes<HTMLElement> & { children?: React.ReactNode }>
  export const DialogFooter: React.ComponentType<React.HTMLAttributes<HTMLElement> & { children?: React.ReactNode }>
  export const DialogTitle: React.ComponentType<React.HTMLAttributes<HTMLElement> & { children?: React.ReactNode }>
  export const DialogDescription: React.ComponentType<React.HTMLAttributes<HTMLElement> & { children?: React.ReactNode }>
}

declare module '@/components/ui/input' {
  import * as React from 'react'

  export const Input: React.ComponentType<React.InputHTMLAttributes<HTMLInputElement>>
}

declare module '@/components/ui/label' {
  import * as React from 'react'

  export const Label: React.ComponentType<React.LabelHTMLAttributes<HTMLLabelElement> & { children?: React.ReactNode }>
}

declare module '@/components/ui/checkbox' {
  import * as React from 'react'

  export const Checkbox: React.ComponentType<any>
}

declare module '@/components/ui/radio-group' {
  import * as React from 'react'

  export const RadioGroup: React.ComponentType<any>
  export const RadioGroupItem: React.ComponentType<any>
}
