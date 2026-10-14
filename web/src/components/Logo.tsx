import { useId } from 'react'

const tusk = 'M7.7 12.9c-.1 3-2.8 4.2-5.1 1.7'
const body =
  'M3 17.5a1.5 1.5 0 0 0 3 0V12C6 6.5 9 3.5 12.5 3.5S20 6.5 21 11.5V20h-2.5v-4H11v4H8.5v-5.5'

interface LogoProps {
  /** With eye for ≥ 32 px, without for smaller sizes (docs/design.md → Logo). */
  eye?: boolean
  size?: number
  className?: string
  title?: string
}

/**
 * Monoline mammoth in currentColor. The tusk's halo cuts the trunk through a mask (not a background
 * colored stroke), so it works on any background. useId keeps mask ids unique per instance.
 */
export function Logo({ eye = true, size = 24, className, title }: LogoProps) {
  const maskId = `gb-cut-${useId().replace(/:/g, '')}`
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      className={className}
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      <defs>
        <mask id={maskId} maskUnits="userSpaceOnUse" x="0" y="0" width="24" height="24">
          <rect width="24" height="24" fill="#fff" />
          <path d={tusk} fill="none" stroke="#000" strokeWidth="3.1" strokeLinecap="round" />
        </mask>
      </defs>
      <g
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d={body} mask={`url(#${maskId})`} />
        <path d={tusk} />
      </g>
      {eye && <circle cx="9.6" cy="8.4" r="0.9" fill="currentColor" />}
    </svg>
  )
}

/** App icon: accent rounded square (22 % radius) with the mammoth in --on-accent. */
export function AppIcon({ size = 32, glow = false }: { size?: number; glow?: boolean }) {
  const glyph = Math.round(size * 0.72)
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center bg-accent text-on-accent ${glow ? 'shadow-glow' : ''}`}
      style={{ width: size, height: size, borderRadius: size * 0.22 }}
    >
      <Logo eye={glyph >= 32} size={glyph} />
    </span>
  )
}
