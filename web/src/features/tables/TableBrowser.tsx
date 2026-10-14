import { Link, useParams } from '@tanstack/react-router'
import { useConnectionId } from '@/lib/api/connections'
import {
  ChevronRight,
  Eye,
  Globe,
  Layers,
  type LucideIcon,
  Plus,
  RotateCw,
  Search,
  SearchX,
  Star,
  Table2,
  TableProperties,
} from 'lucide-react'
import { EmptyState } from '@/components/EmptyState'
import {
  type FocusEvent,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { errorMessage } from '@/lib/api/errors'
import { useReadOnly, useRelations } from '@/lib/api/queries'
import type { Relation } from '@/lib/api/types.gen'
import { cn } from '@/lib/cn'
import { useFormat } from '@/lib/i18n/format'
import { usePrefs } from '@/lib/prefs/store'
import { useShortcut } from '@/lib/shortcuts'
import { filterRelations } from './filterRelations'
import { TableContextMenu } from './TableContextMenu'
import { CreateTableDialog } from './structure/dialogs'
import { useSelectedSchema } from './useSelectedSchema'
import { useConnectionTables } from './tabs'
import { useCompletions } from '@/lib/api/sql'

const kindIcon: Record<string, LucideIcon> = {
  table: Table2,
  view: Eye,
  materialized_view: Layers,
  foreign_table: Globe,
  partitioned_table: TableProperties,
}

/** The "table list" card of the Tables screen (docs/design.md → Layout). */
export function TableBrowser() {
  const { t } = useTranslation()
  const { schema, schemas, setSchema } = useSelectedSchema()
  const relations = useRelations(schema)
  const [query, setQuery] = useState('')
  const [creating, setCreating] = useState(false)
  const readOnly = useReadOnly() !== false
  const search = useRef<HTMLInputElement>(null)
  useShortcut('focusSearch', () => search.current?.focus())

  const list = filterRelations(relations.data ?? [], query)
  const error = schemas.error ?? relations.error
  const loading = schemas.isPending || (schema !== undefined && relations.isPending)

  return (
    <ResizableList>
      <Card className="flex w-full flex-col" aria-label={t('tables.list')}>
        <div className="flex flex-col gap-2 p-3">
          <label className="section-label px-1" htmlFor="schema-select">
            {t('tables.schema')}
          </label>
          <Select
            id="schema-select"
            value={schema ?? ''}
            onValueChange={setSchema}
            disabled={!schemas.data}
            options={(schemas.data ?? []).map((s) => ({ value: s, label: s }))}
            className="font-mono text-[12.5px]"
          />
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted" />
            <Input
              ref={search}
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('tables.search')}
              aria-label={t('tables.search')}
              aria-keyshortcuts="/"
              className="pl-8"
            />
          </div>
          {!readOnly && schema !== undefined && (
            <Button size="sm" onClick={() => setCreating(true)}>
              <Plus className="size-4" />
              {t('structureEdit.newTable')}
            </Button>
          )}
          {creating && schema !== undefined && (
            <CreateTableDialog schema={schema} onClose={() => setCreating(false)} />
          )}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
          {error ? (
            <div role="alert" className="flex flex-col items-start gap-2 p-2 text-muted">
              <span>{errorMessage(error, t)}</span>
              <Button
                size="sm"
                onClick={() => {
                  void schemas.refetch()
                  void relations.refetch()
                }}
              >
                <RotateCw className="size-4" />
                {t('common.retry')}
              </Button>
            </div>
          ) : loading ? (
            <ul
              aria-busy="true"
              aria-label={t('common.loading')}
              className="flex flex-col gap-1 p-1"
            >
              {Array.from({ length: 8 }, (_, i) => (
                <li key={i} className="h-7 animate-pulse rounded-[9px] bg-surface-2" />
              ))}
            </ul>
          ) : list.length === 0 ? (
            <EmptyState
              compact
              className="px-2"
              icon={query ? <SearchX /> : <Table2 />}
              title={query ? t('tables.noMatches') : t('tables.noRelations')}
            />
          ) : (
            <>
              {query.trim() === '' && <Favorites />}
              <ul className="flex flex-col gap-0.5">
                {list.map((r) => (
                  <RelationItem
                    key={r.name}
                    rel={r}
                    expanded={query.trim() !== ''}
                    gutter={list.some((l) => l.partitions.length > 0)}
                  />
                ))}
              </ul>
            </>
          )}
        </div>
      </Card>
    </ResizableList>
  )
}

const LIST_WIDTH = { default: 240, min: 200, max: 560, step: 16 }

/** Wraps the table list card with a handle on its right edge that drags its width (persisted). */
function ResizableList({ children }: { children: ReactNode }) {
  const { t } = useTranslation()
  const stored = usePrefs((s) => s.tableListWidth)
  const setWidth = usePrefs((s) => s.setTableListWidth)
  const box = useRef<HTMLDivElement>(null)
  const width = stored ?? LIST_WIDTH.default
  const clamp = (w: number) => Math.round(Math.min(LIST_WIDTH.max, Math.max(LIST_WIDTH.min, w)))
  const onMove = (e: PointerEvent) => {
    const left = box.current?.getBoundingClientRect().left
    if (left !== undefined && e.buttons === 1) setWidth(clamp(e.clientX - left))
  }
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'ArrowLeft') setWidth(clamp(width - LIST_WIDTH.step))
    else if (e.key === 'ArrowRight') setWidth(clamp(width + LIST_WIDTH.step))
    else if (e.key === 'Home') setWidth(LIST_WIDTH.min)
    else if (e.key === 'End') setWidth(LIST_WIDTH.max)
    else return
    e.preventDefault()
  }
  return (
    <div ref={box} className="relative flex shrink-0" style={{ width }}>
      {children}
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label={t('tables.resizeList')}
        aria-valuenow={width}
        aria-valuemin={LIST_WIDTH.min}
        aria-valuemax={LIST_WIDTH.max}
        tabIndex={0}
        onPointerDown={(e) => e.currentTarget.setPointerCapture(e.pointerId)}
        onPointerMove={onMove}
        onKeyDown={onKey}
        onDoubleClick={() => setWidth(null)}
        className="group absolute inset-y-0 -right-2 z-10 flex w-3 cursor-col-resize items-center justify-center focus-visible:outline-none"
      >
        <span className="h-10 w-1 rounded-full group-hover:bg-muted group-focus-visible:bg-accent" />
      </div>
    </div>
  )
}

/**
 * Shows the full name of a truncated row on hover or focus: a copy of the row floats over the card
 * at the same spot, as wide as the name needs, without moving anything. The copy ignores the
 * pointer, so clicks still reach the row below. Rows mark their name element with data-name.
 */
function useReveal() {
  const [shown, setShown] = useState<{ rect: DOMRect; focus: boolean } | null>(null)
  useEffect(() => {
    if (!shown) return
    const hide = () => setShown(null)
    window.addEventListener('scroll', hide, true)
    window.addEventListener('resize', hide)
    return () => {
      window.removeEventListener('scroll', hide, true)
      window.removeEventListener('resize', hide)
    }
  }, [shown])
  const show = (e: MouseEvent<HTMLElement> | FocusEvent<HTMLElement>) => {
    const row = e.currentTarget
    const name = row.querySelector<HTMLElement>('[data-name]')
    if (name && name.scrollWidth > name.clientWidth)
      setShown({ rect: row.getBoundingClientRect(), focus: e.type === 'focus' })
  }
  const hide = () => setShown(null)
  return {
    handlers: { onMouseEnter: show, onFocus: show, onMouseLeave: hide, onBlur: hide },
    overlay: (content: ReactNode) =>
      shown &&
      createPortal(
        <div
          aria-hidden
          data-testid="name-reveal"
          style={{
            top: shown.rect.top,
            left: shown.rect.left,
            height: shown.rect.height,
            minWidth: shown.rect.width,
            maxWidth: window.innerWidth - shown.rect.left - 8,
          }}
          className={cn(
            'pointer-events-none fixed z-40 flex items-center gap-2 rounded-[9px] bg-surface-2 px-2 whitespace-nowrap text-text shadow-card',
            shown.focus && 'outline-2 outline-offset-2 outline-accent',
          )}
        >
          {content}
        </div>,
        document.body,
      ),
  }
}

// gutter keeps row counts aligned when some rows of the list have a partitions toggle.
function RelationItem({
  rel,
  expanded,
  gutter,
}: {
  rel: Relation
  expanded: boolean
  gutter: boolean
}) {
  const { t } = useTranslation()
  const params = useParams({ strict: false })
  const isActive = (r: Relation) => params.schema === r.schema && params.table === r.name
  const [open, setOpen] = useState(() => rel.partitions.some(isActive))
  const showParts = rel.partitions.length > 0 && (open || expanded)

  return (
    <li>
      <div className="flex items-center">
        <RelationLink rel={rel} />
        {rel.partitions.length > 0 ? (
          <button
            type="button"
            aria-expanded={showParts}
            aria-label={t('tables.partitions', { count: rel.partitions.length })}
            onClick={() => setOpen(!open)}
            className="grid size-7 shrink-0 place-items-center rounded-[8px] text-muted hover:bg-surface-2 hover:text-text"
          >
            <ChevronRight className={cn('size-4 transition-transform', showParts && 'rotate-90')} />
          </button>
        ) : (
          gutter && <span aria-hidden className="size-7 shrink-0" />
        )}
      </div>
      {showParts && (
        <ul className="ml-4 flex flex-col gap-0.5 border-l border-border pl-1">
          {rel.partitions.map((p) => (
            <li key={p.name}>
              <RelationLink rel={p} />
            </li>
          ))}
        </ul>
      )}
    </li>
  )
}

function RelationLink({ rel }: { rel: Relation }) {
  const connectionId = useConnectionId()
  const { t } = useTranslation()
  const fmt = useFormat()
  const reveal = useReveal()
  const Icon = kindIcon[rel.kind] ?? Table2
  return (
    <>
      <TableContextMenu schema={rel.schema} table={rel.name} kind={rel.kind}>
        <Link
          {...reveal.handlers}
          to="/c/$connectionId/tables/$schema/$table"
          params={{ connectionId, schema: rel.schema, table: rel.name }}
          title={rel.comment ?? undefined}
          className={cn(
            'flex h-8 min-w-0 flex-1 items-center gap-2 rounded-[9px] px-2 text-muted',
            'transition-colors hover:bg-surface-2 hover:text-text data-[state=open]:bg-surface-2 data-[state=open]:text-text',
          )}
          activeOptions={{ exact: true, includeSearch: false }}
          activeProps={{ className: 'bg-surface-2 !text-text [&_svg]:text-accent-ink' }}
        >
          <Icon className="size-4 shrink-0" aria-label={t(`tables.kind.${rel.kind}`)} />
          <span data-name className="min-w-0 flex-1 truncate font-mono text-[12.5px]">
            {rel.name}
          </span>
          {rel.estimated_rows !== null && (
            <span className="shrink-0 font-mono text-[11px] text-muted">
              {fmt.approx(rel.estimated_rows)}
            </span>
          )}
        </Link>
      </TableContextMenu>
      {reveal.overlay(
        <>
          <Icon className="size-4 shrink-0 text-muted" />
          <span className="truncate font-mono text-[12.5px]">{rel.name}</span>
        </>,
      )}
    </>
  )
}

/** Starred tables of the connection, above the list (any schema). */
function Favorites() {
  const { t } = useTranslation()
  const connectionId = useConnectionId()
  const { favorites } = useConnectionTables(connectionId)
  const known = useCompletions().data?.tables
  // Tables dropped or renamed since they were starred are left out (and kept, in case they return).
  const list = favorites.filter(
    (f) => !known || known.some((k) => k.schema === f.schema && k.name === f.table),
  )
  if (list.length === 0) return null
  return (
    <section aria-labelledby="favorites-heading" className="mb-2 border-b border-border pb-2">
      <h2 id="favorites-heading" className="section-label px-2 pt-1 pb-1">
        {t('tables.favorites')}
      </h2>
      <ul className="flex flex-col gap-0.5">
        {list.map((f) => (
          <FavoriteItem key={`${f.schema}.${f.table}`} schema={f.schema} table={f.table} />
        ))}
      </ul>
    </section>
  )
}

function FavoriteItem({ schema, table }: { schema: string; table: string }) {
  const connectionId = useConnectionId()
  const reveal = useReveal()
  // Favorites only remember schema and name; the kind comes from the relations of their schema.
  const kind = useRelations(schema).data?.find((r) => r.name === table)?.kind ?? ''
  const label = (
    <>
      {schema !== 'public' && <span className="text-muted">{schema}.</span>}
      {table}
    </>
  )
  return (
    <li className="flex items-center">
      <TableContextMenu schema={schema} table={table} kind={kind}>
        <Link
          {...reveal.handlers}
          to="/c/$connectionId/tables/$schema/$table"
          params={{ connectionId, schema, table }}
          className="flex h-8 min-w-0 flex-1 items-center gap-2 rounded-[9px] px-2 text-muted transition-colors hover:bg-surface-2 hover:text-text data-[state=open]:bg-surface-2 data-[state=open]:text-text"
          activeOptions={{ exact: true, includeSearch: false }}
          activeProps={{ className: 'bg-surface-2 !text-text' }}
        >
          <Star className="size-4 shrink-0 fill-current text-accent-ink" aria-hidden />
          <span data-name className="min-w-0 flex-1 truncate font-mono text-[12.5px]">
            {label}
          </span>
        </Link>
      </TableContextMenu>
      {reveal.overlay(
        <>
          <Star className="size-4 shrink-0 fill-current text-accent-ink" />
          <span className="truncate font-mono text-[12.5px]">{label}</span>
        </>,
      )}
    </li>
  )
}
