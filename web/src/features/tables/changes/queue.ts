import { create } from 'zustand'
import type { Cell, CellMap, Op } from '@/lib/api/types.gen'

/**
 * Change queue of the grid: edits, inserts and deletes wait here, tinted in the grid, until they are
 * saved as one changeset. The queue is plain immutable data changed only through `reduceQueue`, so
 * history (undo/redo before saving) can be kept as a list of snapshots.
 */

/** Identity of an existing row: its primary key (in primary key order) as JSON. */
export type RowKey = string

/** An existing row as the grid loaded it: primary key and every column's value by name. */
export interface ExistingRow {
  pk: CellMap
  original: CellMap
}

export interface Queue {
  /** Rows with edited cells; `set` holds only the cells that differ from `original`. */
  updates: Record<RowKey, ExistingRow & { set: CellMap }>
  /** Rows marked for deletion (shown struck through). */
  deletes: Record<RowKey, ExistingRow>
  /** New rows in creation order; columns missing from `values` take their default. */
  inserts: { id: string; values: CellMap }[]
}

export type QueueAction =
  | { type: 'set'; row: ExistingRow; values: CellMap }
  | { type: 'insert'; id: string; values: CellMap }
  /** `undefined` takes the column back to its default. */
  | { type: 'setInsert'; id: string; column: string; value: Cell | undefined }
  | { type: 'removeInserts'; ids: string[] }
  | { type: 'delete'; rows: ExistingRow[] }
  | { type: 'undelete'; keys: RowKey[] }
  | { type: 'discard' }
  /** Several actions as one undo step (a paste). */
  | { type: 'batch'; actions: QueueAction[] }

export const emptyQueue: Queue = { updates: {}, deletes: {}, inserts: [] }

/** A copy of `obj` without `keys`. */
export const omit = <T>(obj: Record<string, T>, ...keys: string[]): Record<string, T> =>
  Object.fromEntries(Object.entries(obj).filter(([k]) => !keys.includes(k)))

export const rowKey = (pk: CellMap): RowKey => JSON.stringify(pk)

/**
 * Same value as the user sees it: an int4 loaded as 7 and typed as "7" are equal, and so are JSON
 * values with the same content.
 */
export function sameValue(a: Cell | undefined, b: Cell | undefined): boolean {
  if (a === b) return true
  if (a == null || b == null) return false
  const text = (v: Cell) => (typeof v === 'object' ? JSON.stringify(v) : String(v))
  return text(a) === text(b)
}

export function reduceQueue(q: Queue, a: QueueAction): Queue {
  switch (a.type) {
    case 'set': {
      const key = rowKey(a.row.pk)
      let set: CellMap = { ...q.updates[key]?.set }
      for (const [col, value] of Object.entries(a.values)) {
        if (sameValue(value, a.row.original[col])) set = omit(set, col)
        else set[col] = value
      }
      const updates = omit(q.updates, key)
      if (Object.keys(set).length > 0) updates[key] = { ...a.row, set }
      return { ...q, updates }
    }
    case 'insert':
      return { ...q, inserts: [...q.inserts, { id: a.id, values: a.values }] }
    case 'setInsert':
      return {
        ...q,
        inserts: q.inserts.map((r) => {
          if (r.id !== a.id) return r
          const values = omit(r.values, a.column)
          if (a.value !== undefined) values[a.column] = a.value
          return { ...r, values }
        }),
      }
    case 'removeInserts':
      return { ...q, inserts: q.inserts.filter((r) => !a.ids.includes(r.id)) }
    case 'delete': {
      const deletes = { ...q.deletes }
      for (const row of a.rows) deletes[rowKey(row.pk)] = row
      return { ...q, deletes }
    }
    case 'undelete':
      return { ...q, deletes: omit(q.deletes, ...a.keys) }
    case 'discard':
      return emptyQueue
    case 'batch':
      return a.actions.reduce(reduceQueue, q)
  }
}

/** The operations to save, in order: updates, deletes, inserts (so a deleted key can be reused). */
export function toOps(q: Queue): Op[] {
  const ops: Op[] = []
  for (const [key, u] of Object.entries(q.updates)) {
    if (key in q.deletes) continue // deleting wins over editing
    const expected: CellMap = {}
    for (const col of Object.keys(u.set)) expected[col] = u.original[col] ?? null
    ops.push({ kind: 'update', pk: u.pk, set: u.set, expected })
  }
  for (const d of Object.values(q.deletes)) {
    ops.push({ kind: 'delete', pk: d.pk, expected: d.original })
  }
  for (const r of q.inserts) ops.push({ kind: 'insert', values: r.values })
  return ops
}

export const pendingCount = (q: Queue) => toOps(q).length

/** Queue snapshots before (`past`) and after (`future`) the current one, for local undo/redo. */
export interface QueueHistory {
  past: Queue[]
  future: Queue[]
}

const noHistory: QueueHistory = { past: [], future: [] }

interface ChangesState {
  /** One queue per table, keyed by `tableKey`. */
  queues: Record<string, Queue>
  // ponytail: history is unbounded until the table is saved; cap it if very long sessions appear.
  history: Record<string, QueueHistory>
  dispatch: (table: string, action: QueueAction) => void
  /** Steps the queue back (or forward); false when there is nothing to step to. */
  undo: (table: string) => boolean
  redo: (table: string) => boolean
  /** Empties the queue and forgets its history (after saving: the changes are no longer local). */
  clear: (table: string) => void
}

export const tableKey = (schema: string, table: string) => JSON.stringify([schema, table])

/** Every change to a queue goes through `dispatch`, which records the previous queue for undo. */
export const useChanges = create<ChangesState>()((set, get) => {
  const step = (table: string, back: boolean) => {
    const h = get().history[table] ?? noHistory
    const from = back ? h.past : h.future
    const to = from.at(-1)
    if (!to) return false
    const current = get().queues[table] ?? emptyQueue
    const rest = from.slice(0, -1)
    const history = back
      ? { past: rest, future: [...h.future, current] }
      : { past: [...h.past, current], future: rest }
    set((s) => ({
      queues: { ...s.queues, [table]: to },
      history: { ...s.history, [table]: history },
    }))
    return true
  }
  return {
    queues: {},
    history: {},
    dispatch: (table, action) =>
      set((s) => {
        const current = s.queues[table] ?? emptyQueue
        const next = reduceQueue(current, action)
        // A no-op edit (e.g. committing the same value) must not leave an empty undo step.
        if (JSON.stringify(next) === JSON.stringify(current)) return s
        const h = s.history[table] ?? noHistory
        return {
          queues: { ...s.queues, [table]: next },
          history: { ...s.history, [table]: { past: [...h.past, current], future: [] } },
        }
      }),
    undo: (table) => step(table, true),
    redo: (table) => step(table, false),
    clear: (table) =>
      set((s) => ({
        queues: { ...s.queues, [table]: emptyQueue },
        history: { ...s.history, [table]: noHistory },
      })),
  }
})

export const useQueue = (table: string) => useChanges((s) => s.queues[table] ?? emptyQueue)

let nextInsert = 1
export const newInsertId = () => `new-${nextInsert++}`
