import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { ApiError } from '@/lib/api/client'
import { snippetName } from '@/lib/api/snippets'
import { beginTx, cancelExecution, commitTx, executeSql, getTx, rollbackTx } from '@/lib/api/sql'
import type { Analysis, StatementResult, TxInfo } from '@/lib/api/types.gen'
import { useHistory } from './history'

/** A run refused with 409 confirmation_required, waiting for the user to decide. */
export interface PendingRun {
  sql: string
  offset: number
  analysis: Analysis
  params?: Record<string, string>
}

/** What a tab shows of its last run, kept while it is in the background (not persisted). */
interface TabRun {
  results: StatementResult[]
  offset: number
  error: unknown
  active: number
}

/**
 * A query tab. The open tab's text and saved query live in the state's `doc` and `snippet` (what
 * the editor edits); its entry here is brought up to date when another tab opens.
 */
export interface SqlTab {
  id: string
  /** Name given by the user; null shows the saved query's name, or "Untitled". */
  name: string | null
  doc: string
  snippet: OpenSnippet | null
  /** Last values given to its :name parameters. */
  params: Record<string, string>
  run?: TabRun
}

/** The tabs of a connection. */
interface ConnectionTabs {
  tabs: SqlTab[]
  tabId: string
}

// randomUUID only exists in secure contexts (not plain HTTP on a LAN host).
const newId = () =>
  crypto.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`

// Runs are only kept in memory (results can be large).
const withoutRun = (t: SqlTab): SqlTab => ({ ...t, run: undefined })

const blankTab = (doc = '', snippet: OpenSnippet | null = null): SqlTab => ({
  id: newId(),
  name: null,
  doc,
  snippet,
  params: {},
})

/** How a commit or rollback ended. */
export type TxOutcome = 'committed' | 'rolledBack' | 'expired'

/** The saved query open in the editor: its path and the text last saved. */
export interface OpenSnippet {
  path: string
  saved: string
}

/**
 * State of the SQL editor screen. `doc` and `snippet` are persisted (the editor survives reloads).
 * Every run is recorded in the history.
 */
export interface SqlEditorState {
  doc: string
  /** The saved query being edited, null for an untitled one. */
  snippet: OpenSnippet | null
  /** A text waiting to replace an editor with unsaved changes (the user must confirm). */
  pendingReplace: { doc: string; snippet: OpenSnippet | null } | null
  /** statement_timeout of the next runs, in ms; null = the server default (GRESBASE_STATEMENT_TIMEOUT). */
  timeoutMs: number | null
  /** Id of the running execution (for cancel), null when idle. */
  running: string | null
  /** Results of the last run, one per statement that ran (the last one may hold the error). */
  results: StatementResult[]
  /** Where the executed text starts in `doc`: result ranges and error positions are relative to it. */
  offset: number
  /** The request itself failed (network, read_only…). */
  error: unknown
  /** Selected result tab. */
  active: number
  /** Transaction mode: the first run opens a transaction and the next ones run inside it. */
  txMode: boolean
  /** The open transaction, null when there is none. */
  tx: TxInfo | null
  /** When the open transaction will be rolled back for being idle (local clock, ms). */
  txDeadline: number
  /** The open transaction ended on the server (idle too long) and was rolled back. */
  txExpired: boolean
  pending: PendingRun | null
  /** The connection the tabs belong to. */
  connection: string
  /** Query tabs of the connection, in order; the open one is `tabId`. */
  tabs: SqlTab[]
  tabId: string
  /** Tabs of the other connections, while this one is open. */
  byConnection: Record<string, ConnectionTabs>
  /** Opens a new tab (with a text, or a saved query) and switches to it. */
  newTab: (doc?: string, snippet?: OpenSnippet | null) => void
  /** Switches tabs (not while a run is going: its results belong to the tab that started it). */
  selectTab: (id: string) => void
  /** Closes a tab; the last one is replaced by an empty tab. */
  closeTab: (id: string) => void
  renameTab: (id: string, name: string | null) => void
  /** Remembers the values of the open tab's parameters. */
  setParams: (params: Record<string, string>) => void
  /** Shows a saved query: its tab if one has it, else the open tab if it is empty, else a new tab. */
  openSnippet: (snippet: OpenSnippet) => void
  /** A saved query (or folder) was moved to `to`, or deleted (null): every tab follows it. */
  moveSnippet: (root: string, to: string | null) => void
  /** Keeps the tabs of the current connection aside and shows those of `connection`. */
  switchConnection: (connection: string) => void
  setDoc: (doc: string) => void
  setSnippet: (snippet: OpenSnippet | null) => void
  /**
   * Loads another text (a saved query, a history entry…). If the editor has unsaved changes it only
   * records the request in `pendingReplace` and returns false.
   */
  replaceDoc: (doc: string, snippet: OpenSnippet | null) => boolean
  confirmReplace: () => void
  dismissReplace: () => void
  setTimeoutMs: (ms: number | null) => void
  setActive: (i: number) => void
  /** Switching it off is refused while a transaction is open (commit or roll back first). */
  setTxMode: (on: boolean) => void
  /**
   * Runs `sql`, the part of `doc` that starts at `offset`; `confirm` accepts destructive SQL and
   * `params` gives the values of its :name parameters (sent bound, never written into the SQL).
   */
  run: (
    sql: string,
    offset: number,
    confirm?: boolean,
    params?: Record<string, string>,
  ) => Promise<void>
  cancel: () => Promise<void>
  /** Forgets a run refused with 409 (the user cancelled). */
  dismissPending: () => void
  commit: () => Promise<TxOutcome>
  rollback: () => Promise<TxOutcome>
  /** Asks the server whether the transaction is still open (detects expiry). */
  refreshTx: () => Promise<void>
  /** Adopts an open transaction found on the server (left by a closed or reloaded page). */
  resumeTx: (tx: TxInfo) => void
  dismissExpired: () => void
}

export const SQL_KEY = 'gresbase:sql'

const firstTab = blankTab()

/** The state without actions: the initial value, also used by tests to reset the store. */
export const initialSqlState = {
  connection: 'env',
  tabs: [firstTab],
  tabId: firstTab.id,
  byConnection: {} as Record<string, ConnectionTabs>,
  doc: '',
  snippet: null as OpenSnippet | null,
  pendingReplace: null as SqlEditorState['pendingReplace'],
  timeoutMs: null as number | null,
  running: null as string | null,
  results: [] as StatementResult[],
  offset: 0,
  error: null as unknown,
  active: 0,
  txMode: false,
  tx: null as TxInfo | null,
  txDeadline: 0,
  txExpired: false,
  pending: null as PendingRun | null,
}

// The server answers 404 for a transaction that is no longer open: it expired.
const gone = (err: unknown) => err instanceof ApiError && err.status === 404

/**
 * Idle time the server gives a transaction, from the first TxInfo (expires = created + idle).
 * Deadlines are kept on the local clock so a skewed server clock does not distort the countdown.
 */
let txIdleMs = 5 * 60_000

export const useSqlEditor = create<SqlEditorState>()(
  persist(
    (set, get) => {
      const expired = () => set({ tx: null, txExpired: true })
      const finish = async (fn: (id: string) => Promise<{ committed: boolean }>) => {
        const tx = get().tx
        if (!tx) return 'expired' as const
        try {
          const res = await fn(tx.id)
          set({ tx: null })
          return res.committed ? ('committed' as const) : ('rolledBack' as const)
        } catch (err) {
          if (!gone(err)) throw err
          expired()
          return 'expired' as const
        }
      }

      // The tabs with the open one brought up to date (its text, saved query and last run).
      const current = (s = get()): SqlTab[] =>
        s.tabs.map((t) =>
          t.id === s.tabId
            ? {
                ...t,
                doc: s.doc,
                snippet: s.snippet,
                run: { results: s.results, offset: s.offset, error: s.error, active: s.active },
              }
            : t,
        )
      // The state of an open tab.
      const show = (tab: SqlTab) => ({
        tabId: tab.id,
        doc: tab.doc,
        snippet: tab.snippet,
        results: tab.run?.results ?? [],
        offset: tab.run?.offset ?? 0,
        error: tab.run?.error ?? null,
        active: tab.run?.active ?? 0,
        pending: null,
        pendingReplace: null,
      })
      const newTab = (doc = '', snippet: OpenSnippet | null = null) => {
        if (get().running) return
        const tab = blankTab(doc, snippet)
        set({ tabs: [...current(), tab], ...show(tab) })
      }

      return {
        ...initialSqlState,
        newTab,
        selectTab: (id) => {
          if (get().running || id === get().tabId) return
          const tabs = current()
          const tab = tabs.find((t) => t.id === id)
          if (tab) set({ tabs, ...show(tab) })
        },
        closeTab: (id) => {
          const { running, tabId } = get()
          if (running && id === tabId) return
          const tabs = current()
          const i = tabs.findIndex((t) => t.id === id)
          const rest = tabs.filter((t) => t.id !== id)
          const next = rest[Math.min(i, rest.length - 1)]
          if (!next) {
            const tab = blankTab()
            set({ tabs: [tab], ...show(tab) })
          } else if (id === tabId) set({ tabs: rest, ...show(next) })
          else set({ tabs: rest })
        },
        renameTab: (id, name) =>
          set({ tabs: get().tabs.map((t) => (t.id === id ? { ...t, name } : t)) }),
        setParams: (params) =>
          set({ tabs: get().tabs.map((t) => (t.id === get().tabId ? { ...t, params } : t)) }),
        openSnippet: (snippet) => {
          const s = get()
          if (s.snippet?.path === snippet.path) return
          const tabs = current()
          const found = tabs.find((t) => t.snippet?.path === snippet.path)
          if (found) {
            if (!s.running) set({ tabs, ...show(found) })
          } else if (!s.snippet && s.doc.trim() === '') set({ doc: snippet.saved, snippet })
          else newTab(snippet.saved, snippet)
        },
        moveSnippet: (root, to) => {
          const inside = (p: string) => p === root || p.startsWith(`${root}/`)
          const follow = (sn: OpenSnippet | null) =>
            sn && inside(sn.path)
              ? to === null
                ? null
                : { ...sn, path: to + sn.path.slice(root.length) }
              : sn
          const retab = (tabs: SqlTab[]) => tabs.map((t) => ({ ...t, snippet: follow(t.snippet) }))
          const s = get()
          set({
            snippet: follow(s.snippet),
            tabs: retab(s.tabs),
            byConnection: Object.fromEntries(
              Object.entries(s.byConnection).map(([c, v]) => [c, { ...v, tabs: retab(v.tabs) }]),
            ),
          })
        },
        switchConnection: (connection) => {
          const s = get()
          if (connection === s.connection) return
          const byConnection = Object.fromEntries(
            Object.entries({
              ...s.byConnection,
              [s.connection]: { tabs: current().map(withoutRun), tabId: s.tabId },
            }).filter(([c]) => c !== connection),
          )
          let next = s.byConnection[connection]
          if (!next) {
            const tab = blankTab()
            next = { tabs: [tab], tabId: tab.id }
          }
          const tab = next.tabs.find((t) => t.id === next.tabId) ?? next.tabs[0] ?? blankTab()
          // An open transaction belongs to the previous connection (its band offers it there).
          set({
            connection,
            byConnection,
            tabs: next.tabs.length ? next.tabs : [tab],
            ...show(tab),
            running: null,
            txMode: false,
            tx: null,
            txDeadline: 0,
            txExpired: false,
          })
        },
        setDoc: (doc) => set({ doc }),
        setSnippet: (snippet) => set({ snippet }),
        replaceDoc: (doc, snippet) => {
          if (hasUnsavedChanges(get())) {
            set({ pendingReplace: { doc, snippet } })
            return false
          }
          set({ doc, snippet, pendingReplace: null })
          return true
        },
        confirmReplace: () => {
          const p = get().pendingReplace
          if (p) set({ doc: p.doc, snippet: p.snippet, pendingReplace: null })
        },
        dismissReplace: () => set({ pendingReplace: null }),
        setTimeoutMs: (timeoutMs) => set({ timeoutMs }),
        setActive: (active) => set({ active }),
        setTxMode: (txMode) => {
          if (!txMode && get().tx) return
          set({ txMode, txExpired: false })
        },
        run: async (sql, offset, confirm = false, params) => {
          if (get().running) return
          const id = newId()
          set({ running: id, results: [], error: null, offset, active: 0, pending: null })
          const at = Date.now()
          let tx = get().tx
          try {
            if (get().txMode && !tx) {
              tx = await beginTx()
              txIdleMs = Date.parse(tx.expires_at) - Date.parse(tx.created_at) || txIdleMs
              set({ tx, txDeadline: Date.now() + txIdleMs, txExpired: false })
            }
            const res = await executeSql({
              sql,
              execution_id: id,
              timeout_ms: get().timeoutMs ?? undefined,
              tx_id: tx?.id,
              confirm_destructive: confirm || undefined,
              params,
            })
            // Show the failed statement, or else the last one (usually the query the user wants).
            set({ results: res.results, active: Math.max(0, res.results.length - 1) })
            if (res.tx) set({ tx: res.tx, txDeadline: Date.now() + txIdleMs })
            void useHistory.getState().add(historyEntry(sql, at, res.results))
          } catch (error) {
            if (
              error instanceof ApiError &&
              error.code === 'confirmation_required' &&
              error.analysis
            )
              set({ pending: { sql, offset, analysis: error.analysis, params } })
            else if (tx && gone(error)) expired()
            else {
              set({ error })
              void useHistory.getState().add(historyEntry(sql, at, [], error))
            }
          } finally {
            set({ running: null })
          }
        },
        cancel: async () => {
          const id = get().running
          if (id) await cancelExecution(id).catch(() => undefined)
        },
        dismissPending: () => set({ pending: null }),
        commit: () => finish(commitTx),
        rollback: () => finish(rollbackTx),
        refreshTx: async () => {
          const tx = get().tx
          if (!tx) return
          try {
            const info = await getTx(tx.id)
            // Still open (clocks disagree a little): look again shortly.
            set({ tx: info, txDeadline: Math.max(get().txDeadline, Date.now() + 5_000) })
          } catch (err) {
            if (gone(err)) expired()
            // Network hiccup: move the deadline so the countdown asks again instead of stalling at
            // zero (the band only re-checks when the remaining time changes).
            else set({ txDeadline: Date.now() + 5_000 })
          }
        },
        resumeTx: (tx) =>
          // Only the server clock is known for it; the check at zero corrects any skew.
          set({ tx, txMode: true, txExpired: false, txDeadline: Date.parse(tx.expires_at) }),
        dismissExpired: () => set({ txExpired: false }),
      }
    },
    {
      name: SQL_KEY,
      // ponytail: one entry for every browser tab; two of them on different connections each
      // write back their copy of the other's tabs (last one wins), as the single editor text did.
      version: 1,
      partialize: (s) => ({
        doc: s.doc,
        snippet: s.snippet,
        connection: s.connection,
        tabId: s.tabId,
        tabs: s.tabs
          .map(withoutRun)
          .map((t) => (t.id === s.tabId ? { ...t, doc: s.doc, snippet: s.snippet } : t)),
        byConnection: s.byConnection,
      }),
      // Version 0 kept one text: it becomes the only tab of the env connection.
      migrate: (persisted, version) => {
        if (version !== 0) return persisted
        const old = persisted as { doc?: string; snippet?: OpenSnippet | null }
        const tab = blankTab(old.doc ?? '', old.snippet ?? null)
        return {
          doc: tab.doc,
          snippet: tab.snippet,
          connection: 'env',
          tabId: tab.id,
          tabs: [tab],
          byConnection: {},
        }
      },
    },
  ),
)

/** The label of a tab: its name, else its saved query's name, else null (untitled). */
export const tabLabel = (tab: Pick<SqlTab, 'name' | 'snippet'>) =>
  tab.name ?? (tab.snippet ? snippetName(tab.snippet.path) : null)

/**
 * Whether replacing the editor text would lose work: a saved query edited since its last save, or
 * an untitled text that was never run (runs are in the history).
 */
export function hasUnsavedChanges({ doc, snippet }: Pick<SqlEditorState, 'doc' | 'snippet'>) {
  if (snippet) return doc !== snippet.saved
  const text = doc.trim()
  return text !== '' && !useHistory.getState().entries.some((e) => e.sql.trim() === text)
}

/** What the history keeps of a finished run. */
function historyEntry(sql: string, at: number, results: StatementResult[], error?: unknown) {
  const last = results.at(-1)
  return {
    sql,
    at,
    duration_ms: results.reduce((ms, r) => ms + r.duration_ms, 0),
    rows: last ? (last.columns.length ? last.rows.length : last.rows_affected) : undefined,
    error:
      results.find((r) => r.error)?.error?.message ??
      (error instanceof Error ? error.message : undefined),
  }
}
