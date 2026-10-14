import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from './client'
import type {
  ConnectionInput,
  ConnectionTest,
  SetupRequest,
  SetupResult,
  SetupStatus,
} from './types.gen'

/** Header of the setup token on requests that don't come from this machine. */
const tokenHeader = (token: string): Record<string, string> =>
  token ? { 'X-Gresbase-Setup-Token': token } : {}

/** Read once: completing setup must not swap the wizard for a redirect before its last step. */
export function useSetupStatus() {
  return useQuery({
    queryKey: ['setup'],
    queryFn: () => api<SetupStatus>('setup'),
    staleTime: Infinity,
  })
}

export function useVerifySetupToken() {
  return useMutation({
    mutationFn: (token: string) =>
      api<undefined>('setup/verify', { method: 'POST', headers: tokenHeader(token) }),
  })
}

export function useTestConnection(token: string) {
  return useMutation({
    mutationFn: (body: ConnectionInput) =>
      api<ConnectionTest>('setup/test', { method: 'POST', body, headers: tokenHeader(token) }),
  })
}

export function useCompleteSetup(token: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: SetupRequest) =>
      api<SetupResult>('setup', { method: 'POST', body, headers: tokenHeader(token) }),
    // setup_required and auth_enabled change; the wizard keeps its status until it leaves.
    onSuccess: () => qc.invalidateQueries({ queryKey: ['config'] }),
  })
}
