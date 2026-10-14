import { useCallback, useEffect, useRef, useState } from 'react'
import { apiStream } from '@/lib/api/client'
import type { SearchEvent, SearchRequest, SearchTableRef } from '@/lib/api/types.gen'

export type TableResult = SearchEvent & { type: 'table' }
export type SkippedTable = SearchEvent & { type: 'skipped' }

export interface SearchState {
  status: 'idle' | 'running' | 'done' | 'canceled' | 'error'
  /** Tables to search and how many have answered. */
  total: number
  finished: number
  skippedLarge: number
  /** Tables with at least one matching row, in the order they answered. */
  results: TableResult[]
  skipped: SkippedTable[]
  found: number
  truncated: boolean
  error?: unknown
}

const initial: SearchState = {
  status: 'idle',
  total: 0,
  finished: 0,
  skippedLarge: 0,
  results: [],
  skipped: [],
  found: 0,
  truncated: false,
}

/** Time limit of a retried table: the one that was too slow gets more time, on its own. */
export const RETRY_TIMEOUT_MS = 30_000

const sameTable = (a: { schema?: string; table?: string }, b: SearchTableRef) =>
  a.schema === b.schema && a.table === b.table

/**
 * Runs the global search while `q` has two characters or more, applying each streamed event as it
 * arrives. A new term, schemas or `includeLarge` cancels the search in flight (the server stops
 * querying when the request goes away), and so does `cancel`.
 */
export function useGlobalSearch(q: string, schemas: string[], includeLarge: boolean) {
  const ctl = useRef<AbortController | null>(null)
  const key = JSON.stringify([q.trim(), schemas, includeLarge])
  const [state, setState] = useState<SearchState & { key: string }>({ ...initial, key: '' })
  // A new search starts from scratch: reset while rendering, not in the effect.
  if (state.key !== key) {
    setState({ ...initial, key, status: q.trim().length >= 2 ? 'running' : 'idle' })
  }

  const apply = (e: SearchEvent) =>
    setState((s) => {
      switch (e.type) {
        case 'start':
          return { ...s, total: e.tables ?? 0, skippedLarge: e.skipped_large ?? 0 }
        case 'table':
          return {
            ...s,
            finished: s.finished + 1,
            found: s.found + (e.rows?.length ?? 0),
            results: e.rows?.length ? [...s.results, e as TableResult] : s.results,
          }
        case 'skipped':
          return { ...s, finished: s.finished + 1, skipped: [...s.skipped, e as SkippedTable] }
        case 'done':
          return { ...s, status: 'done', truncated: !!e.truncated }
      }
      return s
    })

  useEffect(() => {
    const [term, scope, large] = JSON.parse(key) as [string, string[], boolean]
    ctl.current?.abort()
    if (term.length < 2) return
    const c = new AbortController()
    ctl.current = c
    const req: SearchRequest = { q: term, schemas: scope, include_large: large }
    // Lines of a search that was replaced or canceled are dropped.
    const onLine = (e: SearchEvent) => !c.signal.aborted && apply(e)
    apiStream<SearchEvent>('search', req, onLine, c.signal).catch((error: unknown) => {
      if (c.signal.aborted) return
      setState((s) => ({ ...s, status: 'error', error }))
    })
    return () => c.abort()
  }, [key])

  const cancel = useCallback(() => {
    ctl.current?.abort()
    setState((s) => (s.status === 'running' ? { ...s, status: 'canceled' } : s))
  }, [])

  /** Searches one skipped table again, with more time; its results replace the skip. */
  const retry = useCallback(
    (table: SearchTableRef) => {
      setState((s) => ({ ...s, skipped: s.skipped.filter((x) => !sameTable(x, table)) }))
      const req: SearchRequest = {
        q: q.trim(),
        tables: [table],
        include_large: true,
        timeout_ms: RETRY_TIMEOUT_MS,
      }
      void apiStream<SearchEvent>('search', req, (e) => {
        if (e.type === 'table' && e.rows?.length) {
          setState((s) => ({
            ...s,
            found: s.found + (e.rows?.length ?? 0),
            results: [...s.results, e as TableResult],
          }))
        } else if (e.type === 'skipped') {
          setState((s) => ({ ...s, skipped: [...s.skipped, e as SkippedTable] }))
        }
      }).catch((error: unknown) => setState((s) => ({ ...s, error })))
    },
    [q],
  )

  return { ...state, cancel, retry }
}
