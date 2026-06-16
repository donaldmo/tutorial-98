declare module '@/components/ui/tooltip' {
  import * as React from 'react'

  export const TooltipProvider: React.ComponentType<{ children?: React.ReactNode; delayDuration?: number; skipDelayDuration?: number; disableHoverableContent?: boolean }>
  export const Tooltip: React.ComponentType<{ children?: React.ReactNode; defaultOpen?: boolean; open?: boolean; onOpenChange?: (open: boolean) => void; delayDuration?: number; disableHoverableContent?: boolean }>
  export const TooltipTrigger: React.ComponentType<React.HTMLAttributes<HTMLElement> & { asChild?: boolean; children?: React.ReactNode }>
  export const TooltipContent: React.ComponentType<React.HTMLAttributes<HTMLElement> & { sideOffset?: number; children?: React.ReactNode }>
}
