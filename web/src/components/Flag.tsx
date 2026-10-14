import { useId } from 'react'
import type { Lang } from '@/lib/i18n'
import { cn } from '@/lib/cn'

/**
 * Language flags as inline SVG: Windows doesn't draw flag emojis. Decorative (aria-hidden): the
 * language name or code always goes next to it.
 */
export function Flag({ lang, className }: { lang: Lang; className?: string }) {
  const id = `flag${useId().replace(/[^a-zA-Z0-9]/g, '')}` // a plain id for url(#…)
  // Both flags are 18×12 (3:2), so they line up the same next to their language code.
  const size = { width: 18, height: 12 }
  const cls = cn('inline-block shrink-0 rounded-[2px] align-[-1px]', className)
  if (lang === 'es')
    return (
      <svg aria-hidden viewBox="0 0 3 2" {...size} className={cls}>
        <rect width="3" height="2" fill="#AA151B" />
        <rect y="0.5" width="3" height="1" fill="#F1BF00" />
      </svg>
    )
  // Union Jack: the red diagonals are offset (counterchanged), hence the clip. Drawn at its own 2:1
  // and cropped at the sides to 3:2 (slice), never stretched.
  return (
    <svg
      aria-hidden
      viewBox="0 0 60 30"
      preserveAspectRatio="xMidYMid slice"
      {...size}
      className={cls}
    >
      <clipPath id={`${id}t`}>
        <path d="M30,15 h30 v15 z v15 h-30 z h-30 v-15 z v-15 h30 z" />
      </clipPath>
      <rect width="60" height="30" fill="#012169" />
      <path d="M0,0 L60,30 M60,0 L0,30" stroke="#fff" strokeWidth="6" />
      <path
        d="M0,0 L60,30 M60,0 L0,30"
        clipPath={`url(#${id}t)`}
        stroke="#C8102E"
        strokeWidth="4"
      />
      <path d="M30,0 v30 M0,15 h60" stroke="#fff" strokeWidth="10" />
      <path d="M30,0 v30 M0,15 h60" stroke="#C8102E" strokeWidth="6" />
    </svg>
  )
}
