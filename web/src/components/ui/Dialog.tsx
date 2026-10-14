import { Dialog as D } from 'radix-ui'
import { X } from 'lucide-react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/cn'
import { IconButton } from './IconButton'

interface DialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: ReactNode
  description?: ReactNode
  children?: ReactNode
  footer?: ReactNode
  tone?: 'default' | 'danger'
  /** `lg` for forms with several rows (e.g. the columns of a new table). */
  size?: 'md' | 'lg'
}

export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  tone = 'default',
  size = 'md',
}: DialogProps) {
  const { t } = useTranslation()
  return (
    <D.Root open={open} onOpenChange={onOpenChange}>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-40 bg-black/40" />
        <D.Content
          className={cn(
            'fixed top-1/2 left-1/2 z-50 w-[calc(100vw-24px)] -translate-x-1/2 -translate-y-1/2',
            'max-h-[calc(100vh-24px)] overflow-y-auto',
            size === 'lg' ? 'max-w-[780px]' : 'max-w-[520px]',
            'rounded-[var(--radius-card)] border border-border bg-surface p-5 shadow-card',
            tone === 'danger' && 'border-t-4 border-t-danger',
          )}
        >
          <div className="flex items-start justify-between gap-4">
            <D.Title className="text-[15px] font-semibold">{title}</D.Title>
            <D.Close asChild>
              <IconButton
                label={t('common.close')}
                icon={<X />}
                tooltip={false}
                className="-mt-1 -mr-1"
              />
            </D.Close>
          </div>
          {description ? (
            <D.Description className="mt-1 text-muted">{description}</D.Description>
          ) : (
            <D.Description className="sr-only">{title}</D.Description>
          )}
          {children && <div className="mt-4">{children}</div>}
          {footer && <div className="mt-5 flex justify-end gap-2">{footer}</div>}
        </D.Content>
      </D.Portal>
    </D.Root>
  )
}
