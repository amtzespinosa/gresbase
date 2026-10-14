import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from './client'
import type { Entry, Snippet } from './types.gen'

/** Saved queries: .sql files under the data dir, addressed by their relative path. */
export function useSnippets() {
  // Free mode users get their own private folder on the server.
  return useQuery({ queryKey: ['snippets'], queryFn: () => api<Entry[]>('snippets') })
}

export const getSnippet = (path: string) =>
  api<Snippet>(`snippets/file?path=${encodeURIComponent(path)}`)

export function useSnippet(path: string | undefined) {
  return useQuery({
    queryKey: ['snippet', path],
    queryFn: () => getSnippet(path ?? ''),
    enabled: !!path,
    // The editor owns the text once loaded: don't overwrite it behind the user's back.
    staleTime: Infinity,
    retry: false,
  })
}

export type SnippetAction =
  | { kind: 'create'; path: string; sql: string }
  | { kind: 'update'; path: string; sql: string }
  | { kind: 'move'; from: string; to: string }
  | { kind: 'delete'; path: string }
  | { kind: 'folder'; path: string }

/** Every change to the saved queries; refreshes the list afterwards. */
export function useSnippetAction() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (a: SnippetAction): Promise<Snippet | undefined> => {
      switch (a.kind) {
        case 'create':
        case 'update':
          return api<Snippet>('snippets', {
            method: a.kind === 'create' ? 'POST' : 'PUT',
            body: { path: a.path, sql: a.sql },
          })
        case 'move':
          return api('snippets:move', { method: 'POST', body: { from: a.from, to: a.to } })
        case 'delete':
          return api(`snippets?path=${encodeURIComponent(a.path)}`, { method: 'DELETE' })
        case 'folder':
          return api('snippets/folders', { method: 'POST', body: { path: a.path } })
      }
    },
    onSuccess: () => {
      // Stale, not refetched now: the open query's old path may be gone (rename, delete).
      void qc.invalidateQueries({ queryKey: ['snippet'], refetchType: 'none' })
      return qc.invalidateQueries({ queryKey: ['snippets'] })
    },
  })
}

/** "reports/monthly.sql" → "monthly". */
export const snippetName = (path: string) => (path.split('/').pop() ?? path).replace(/\.sql$/, '')

/** What the user typed as a name → a snippet path: no surrounding slashes, ending in .sql. */
export const toSnippetPath = (name: string) => {
  const p = name.trim().replace(/^\/+|\/+$/g, '')
  return p.endsWith('.sql') ? p : `${p}.sql`
}

/**
 * Saved queries of one connection live in its folder `@<id>/`; every other one is for all
 * connections.
 */
export const connectionFolder = (id: string) => `@${id}`

/** Whether a saved query (or folder) shows on connection `id`: the shared ones and its own. */
export const visibleOn = (path: string, id: string) =>
  !path.startsWith('@') ||
  path === connectionFolder(id) ||
  path.startsWith(`${connectionFolder(id)}/`)
