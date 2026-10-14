import { useState } from 'react'
import type { CellMap } from '@/lib/api/types.gen'
import { basePath } from '@/lib/basePath'
import { rowKey } from './changes/queue'

/**
 * How one table is shown in this browser: pinned columns (by name, in pin order) and rows (by
 * primary key), hidden columns, column order (names; columns not listed go after, in table order)
 * and widths in px.
 */
export interface TableViewState {
  columns: string[]
  rows: CellMap[]
  hidden: string[]
  order: string[]
  widths: Record<string, number>
}

const none: TableViewState = { columns: [], rows: [], hidden: [], order: [], widths: {} }

/** localStorage key: one entry per app instance (base path), connection, schema and table. */
export const viewKey = (connection: string, schema: string, table: string) =>
  `gresbase:view:${JSON.stringify([basePath, connection, schema, table])}`

const strings = (v: unknown) =>
  Array.isArray(v) ? v.filter((c): c is string => typeof c === 'string') : []

function load(key: string): TableViewState {
  try {
    const v = JSON.parse(localStorage.getItem(key) ?? 'null') as Partial<TableViewState> | null
    const widths: Record<string, number> = {}
    if (v?.widths && typeof v.widths === 'object')
      for (const [k, w] of Object.entries(v.widths)) if (typeof w === 'number') widths[k] = w
    return {
      columns: strings(v?.columns),
      rows: Array.isArray(v?.rows) ? v.rows.filter((r) => r !== null && typeof r === 'object') : [],
      hidden: strings(v?.hidden),
      order: strings(v?.order),
      widths,
    }
  } catch {
    return none
  }
}

const isEmpty = (s: TableViewState) =>
  !s.columns.length &&
  !s.rows.length &&
  !s.hidden.length &&
  !s.order.length &&
  !Object.keys(s.widths).length

const toggle = <T>(list: T[], item: T, same: (x: T) => boolean) =>
  list.some(same) ? list.filter((x) => !same(x)) : [...list, item]

/** v0.1.1 kept only pins, per schema and table (there was one connection, now `env`). */
export const legacyPinsKey = (schema: string, table: string) =>
  `gresbase:pins:${JSON.stringify([basePath, schema, table])}`

/** The stored view; on first read, pins from v0.1.1 move into it (once: the old entry goes). */
export function loadView(connection: string, schema: string, table: string): TableViewState {
  const key = viewKey(connection, schema, table)
  const view = load(key)
  if (connection !== 'env') return view
  try {
    const old = legacyPinsKey(schema, table)
    if (localStorage.getItem(old) === null) return view
    const pins = load(old)
    localStorage.removeItem(old)
    if (localStorage.getItem(key) !== null) return view
    const next = { ...view, columns: pins.columns, rows: pins.rows }
    if (!isEmpty(next)) localStorage.setItem(key, JSON.stringify(next))
    return next
  } catch {
    return view
  }
}

/** The view of a table, remembered in this browser. Mount it per table (it reads storage once). */
export function useTableView(connection: string, schema: string, table: string) {
  const key = viewKey(connection, schema, table)
  const [view, setView] = useState(() => loadView(connection, schema, table))
  const save = (next: TableViewState) => {
    setView(next)
    try {
      if (isEmpty(next)) localStorage.removeItem(key)
      else localStorage.setItem(key, JSON.stringify(next))
    } catch {
      // Storage blocked (private window): the view lasts until the page is left.
    }
  }
  return {
    view,
    toggleColumn: (name: string) =>
      save({ ...view, columns: toggle(view.columns, name, (c) => c === name) }),
    toggleRow: (pk: CellMap) =>
      save({ ...view, rows: toggle(view.rows, pk, (r) => rowKey(r) === rowKey(pk)) }),
    unpinAll: () => save({ ...view, columns: [], rows: [] }),
    toggleHidden: (name: string) =>
      save({ ...view, hidden: toggle(view.hidden, name, (c) => c === name) }),
    setOrder: (order: string[]) => save({ ...view, order }),
    setWidths: (widths: Record<string, number>) => save({ ...view, widths }),
    /** Back to the table as it comes: no pins, nothing hidden, table order, default widths. */
    reset: () => save(none),
  }
}
