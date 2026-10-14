import { Check, Minus } from 'lucide-react'
import { Checkbox as C } from 'radix-ui'
import type { ComponentProps, ReactNode } from 'react'
import { cn } from '@/lib/cn'

type CheckboxProps = Omit<ComponentProps<typeof C.Root>, 'onCheckedChange' | 'children'> & {
  onCheckedChange?: (checked: boolean) => void
}

/**
 * The app's checkbox (docs/design.md → Checkbox): a 16 px box inside a 24 × 24 px target, accent
 * yellow with an --on-accent mark when checked or indeterminate (checked="indeterminate").
 */
export function Checkbox({ className, onCheckedChange, ...props }: CheckboxProps) {
  return (
    <C.Root
      className={cn(
        'group/checkbox grid size-6 shrink-0 cursor-pointer place-items-center rounded-[6px] outline-none',
        'disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      onCheckedChange={(v) => onCheckedChange?.(v === true)}
      {...props}
    >
      <span
        className={cn(
          'grid size-4 place-items-center rounded-[4px] border border-muted bg-surface text-on-accent transition-colors',
          'group-hover/checkbox:border-text group-focus-visible/checkbox:outline-2 group-focus-visible/checkbox:outline-offset-1 group-focus-visible/checkbox:outline-accent',
          'group-data-[state=checked]/checkbox:border-accent group-data-[state=checked]/checkbox:bg-accent',
          'group-data-[state=indeterminate]/checkbox:border-accent group-data-[state=indeterminate]/checkbox:bg-accent',
        )}
      >
        <C.Indicator className="grid place-items-center">
          <Check
            className="size-3 group-data-[state=indeterminate]/checkbox:hidden"
            strokeWidth={3}
            aria-hidden
          />
          <Minus
            className="hidden size-3 group-data-[state=indeterminate]/checkbox:block"
            strokeWidth={3}
            aria-hidden
          />
        </C.Indicator>
      </span>
    </C.Root>
  )
}

/** A checkbox with its label; clicking the label toggles it. */
export function CheckboxField({
  label,
  checked,
  onChange,
  disabled,
  className,
}: {
  label: ReactNode
  checked: boolean
  onChange: (checked: boolean) => void
  disabled?: boolean
  className?: string
}) {
  return (
    <label
      className={cn(
        'flex cursor-pointer items-center gap-1.5',
        disabled && 'cursor-not-allowed',
        className,
      )}
    >
      <Checkbox checked={checked} onCheckedChange={onChange} disabled={disabled} />
      <span className="min-w-0">{label}</span>
    </label>
  )
}
