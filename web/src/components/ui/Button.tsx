import type { ComponentProps } from 'react'
import { cn } from '@/lib/cn'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'

const variants: Record<ButtonVariant, string> = {
  primary: 'bg-accent text-on-accent font-semibold hover:brightness-95',
  secondary: 'border border-border bg-surface text-text hover:bg-surface-2',
  ghost: 'text-muted hover:bg-surface-2 hover:text-text',
  danger: 'bg-danger text-on-danger font-semibold hover:brightness-95',
}

export const controlBase =
  'inline-flex items-center justify-center gap-2 rounded-[var(--radius-control)] transition-colors ' +
  'whitespace-nowrap disabled:pointer-events-none disabled:opacity-50 cursor-pointer select-none'

interface ButtonProps extends ComponentProps<'button'> {
  variant?: ButtonVariant
  size?: 'sm' | 'md'
}

export function Button({
  variant = 'secondary',
  size = 'md',
  className,
  type = 'button',
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        controlBase,
        variants[variant],
        size === 'sm' ? 'h-8 px-3' : 'h-9 px-4',
        className,
      )}
      {...props}
    />
  )
}
