import type { ComponentProps } from 'react'
import { cn } from '@/lib/cn'

const tones = {
  neutral: 'bg-surface-2 text-muted border border-border',
  accent: 'bg-accent-tint text-accent-ink',
  danger: 'bg-danger/15 text-danger',
} as const

interface BadgeProps extends ComponentProps<'span'> {
  tone?: keyof typeof tones
}

export function Badge({ tone = 'neutral', className, ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex h-5 items-center gap-1 rounded-[8px] px-2 text-[11px] font-medium',
        tones[tone],
        className,
      )}
      {...props}
    />
  )
}
