import type { ConnectionInput } from '@/lib/api/types.gen'

/** A connection used in free mode, kept in this browser without its password. */
export type RecentConnection = Omit<ConnectionInput, 'password' | 'read_only'>

const KEY = 'gresbase:recent-connections'
const MAX = 5

const same = (a: RecentConnection, b: RecentConnection) =>
  a.host === b.host && a.port === b.port && a.database === b.database && a.user === b.user

export function loadRecent(): RecentConnection[] {
  try {
    const list: unknown = JSON.parse(localStorage.getItem(KEY) ?? '[]')
    return Array.isArray(list) ? (list as RecentConnection[]).slice(0, MAX) : []
  } catch {
    return []
  }
}

/** Puts `c` first (without password) and keeps the last five. */
export function saveRecent(c: ConnectionInput) {
  const entry: RecentConnection = {
    host: c.host,
    port: c.port,
    database: c.database,
    user: c.user,
    sslmode: c.sslmode,
  }
  try {
    const next = [entry, ...loadRecent().filter((r) => !same(r, entry))].slice(0, MAX)
    localStorage.setItem(KEY, JSON.stringify(next))
  } catch {
    // storage blocked: recents are a convenience
  }
}
