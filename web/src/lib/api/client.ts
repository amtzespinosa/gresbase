import { basePath } from '@/lib/basePath'
import type { Analysis, Conflict } from './types.gen'

/** Common API error body (AGENTS.md → API). `code` is stable and translated by the UI. */
export interface ApiErrorBody {
  code: string
  message: string
  detail?: string
  hint?: string
  position?: number
  pg_code?: string
  /** Why a connection_failed happened: dns, connection_refused, authentication, ssl… */
  reason?: string
  /** 409 conflict of a changeset: which operation and the values that differ. */
  conflict?: Conflict
  /** 409 confirmation_required of the SQL editor: the destructive statements. */
  analysis?: Analysis
}

export class ApiError extends Error {
  readonly status: number
  readonly code: string
  readonly detail?: string
  readonly hint?: string
  readonly position?: number
  readonly pgCode?: string
  readonly reason?: string
  readonly conflict?: Conflict
  readonly analysis?: Analysis

  constructor(status: number, body: ApiErrorBody) {
    super(body.message)
    this.name = 'ApiError'
    this.status = status
    this.code = body.code
    this.detail = body.detail
    this.hint = body.hint
    this.position = body.position
    this.pgCode = body.pg_code
    this.reason = body.reason
    this.conflict = body.conflict
    this.analysis = body.analysis
  }
}

let onUnauthorized = () => {
  if (!window.location.pathname.endsWith('/login')) window.location.assign(`${basePath}login`)
}

/** Lets the router replace the default full-page redirect to /login on 401. */
export function setUnauthorizedHandler(handler: () => void) {
  onUnauthorized = handler
}

export interface RequestOptions {
  method?: string
  body?: unknown
  signal?: AbortSignal
  /** Lets the request outlive the page (rollback on exit). */
  keepalive?: boolean
  /** Extra request headers (the setup token). */
  headers?: Record<string, string>
}

/**
 * The connection of this tab (the `/c/$connectionId` route sets it). Every database route goes to
 * `/api/v1/c/<id>/…`, so two tabs can work on different connections; each tab has its own module.
 */
let connectionId: string | undefined

export const currentConnection = () => connectionId

export function setConnection(id: string | undefined) {
  connectionId = id
}

/** The database routes (internal/server dbRoutes); the rest (auth, config, snippets…) are global. */
const dbRoute =
  /^(connection$|schemas($|\/)|tables\/|sql\/|changesets\/|types$|structure($|:)|search$)/

/** `path` under `/api/v1/`, prefixed with the tab's connection when it is a database route. */
export function apiPath(path: string) {
  const p = path.replace(/^\//, '')
  return connectionId && dbRoute.test(p) ? `c/${encodeURIComponent(connectionId)}/${p}` : p
}

/** Calls `/api/v1/<path>` under the base path. Non-GET requests carry the anti-CSRF header. */
export async function api<T>(
  path: string,
  { method = 'GET', body, signal, keepalive, headers: extra }: RequestOptions = {},
): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json', ...extra }
  if (method !== 'GET' && method !== 'HEAD') headers['X-Gresbase'] = '1'
  const form = body instanceof FormData
  if (body !== undefined && !form) headers['Content-Type'] = 'application/json'

  const url = new URL(`${basePath}api/v1/${apiPath(path)}`, window.location.origin)
  const res = await fetch(url, {
    method,
    headers,
    body: body === undefined ? undefined : form ? body : JSON.stringify(body),
    credentials: 'same-origin',
    signal,
    keepalive,
  })

  if (res.status === 401) onUnauthorized()
  if (!res.ok) throw new ApiError(res.status, await errorBody(res))
  if (res.status === 204) return undefined as T
  const data: unknown = await res.json()
  // A slow request answered after heartbeats (api.Heartbeat) is always 200: its error is in the body.
  const late = (data as { error?: ApiErrorBody } | null)?.error
  if (late?.code) throw new ApiError(res.status, late)
  return data as T
}

/** The common error body of a failed response (a generic one when it is not JSON). */
export async function errorBody(res: Response): Promise<ApiErrorBody> {
  try {
    const data = (await res.json()) as { error?: ApiErrorBody }
    if (data.error?.code) return data.error
  } catch {
    // not JSON: fall through
  }
  return { code: res.status >= 500 ? 'internal' : 'bad_request', message: `HTTP ${res.status}` }
}

/**
 * Downloads a server file (exports) only once the server has accepted the request, so an error
 * (expired session, bad filter…) is thrown instead of being saved as the file.
 */
export async function download(url: string) {
  const ctl = new AbortController()
  const res = await fetch(url, { credentials: 'same-origin', signal: ctl.signal })
  if (res.status === 401) onUnauthorized()
  if (!res.ok) throw new ApiError(res.status, await errorBody(res))
  // ponytail: the probe starts the export and cancels it at once (the server stops on disconnect);
  // a HEAD route would avoid the extra query if that ever matters on huge tables.
  ctl.abort()
  const a = document.createElement('a')
  a.href = url
  a.download = ''
  a.click()
}

/**
 * POSTs to `/api/v1/<path>` and calls `onLine` with each JSON line of an NDJSON answer as it
 * arrives (the global search streams one event per table). Errors before the stream are thrown
 * as ApiError, like `api()`.
 */
export async function apiStream<T>(
  path: string,
  body: unknown,
  onLine: (line: T) => void,
  signal?: AbortSignal,
) {
  const url = new URL(`${basePath}api/v1/${apiPath(path)}`, window.location.origin)
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Accept: 'application/x-ndjson',
      'Content-Type': 'application/json',
      'X-Gresbase': '1',
    },
    body: JSON.stringify(body),
    credentials: 'same-origin',
    signal,
  })
  if (res.status === 401) onUnauthorized()
  if (!res.ok || !res.body) throw new ApiError(res.status, await errorBody(res))
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader()
  let rest = ''
  for (;;) {
    const { value, done } = await reader.read()
    if (done) break
    const lines = (rest + value).split('\n')
    rest = lines.pop() ?? ''
    for (const l of lines) if (l.trim()) onLine(JSON.parse(l) as T)
  }
  if (rest.trim()) onLine(JSON.parse(rest) as T)
}
