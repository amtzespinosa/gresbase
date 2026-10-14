import type { ConnectionInput } from '@/lib/api/types.gen'

export type SslMode = ConnectionInput['sslmode']
export const SSL_MODES: SslMode[] = ['disable', 'prefer', 'require', 'verify-ca', 'verify-full']

export const emptyConnection = (): ConnectionInput => ({
  host: '',
  port: 5432,
  database: '',
  user: '',
  password: '',
  sslmode: 'prefer',
  read_only: false,
})

/** Fields of a pasted postgres:// URL, or null if it isn't one. Unknown parameters are dropped. */
export function parseConnectionUrl(text: string): Partial<ConnectionInput> | null {
  let u: URL
  try {
    u = new URL(text.trim())
  } catch {
    return null
  }
  if (u.protocol !== 'postgres:' && u.protocol !== 'postgresql:') return null
  const out: Partial<ConnectionInput> = {}
  if (u.hostname) out.host = decodeURIComponent(u.hostname.replace(/^\[|\]$/g, ''))
  if (u.port) out.port = Number(u.port)
  if (u.username) out.user = decodeURIComponent(u.username)
  if (u.password) out.password = decodeURIComponent(u.password)
  const db = decodeURIComponent(u.pathname.replace(/^\//, ''))
  if (db) out.database = db
  const ssl = u.searchParams.get('sslmode')
  if (ssl && (SSL_MODES as string[]).includes(ssl)) out.sslmode = ssl as SslMode
  return out
}
