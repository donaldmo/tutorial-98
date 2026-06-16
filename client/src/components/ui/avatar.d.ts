declare module '@/components/ui/avatar' {
  import * as React from 'react'

  export const Avatar: React.ComponentType<React.HTMLAttributes<HTMLElement> & { children?: React.ReactNode }>
  export const AvatarImage: React.ComponentType<any>
  export const AvatarFallback: React.ComponentType<React.HTMLAttributes<HTMLElement> & { children?: React.ReactNode }>
}
