import { Tooltip as T } from 'radix-ui'
import type { ReactNode } from 'react'

interface TooltipProps {
  content: ReactNode
  children: ReactNode
  side?: 'top' | 'right' | 'bottom' | 'left'
  /** When false the trigger renders without a tooltip (e.g. expanded sidebar labels). */
  enabled?: boolean
}

export function Tooltip({ content, children, side = 'top', enabled = true }: TooltipProps) {
  if (!enabled) return children
  return (
    <T.Root>
      <T.Trigger asChild>{children}</T.Trigger>
      <T.Portal>
        <T.Content
          side={side}
          sideOffset={8}
          className="z-50 max-w-64 rounded-md bg-pill px-2 py-1 text-xs text-on-pill shadow-card"
        >
          {content}
        </T.Content>
      </T.Portal>
    </T.Root>
  )
}

export const TooltipProvider = T.Provider
