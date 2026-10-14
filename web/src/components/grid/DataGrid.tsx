import {
  type ColumnDef,
  type Header,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from '@tanstack/react-table'
import { useVirtualizer } from '@tanstack/react-virtual'
import {
  ArrowDown,
  ArrowUp,
  ArrowUpRight,
  ClipboardPaste,
  Copy,
  EyeOff,
  KeyRound,
  Lock,
  LockOpen,
  MoreVertical,
} from 'lucide-react'
import { ContextMenu as CM, DropdownMenu as M } from 'radix-ui'
import {
  type CSSProperties,
  type Key,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { useTranslation } from 'react-i18next'
import type { Cell } from '@/lib/api/types.gen'
import { cn } from '@/lib/cn'
import { usePrefs } from '@/lib/prefs/store'
import { matchesShortcut } from '@/lib/shortcuts'
import { toast } from '@/lib/toast'
import { IconButton } from '@/components/ui/IconButton'
import { CellView } from './CellView'
import { isTruncated } from './cellValue'
import { type CopyFormat, formatSelection, parsePasted } from './clipboard'
import { orderedNames } from './order'

const ROW_HEIGHTS = { comfortable: 36, compact: 28 } as const

export interface GridColumn {
  name: string
  type: string
  pk?: boolean
  fk?: boolean
  json?: boolean
}

export interface GridSort {
  column: string
  dir: 'asc' | 'desc'
}

export interface CellPos {
  row: number
  col: number
}

/** Editing layer: without it the grid is read-only (keyboard navigation still works). */
export interface GridEditing {
  rowState?: (row: number) => 'new' | 'deleted' | undefined
  /** The cell has a pending change (tinted). */
  cellEdited?: (row: number, col: number) => boolean
  canEdit: (row: number, col: number) => boolean
  /** Enter, F2 or double click on an editable cell. */
  onEdit: (pos: CellPos) => void
  /** Mod+Backspace on an editable cell. */
  onSetNull: (pos: CellPos) => void
  /** The open editor, drawn over its cell. */
  editor?: CellPos & { node: ReactNode }
  /** Why a pending value is invalid for its column (marked in red), or undefined. */
  cellInvalid?: (row: number, col: number) => string | undefined
  /**
   * Pasted cells from `origin`: `cols` are the target column indexes in visual order (the grid
   * drops what falls past the last column); rows past the end are the caller's to offer inserting.
   */
  onPaste?: (origin: CellPos, cols: number[], cells: string[][]) => void
}

/** A fixed column on the left (selection checkboxes, row actions). */
export interface GridGutter {
  width: number
  header: ReactNode
  cell: (row: number) => ReactNode
}

export interface DataGridProps {
  /** Accessible name of the grid. */
  label: string
  columns: GridColumn[]
  rows: Cell[][]
  /** Current sort keys; with `onSort`, headers become sort buttons (shift+click adds a key). */
  sort?: GridSort[]
  onSort?: (column: string, multi: boolean) => void
  /** Loads the full value of a truncated cell; omit where it can't be fetched (SQL results). */
  loadFull?: (row: number, col: number) => Promise<Cell>
  /** Number of the first row, for aria-rowindex when the grid shows one page of many. */
  rowOffset?: number
  edit?: GridEditing
  gutter?: GridGutter
  /** Controlled active cell; uncontrolled when omitted. */
  active?: CellPos
  onActiveChange?: (pos: CellPos) => void
  /** Click (or Space) on a non-null foreign key cell. */
  onFkClick?: (pos: CellPos) => void
  /** Names of the columns pinned to the left, in pin order. */
  pinnedColumns?: string[]
  /** Lock button in the headers; without it columns can't be pinned (SQL results). */
  onPinColumn?: (name: string) => void
  /** The first `pinnedRows` rows stay under the header while scrolling. */
  pinnedRows?: number
  /** Names of the columns not shown. */
  hiddenColumns?: string[]
  /** Display order by name; columns not listed follow in their own order. */
  columnOrder?: string[]
  /** Initial widths by column name (px); the grid owns them afterwards. */
  columnWidths?: Record<string, number>
  /** Called with all custom widths when a resize ends (or a width is reset). */
  onColumnWidthsChange?: (widths: Record<string, number>) => void
  /** "Hide" in the column menu. */
  onHideColumn?: (name: string) => void
  /** "Sort ascending/descending" in the column menu. */
  onSortColumn?: (name: string, dir: 'asc' | 'desc') => void
  /** Table of the rows, for "Copy as INSERT" (offered only with it). */
  table?: { schema: string; name: string }
  /** Selected rows (highlighted in gray); with `onRowClick`, a click anywhere on a row selects it. */
  rowSelected?: (row: number) => boolean
  /** Click on a row: Ctrl/Cmd toggles it, Shift selects the range from the last clicked row. */
  onRowClick?: (row: number, mode: RowClick) => void
  /** A column to bring into view and highlight (a structure result of the global search). */
  focusColumn?: string
}

export interface RowClick {
  toggle: boolean
  range: boolean
}

const rowClick = (e: MouseEvent): RowClick => ({
  toggle: e.ctrlKey || e.metaKey,
  range: e.shiftKey,
})

/** Subtle shadow on the edge of the pinned zones. */
const pinEdgeX = 'shadow-[4px_0_6px_-4px_rgb(0_0_0/0.25)]'
const pinEdgeY = 'shadow-[0_4px_6px_-4px_rgb(0_0_0/0.25)]'

/** Initial width by type: short for numbers and flags, wide for text and JSON. */
function defaultWidth(c: GridColumn): number {
  if (/^(smallint|integer|bigint|boolean|real|double precision|oid)$/.test(c.type)) return 120
  if (c.json || /text|char|\[\]|timestamp/.test(c.type)) return 240
  return 180
}

/**
 * Virtualized (rows and columns) grid. It knows nothing about tables or the API, so the table view
 * and the SQL results share it; the table view adds editing through `edit` and `gutter`.
 */
export function DataGrid({
  label,
  columns,
  rows,
  sort,
  onSort,
  loadFull,
  rowOffset = 0,
  edit,
  gutter,
  active: activeProp,
  onActiveChange,
  onFkClick,
  pinnedColumns,
  onPinColumn,
  pinnedRows = 0,
  hiddenColumns,
  columnOrder,
  columnWidths,
  onColumnWidthsChange,
  onHideColumn,
  onSortColumn,
  table: target,
  rowSelected,
  onRowClick,
  focusColumn,
}: DataGridProps) {
  const { t } = useTranslation()
  const scrollRef = useRef<HTMLDivElement>(null)
  /** Other corner of the selected rectangle (the active cell is one corner); null: just the cell. */
  const [anchor, setAnchor] = useState<CellPos | null>(null)
  const dragging = useRef(false)
  useEffect(() => {
    const up = () => (dragging.current = false)
    window.addEventListener('mouseup', up)
    return () => window.removeEventListener('mouseup', up)
  }, [])
  const rowHeight = ROW_HEIGHTS[usePrefs((s) => s.density)]
  const [activeInner, setActiveInner] = useState<CellPos>({ row: 0, col: 0 })
  const active = activeProp ?? activeInner
  const setActive = (p: CellPos) => {
    setActiveInner(p)
    onActiveChange?.(p)
  }
  const gutterWidth = gutter?.width ?? 0
  const pinned = Math.min(pinnedRows, rows.length)
  /** Height of the sticky block: header plus pinned rows. */
  const stickyHeight = (pinned + 1) * rowHeight
  const pinnedIds = useMemo(
    () =>
      (pinnedColumns ?? []).flatMap((name) => {
        const i = columns.findIndex((c) => c.name === name)
        return i < 0 ? [] : [String(i)]
      }),
    [pinnedColumns, columns],
  )

  const defs = useMemo<ColumnDef<Cell[]>[]>(
    () =>
      columns.map((c, i) => ({
        id: String(i),
        header: c.name,
        accessorFn: (row) => row[i],
        size: defaultWidth(c),
        minSize: 60,
        maxSize: 1200,
      })),
    [columns],
  )
  // Widths are kept by name: columns arrive after the first render and their ids are indexes.
  const [widths, setWidths] = useState<Record<string, number>>(() => columnWidths ?? {})
  const idOf = useMemo(() => new Map(columns.map((c, i) => [c.name, String(i)])), [columns])
  const columnSizing = useMemo(() => {
    const out: Record<string, number> = {}
    for (const [name, w] of Object.entries(widths)) {
      const id = idOf.get(name)
      if (id !== undefined) out[id] = w
    }
    return out
  }, [widths, idOf])
  const columnVisibility = useMemo(
    () =>
      Object.fromEntries(
        (hiddenColumns ?? []).flatMap((n) => {
          const id = idOf.get(n)
          return id === undefined ? [] : [[id, false]]
        }),
      ),
    [hiddenColumns, idOf],
  )
  const order = useMemo(
    () =>
      orderedNames(
        columns.map((c) => c.name),
        columnOrder,
      ).map((n) => idOf.get(n) ?? ''),
    [columns, columnOrder, idOf],
  )
  // eslint-disable-next-line react-hooks/incompatible-library -- TanStack Table is not compiler-safe; this grid is not memoized
  const table = useReactTable({
    data: rows,
    columns: defs,
    getCoreRowModel: getCoreRowModel(),
    columnResizeMode: 'onChange',
    state: {
      columnPinning: { left: pinnedIds, right: [] },
      columnSizing,
      columnVisibility,
      columnOrder: order,
    },
    onColumnSizingChange: (u) => {
      const next = typeof u === 'function' ? u(columnSizing) : u
      setWidths(
        Object.fromEntries(
          Object.entries(next).flatMap(([id, w]) => {
            const name = columns[Number(id)]?.name
            return name === undefined ? [] : [[name, w]]
          }),
        ),
      )
    },
  })
  // Saved once a drag ends (not on every pixel), and after a double click resets a width.
  const resizing = !!table.getState().columnSizingInfo.isResizingColumn
  const savedWidths = useRef(widths)
  useEffect(() => {
    if (resizing || savedWidths.current === widths) return
    savedWidths.current = widths
    onColumnWidthsChange?.(widths)
  }, [resizing, widths, onColumnWidthsChange])
  // Pinned columns (in pin order) are always rendered; only the rest is virtualized.
  const left = table.getLeftFlatHeaders()
  const center = table.getCenterFlatHeaders()
  const fixedWidth = gutterWidth + table.getLeftTotalSize()
  /** Column indexes in visual order, for arrow keys. */
  const visualOrder = [...left, ...center].map((h) => Number(h.column.id))
  const focusIndex = focusColumn ? columns.findIndex((c) => c.name === focusColumn) : -1

  const rowV = useVirtualizer({
    count: rows.length - pinned,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => rowHeight,
    overscan: 10,
    paddingStart: stickyHeight,
    scrollPaddingStart: stickyHeight,
  })
  const colV = useVirtualizer({
    horizontal: true,
    count: center.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: (i) => center[i]?.getSize() ?? 150,
    overscan: 3,
    paddingStart: fixedWidth,
    scrollPaddingStart: fixedWidth,
  })
  // Column widths, order, visibility and pins change the offsets: measure again so they follow.
  useEffect(() => colV.measure(), [colV, columnSizing, columns, pinnedIds, order, columnVisibility])
  useEffect(() => rowV.measure(), [rowV, pinned, rowHeight])

  // Keyboard focus follows the active cell; after closing an editor it comes back to the grid.
  const wantFocus = useRef(false)
  const editorOpen = !!edit?.editor
  const wasOpen = useRef(editorOpen)
  useLayoutEffect(() => {
    if (wasOpen.current && !editorOpen) wantFocus.current = true
    wasOpen.current = editorOpen
    if (!wantFocus.current || editorOpen) return
    const el = scrollRef.current?.querySelector<HTMLElement>(
      `[data-cell="${active.row}:${active.col}"]`,
    )
    if (el) {
      wantFocus.current = false
      el.focus({ preventScroll: true })
    }
  })

  /** The selected rectangle: a row span and the columns between the corners, in visual order. */
  const posOf = (col: number) => visualOrder.indexOf(col)
  const span = anchor && posOf(anchor.col) >= 0 && posOf(active.col) >= 0 ? anchor : active
  const sel = {
    r0: Math.max(0, Math.min(span.row, active.row)),
    r1: Math.min(rows.length - 1, Math.max(span.row, active.row)),
    cols: visualOrder.slice(
      Math.min(posOf(span.col), posOf(active.col)),
      Math.max(posOf(span.col), posOf(active.col)) + 1,
    ),
  }
  const selCols = new Set(sel.cols)
  const multi = sel.r1 > sel.r0 || sel.cols.length > 1
  const inSel = (row: number, col: number) =>
    multi && row >= sel.r0 && row <= sel.r1 && selCols.has(col)

  /** Selected values (full text of truncated ones when they can be loaded). */
  const selection = async () => {
    const out: Cell[][] = []
    for (let r = sel.r0; r <= sel.r1; r++) {
      out.push(
        await Promise.all(
          sel.cols.map((c) => {
            const v = rows[r]?.[c] ?? null
            return isTruncated(v) && loadFull ? loadFull(r, c) : v
          }),
        ),
      )
    }
    return out
  }
  const copyAs = (format: CopyFormat) =>
    selection()
      .then((cells) =>
        navigator.clipboard.writeText(
          formatSelection(
            format,
            sel.cols.map((c) => columns[c]?.name ?? ''),
            cells,
            target,
          ),
        ),
      )
      .then(
        () =>
          toast({
            message: t('clipboard.copied', { count: (sel.r1 - sel.r0 + 1) * sel.cols.length }),
          }),
        () => toast({ tone: 'danger', message: t('clipboard.copyFailed') }),
      )
  const paste = (text: string) => {
    const parsed = parsePasted(text)
    if (!edit?.onPaste || parsed.length === 0) return
    edit.onPaste(
      { row: active.row, col: active.col },
      visualOrder.slice(Math.max(0, posOf(active.col))),
      parsed,
    )
  }

  /** Moves the active cell by rows and by columns in visual order (pinned columns first). */
  const moveBy = (dRow: number, dCol: number, extend = false) => {
    setAnchor(extend ? (anchor ?? active) : null)
    const at = Math.max(0, Math.min(visualOrder.length - 1, visualOrder.indexOf(active.col) + dCol))
    const p = {
      row: Math.max(0, Math.min(rows.length - 1, active.row + dRow)),
      col: visualOrder[at] ?? 0,
    }
    setActive(p)
    if (p.row >= pinned) rowV.scrollToIndex(p.row - pinned)
    const ci = center.findIndex((h) => Number(h.column.id) === p.col)
    if (ci >= 0) colV.scrollToIndex(ci)
    wantFocus.current = true
  }

  // Once the columns are known, the focused column becomes the active one and scrolls into view.
  const focused = useRef<string | undefined>(undefined)
  useEffect(() => {
    if (focusIndex < 0 || focused.current === focusColumn) return
    focused.current = focusColumn
    setActive({ row: 0, col: focusIndex })
    const ci = center.findIndex((h) => Number(h.column.id) === focusIndex)
    if (ci >= 0) colV.scrollToIndex(ci, { align: 'center' })
  })

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!(e.target as HTMLElement).dataset.cell) return // keys inside editors or gutter controls
    const { row, col } = active
    const editable = edit?.canEdit(row, col)
    const moves: Record<string, [number, number]> = {
      ArrowUp: [-1, 0],
      ArrowDown: [1, 0],
      ArrowLeft: [0, -1],
      ArrowRight: [0, 1],
    }
    const m = moves[e.key]
    if (m) {
      e.preventDefault()
      moveBy(m[0], m[1], e.shiftKey)
    } else if (e.key === 'Escape' && anchor) {
      setAnchor(null)
    } else if ((e.key === 'Enter' || e.key === 'F2') && editable) {
      e.preventDefault()
      edit?.onEdit(active)
    } else if (matchesShortcut(e, 'setNull') && editable) {
      e.preventDefault()
      edit?.onSetNull(active)
    } else if (e.key === ' ' && onFkClick && columns[col]?.fk && rows[row]?.[col] != null) {
      e.preventDefault()
      onFkClick(active)
    }
  }

  const vcols = colV.getVirtualItems()
  const visible = vcols.flatMap((vc) => {
    const h = center[vc.index]
    const c = h && columns[Number(h.column.id)]
    return h && c ? [{ key: vc.key, h, c }] : []
  })
  const pinnedCols = left.flatMap((h, i) => {
    const c = columns[Number(h.column.id)]
    return c
      ? [{ h, c, x: gutterWidth + h.column.getStart('left'), last: i === left.length - 1 }]
      : []
  })
  const totalWidth = table.getTotalSize() + gutterWidth
  const padLeft = (vcols[0]?.start ?? fixedWidth) - fixedWidth
  const padRight = totalWidth - (vcols.at(-1)?.end ?? fixedWidth)
  const sortIndex = new Map(sort?.map((s, i) => [s.column, { ...s, n: i + 1 }]))
  const ed = edit?.editor

  const renderCell = (
    row: number,
    h: Header<Cell[], unknown>,
    c: GridColumn,
    key: Key,
    pin?: { x: number; last: boolean },
  ) => {
    const col = Number(h.column.id)
    const state = edit?.rowState?.(row)
    const isActive = active.row === row && active.col === col
    const edited = edit?.cellEdited?.(row, col)
    const invalid = edited || state === 'new' ? edit?.cellInvalid?.(row, col) : undefined
    const selected = inSel(row, col)
    const editor = ed && ed.row === row && ed.col === col ? ed.node : null
    return (
      <div
        key={key}
        role="gridcell"
        aria-colindex={col + 1}
        aria-selected={isActive || selected}
        aria-invalid={invalid ? true : undefined}
        title={invalid}
        data-cell={`${row}:${col}`}
        data-edited={edited || undefined}
        data-invalid={invalid ? true : undefined}
        data-pinned={pin ? true : undefined}
        tabIndex={isActive ? 0 : -1}
        onMouseDown={(e) => {
          // Buttons inside the cell (FK, expand) and the open editor keep their own clicks.
          if (e.button !== 0 || (e.target as HTMLElement).closest('button, a, input, textarea'))
            return
          e.preventDefault() // no text selection while dragging a range
          setAnchor(e.shiftKey ? (anchor ?? active) : { row, col })
          setActive({ row, col })
          dragging.current = true
          wantFocus.current = true
          onRowClick?.(row, rowClick(e))
        }}
        onMouseEnter={(e) => {
          if (dragging.current && e.buttons === 1) setActive({ row, col })
        }}
        onDoubleClick={() => edit?.canEdit(row, col) && edit.onEdit({ row, col })}
        className={cn(
          'relative flex shrink-0 items-center border-r border-border outline-none',
          'focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent',
          pin && 'sticky z-[4]',
          pin && (rowSelected?.(row) ? 'bg-row-selected' : 'bg-surface'),
          pin?.last && pinEdgeX,
          !!editor && 'z-[6]',
        )}
        style={{
          width: h.getSize(),
          left: pin?.x,
        }}
      >
        <div
          className={cn(
            'flex h-full min-w-0 flex-1 items-center overflow-hidden px-3',
            // On the inner box, so sticky cells keep their opaque background (and axe can
            // measure the contrast, which it can't over a gradient).
            (edited || state === 'new') && 'bg-accent-tint',
            selected && 'bg-accent/15',
            invalid && 'shadow-[inset_0_0_0_1.5px_var(--danger)]',
          )}
        >
          <CellView
            value={rows[row]?.[col] ?? null}
            json={c.json}
            fk={c.fk}
            onFk={onFkClick && (() => onFkClick({ row, col }))}
            loadFull={loadFull && (() => loadFull(row, col))}
          />
        </div>
        {editor && (
          // Grown 4 px over the neighbouring cells, like a spreadsheet, always on the light surface
          // (also over a gray selected row) and with the editor's rounded corners.
          <div
            className="absolute -top-1 -left-1 z-20 flex flex-col rounded-[6px] bg-surface shadow-card"
            style={{ width: Math.max(h.getSize() + 8, 220), minHeight: rowHeight + 8 }}
          >
            {editor}
          </div>
        )}
      </div>
    )
  }

  /** One row: gutter, pinned cells, then the visible window of the other columns. */
  const renderRow = (row: number, key: Key, className: string, style: CSSProperties) => {
    const state = edit?.rowState?.(row)
    const selected = rowSelected?.(row)
    return (
      <div
        key={key}
        role="row"
        aria-rowindex={rowOffset + row + 2}
        aria-selected={rowSelected ? !!selected : undefined}
        data-state={state}
        data-pinned={row < pinned || undefined}
        data-row-selected={selected || undefined}
        className={cn(
          'group flex border-b border-border',
          // Pinned rows don't take the hover tint; a selected row keeps its gray under the pointer.
          selected
            ? 'bg-row-selected'
            : row < pinned
              ? 'bg-surface'
              : 'bg-surface hover:bg-surface-2/60',
          state === 'deleted' && 'text-muted line-through',
          ed?.row === row && 'z-[15]',
          className,
        )}
        style={{ width: totalWidth, height: rowHeight, ...style }}
      >
        {gutter && (
          <div
            role="gridcell"
            className={cn(
              'sticky left-0 z-[5] flex shrink-0 items-center gap-1 border-r border-border px-2 no-underline',
              selected ? 'bg-row-selected' : 'bg-surface',
              state === 'new' && 'border-l-2 border-l-accent',
            )}
            style={{ width: gutterWidth }}
            onMouseDown={(e) => {
              // The checkbox and buttons in the gutter keep their own clicks.
              if (e.button !== 0 || (e.target as HTMLElement).closest('button, input')) return
              onRowClick?.(row, rowClick(e))
            }}
          >
            {gutter.cell(row)}
          </div>
        )}
        {pinnedCols.map(({ h, c, x, last }) => renderCell(row, h, c, h.id, { x, last }))}
        <div style={{ width: padLeft }} className="shrink-0" />
        {visible.map(({ key: k, h, c }) => renderCell(row, h, c, k))}
        <div style={{ width: padRight }} className="shrink-0" />
      </div>
    )
  }

  const grid = (
    <div
      ref={scrollRef}
      role="grid"
      aria-label={label}
      aria-rowcount={rowOffset + rows.length + 1}
      aria-colcount={columns.length}
      aria-multiselectable
      onKeyDown={onKeyDown}
      onCopy={(e) => {
        if (!(e.target as HTMLElement).dataset.cell) return // copying inside an editor
        e.preventDefault()
        const truncated = sel.cols.some((c) =>
          rows.slice(sel.r0, sel.r1 + 1).some((r) => isTruncated(r[c] ?? null)),
        )
        // Full values need a request, which the synchronous copy event can't wait for.
        if (truncated && loadFull) return void copyAs('tsv')
        const cells = rows.slice(sel.r0, sel.r1 + 1).map((r) => sel.cols.map((c) => r[c] ?? null))
        e.clipboardData.setData('text/plain', formatSelection('tsv', [], cells))
      }}
      onPaste={(e) => {
        if (!(e.target as HTMLElement).dataset.cell) return
        e.preventDefault()
        paste(e.clipboardData.getData('text/plain'))
      }}
      onContextMenu={(e) => {
        const pos = (e.target as HTMLElement).closest<HTMLElement>('[data-cell]')?.dataset.cell
        if (!pos) return
        const [row = 0, col = 0] = pos.split(':').map(Number)
        if (!inSel(row, col)) {
          setAnchor(null)
          setActive({ row, col })
        }
      }}
      className="relative min-h-0 flex-1 overflow-auto font-mono text-[12.5px]"
    >
      <div style={{ width: totalWidth, height: rowV.getTotalSize() }} className="relative">
        <div
          role="rowgroup"
          className={cn('sticky top-0 z-10', pinned > 0 && pinEdgeY)}
          style={{ width: totalWidth, height: stickyHeight }}
        >
          <div
            role="row"
            aria-rowindex={1}
            className="flex border-b border-border bg-surface-2"
            style={{ width: totalWidth, height: rowHeight }}
          >
            {gutter && (
              <div
                role="columnheader"
                className="sticky left-0 z-10 flex shrink-0 items-center border-r border-border bg-surface-2 px-2"
                style={{ width: gutterWidth }}
              >
                {gutter.header}
              </div>
            )}
            {pinnedCols.map(({ h, c, x, last }) => (
              <HeaderCell
                key={h.id}
                header={h}
                column={c}
                highlight={Number(h.column.id) === focusIndex}
                sort={sortIndex.get(c.name)}
                multi={(sort?.length ?? 0) > 1}
                onSort={onSort}
                onPin={onPinColumn}
                onHide={onHideColumn}
                onSortDir={onSortColumn}
                pin={{ x, last }}
              />
            ))}
            <div style={{ width: padLeft }} className="shrink-0" />
            {visible.map(({ h, c }) => (
              <HeaderCell
                key={h.id}
                header={h}
                column={c}
                highlight={Number(h.column.id) === focusIndex}
                sort={sortIndex.get(c.name)}
                multi={(sort?.length ?? 0) > 1}
                onSort={onSort}
                onPin={onPinColumn}
                onHide={onHideColumn}
                onSortDir={onSortColumn}
              />
            ))}
            <div style={{ width: padRight }} className="shrink-0" />
          </div>
          {Array.from({ length: pinned }, (_, row) => renderRow(row, `pin-${row}`, 'relative', {}))}
        </div>
        {rowV.getVirtualItems().map((vr) =>
          renderRow(pinned + vr.index, vr.key, 'absolute top-0 left-0', {
            transform: `translateY(${vr.start}px)`,
          }),
        )}
      </div>
    </div>
  )

  return (
    <CM.Root>
      <CM.Trigger asChild>{grid}</CM.Trigger>
      <CM.Portal>
        <CM.Content className="z-50 min-w-48 rounded-[var(--radius-control)] border border-border bg-surface p-1 text-[13px] shadow-card">
          {(['tsv', 'csv', 'json', ...(target ? ['insert' as const] : [])] as const).map((f) => (
            <CM.Item key={f} className={menuItem} onSelect={() => void copyAs(f)}>
              <Copy />
              {t(`clipboard.copyAs.${f}`)}
            </CM.Item>
          ))}
          {edit?.onPaste && (
            <CM.Item
              className={menuItem}
              onSelect={() =>
                navigator.clipboard
                  .readText()
                  .then(paste, () => toast({ tone: 'danger', message: t('clipboard.pasteFailed') }))
              }
            >
              <ClipboardPaste />
              {t('clipboard.paste')}
            </CM.Item>
          )}
        </CM.Content>
      </CM.Portal>
    </CM.Root>
  )
}

interface HeaderCellProps {
  header: Header<Cell[], unknown>
  column: GridColumn
  sort?: GridSort & { n: number }
  multi: boolean
  onSort?: (column: string, multi: boolean) => void
  onPin?: (column: string) => void
  onHide?: (column: string) => void
  onSortDir?: (column: string, dir: 'asc' | 'desc') => void
  /** Set when the column is pinned: its sticky offset and whether it is the last pinned one. */
  pin?: { x: number; last: boolean }
  /** The column the global search pointed at. */
  highlight?: boolean
}

const menuItem =
  'flex h-8 cursor-pointer items-center gap-2 rounded-[8px] px-2 font-sans text-text outline-none ' +
  'data-[highlighted]:bg-surface-2 [&_svg]:size-4 [&_svg]:text-muted'

function HeaderCell({
  header,
  column,
  sort,
  multi,
  onSort,
  onPin,
  onHide,
  onSortDir,
  pin,
  highlight,
}: HeaderCellProps) {
  const { t } = useTranslation()
  const menu = !!(onHide || onSortDir)
  const pad = onPin && menu ? 'pr-14' : onPin || menu ? 'pr-8' : undefined
  const content = (
    <>
      {column.pk && (
        <KeyRound
          className="size-3.5 shrink-0 text-accent-ink"
          role="img"
          aria-label={t('grid.pk')}
        />
      )}
      {column.fk && (
        <ArrowUpRight
          className="size-3.5 shrink-0 text-accent-ink"
          role="img"
          aria-label={t('grid.fk')}
        />
      )}
      <span className="max-w-[80%] shrink-0 truncate font-sans font-medium text-text">
        {flexRender(header.column.columnDef.header, header.getContext())}
      </span>{' '}
      <span className="min-w-0 truncate text-[11px] text-muted">{column.type}</span>
      {sort && (
        <span className="ml-auto flex shrink-0 items-center text-accent-ink">
          {sort.dir === 'asc' ? (
            <ArrowUp className="size-3.5" />
          ) : (
            <ArrowDown className="size-3.5" />
          )}
          {multi && <span className="text-[10px]">{sort.n}</span>}
        </span>
      )}
    </>
  )
  return (
    <div
      role="columnheader"
      aria-colindex={Number(header.column.id) + 1}
      aria-sort={sort ? (sort.dir === 'asc' ? 'ascending' : 'descending') : undefined}
      data-highlight={highlight || undefined}
      className={cn(
        'group/h relative flex shrink-0 items-center border-r border-border',
        pin && 'sticky z-[4] bg-surface-2',
        pin?.last && pinEdgeX,
        highlight && 'bg-accent-tint shadow-[inset_0_-2px_0_var(--accent)]',
      )}
      style={{ width: header.getSize(), left: pin?.x }}
    >
      {onSort ? (
        <button
          type="button"
          onClick={(e) => onSort(column.name, e.shiftKey)}
          className={cn(
            'flex h-full w-full min-w-0 cursor-pointer items-center gap-1.5 px-3 text-left hover:bg-surface focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent',
            pad,
          )}
        >
          {content}
        </button>
      ) : (
        <div className={cn('flex h-full w-full min-w-0 items-center gap-1.5 px-3', pad)}>
          {content}
        </div>
      )}
      {onPin && (
        <IconButton
          label={t(pin ? 'pin.unpinColumn' : 'pin.pinColumn', { column: column.name })}
          icon={pin ? <Lock className="text-accent-ink" /> : <LockOpen />}
          onClick={() => onPin(column.name)}
          aria-pressed={!!pin}
          className={cn(
            'absolute top-1/2 size-6 -translate-y-1/2 [&_svg]:size-3',
            menu ? 'right-8' : 'right-2',
            !pin && 'opacity-0 group-hover/h:opacity-100 focus-visible:opacity-100',
          )}
        />
      )}
      {menu && (
        <M.Root>
          <M.Trigger asChild>
            <IconButton
              label={t('columns.menu', { column: column.name })}
              icon={<MoreVertical />}
              tooltip={false}
              className="absolute top-1/2 right-2 size-6 -translate-y-1/2 opacity-0 group-hover/h:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100 [&_svg]:size-3.5"
            />
          </M.Trigger>
          <M.Portal>
            <M.Content
              align="end"
              sideOffset={4}
              className="z-50 min-w-44 rounded-[var(--radius-control)] border border-border bg-surface p-1 text-[13px] shadow-card"
            >
              {onSortDir && (
                <>
                  <M.Item className={menuItem} onSelect={() => onSortDir(column.name, 'asc')}>
                    <ArrowUp />
                    {t('columns.sortAsc')}
                  </M.Item>
                  <M.Item className={menuItem} onSelect={() => onSortDir(column.name, 'desc')}>
                    <ArrowDown />
                    {t('columns.sortDesc')}
                  </M.Item>
                </>
              )}
              {onPin && (
                <M.Item className={menuItem} onSelect={() => onPin(column.name)}>
                  {pin ? <LockOpen /> : <Lock />}
                  {t(pin ? 'columns.unpin' : 'columns.pin')}
                </M.Item>
              )}
              {onHide && (
                <M.Item className={menuItem} onSelect={() => onHide(column.name)}>
                  <EyeOff />
                  {t('columns.hide')}
                </M.Item>
              )}
            </M.Content>
          </M.Portal>
        </M.Root>
      )}
      <div
        aria-hidden
        onMouseDown={header.getResizeHandler()}
        onTouchStart={header.getResizeHandler()}
        onDoubleClick={() => header.column.resetSize()}
        className={cn(
          'absolute top-0 right-0 z-10 h-full w-1.5 cursor-col-resize touch-none select-none hover:bg-accent',
          header.column.getIsResizing() && 'bg-accent',
        )}
      />
    </div>
  )
}
