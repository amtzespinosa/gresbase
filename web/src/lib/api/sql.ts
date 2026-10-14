import { useQuery } from '@tanstack/react-query'
import { api } from './client'
import type { Completions, SQLRequest, SQLResponse, TxInfo, TxResult } from './types.gen'

const txPath = (id: string) => `sql/transactions/${encodeURIComponent(id)}`

export const beginTx = () => api<TxInfo>('sql/transactions', { method: 'POST' })
export const getTx = (id: string) => api<TxInfo>(txPath(id))
export const commitTx = (id: string) => api<TxResult>(`${txPath(id)}/commit`, { method: 'POST' })
/** `keepalive` lets the rollback finish while the page unloads (pagehide). */
export const rollbackTx = (id: string, keepalive = false) =>
  api<TxResult>(`${txPath(id)}/rollback`, { method: 'POST', keepalive })

/** Open transactions of this session, newest first: a closed or reloaded page may have left some. */
export function useOpenTxs() {
  return useQuery({ queryKey: ['sqlTxs'], queryFn: () => api<TxInfo[]>('sql/transactions') })
}

export function executeSql(req: SQLRequest, signal?: AbortSignal) {
  return api<SQLResponse>('sql/execute', { method: 'POST', body: req, signal })
}

export function cancelExecution(id: string) {
  return api<undefined>(`sql/executions/${encodeURIComponent(id)}/cancel`, { method: 'POST' })
}

/** Tables, columns and functions for the editor's autocompletion. */
export function useCompletions() {
  return useQuery({
    queryKey: ['completions'],
    queryFn: () => api<Completions>('sql/completions'),
    staleTime: 60_000,
  })
}
