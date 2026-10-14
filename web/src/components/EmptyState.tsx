import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

interface EmptyStateProps {
  icon: ReactNode
  title: string
  hint?: string
  /** Optional action (a button) under the text. */
  children?: ReactNode
  /** Small, left-aligned variant for narrow side cards. */
  compact?: boolean
  className?: string
}

/** What a view shows when there is nothing to list: an icon, what happened and what to do. */
export function EmptyState({ icon, title, hint, children, compact, className }: EmptyStateProps) {
  return (
    <div
      role="status"
      className={cn(
        'flex text-muted [&_svg]:shrink-0',
        compact
          ? 'items-start gap-2 px-4 py-1 text-[12px] [&_svg]:mt-px [&_svg]:size-3.5'
          : 'flex-1 flex-col items-center justify-center gap-2 p-6 text-center [&_svg]:size-6',
        className,
      )}
    >
      {icon}
      <div className={cn('flex flex-col gap-1', !compact && 'max-w-sm items-center')}>
        <p className={cn(!compact && 'font-medium text-text')}>{title}</p>
        {hint && <p>{hint}</p>}
        {children}
      </div>
    </div>
  )
}
