import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api, setConnection } from './client'
import type { ConnectionInput, LoginRequest, SessionResponse } from './types.gen'

export function useLogin() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: LoginRequest) =>
      api<SessionResponse>('auth/login', { method: 'POST', body }),
    onSuccess: () => {
      newSession()
      return qc.invalidateQueries()
    },
  })
}

export function useLogout() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => api<undefined>('auth/logout', { method: 'POST' }),
    onSettled: () => {
      newSession()
      qc.clear()
    },
  })
}

/** Only same-app paths are accepted as post-login targets (no open redirects). */
export function safeRedirect(value: unknown): string | undefined {
  // "//host" and "/\host" are protocol-relative URLs for browsers.
  return typeof value === 'string' && /^\/(?![/\\])/.test(value) ? value : undefined
}

/** Free mode: connecting with Postgres credentials is the login. */
export function useConnect() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: ConnectionInput) =>
      api<SessionResponse>('auth/connect', { method: 'POST', body }),
    // A new connection: nothing cached from the previous one may stay.
    onSuccess: () => {
      newSession()
      qc.removeQueries({ predicate: (q) => q.queryKey[0] !== 'config' })
    },
  })
}

/**
 * A session starts or ends: the tab forgets its connection, so the next screen checks again that
 * the session can use it (a free mode session's connection ends with it; see the /c route).
 */
function newSession() {
  setConnection(undefined)
}
