import { ArrowUpRight, Maximize2 } from 'lucide-react'
import { Popover } from 'radix-ui'
import { type ReactNode, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { errorMessage } from '@/lib/api/errors'
import type { Cell } from '@/lib/api/types.gen'
import { cn } from '@/lib/cn'
import { useFormat } from '@/lib/i18n/format'
import { cellText, isBytea, isTruncated } from './cellValue'

interface CellViewProps {
  value: Cell
  /** The column is json/jsonb: show compact JSON with the full value in a popover. */
  json?: boolean
  /** The column is a foreign key: shown as a link. */
  fk?: boolean
  /** Opens the referenced row; without it the link is not clickable. */
  onFk?: () => void
  /** Loads the untruncated value of a long text cell; without it there is no "view full". */
  loadFull?: () => Promise<Cell>
}

/** Renders one value according to its wire encoding (AGENTS.md → Values on the wire). */
export function CellView({ value, json, fk, onFk, loadFull }: CellViewProps) {
  const { t } = useTranslation()
  const fmt = useFormat()

  if (value === null) return <span className="text-muted italic">{t('grid.null')}</span>
  if (isBytea(value)) {
    return (
      <span className="text-muted">{t('grid.bytea', { size: fmt.bytes(value.$bytea.size) })}</span>
    )
  }
  const text = cellText(value, json)
  if (isTruncated(value)) {
    return (
      <Expandable text={text} label={t('grid.viewFull')}>
        {loadFull ? <FullValue load={loadFull} /> : <Pretty value={value.$text} />}
      </Expandable>
    )
  }
  if (json || (typeof value === 'object' && !Array.isArray(value))) {
    return (
      <Expandable text={text} label={t('grid.viewFull')}>
        <Pretty value={value} />
      </Expandable>
    )
  }
  if (fk) {
    const link = (
      <>
        <span className="truncate">{text}</span>
        <ArrowUpRight className="size-3.5 shrink-0" aria-hidden />
      </>
    )
    return onFk ? (
      <button
        type="button"
        tabIndex={-1}
        aria-label={t('grid.openFk', { value: text })}
        onClick={onFk}
        className="inline-flex min-w-0 cursor-pointer items-center gap-0.5 text-accent-ink hover:underline"
      >
        {link}
      </button>
    ) : (
      <span className="inline-flex min-w-0 items-center gap-0.5 text-accent-ink">{link}</span>
    )
  }
  return (
    <span className={cn('truncate', typeof value === 'boolean' && 'text-accent-ink')}>{text}</span>
  )
}

function Expandable({
  text,
  label,
  children,
}: {
  text: string
  label: string
  children: ReactNode
}) {
  return (
    <span className="group/cell flex min-w-0 items-center gap-1">
      <span className="truncate">{text}</span>
      <Popover.Root>
        <Popover.Trigger
          aria-label={label}
          className="ml-auto shrink-0 cursor-pointer rounded p-0.5 text-muted opacity-0 group-hover/cell:opacity-100 hover:text-text focus-visible:opacity-100"
        >
          <Maximize2 className="size-3.5" />
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Content
            side="bottom"
            align="start"
            sideOffset={4}
            className="z-50 max-h-[60vh] w-[min(560px,90vw)] overflow-auto rounded-[var(--radius-control)] border border-border bg-surface p-3 shadow-card"
          >
            {children}
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
    </span>
  )
}

function Pretty({ value }: { value: unknown }) {
  const text = typeof value === 'string' ? value : JSON.stringify(value, null, 2)
  return <pre className="font-mono text-[12.5px] break-all whitespace-pre-wrap">{text}</pre>
}

/** Fetches the full value once, when the popover opens. */
function FullValue({ load }: { load: () => Promise<Cell> }) {
  const { t } = useTranslation()
  const [promise] = useState(load)
  const [state, setState] = useState<{ value?: Cell; error?: unknown }>({})
  useEffect(() => {
    let live = true
    promise.then(
      (value) => live && setState({ value }),
      (error: unknown) => live && setState({ error }),
    )
    return () => {
      live = false
    }
  }, [promise])
  if (state.error) return <span className="text-danger">{errorMessage(state.error, t)}</span>
  if (!('value' in state)) return <span className="text-muted">{t('common.loading')}</span>
  return <Pretty value={cellText(state.value ?? null)} />
}
