import { FileDown } from 'lucide-react'
import { DropdownMenu as M } from 'radix-ui'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/Button'
import { download } from '@/lib/api/client'
import { errorMessage } from '@/lib/api/errors'
import { toast } from '@/lib/toast'

export interface ExportItem {
  label: string
  /** A download link (server export) or an action (client export). */
  href?: string
  onSelect?: () => void
}

const itemClass =
  'flex h-8 cursor-pointer items-center rounded-[8px] px-2 text-text outline-none ' +
  'data-[highlighted]:bg-surface-2'

/** The "Export" button with its formats. */
export function ExportMenu({ items, disabled }: { items: ExportItem[]; disabled?: boolean }) {
  const { t } = useTranslation()
  return (
    <M.Root>
      <M.Trigger asChild>
        <Button size="sm" disabled={disabled}>
          <FileDown className="size-4" />
          {t('export.button')}
        </Button>
      </M.Trigger>
      <M.Portal>
        <M.Content
          align="end"
          sideOffset={4}
          className="z-50 min-w-40 rounded-[var(--radius-control)] border border-border bg-surface p-1 shadow-card"
        >
          {items.map((it) =>
            it.href ? (
              <M.Item
                key={it.label}
                className={itemClass}
                onSelect={() => {
                  const href = it.href ?? ''
                  download(href).catch((err: unknown) =>
                    toast({ tone: 'danger', message: errorMessage(err, t), duration: 10_000 }),
                  )
                }}
              >
                {it.label}
              </M.Item>
            ) : (
              <M.Item key={it.label} className={itemClass} onSelect={it.onSelect}>
                {it.label}
              </M.Item>
            ),
          )}
        </M.Content>
      </M.Portal>
    </M.Root>
  )
}
