import { ContextMenu as M } from 'radix-ui'
import type { KeyboardEvent, ReactNode } from 'react'
import { cn } from '@/lib/cn'

// Keyboards: the Menu key and Shift+F10 open the menu at the focused element, like a right click
// at its bottom left corner.
const openFromKeyboard = (e: KeyboardEvent<HTMLElement>) => {
  if (e.key !== 'ContextMenu' && !(e.shiftKey && e.key === 'F10')) return
  e.preventDefault()
  const r = e.currentTarget.getBoundingClientRect()
  e.currentTarget.dispatchEvent(
    new MouseEvent('contextmenu', {
      bubbles: true,
      cancelable: true,
      clientX: r.left + 16,
      clientY: r.bottom,
    }),
  )
}

/**
 * A context menu on its child (docs/design.md → Menú contextual): right click, the Menu key or
 * Shift+F10, or a long press on touch. The child must be focusable and forward its ref.
 */
export function ContextMenu({
  label,
  children,
  items,
}: {
  label: string
  children: ReactNode
  items: ReactNode
}) {
  return (
    <M.Root>
      <M.Trigger asChild onKeyDown={openFromKeyboard} className="[-webkit-touch-callout:none]">
        {children}
      </M.Trigger>
      <M.Portal>
        <M.Content
          aria-label={label}
          className="z-50 min-w-52 rounded-[var(--radius-control)] border border-border bg-surface p-1 text-text shadow-card"
        >
          {items}
        </M.Content>
      </M.Portal>
    </M.Root>
  )
}

export function MenuItem({
  icon,
  danger,
  onSelect,
  children,
}: {
  icon: ReactNode
  /** Destructive: red, and grouped at the end after a MenuSeparator. */
  danger?: boolean
  onSelect: () => void
  children: ReactNode
}) {
  return (
    <M.Item
      onSelect={onSelect}
      className={cn(
        'flex h-8 cursor-pointer items-center gap-2 rounded-[8px] px-2 outline-none',
        'data-[highlighted]:bg-surface-2 [&_svg]:size-4 [&_svg]:shrink-0',
        danger && 'text-danger',
      )}
    >
      {icon}
      {children}
    </M.Item>
  )
}

export const MenuSeparator = () => <M.Separator className="my-1 h-px bg-border" />
