import { useNavigate, useSearch } from '@tanstack/react-router'
import {
  Check,
  ChevronDown,
  Columns3,
  Eye,
  Loader2,
  RotateCcw,
  ScanSearch,
  Search,
  Square,
  Table2,
} from 'lucide-react'
import { DropdownMenu as M } from 'radix-ui'
import { type FormEvent, type ReactNode, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { EmptyState } from '@/components/EmptyState'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { CheckboxField } from '@/components/ui/Checkbox'
import { Input } from '@/components/ui/Input'
import { useConnectionId } from '@/lib/api/connections'
import { errorMessage } from '@/lib/api/errors'
import { useSchemas } from '@/lib/api/queries'
import { useCompletions } from '@/lib/api/sql'
import type { SearchMatch } from '@/lib/api/types.gen'
import { cn } from '@/lib/cn'
import { eqFilters, type GridFilter } from '@/features/tables/tableSearch'
import { highlight, type StructureHit, structureHits } from './structure'
import { type TableResult, useGlobalSearch } from './useGlobalSearch'

/** Search every table of the connection: names (structure) and values (data), streamed by table. */
export function SearchScreen() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const connectionId = useConnectionId()
  const { q = '', schemas = [] } = useSearch({ from: '/c/$connectionId/search' })
  const [includeLarge, setIncludeLarge] = useState(false)
  const search = useGlobalSearch(q, schemas, includeLarge)
  const tables = useCompletions().data?.tables ?? []
  const structure = structureHits(tables, q, schemas)

  const setSearch = (patch: { q?: string; schemas?: string[] }) =>
    void navigate({
      to: '/c/$connectionId/search',
      params: { connectionId },
      search: (s) => ({ ...s, ...patch }),
      replace: patch.q === undefined,
    })
  const openTable = (
    schema: string,
    table: string,
    extra: { filters?: GridFilter[]; col?: string },
  ) =>
    void navigate({
      to: '/c/$connectionId/tables/$schema/$table',
      params: { connectionId, schema, table },
      search: extra,
    })
  const openRow = (r: TableResult, m: SearchMatch) => {
    const pk = r.primary_key ?? []
    const filters: GridFilter[] =
      pk.length > 0 && m.key
        ? eqFilters(
            pk,
            pk.map((k) => m.key?.[k]),
          )
        : m.value
          ? [{ column: m.column, op: 'eq', value: m.value }]
          : [{ column: m.column, op: 'contains', value: q }]
    openTable(r.schema ?? '', r.table ?? '', { filters, col: m.column })
  }

  const running = search.status === 'running'
  const searched = q.trim().length >= 2
  return (
    <Card className="flex min-w-0 flex-1 flex-col">
      <SearchForm
        // A new term in the URL (back, the palette) starts the box over with it.
        key={q}
        initial={q}
        onSubmit={(term) => setSearch({ q: term })}
      >
        <SchemaFilter value={schemas} onChange={(s) => setSearch({ schemas: s })} />
        <CheckboxField
          label={t('search.includeLarge')}
          checked={includeLarge}
          onChange={setIncludeLarge}
        />
      </SearchForm>

      {!searched ? (
        <EmptyState
          icon={<ScanSearch />}
          title={t('search.emptyTitle')}
          hint={t('search.emptyHint')}
        />
      ) : (
        <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-5 py-4">
          <Progress search={search} />

          {structure.length > 0 && (
            <section aria-labelledby="search-structure" className="flex flex-col gap-2">
              <h2 id="search-structure" className="section-label">
                {t('search.structure')}
              </h2>
              <ul className="flex flex-col">
                {structure.map((h) => (
                  <li key={`${h.schema}.${h.table}.${h.column ?? ''}`}>
                    <StructureRow
                      hit={h}
                      term={q}
                      onOpen={() => openTable(h.schema, h.table, h.column ? { col: h.column } : {})}
                    />
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section aria-labelledby="search-data" className="flex flex-col gap-3">
            <h2 id="search-data" className="section-label">
              {t('search.data')}
            </h2>
            {search.results.length === 0 && !running && search.status !== 'error' && (
              <p className="text-muted">{t('search.noRows')}</p>
            )}
            {search.results.map((r) => (
              <div
                key={`${r.schema}.${r.table}`}
                className="overflow-hidden rounded-[var(--radius-control)] border border-border"
              >
                <div className="flex items-center gap-2 border-b border-border bg-surface-2 px-3 py-2">
                  <Table2 className="size-4 text-muted" aria-hidden />
                  <span className="font-mono">
                    <span className="text-muted">{r.schema}.</span>
                    {r.table}
                  </span>
                  <span className="ml-auto text-[12px] text-muted">
                    {t('search.rows', { count: r.rows?.length ?? 0 })}
                  </span>
                </div>
                <ul>
                  {(r.rows ?? []).map((m, i) => (
                    <li key={i} className="border-b border-border last:border-0">
                      <button
                        type="button"
                        onClick={() => openRow(r, m)}
                        className="flex w-full cursor-pointer items-baseline gap-3 px-3 py-2 text-left hover:bg-surface-2 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent"
                      >
                        <span className="w-40 shrink-0 truncate font-mono text-[12px] text-muted">
                          {m.column}
                        </span>
                        <Marked
                          text={m.snippet}
                          term={m.value ? m.snippet : q}
                          className="min-w-0 flex-1 font-mono text-[12.5px] break-words"
                        />
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </section>

          {search.skipped.length > 0 && (
            <details className="flex flex-col gap-2">
              <summary className="cursor-pointer text-muted">
                {t('search.skipped', { count: search.skipped.length })}
              </summary>
              <ul className="mt-2 flex flex-col gap-1">
                {search.skipped.map((s) => (
                  <li key={`${s.schema}.${s.table}`} className="flex items-center gap-3">
                    <span className="font-mono">
                      <span className="text-muted">{s.schema}.</span>
                      {s.table}
                    </span>
                    <span className="text-muted">{t(`search.reason.${s.reason ?? 'error'}`)}</span>
                    {s.reason === 'timeout' && (
                      <Button
                        size="sm"
                        onClick={() =>
                          search.retry({ schema: s.schema ?? '', table: s.table ?? '' })
                        }
                      >
                        <RotateCcw className="size-3.5" aria-hidden />
                        {t('search.retry')}
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}
    </Card>
  )
}

function SearchForm({
  initial,
  onSubmit,
  children,
}: {
  initial: string
  onSubmit: (term: string) => void
  children: ReactNode
}) {
  const { t } = useTranslation()
  const [draft, setDraft] = useState(initial)
  return (
    <form
      onSubmit={(e: FormEvent) => {
        e.preventDefault()
        onSubmit(draft.trim())
      }}
      className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border px-5 py-3"
    >
      <h1 className="sr-only">{t('search.title')}</h1>
      <div className="relative min-w-[220px] flex-1">
        <Search
          className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted"
          aria-hidden
        />
        <Input
          type="search"
          aria-label={t('search.label')}
          placeholder={t('search.placeholder')}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          autoFocus
          className="pl-9"
        />
      </div>
      {children}
      <Button type="submit" variant="primary" disabled={draft.trim().length < 2}>
        {t('search.submit')}
      </Button>
    </form>
  )
}

function Progress({ search }: { search: ReturnType<typeof useGlobalSearch> }) {
  const { t } = useTranslation()
  if (search.status === 'error')
    return (
      <p role="alert" className="text-danger">
        {errorMessage(search.error, t)}
      </p>
    )
  return (
    <div role="status" className="flex flex-wrap items-center gap-3 text-muted">
      {search.status === 'running' && <Loader2 className="size-4 animate-spin" aria-hidden />}
      <span>
        {search.status === 'running'
          ? t('search.progress', { done: search.finished, total: search.total })
          : t('search.summary', {
              count: search.found,
              tables: t('search.tableCount', { count: search.results.length }),
            })}
      </span>
      {search.status === 'canceled' && <span>{t('search.canceled')}</span>}
      {search.truncated && <span>{t('search.truncated')}</span>}
      {search.skippedLarge > 0 && (
        <span>{t('search.skippedLarge', { count: search.skippedLarge })}</span>
      )}
      {search.status === 'running' && (
        <Button size="sm" onClick={search.cancel}>
          <Square className="size-3.5" aria-hidden />
          {t('search.cancel')}
        </Button>
      )}
    </div>
  )
}

function StructureRow({
  hit,
  term,
  onOpen,
}: {
  hit: StructureHit
  term: string
  onOpen: () => void
}) {
  const { t } = useTranslation()
  const view = hit.kind === 'view' || hit.kind === 'materialized_view'
  const icon = hit.column ? <Columns3 /> : view ? <Eye /> : <Table2 />
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-full cursor-pointer items-center gap-2 rounded-[8px] px-2 py-1.5 text-left hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-accent [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-muted"
    >
      {icon}
      <span className="min-w-0 truncate font-mono">
        <span className="text-muted">{hit.schema}.</span>
        {hit.column ? (
          <>
            {hit.table}
            <span className="text-muted">.</span>
            <Marked text={hit.column} term={term} />
          </>
        ) : (
          <Marked text={hit.table} term={term} />
        )}
      </span>
      <span className="ml-auto shrink-0 text-[12px] text-muted">
        {t(hit.column ? 'search.kind.column' : `search.kind.${view ? 'view' : 'table'}`)}
      </span>
    </button>
  )
}

/** `text` with the matches of `term` marked. */
function Marked({ text, term, className }: { text: string; term: string; className?: string }) {
  return (
    <span className={className}>
      {highlight(text, term).map((p, i) =>
        p.match ? (
          <mark key={i} className="rounded-[3px] bg-accent-tint px-0.5 text-text">
            {p.text}
          </mark>
        ) : (
          p.text
        ),
      )}
    </span>
  )
}

/** All schemas by default; any subset kept in the URL. */
function SchemaFilter({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const { t } = useTranslation()
  const all = useSchemas().data ?? []
  const label =
    value.length === 0
      ? t('search.allSchemas')
      : value.length === 1
        ? value[0]
        : t('search.someSchemas', { count: value.length })
  const toggle = (s: string) =>
    onChange(value.includes(s) ? value.filter((x) => x !== s) : [...value, s].sort())
  return (
    <M.Root>
      <M.Trigger asChild>
        <Button aria-label={t('search.schemas')}>
          <span className="max-w-40 truncate">{label}</span>
          <ChevronDown className="size-4" aria-hidden />
        </Button>
      </M.Trigger>
      <M.Portal>
        <M.Content
          align="end"
          sideOffset={6}
          className="z-50 max-h-80 min-w-52 overflow-y-auto rounded-[var(--radius-control)] border border-border bg-surface p-1 shadow-card"
        >
          <M.CheckboxItem
            checked={value.length === 0}
            onCheckedChange={() => onChange([])}
            onSelect={(e) => e.preventDefault()}
            className={itemClass}
          >
            <Tick on={value.length === 0} />
            {t('search.allSchemas')}
          </M.CheckboxItem>
          <M.Separator className="my-1 h-px bg-border" />
          {all.map((s) => (
            <M.CheckboxItem
              key={s}
              checked={value.includes(s)}
              onCheckedChange={() => toggle(s)}
              onSelect={(e) => e.preventDefault()}
              className={cn(itemClass, 'font-mono')}
            >
              <Tick on={value.includes(s)} />
              {s}
            </M.CheckboxItem>
          ))}
        </M.Content>
      </M.Portal>
    </M.Root>
  )
}

const itemClass =
  'flex min-h-9 cursor-pointer items-center gap-2 rounded-[8px] px-2 py-1 text-text outline-none data-[highlighted]:bg-surface-2'

const Tick = ({ on }: { on: boolean }) => (
  <Check className={cn('size-4 shrink-0', on ? 'text-accent-ink' : 'invisible')} aria-hidden />
)
