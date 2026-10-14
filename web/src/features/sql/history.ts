import { create } from 'zustand'

/** One run of the SQL editor, kept in the browser (IndexedDB). */
export interface HistoryEntry {
  id?: number
  sql: string
  /** When it ran (ms since epoch). */
  at: number
  duration_ms: number
  /** Rows returned by the last statement, or affected when it returned none. */
  rows?: number
  error?: string
}

export const HISTORY_LIMIT = 500
const DB = 'gresbase'
const STORE = 'history'

function db(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1)
    req.onupgradeneeded = () =>
      req.result.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true })
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

/** Runs `fn` in a transaction and resolves with the result of its last request when it commits. */
async function tx<T>(
  mode: IDBTransactionMode,
  fn: (s: IDBObjectStore) => IDBRequest<T> | undefined,
): Promise<T | undefined> {
  const d = await db()
  return new Promise((resolve, reject) => {
    const t = d.transaction(STORE, mode)
    const req = fn(t.objectStore(STORE))
    t.oncomplete = () => {
      d.close()
      resolve(req ? req.result : undefined)
    }
    t.onerror = () => reject(t.error)
  })
}

/** Newest first. */
export async function readHistory(): Promise<HistoryEntry[]> {
  const all = (await tx('readonly', (s) => s.getAll() as IDBRequest<HistoryEntry[]>)) ?? []
  return all.reverse()
}

/** Adds an entry and drops the oldest ones beyond the limit. */
export async function addHistory(entry: HistoryEntry): Promise<void> {
  await tx('readwrite', (s) => {
    s.add(entry)
    const count = s.count()
    count.onsuccess = () => {
      let extra = count.result - HISTORY_LIMIT
      if (extra <= 0) return
      const cursor = s.openCursor()
      cursor.onsuccess = () => {
        const c = cursor.result
        if (!c || extra-- <= 0) return
        c.delete()
        c.continue()
      }
    }
    return undefined
  })
}

export const clearHistory = () => tx('readwrite', (s) => s.clear()).then(() => undefined)

export const deleteHistory = (id: number) =>
  tx('readwrite', (s) => s.delete(id)).then(() => undefined)

/** Case-insensitive search on the SQL text. */
export const searchHistory = (entries: HistoryEntry[], q: string) => {
  const needle = q.trim().toLowerCase()
  return needle ? entries.filter((e) => e.sql.toLowerCase().includes(needle)) : entries
}

interface HistoryState {
  entries: HistoryEntry[]
  load: () => Promise<void>
  add: (entry: HistoryEntry) => Promise<void>
  /** Removes one entry (the one the UI shows, by identity). */
  remove: (entry: HistoryEntry) => Promise<void>
  clear: () => Promise<void>
}

/** The history in memory for the UI; IndexedDB is the source of truth. Without IndexedDB
 * (private mode in some browsers) it still works for the session. */
// Reads from IndexedDB can finish out of order (a load started on mount, then a run): only the
// latest one may replace what the UI shows.
let reads = 0
const reload = async (set: (s: Partial<HistoryState>) => void) => {
  const n = ++reads
  const entries = await readHistory()
  if (n === reads) set({ entries })
}

export const useHistory = create<HistoryState>()((set) => ({
  entries: [],
  load: () => reload(set).catch(() => undefined), // No IndexedDB: keep this session's runs.
  add: async (entry) => {
    reads++
    set((s) => ({ entries: [{ ...entry, id: -Date.now() }, ...s.entries].slice(0, HISTORY_LIMIT) }))
    try {
      await addHistory(entry)
      await reload(set)
    } catch {
      // Kept in memory only.
    }
  },
  remove: async (entry) => {
    reads++
    set((s) => ({ entries: s.entries.filter((e) => e !== entry) }))
    // Entries added this session have a temporary negative id until the next read.
    if (entry.id !== undefined && entry.id > 0) await deleteHistory(entry.id).catch(() => undefined)
  },
  clear: async () => {
    reads++
    set({ entries: [] })
    await clearHistory().catch(() => undefined)
  },
}))
