import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from './client'
import type { StructureChange, StructurePreview, TypeInfo } from './types.gen'

/** The types a column can have, for the type picker. */
export function useTypes() {
  return useQuery({
    queryKey: ['types'],
    queryFn: () => api<TypeInfo[]>('types'),
    staleTime: 5 * 60_000,
  })
}

/** The exact SQL of a structure change and its warnings; `null` while the form is incomplete. */
export function useStructurePreview(change: StructureChange | null) {
  return useQuery({
    queryKey: ['structure-preview', change],
    queryFn: () =>
      api<StructurePreview>('structure:preview', { method: 'POST', body: change ?? undefined }),
    enabled: change !== null,
    placeholderData: keepPreviousData,
    retry: false,
  })
}

/** Runs a structure change. Everything describing tables may be stale afterwards. */
export function useApplyStructure() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (change: StructureChange) =>
      api<StructurePreview>('structure', { method: 'POST', body: change }),
    onSuccess: (_, c) => {
      // A renamed or moved table is gone under its old name: forget it instead of refetching (404).
      if (c.kind === 'rename_table' || c.kind === 'set_table_schema')
        for (const k of ['table', 'rows', 'ddl'])
          qc.removeQueries({ queryKey: [k, c.schema, c.table] })
      return Promise.all(
        ['table', 'rows', 'ddl', 'relations', 'schemas', 'dependents', 'completions'].map((k) =>
          qc.invalidateQueries({ queryKey: [k] }),
        ),
      )
    },
  })
}
