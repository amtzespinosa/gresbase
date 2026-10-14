import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from './client'
import type { PasswordChange, SessionResponse, SettingsResponse } from './types.gen'

/** The signed-in session: user, role and whether the account is fixed by the environment. */
export function useSession() {
  return useQuery({
    queryKey: ['session'],
    queryFn: () => api<SessionResponse>('auth/session'),
    staleTime: 60_000,
  })
}

/** Server settings with their origin (administrator only). */
export function useServerSettings(enabled: boolean) {
  return useQuery({
    queryKey: ['settings'],
    queryFn: () => api<SettingsResponse>('settings'),
    enabled,
  })
}

/** Stores one setting; "" resets it to its default. */
export function usePatchSetting() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ key, value }: { key: string; value: string }) =>
      api<SettingsResponse>('settings', { method: 'PATCH', body: { settings: { [key]: value } } }),
    onSuccess: (data) => {
      qc.setQueryData(['settings'], data)
      // lang and sql_max_rows are live and reported by /config.
      void qc.invalidateQueries({ queryKey: ['config'] })
    },
  })
}

export function useChangePassword() {
  return useMutation({
    mutationFn: (body: PasswordChange) => api<undefined>('auth/password', { method: 'POST', body }),
  })
}
