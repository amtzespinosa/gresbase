import { useQuery } from '@tanstack/react-query'
import { useNavigate, useParams, useSearch } from '@tanstack/react-router'
import { ChevronLeft, ChevronRight, Code, Lock, LockOpen, Rows3, SearchX } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { EmptyState } from '@/components/EmptyState'
import { ErrorPanel } from '@/components/ErrorPanel'
import { DataGrid, type GridColumn, type GridGutter } from '@/components/grid/DataGrid'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { IconButton } from '@/components/ui/IconButton'
import { SegmentedControl } from '@/components/ui/SegmentedControl'
import { Select } from '@/components/ui/Select'
import { Tooltip } from '@/components/ui/Tooltip'
import { errorMessage } from '@/lib/api/errors'
import {
  exportUrl,
  fetchCellValue,
  fetchRowsSql,
  useRowCount,
  useRows,
  useRowsByKey,
  useTable,
} from '@/lib/api/rows'
import type { Cell, CellMap, Query, Table } from '@/lib/api/types.gen'
import { useConnectionId } from '@/lib/api/connections'
import { useReadOnly } from '@/lib/api/queries'
import { useFormat } from '@/lib/i18n/format'
import { cn } from '@/lib/cn'
import { usePrefs } from '@/lib/prefs/store'
import { rowKey } from './changes/queue'
import { useTableEditing, useWritable } from './changes/useTableEditing'
import { type FkTarget, FkSheet } from './FkSheet'
import { RelationsTab, StructureTab } from './StructureTab'
import { ImportButton } from './ImportButton'
import { ColumnsPanel } from './ColumnsPanel'
import { isSameTable, useTableTabs } from './tabs'
import { ApiError } from '@/lib/api/client'
import { useTableView } from './view'
import { TableActions } from './TableActions'
import { TableToolbar } from './TableToolbar'
import {
  type TableSearch,
  type TableTab,
  effectiveSort,
  nextSort,
  pageSizes,
  toQuery,
} from './tableSearch'

const route = '/c/$connectionId/tables/$schema/$table' as const

/** The main card of the Tables screen: header, tabs, toolbar, grid and pagination. */
export function TableView() {
  const { t } = useTranslation()
  const fmt = useFormat()
  const { connectionId, schema, table } = useParams({ from: route })
  const search = useSearch({ from: route })
  const navigate = useNavigate()
  const meta = useTable(schema, table)
  const readOnly = useReadOnly() === true
  const found = meta.isSuccess
  useEffect(() => {
    if (!found) return
    usePrefs.getState().addRecent({ connection: connectionId, kind: 'table', schema, table })
    useTableTabs.getState().openTab(connectionId, { schema, table })
  }, [found, connectionId, schema, table])
  // A tab of a table that no longer exists (dropped, renamed, moved) goes away when opened.
  const gone = meta.error instanceof ApiError && meta.error.code === 'not_found'
  useEffect(() => {
    if (gone)
      useTableTabs.getState().closeTabs(connectionId, (r) => !isSameTable(r, { schema, table }))
  }, [gone, connectionId, schema, table])

  /** Changes the URL state; anything but paging goes back to the first page. */
  const update = (patch: Partial<TableSearch>, keepPage = false) =>
    navigate({
      to: route,
      params: { connectionId, schema, table },
      search: (s) => ({
        ...s,
        ...(keepPage ? {} : { cursors: [], offset: 0 }),
        ...patch,
      }),
    })

  return (
    <>
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border px-5">
        <h1 className="min-w-0 truncate text-[19px] font-semibold">
          <span className="font-normal text-muted">{schema} / </span>
          <span className="font-mono">{table}</span>
        </h1>
        {meta.data?.estimated_rows != null && (
          <span className="shrink-0 font-mono text-[12.5px] text-muted">
            {t('grid.rowsApprox', {
              count: meta.data.estimated_rows,
              n: fmt.approx(meta.data.estimated_rows),
            })}
          </span>
        )}
        {meta.data && (!meta.data.has_primary_key || readOnly) && (
          <ReadOnlyBadge table={meta.data} />
        )}
        <SegmentedControl<TableTab>
          className="ml-auto shrink-0"
          label={t('table.tabs')}
          value={search.tab}
          onChange={(tab) => update({ tab }, true)}
          options={(['data', 'structure', 'relations'] as const).map((v) => ({
            value: v,
            label: t(`table.tab.${v}`),
          }))}
        />
        {meta.data && (
          <TableActions
            schema={schema}
            table={table}
            kind={meta.data.kind}
            comment={meta.data.comment}
            className="-mr-2"
          />
        )}
      </header>
      {meta.isError ? (
        <ErrorPanel error={meta.error} onRetry={() => void meta.refetch()} />
      ) : !meta.data ? (
        <p className="p-5 text-muted">{t('common.loading')}</p>
      ) : search.tab === 'data' ? (
        <DataTab key={`${schema}.${table}`} meta={meta.data} search={search} update={update} />
      ) : search.tab === 'structure' ? (
        <StructureTab meta={meta.data} />
      ) : (
        <RelationsTab meta={meta.data} />
      )}
    </>
  )
}

function ReadOnlyBadge({ table }: { table: Table }) {
  const { t } = useTranslation()
  const view = table.kind !== 'table' && table.kind !== 'partitioned_table'
  const hint = view
    ? 'table.readOnlyViewHint'
    : table.has_primary_key
      ? 'table.readOnlyModeHint'
      : 'table.noPkHint'
  return (
    <Tooltip content={t(hint)}>
      <Badge tone="accent" tabIndex={0} className="shrink-0">
        <Lock className="size-3" />
        {t('table.readOnly')}
      </Badge>
    </Tooltip>
  )
}

interface DataTabProps {
  meta: Table
  search: TableSearch
  update: (patch: Partial<TableSearch>, keepPage?: boolean) => void
}

function DataTab({ meta, search, update }: DataTabProps) {
  const { t } = useTranslation()
  const fmt = useFormat()
  const keyset = meta.has_primary_key
  const sort = effectiveSort(search.sort, meta.primary_key)
  const query = toQuery({ ...search, sort }, keyset)
  const page = useRows(meta.schema, meta.name, query)
  const count = useRowCount(meta.schema, meta.name)
  const [sqlOpen, setSqlOpen] = useState(false)

  const columns = useMemo<GridColumn[]>(() => {
    const fk = new Set(meta.foreign_keys.flatMap((f) => f.columns))
    const pk = new Set(meta.primary_key)
    const byName = new Map(meta.columns.map((c) => [c.name, c]))
    return (page.data?.columns ?? []).map((c) => {
      const m = byName.get(c.name)
      return {
        name: c.name,
        type: c.type,
        pk: pk.has(c.name),
        fk: fk.has(c.name),
        json: !!m && !m.is_array && (m.base_type === 'json' || m.base_type === 'jsonb'),
      }
    })
  }, [page.data?.columns, meta])

  const pageRows = page.data?.rows ?? []
  const pk = meta.primary_key
  const pkOf = (r: Cell[]): CellMap =>
    Object.fromEntries(pk.map((n) => [n, r[columns.findIndex((c) => c.name === n)] ?? null]))
  const tv = useTableView(useConnectionId(), meta.schema, meta.name)
  const { view: pins, toggleColumn, toggleRow, unpinAll } = tv
  const [resets, setResets] = useState(0)
  // Pinned rows are shown whatever the page and filters; a pin whose row is gone just disappears.
  const pinnedPks = keyset
    ? pins.rows.filter((r) => Object.keys(r).length === pk.length && pk.every((n) => n in r))
    : []
  const pinnedPages = useRowsByKey(meta.schema, meta.name, pinnedPks)
  const pinnedRows = pinnedPks.flatMap((p, i) => {
    const data = pinnedPages[i]?.data
    const first = data?.rows[0]
    const fetched =
      data && first
        ? columns.map((c) => first[data.columns.findIndex((x) => x.name === c.name)] ?? null)
        : undefined
    const row = fetched ?? pageRows.find((r) => rowKey(pkOf(r)) === rowKey(p))
    return row ? [row] : []
  })
  const pinnedKeys = new Set(pinnedRows.map((r) => rowKey(pkOf(r))))
  /** Pinned rows first, then the page without them. */
  const rows = [...pinnedRows, ...pageRows.filter((r) => !pinnedKeys.has(rowKey(pkOf(r))))]
  const loadFull = keyset
    ? (row: number, col: number) => {
        const pk: Record<string, Cell> = {}
        for (const name of meta.primary_key)
          pk[name] = rows[row]?.[columns.findIndex((c) => c.name === name)] ?? null
        return fetchCellValue(meta.schema, meta.name, pk, columns[col]?.name ?? '')
      }
    : undefined
  const editing = useTableEditing({
    meta,
    columns,
    pageRows: rows,
    pinnedCount: pinnedRows.length,
    loadFull,
  })
  const anyPinned = pins.columns.length > 0 || pinnedPks.length > 0

  /** Row lock: a 14 px icon in a 28 px button (comfortable target, WCAG 2.5.8 asks for 24 px). */
  const rowLock = 'size-7 [&_svg]:size-3.5'
  const pinCell = (row: number) => {
    const i = editing.pageIndex(row)
    const r = i === null ? undefined : rows[i]
    if (i === null || !r) return null
    if (!keyset)
      return (
        <IconButton
          label={t('pin.noPk')}
          icon={<LockOpen />}
          aria-disabled
          className={cn(rowLock, 'opacity-0 group-hover:opacity-40 focus-visible:opacity-40')}
        />
      )
    const isPinned = i < pinnedRows.length
    return (
      <IconButton
        tooltip={false}
        label={t(isPinned ? 'pin.unpinRow' : 'pin.pinRow', { n: row + 1 })}
        icon={isPinned ? <Lock className="text-accent-ink" /> : <LockOpen />}
        aria-pressed={isPinned}
        onClick={() => toggleRow(pkOf(r))}
        className={cn(
          rowLock,
          !isPinned && 'opacity-0 group-hover:opacity-100 focus-visible:opacity-100',
        )}
      />
    )
  }
  const base = editing.gutter
  const gutter: GridGutter = base
    ? {
        ...base,
        width: base.width + 36,
        cell: (row) => (
          <>
            {base.cell(row)}
            {pinCell(row)}
          </>
        ),
      }
    : { width: 48, header: <span className="sr-only">{t('pin.rows')}</span>, cell: pinCell }
  const writable = useWritable(meta)
  const [fkTarget, setFkTarget] = useState<FkTarget | null>(null)
  const openFk = ({ row, col }: { row: number; col: number }) => {
    const name = columns[col]?.name
    const fk = meta.foreign_keys.find((f) => name !== undefined && f.columns.includes(name))
    if (!fk) return
    const values = fk.columns.map(
      (c) => editing.rows[row]?.[columns.findIndex((gc) => gc.name === c)] ?? null,
    )
    if (values.every((v) => v !== null)) setFkTarget({ fk, values })
  }

  const pageIndex = keyset ? search.cursors.length : search.offset / search.size
  const from = pageIndex * search.size + 1
  const to = pageIndex * search.size + pageRows.length
  const filtersKey = JSON.stringify([search.filters, search.logic])
  const exact =
    count.data &&
    count.variables &&
    JSON.stringify([count.variables.filters, count.variables.logic]) === filtersKey
      ? count.data.count
      : undefined
  const total =
    exact !== undefined
      ? fmt.number(exact)
      : search.filters.length === 0 && meta.estimated_rows != null
        ? fmt.approx(meta.estimated_rows)
        : undefined

  const next = () =>
    keyset
      ? page.data?.next_cursor &&
        update({ cursors: [...search.cursors, page.data.next_cursor] }, true)
      : update({ offset: search.offset + search.size }, true)
  const prev = () =>
    keyset
      ? update({ cursors: search.cursors.slice(0, -1) }, true)
      : update({ offset: Math.max(0, search.offset - search.size) }, true)

  return (
    <>
      <TableToolbar
        columns={meta.columns}
        search={search}
        update={update}
        exportHref={(format) => exportUrl(meta.schema, meta.name, query, format)}
        actions={
          <>
            <Button size="sm" onClick={() => setSqlOpen(true)}>
              <Code className="size-4" />
              {t('grid.viewSql')}
            </Button>
            <ImportButton meta={meta} />
            <ColumnsPanel
              columns={columns.map((c) => c.name)}
              hidden={pins.hidden}
              order={pins.order}
              onToggle={tv.toggleHidden}
              onOrder={tv.setOrder}
              onReset={() => {
                tv.reset()
                setResets((n) => n + 1)
              }}
            />
            {anyPinned && (
              <Button size="sm" onClick={unpinAll}>
                <LockOpen className="size-4" />
                {t('pin.unpinAll')}
              </Button>
            )}
            {editing.actions}
          </>
        }
      />
      {page.isError ? (
        <ErrorPanel error={page.error} onRetry={() => void page.refetch()} />
      ) : (
        <div className="relative flex min-h-0 flex-1 flex-col">
          <DataGrid
            key={`${meta.schema}.${meta.name}.${resets}`}
            label={t('grid.label', { table: meta.name })}
            columns={columns}
            focusColumn={search.col}
            rows={editing.rows}
            sort={sort}
            onSort={(column, multi) => {
              const next = nextSort(sort, column, multi)
              // Under the default order, going back to it would change nothing: go ascending.
              update({
                sort:
                  next.length === 0 && search.sort.length === 0 ? [{ column, dir: 'asc' }] : next,
              })
            }}
            loadFull={editing.loadFull}
            rowOffset={from - 1}
            edit={editing.edit}
            gutter={gutter}
            pinnedColumns={pins.columns}
            onPinColumn={toggleColumn}
            pinnedRows={pinnedRows.length}
            hiddenColumns={pins.hidden}
            columnOrder={pins.order}
            columnWidths={pins.widths}
            onColumnWidthsChange={tv.setWidths}
            onHideColumn={tv.toggleHidden}
            onSortColumn={(column, dir) => update({ sort: [{ column, dir }] })}
            table={{ schema: meta.schema, name: meta.name }}
            active={editing.active}
            onActiveChange={editing.onActiveChange}
            rowSelected={editing.rowSelected}
            onRowClick={editing.onRowClick}
            onFkClick={openFk}
          />
          {page.isPending && (
            <p className="absolute inset-x-0 top-12 text-center text-muted">
              {t('common.loading')}
            </p>
          )}
          {page.isSuccess && editing.rows.length === 0 && (
            <div className="absolute inset-x-0 top-12 flex">
              {search.filters.length ? (
                <EmptyState icon={<SearchX />} title={t('grid.noMatches')}>
                  <Button size="sm" className="mt-2" onClick={() => update({ filters: [] })}>
                    {t('grid.clearFilters')}
                  </Button>
                </EmptyState>
              ) : (
                <EmptyState
                  icon={<Rows3 />}
                  title={t('grid.empty')}
                  hint={writable ? t('grid.emptyHint') : undefined}
                />
              )}
            </div>
          )}
          {editing.overlays}
        </div>
      )}
      <footer className="flex h-12 shrink-0 items-center gap-2 border-t border-border px-4 text-muted">
        <span className="font-mono text-[12.5px]" aria-live="polite">
          {pageRows.length === 0
            ? t('grid.noRows')
            : total
              ? t('grid.rangeOf', { from: fmt.number(from), to: fmt.number(to), total })
              : t('grid.range', { from: fmt.number(from), to: fmt.number(to) })}
        </span>
        {exact === undefined && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => count.mutate(query)}
            disabled={count.isPending}
          >
            {count.isPending ? t('common.loading') : t('grid.exactCount')}
          </Button>
        )}
        <div className="ml-auto flex items-center gap-1">
          <label className="sr-only" htmlFor="page-size">
            {t('grid.pageSize')}
          </label>
          <Select
            id="page-size"
            value={String(search.size)}
            onValueChange={(v) => update({ size: Number(v) as TableSearch['size'] })}
            options={pageSizes.map((n) => ({ value: String(n), label: t('grid.perPage', { n }) }))}
            className="h-8 w-auto px-2 font-mono text-[12.5px]"
          />
          <IconButton
            label={t('grid.prev')}
            icon={<ChevronLeft />}
            onClick={prev}
            disabled={pageIndex === 0}
          />
          <IconButton
            label={t('grid.next')}
            icon={<ChevronRight />}
            onClick={next}
            disabled={!page.data?.has_more || page.isPlaceholderData}
          />
        </div>
      </footer>
      <FkSheet target={fkTarget} onClose={() => setFkTarget(null)} />
      <SqlDialog
        open={sqlOpen}
        onOpenChange={setSqlOpen}
        schema={meta.schema}
        table={meta.name}
        query={query}
      />
    </>
  )
}

function SqlDialog({
  open,
  onOpenChange,
  schema,
  table,
  query,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  schema: string
  table: string
  query: Query
}) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const connectionId = useConnectionId()
  const sql = useQuery({
    queryKey: ['rows-sql', schema, table, query],
    queryFn: () => fetchRowsSql(schema, table, query),
    enabled: open,
  })
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={t('grid.sqlTitle')}
      description={t('grid.sqlDescription')}
      footer={
        <Button
          variant="primary"
          disabled={!sql.data}
          onClick={() =>
            sql.data &&
            navigate({
              to: '/c/$connectionId/sql',
              params: { connectionId },
              search: { sql: sql.data.sql },
            })
          }
        >
          {t('grid.openInEditor')}
        </Button>
      }
    >
      {sql.isError ? (
        <p className="text-danger">{errorMessage(sql.error, t)}</p>
      ) : (
        <pre className="max-h-80 overflow-auto rounded-[var(--radius-control)] bg-surface-2 p-3 font-mono text-[12.5px] whitespace-pre-wrap">
          {sql.data?.sql ?? t('common.loading')}
        </pre>
      )}
    </Dialog>
  )
}
