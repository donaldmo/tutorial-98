declare module '@/components/ui/command' {
  import * as React from 'react'

  type CommandProps = Omit<React.HTMLAttributes<HTMLElement>, 'onSelect'> & {
    children?: React.ReactNode
    shouldFilter?: boolean
  }

  type CommandInputProps = Omit<React.HTMLAttributes<HTMLElement>, 'onValueChange'> & {
    children?: React.ReactNode
    placeholder?: string
    value?: string
    onValueChange?: (value: string) => void
  }

  type CommandItemProps = Omit<React.HTMLAttributes<HTMLElement>, 'onSelect' | 'value'> & {
    children?: React.ReactNode
    value?: string
    onSelect?: (value: string) => void
    disabled?: boolean
  }

  export const Command: React.ComponentType<CommandProps>
  export const CommandDialog: React.ComponentType<{ children?: React.ReactNode } & React.ComponentProps<typeof import('@/components/ui/dialog').Dialog>>
  export const CommandInput: React.ComponentType<CommandInputProps>
  export const CommandList: React.ComponentType<React.HTMLAttributes<HTMLElement> & { children?: React.ReactNode }>
  export const CommandEmpty: React.ComponentType<React.HTMLAttributes<HTMLElement> & { children?: React.ReactNode }>
  export const CommandGroup: React.ComponentType<React.HTMLAttributes<HTMLElement> & { children?: React.ReactNode }>
  export const CommandSeparator: React.ComponentType<React.HTMLAttributes<HTMLElement> & { children?: React.ReactNode }>
  export const CommandItem: React.ComponentType<CommandItemProps>
  export const CommandShortcut: React.ComponentType<React.HTMLAttributes<HTMLElement> & { children?: React.ReactNode }>
}
