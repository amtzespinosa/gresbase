import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from './client'
import type {
  Dependents,
  DropRequest,
  Impact,
  ImportOptions,
  ImportResult,
  Op,
  TruncateRequest,
} from './types.gen'

const tablePath = (schema: string, table: string) =>
  `tables/${encodeURIComponent(schema)}/${encodeURIComponent(table)}`

/** What the deletes of a changeset would also delete or change in other tables. */
export const fetchImpact = (schema: string, table: string, ops: Op[]) =>
  api<Impact>(`${tablePath(schema, table)}/changesets:impact`, { method: 'POST', body: { ops } })

/** Tables TRUNCATE … CASCADE would also empty and objects DROP … CASCADE would also drop. */
export function useDependents(schema: string, table: string, enabled: boolean) {
  return useQuery({
    queryKey: ['dependents', schema, table],
    queryFn: () => api<Dependents>(`${tablePath(schema, table)}/dependents`),
    enabled,
  })
}

/** Truncate or drop a table; both refresh everything that showed it. */
export function useTableAction(schema: string, table: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (
      a: ({ kind: 'truncate' } & TruncateRequest) | ({ kind: 'drop' } & DropRequest),
    ) => {
      const { kind, ...body } = a
      return kind === 'truncate'
        ? api<undefined>(`${tablePath(schema, table)}:truncate`, { method: 'POST', body })
        : api<undefined>(tablePath(schema, table), { method: 'DELETE', body })
    },
    onSuccess: (_, a) => {
      if (a.kind === 'drop') {
        // The table is gone: forget it instead of refetching it (that would 404). CASCADE only
        // drops views and constraints, so other tables keep their rows.
        for (const k of ['table', 'rows']) qc.removeQueries({ queryKey: [k, schema, table] })
        // Its own dependents query is still mounted in the closing dialog: leave it alone.
        return Promise.all([
          qc.invalidateQueries({ queryKey: ['relations'] }),
          qc.invalidateQueries({
            queryKey: ['dependents'],
            predicate: (q) => q.queryKey[1] !== schema || q.queryKey[2] !== table,
          }),
        ])
      }
      // TRUNCATE … CASCADE empties other tables too: every table's rows are stale.
      return Promise.all(
        ['rows', 'table', 'relations'].map((k) => qc.invalidateQueries({ queryKey: [k] })),
      )
    },
  })
}

/** Imports a CSV file into a table; on success its rows (and counts) are stale. */
export function useImport(schema: string, table: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ options, file }: { options: ImportOptions; file: File }) => {
      const body = new FormData()
      // The server reads the options before streaming the file: keep this order.
      body.append('options', JSON.stringify(options))
      body.append('file', file)
      return api<ImportResult>(`${tablePath(schema, table)}/import`, { method: 'POST', body })
    },
    onSuccess: (res) =>
      res.inserted > 0 &&
      Promise.all([
        qc.invalidateQueries({ queryKey: ['rows', schema, table] }),
        qc.invalidateQueries({ queryKey: ['table', schema, table] }),
        qc.invalidateQueries({ queryKey: ['relations'] }),
      ]),
  })
}
