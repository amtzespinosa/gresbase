import { labelColor } from '@/lib/api/connections'
import type { LabelColor } from '@/lib/api/types.gen'
import { cn } from '@/lib/cn'

/** The round color label of a saved connection. Decorative: the name is always next to it. */
export function LabelDot({ color, className }: { color: LabelColor; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn('inline-block size-2.5 shrink-0 rounded-full', className)}
      style={{ background: labelColor(color) }}
    />
  )
}
