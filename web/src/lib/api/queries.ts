import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { api } from './client'
import type { ConfigResponse, ConnectionInfo, Relation } from './types.gen'

export function useConfig() {
  return useQuery({
    queryKey: ['config'],
    queryFn: () => api<ConfigResponse>('config'),
    staleTime: Infinity,
  })
}

export function useConnection() {
  return useQuery({
    queryKey: ['connection'],
    queryFn: () => api<ConnectionInfo>('connection'),
    staleTime: 60_000,
  })
}

export function useSchemas() {
  return useQuery({ queryKey: ['schemas'], queryFn: () => api<string[]>('schemas') })
}

export function useRelations(schema: string | undefined) {
  return useQuery({
    queryKey: ['relations', schema],
    queryFn: () => api<Relation[]>(`schemas/${encodeURIComponent(schema ?? '')}/relations`),
    enabled: schema !== undefined,
  })
}

/**
 * Whether the connected server has a capability (internal/pg/capabilities). When it doesn't,
 * `requires` explains what it needs, for a tooltip on the disabled control. Unknown while the
 * connection loads (available: false, no reason).
 */
export function useCapability(name: string): { available: boolean; requires?: string } {
  const { t } = useTranslation()
  const data = useConnection().data
  const cap = data?.capabilities[name]
  if (!data || !cap) return { available: false }
  if (cap.available) return { available: true }
  // The version is the first requirement; past it, the missing piece is the extension.
  const requires =
    cap.min_version && data.server_version_num < cap.min_version
      ? t('capability.requiresVersion', { major: Math.floor(cap.min_version / 10000) })
      : cap.extension
        ? t('capability.requiresExtension', { name: cap.extension })
        : undefined
  return { available: false, requires }
}

/**
 * Whether the tab's connection is read-only (GRESBASE_READ_ONLY or the connection's own flag);
 * undefined while it loads.
 */
export function useReadOnly(): boolean | undefined {
  const global = useConfig().data?.read_only
  const conn = useConnection().data?.read_only
  if (global) return true
  return conn
}
