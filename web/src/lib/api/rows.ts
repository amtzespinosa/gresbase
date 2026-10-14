import { keepPreviousData, useMutation, useQueries, useQuery } from '@tanstack/react-query'
import { basePath } from '@/lib/basePath'
import { api, apiPath } from './client'
import type {
  Cell,
  CountResult,
  DDLResult,
  Page,
  Query,
  Reference,
  SQLResult,
  Table,
  ValueResult,
} from './types.gen'

const tablePath = (schema: string, table: string) =>
  `tables/${encodeURIComponent(schema)}/${encodeURIComponent(table)}`

export function useTable(schema: string, table: string) {
  return useQuery({
    queryKey: ['table', schema, table],
    queryFn: () => api<Table>(tablePath(schema, table)),
  })
}

const rowsQuery = (schema: string, table: string, query: Query) => ({
  queryKey: ['rows', schema, table, query],
  queryFn: ({ signal }: { signal: AbortSignal }) =>
    api<Page>(`${tablePath(schema, table)}/rows:query`, { method: 'POST', body: query, signal }),
})

export function useRows(schema: string, table: string, query: Query, enabled = true) {
  return useQuery({
    ...rowsQuery(schema, table, query),
    placeholderData: keepPreviousData,
    enabled,
  })
}

/**
 * One row per primary key (pinned rows), whatever the current page and filters. Same query key
 * prefix as the pages, so saving changes refreshes them too.
 */
// ponytail: one request per pinned row; batch with an OR filter if people pin dozens of rows.
export function useRowsByKey(schema: string, table: string, pks: Record<string, Cell>[]) {
  return useQueries({
    queries: pks.map((pk) =>
      rowsQuery(schema, table, {
        filters: Object.entries(pk).map(([column, value]) => ({ column, op: 'eq', value })),
        logic: 'and',
        sort: [],
        limit: 1,
        cursor: null,
        offset: null,
      }),
    ),
  })
}

/** Exact count on demand (it can be slow on big tables, so it never runs on its own). */
export function useRowCount(schema: string, table: string) {
  return useMutation({
    mutationFn: (query: Query) =>
      api<CountResult>(`${tablePath(schema, table)}/rows:count`, { method: 'POST', body: query }),
  })
}

export function fetchRowsSql(schema: string, table: string, query: Query) {
  return api<SQLResult>(`${tablePath(schema, table)}/rows:sql`, { method: 'POST', body: query })
}

/** The full value of a truncated cell; `pk` maps primary key columns to their wire values. */
export async function fetchCellValue(
  schema: string,
  table: string,
  pk: Record<string, Cell>,
  column: string,
): Promise<Cell> {
  const params = new URLSearchParams({ pk: JSON.stringify(pk), column })
  const res = await api<ValueResult>(`${tablePath(schema, table)}/rows/value?${params}`)
  return res.value
}

export function useTableDdl(schema: string, table: string) {
  return useQuery({
    queryKey: ['ddl', schema, table],
    queryFn: () => api<DDLResult>(`${tablePath(schema, table)}/ddl`),
  })
}

/** For each foreign key pointing at the table, how many rows reference the row with key `pk`. */
export function useReferencedBy(schema: string, table: string, pk: Record<string, Cell> | null) {
  return useQuery({
    queryKey: ['referenced-by', schema, table, pk],
    queryFn: () =>
      api<Reference[]>(
        `${tablePath(schema, table)}/rows/referenced-by?${new URLSearchParams({ pk: JSON.stringify(pk) })}`,
      ),
    enabled: pk !== null,
  })
}

/**
 * Download link of the whole table (filters and sort of `query`; paging is ignored), streamed by
 * the server. A GET, so a plain link works with the session cookie.
 */
export function exportUrl(schema: string, table: string, query: Query, format: 'csv' | 'json') {
  const bytes = new TextEncoder().encode(JSON.stringify(query))
  const q = btoa(Array.from(bytes, (b) => String.fromCharCode(b)).join(''))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
  return `${basePath}api/v1/${apiPath(tablePath(schema, table))}/export?format=${format}&q=${q}`
}
