import { Select as S } from 'radix-ui'
import { Check, ChevronDown, ChevronUp } from 'lucide-react'
import type { KeyboardEvent, ReactNode } from 'react'
import { cn } from '@/lib/cn'

export interface SelectOption {
  /** Radix reserves the empty string for "no value": use a sentinel such as `-1` instead. */
  value: string
  label: ReactNode
}

interface SelectProps {
  value: string
  onValueChange: (value: string) => void
  options: SelectOption[]
  /** Shown while `value` is `''`. */
  placeholder?: ReactNode
  id?: string
  'aria-label'?: string
  'aria-invalid'?: boolean
  autoFocus?: boolean
  disabled?: boolean
  onKeyDown?: (e: KeyboardEvent) => void
  /** Classes for the trigger (width, height, font). */
  className?: string
}

/** A styled single-choice select (Radix): keyboard, typeahead and screen readers come with it. */
export function Select({
  value,
  onValueChange,
  options,
  placeholder,
  className,
  disabled,
  ...trigger
}: SelectProps) {
  return (
    <S.Root value={value} onValueChange={onValueChange} disabled={disabled}>
      <S.Trigger
        {...trigger}
        className={cn(
          'inline-flex h-9 w-full min-w-0 items-center justify-between gap-2 rounded-[var(--radius-control)]',
          'border border-border bg-surface px-3 text-left text-text',
          'focus-visible:outline-2 focus-visible:outline-accent data-[placeholder]:text-muted',
          'aria-[invalid=true]:border-danger disabled:cursor-not-allowed disabled:opacity-50',
          className,
        )}
      >
        <span className="min-w-0 truncate">
          <S.Value placeholder={placeholder} />
        </span>
        <S.Icon className="shrink-0 text-muted">
          <ChevronDown className="size-4" aria-hidden />
        </S.Icon>
      </S.Trigger>
      <S.Portal>
        <S.Content
          position="popper"
          sideOffset={4}
          className={cn(
            'z-50 max-h-[min(320px,var(--radix-select-content-available-height))] min-w-[var(--radix-select-trigger-width)]',
            'overflow-hidden rounded-[12px] border border-border bg-surface text-text shadow-card',
          )}
        >
          <S.ScrollUpButton className="flex h-6 items-center justify-center text-muted">
            <ChevronUp className="size-4" aria-hidden />
          </S.ScrollUpButton>
          <S.Viewport className="p-1">
            {options.map((o) => (
              <S.Item
                key={o.value}
                value={o.value}
                className={cn(
                  'relative flex h-8 cursor-default items-center rounded-[8px] pr-8 pl-2.5 outline-none select-none',
                  'data-[highlighted]:bg-surface-2 data-[state=checked]:font-medium',
                  'data-[highlighted]:outline-2 data-[highlighted]:-outline-offset-2 data-[highlighted]:outline-accent/40',
                )}
              >
                <S.ItemText>{o.label}</S.ItemText>
                <S.ItemIndicator className="absolute right-2.5 text-accent-ink">
                  <Check className="size-4" aria-hidden />
                </S.ItemIndicator>
              </S.Item>
            ))}
          </S.Viewport>
          <S.ScrollDownButton className="flex h-6 items-center justify-center text-muted">
            <ChevronDown className="size-4" aria-hidden />
          </S.ScrollDownButton>
        </S.Content>
      </S.Portal>
    </S.Root>
  )
}
