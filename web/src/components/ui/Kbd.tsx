import type { ComponentProps } from 'react'
import { cn } from '@/lib/cn'

export function Kbd({ className, ...props }: ComponentProps<'kbd'>) {
  return (
    <kbd
      className={cn(
        'inline-flex h-5 min-w-5 items-center justify-center rounded-md border border-border bg-surface px-1',
        'font-mono text-[11px] text-muted',
        className,
      )}
      {...props}
    />
  )
}
