import type { ComponentProps } from 'react'
import { cn } from '@/lib/cn'

export function Card({ className, ...props }: ComponentProps<'section'>) {
  return (
    <section
      className={cn(
        'min-w-0 overflow-hidden rounded-[var(--radius-card)] border border-border bg-surface shadow-card',
        className,
      )}
      {...props}
    />
  )
}
