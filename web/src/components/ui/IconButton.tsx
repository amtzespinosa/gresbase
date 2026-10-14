import type { ComponentProps, ReactNode } from 'react'
import { cn } from '@/lib/cn'
import { controlBase, type ButtonVariant } from './Button'
import { Tooltip } from './Tooltip'

interface IconButtonProps extends Omit<ComponentProps<'button'>, 'children'> {
  /** Accessible name; also shown as tooltip unless `tooltip` is false. */
  label: string
  icon: ReactNode
  variant?: Exclude<ButtonVariant, 'primary' | 'danger'>
  tooltip?: boolean
  tooltipSide?: 'top' | 'right' | 'bottom' | 'left'
}

export function IconButton({
  label,
  icon,
  variant = 'ghost',
  tooltip = true,
  tooltipSide,
  className,
  type = 'button',
  ...props
}: IconButtonProps) {
  const button = (
    <button
      type={type}
      aria-label={label}
      className={cn(
        controlBase,
        'size-8 shrink-0 [&_svg]:size-[18px]',
        variant === 'ghost'
          ? 'text-muted hover:bg-surface-2 hover:text-text'
          : 'border border-border bg-surface',
        className,
      )}
      {...props}
    >
      {icon}
    </button>
  )
  return tooltip ? (
    <Tooltip content={label} side={tooltipSide}>
      {button}
    </Tooltip>
  ) : (
    button
  )
}
