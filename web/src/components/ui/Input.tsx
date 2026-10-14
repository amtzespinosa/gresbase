import type { ComponentProps } from 'react'
import { cn } from '@/lib/cn'

export function Input({ className, ...props }: ComponentProps<'input'>) {
  return (
    <input
      className={cn(
        'h-9 w-full rounded-[var(--radius-control)] border border-border bg-surface-2 px-3 text-text',
        'placeholder:text-muted focus-visible:outline-2 focus-visible:outline-accent',
        className,
      )}
      {...props}
    />
  )
}
