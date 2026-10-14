import { Maximize2, Plus, RotateCcw, Trash2, X } from 'lucide-react'
import { Checkbox } from '@/components/ui/Checkbox'
import { type ReactNode, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { isTruncated } from '@/components/grid/cellValue'
import type {
  CellPos,
  GridColumn,
  GridEditing,
  GridGutter,
  RowClick,
} from '@/components/grid/DataGrid'
import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { IconButton } from '@/components/ui/IconButton'
import { errorMessage } from '@/lib/api/errors'
import { useReadOnly } from '@/lib/api/queries'
import type { Cell, CellMap, Column, Table } from '@/lib/api/types.gen'
import { toast } from '@/lib/toast'
import { editorKind, pastedValue, valueError } from './editors'
import { PendingChanges } from './PendingChanges'
import {
  type ExistingRow,
  type QueueAction,
  type RowKey,
  newInsertId,
  rowKey,
  tableKey,
  useChanges,
  useQueue,
} from './queue'
import { RowSheet, type RowSheetTarget } from './RowSheet'
import { CellEditor } from './ValueInput'

type DisplayRow =
  | { kind: 'new'; id: string; values: CellMap }
  | { kind: 'existing'; key: RowKey; row: ExistingRow; current: CellMap }

interface Options {
  meta: Table
  columns: GridColumn[]
  /** Rows as loaded: the pinned ones first, then the current page. */
  pageRows: Cell[][]
  /** How many of `pageRows` are pinned (new rows go after them). */
  pinnedCount?: number
  loadFull?: (row: number, col: number) => Promise<Cell>
}

/** Can rows of this table be edited from the grid? */
export function useWritable(meta: Table) {
  const readOnly = useReadOnly()
  return (
    meta.has_primary_key &&
    (meta.kind === 'table' || meta.kind === 'partitioned_table') &&
    readOnly === false
  )
}

/**
 * The editing layer of the Data tab: rows with the queue applied, grid editing props, the selection
 * gutter, toolbar buttons and the overlays (pill, diff, row panel). Read-only tables get the plain
 * page back.
 */
export function useTableEditing({ meta, columns, pageRows, pinnedCount = 0, loadFull }: Options) {
  const { t } = useTranslation()
  const writable = useWritable(meta)
  const key = tableKey(meta.schema, meta.name)
  const queue = useQueue(key)
  const dispatch = useChanges((s) => s.dispatch)
  const [active, setActive] = useState<CellPos>({ row: 0, col: 0 })
  const [editing, setEditing] = useState<(CellPos & { initial: Cell }) | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [sheet, setSheet] = useState<RowSheetTarget | null>(null)
  /** A paste that goes past the last row: its updates, and the extra rows to offer inserting. */
  const [pasteOffer, setPasteOffer] = useState<{ actions: QueueAction[]; extra: CellMap[] } | null>(
    null,
  )

  const metaCols = useMemo(() => {
    const byName = new Map(meta.columns.map((c) => [c.name, c]))
    return columns.map((c) => byName.get(c.name))
  }, [meta.columns, columns])

  const display = useMemo<DisplayRow[]>(() => {
    if (!writable) return []
    const news: DisplayRow[] = queue.inserts.map((r) => ({ kind: 'new', ...r }))
    const existing: DisplayRow[] = pageRows.map((r) => {
      const original: CellMap = {}
      columns.forEach((c, i) => (original[c.name] = r[i] ?? null))
      const pk: CellMap = {}
      for (const name of meta.primary_key) pk[name] = original[name] ?? null
      const k = rowKey(pk)
      return {
        kind: 'existing',
        key: k,
        row: { pk, original },
        current: { ...original, ...queue.updates[k]?.set },
      }
    })
    return [...existing.slice(0, pinnedCount), ...news, ...existing.slice(pinnedCount)]
  }, [writable, queue, pageRows, columns, meta.primary_key, pinnedCount])

  /** Selection key of each displayed row: the primary key (new rows: their id), else the index. */
  const selKeys = useMemo(() => {
    if (writable) return display.map((d) => (d.kind === 'new' ? d.id : d.key))
    const pkCols = meta.primary_key.map((n) => columns.findIndex((c) => c.name === n))
    return pageRows.map((r, i) =>
      pkCols.length && pkCols.every((c) => c >= 0)
        ? rowKey(
            Object.fromEntries(meta.primary_key.map((n, j) => [n, r[pkCols[j] ?? -1] ?? null])),
          )
        : `#${i}`,
    )
  }, [writable, display, meta.primary_key, columns, pageRows])
  /** Last clicked row, the start of a Shift+click range. */
  const lastRow = useRef<number | null>(null)
  const onRowClick = (row: number, { toggle, range }: RowClick) => {
    const k = selKeys[row]
    if (k === undefined) return
    const from = lastRow.current
    if (range && from !== null) {
      const span = selKeys.slice(Math.min(from, row), Math.max(from, row) + 1)
      setSelected((s) => new Set(toggle ? [...s, ...span] : span))
      return // the range keeps its start
    }
    lastRow.current = row
    setSelected((s) => {
      if (!toggle) return new Set([k])
      const n = new Set(s)
      if (n.has(k)) n.delete(k)
      else n.add(k)
      return n
    })
  }
  const rowSelected = (row: number) => selected.has(selKeys[row] ?? '')

  if (!writable) {
    return {
      rows: pageRows,
      loadFull,
      actions: null as ReactNode,
      overlays: null as ReactNode,
      pageIndex: (row: number): number | null => row,
      rowSelected,
      onRowClick,
    }
  }

  const newCount = queue.inserts.length
  /** Index in `pageRows` of a displayed row; null for new rows. */
  const pageIndex = (row: number): number | null =>
    row < pinnedCount ? row : row < pinnedCount + newCount ? null : row - newCount
  const rows = display.map((d) =>
    columns.map((c) => (d.kind === 'new' ? (d.values[c.name] ?? '') : (d.current[c.name] ?? null))),
  )
  const isDeleted = (d: DisplayRow | undefined) => d?.kind === 'existing' && d.key in queue.deletes
  const selKey = (d: DisplayRow) => (d.kind === 'new' ? d.id : d.key)

  const commit = (pos: CellPos, value: Cell) => {
    const d = display[pos.row]
    const col = columns[pos.col]
    if (!d || !col) return
    if (d.kind === 'new') dispatch(key, { type: 'setInsert', id: d.id, column: col.name, value })
    else dispatch(key, { type: 'set', row: d.row, values: { [col.name]: value } })
  }

  const canEdit = (row: number, col: number) => {
    const m = metaCols[col]
    return !!m && editorKind(m) !== null && !isDeleted(display[row])
  }

  /** Pasted cells go into the queue as typed text would, as one undo step. */
  const onPaste = (origin: CellPos, cols: number[], cells: string[][]) => {
    const actions: QueueAction[] = []
    const extra: CellMap[] = []
    let skipped = 0
    cells.forEach((line, i) => {
      const d = display[origin.row + i]
      const values: CellMap = {}
      line.forEach((text, j) => {
        const m = metaCols[cols[j] ?? -1]
        if (cols[j] === undefined) return // past the last column
        if (!m || editorKind(m) === null || isDeleted(d)) skipped++
        else values[m.name] = pastedValue(m, text)
      })
      if (!d) extra.push(values)
      else if (d.kind === 'new')
        for (const [column, value] of Object.entries(values))
          actions.push({ type: 'setInsert', id: d.id, column, value })
      else if (Object.keys(values).length) actions.push({ type: 'set', row: d.row, values })
    })
    if (skipped) toast({ message: t('clipboard.skipped', { count: skipped }) })
    if (extra.length) setPasteOffer({ actions, extra })
    else if (actions.length) dispatch(key, { type: 'batch', actions })
  }
  const finishPaste = (insert: boolean) => {
    if (!pasteOffer) return
    const inserts: QueueAction[] = insert
      ? pasteOffer.extra.map((values) => ({ type: 'insert', id: newInsertId(), values }))
      : []
    const actions = [...pasteOffer.actions, ...inserts]
    if (actions.length) dispatch(key, { type: 'batch', actions })
    setPasteOffer(null)
  }

  const edit: GridEditing = {
    onPaste,
    cellInvalid: (row, col) => {
      const d = display[row]
      const m = metaCols[col]
      if (!d || !m) return undefined
      const v = d.kind === 'new' ? d.values[m.name] : queue.updates[d.key]?.set[m.name]
      const err = valueError(m, v)
      return err ? t(`edit.invalid.${err}`) : undefined
    },
    rowState: (row) => {
      const d = display[row]
      return d?.kind === 'new' ? 'new' : isDeleted(d) ? 'deleted' : undefined
    },
    cellEdited: (row, col) => {
      const d = display[row]
      const name = columns[col]?.name
      return d?.kind === 'existing' && !!name && name in (queue.updates[d.key]?.set ?? {})
    },
    canEdit,
    onEdit: (pos) => {
      const value = rows[pos.row]?.[pos.col] ?? null
      if (!isTruncated(value)) return setEditing({ ...pos, initial: value })
      // A truncated value is edited in full: fetch it first.
      const d = display[pos.row]
      loadFull?.(pageIndex(pos.row) ?? -1, pos.col).then(
        (full) => d && setEditing({ ...pos, initial: full }),
        (err: unknown) => toast({ tone: 'danger', message: errorMessage(err, t) }),
      )
    },
    onSetNull: (pos) => {
      const m = metaCols[pos.col]
      if (m?.not_null) toast({ message: t('edit.notNullable', { column: m.name }) })
      else commit(pos, null)
    },
    editor: editing
      ? {
          row: editing.row,
          col: editing.col,
          node: metaCols[editing.col] && (
            <CellEditor
              key={`${editing.row}:${editing.col}`}
              column={metaCols[editing.col] as Column}
              kind={editorKind(metaCols[editing.col] as Column) ?? 'text'}
              initial={editing.initial}
              onCommit={(value, move) => {
                commit(editing, value)
                setEditing(null)
                if (move) {
                  const col = Math.max(0, Math.min(columns.length - 1, editing.col + move))
                  setActive({ row: editing.row, col })
                }
              }}
              onCancel={() => setEditing(null)}
            />
          ),
        }
      : undefined,
  }

  const pageKeys = display.map(selKey)
  const allSelected = pageKeys.length > 0 && pageKeys.every((k) => selected.has(k))
  const someSelected = pageKeys.some((k) => selected.has(k))
  const toggle = (k: string) =>
    setSelected((s) => {
      const n = new Set(s)
      if (n.has(k)) n.delete(k)
      else n.add(k)
      return n
    })

  const gutter: GridGutter = {
    width: 72,
    header: (
      <Checkbox
        aria-label={t('edit.selectAll')}
        checked={allSelected ? true : someSelected ? 'indeterminate' : false}
        onCheckedChange={() => setSelected(allSelected ? new Set() : new Set(pageKeys))}
      />
    ),
    cell: (row) => {
      const d = display[row]
      if (!d) return null
      const k = selKey(d)
      return (
        <>
          <Checkbox
            aria-label={t('edit.selectRow', { n: row + 1 })}
            checked={selected.has(k)}
            onCheckedChange={() => {
              lastRow.current = row
              toggle(k)
            }}
          />
          {isDeleted(d) ? (
            <IconButton
              tooltip={false}
              label={t('edit.restoreRow')}
              icon={<RotateCcw />}
              onClick={() =>
                d.kind === 'existing' && dispatch(key, { type: 'undelete', keys: [d.key] })
              }
            />
          ) : d.kind === 'new' ? (
            <IconButton
              tooltip={false}
              label={t('edit.removeNewRow')}
              icon={<X />}
              onClick={() => dispatch(key, { type: 'removeInserts', ids: [d.id] })}
            />
          ) : (
            <IconButton
              tooltip={false}
              label={t('edit.openRow')}
              icon={<Maximize2 />}
              onClick={() => setSheet({ kind: 'edit', row: d.row, current: d.current })}
            />
          )}
        </>
      )
    },
  }

  const deleteSelected = () => {
    const chosen = display.filter((d) => selected.has(selKey(d)))
    const ids = chosen.flatMap((d) => (d.kind === 'new' ? [d.id] : []))
    const existing = chosen.flatMap((d) => (d.kind === 'existing' ? [d.row] : []))
    if (ids.length) dispatch(key, { type: 'removeInserts', ids })
    if (existing.length) dispatch(key, { type: 'delete', rows: existing })
    setSelected(new Set())
  }

  const actions = (
    <>
      {/* Always there (disabled with nothing selected): a click selects a row, and a button
          appearing then would reflow the toolbar and move the grid under the pointer. */}
      <Button
        size="sm"
        onClick={deleteSelected}
        disabled={selected.size === 0}
        className="text-danger tabular-nums"
      >
        <Trash2 className="size-4" />
        {selected.size > 0
          ? t('edit.deleteSelected', { count: selected.size })
          : t('edit.deleteRows')}
      </Button>
      <Button size="sm" variant="primary" onClick={() => setSheet({ kind: 'insert', initial: {} })}>
        <Plus className="size-4" />
        {t('edit.insertRow')}
      </Button>
    </>
  )

  const overlays = (
    <>
      <PendingChanges meta={meta} />
      <RowSheet meta={meta} target={sheet} onClose={() => setSheet(null)} onOpen={setSheet} />
      <Dialog
        open={pasteOffer !== null}
        onOpenChange={(open) => !open && setPasteOffer(null)}
        title={t('clipboard.insertTitle', { count: pasteOffer?.extra.length ?? 0 })}
        description={t('clipboard.insertDescription')}
        footer={
          <>
            <Button onClick={() => finishPaste(false)}>{t('clipboard.updateOnly')}</Button>
            <Button variant="primary" onClick={() => finishPaste(true)}>
              {t('clipboard.insertConfirm')}
            </Button>
          </>
        }
      />
    </>
  )

  return {
    rows,
    loadFull: loadFull && ((row: number, col: number) => loadFull(pageIndex(row) ?? -1, col)),
    pageIndex,
    edit,
    gutter,
    active,
    onActiveChange: setActive,
    rowSelected,
    onRowClick,
    actions,
    overlays,
  }
}
