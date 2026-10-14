import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from './client'
import type { ChangesetPreview, ChangesetResult, Op } from './types.gen'

const changesetsPath = (schema: string, table: string) =>
  `tables/${encodeURIComponent(schema)}/${encodeURIComponent(table)}/changesets`

/** The SQL a changeset would run, without running it (for the diff dialog). */
export function useChangesetPreview(schema: string, table: string, ops: Op[], enabled: boolean) {
  return useQuery({
    queryKey: ['changeset-preview', schema, table, ops],
    queryFn: () =>
      api<ChangesetPreview>(`${changesetsPath(schema, table)}:preview`, {
        method: 'POST',
        body: { ops },
      }),
    enabled: enabled && ops.length > 0,
  })
}

/** Applies a changeset in one transaction and refreshes the table's rows. */
export function useApplyChangeset(schema: string, table: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (ops: Op[]) =>
      api<ChangesetResult>(changesetsPath(schema, table), { method: 'POST', body: { ops } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['rows', schema, table] }),
  })
}

/** Undoes or redoes a saved changeset (same session) and refreshes the table's rows. */
export function useToggleChangeset(schema: string, table: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, dir }: { id: string; dir: 'undo' | 'redo' }) =>
      api<ChangesetResult>(`changesets/${encodeURIComponent(id)}/${dir}`, { method: 'POST' }),
    onSettled: () => qc.invalidateQueries({ queryKey: ['rows', schema, table] }),
  })
}
