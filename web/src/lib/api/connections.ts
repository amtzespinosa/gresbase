import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useParams } from '@tanstack/react-router'
import { api } from './client'
import type {
  ConnectionEntry,
  ConnectionInfo,
  ConnectionInput,
  ConnectionList,
  ConnectionTest,
  LabelColor,
  SavedConnectionInput,
} from './types.gen'

export const labelColors: LabelColor[] = ['gray', 'red', 'orange', 'green', 'blue', 'purple']

/** The connections the session can pick (with management rights for the administrator). */
export const connectionsQuery = queryOptions({
  queryKey: ['connections'],
  queryFn: () => api<ConnectionList>('connections'),
  staleTime: 30_000,
})

export const useConnections = () => useQuery(connectionsQuery)

/** The entry of one connection in the list (name, color…), if the session can see it. */
export function useConnectionEntry(id: string): ConnectionEntry | undefined {
  return useConnections().data?.connections.find((c) => c.id === id)
}

/**
 * Status and version of any connection, for the selector: asked only while `enabled` (opening a
 * pool per connection is not free).
 */
export const connectionStatusQuery = (id: string) =>
  queryOptions({
    queryKey: ['connectionStatus', id],
    queryFn: () => api<ConnectionInfo>(`c/${encodeURIComponent(id)}/connection`),
    staleTime: 60_000,
    retry: false,
  })

export function useConnectionStatus(id: string, enabled: boolean) {
  return useQuery({ ...connectionStatusQuery(id), enabled })
}

export type ConnectionAction =
  | { kind: 'create'; body: SavedConnectionInput }
  | { kind: 'update'; id: string; body: SavedConnectionInput }
  | { kind: 'delete'; id: string }

/** Creates, edits or deletes a saved connection (administrator only). */
export function useConnectionAction() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (a: ConnectionAction) => {
      switch (a.kind) {
        case 'create':
          return api<ConnectionEntry>('connections', { method: 'POST', body: a.body })
        case 'update':
          return api<ConnectionEntry>(`connections/${encodeURIComponent(a.id)}`, {
            method: 'PUT',
            body: a.body,
          })
        case 'delete':
          return api<undefined>(`connections/${encodeURIComponent(a.id)}`, { method: 'DELETE' })
      }
    },
    onSuccess: (_, a) => {
      if (a.kind !== 'create') qc.removeQueries({ queryKey: ['connectionStatus', a.id] })
      return qc.invalidateQueries({ queryKey: ['connections'] })
    },
  })
}

/** "Test connection" of the form; with the id of a saved one, an empty password uses the stored. */
export const testConnection = (connection: ConnectionInput, id?: string) =>
  api<ConnectionTest>('connections:test', { method: 'POST', body: { id, connection } })

/** The connection of the current route (`/c/$connectionId/…`); "" outside of one. */
export const useConnectionId = (): string => useParams({ strict: false }).connectionId ?? ''

/** CSS color of a connection label (tokens --label-*, docs/design.md). */
export const labelColor = (color: LabelColor | undefined) => `var(--label-${color ?? 'gray'})`
