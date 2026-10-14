import { Dialog as D } from 'radix-ui'
import { X } from 'lucide-react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/cn'
import { IconButton } from './IconButton'

interface SheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: ReactNode
  description?: ReactNode
  children?: ReactNode
  footer?: ReactNode
  /** A wider panel, for content with tables (the CSV import). */
  wide?: boolean
  /** The content fills the body and lays out its own scrolling area and footer (a form). */
  flush?: boolean
}

/** Side panel floating on the right, styled as a card. */
export function Sheet({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  wide,
  flush,
}: SheetProps) {
  const { t } = useTranslation()
  return (
    <D.Root open={open} onOpenChange={onOpenChange}>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-40 bg-black/25" />
        <D.Content
          className={cn(
            'fixed top-3 right-3 bottom-3 z-50 flex flex-col rounded-[var(--radius-card)] border border-border bg-surface shadow-card',
            wide ? 'w-[min(760px,calc(100vw-24px))]' : 'w-[min(480px,calc(100vw-24px))]',
          )}
        >
          <div className="flex items-start justify-between gap-4 border-b border-border p-4">
            <div className="min-w-0">
              <D.Title className="truncate text-[15px] font-semibold">{title}</D.Title>
              <D.Description className={description ? 'mt-0.5 text-muted' : 'sr-only'}>
                {description ?? title}
              </D.Description>
            </div>
            <D.Close asChild>
              <IconButton label={t('common.close')} icon={<X />} tooltip={false} />
            </D.Close>
          </div>
          <div
            className={flush ? 'flex min-h-0 flex-1 flex-col' : 'min-h-0 flex-1 overflow-auto p-4'}
          >
            {children}
          </div>
          {footer && (
            <div className="flex justify-end gap-2 border-t border-border p-4">{footer}</div>
          )}
        </D.Content>
      </D.Portal>
    </D.Root>
  )
}
