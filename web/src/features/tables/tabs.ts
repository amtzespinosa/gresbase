import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { basePath } from '@/lib/basePath'

/** A table of one connection, by schema and name. */
export interface TableRef {
  schema: string
  table: string
}

interface ConnectionTables {
  /** Open tabs, in tab order. */
  tabs: TableRef[]
  /** Starred tables, in starring order. */
  favorites: TableRef[]
}

const empty: ConnectionTables = { tabs: [], favorites: [] }

const same = (a: TableRef) => (b: TableRef) => a.schema === b.schema && a.table === b.table

interface TablesState {
  byConnection: Record<string, ConnectionTables>
  openTab: (connection: string, ref: TableRef) => void
  closeTabs: (connection: string, keep: (ref: TableRef) => boolean) => void
  moveTab: (connection: string, from: number, to: number) => void
  toggleFavorite: (connection: string, ref: TableRef) => void
}

/** Open table tabs and favorite tables, per connection, remembered in this browser. */
export const useTableTabs = create<TablesState>()(
  persist(
    (set) => {
      const edit = (connection: string, fn: (c: ConnectionTables) => Partial<ConnectionTables>) =>
        set(({ byConnection }) => {
          const current = byConnection[connection] ?? empty
          return { byConnection: { ...byConnection, [connection]: { ...current, ...fn(current) } } }
        })
      return {
        byConnection: {},
        openTab: (connection, ref) =>
          edit(connection, ({ tabs }) => (tabs.some(same(ref)) ? {} : { tabs: [...tabs, ref] })),
        closeTabs: (connection, keep) =>
          edit(connection, ({ tabs }) => ({ tabs: tabs.filter(keep) })),
        moveTab: (connection, from, to) =>
          edit(connection, ({ tabs }) => {
            const next = [...tabs]
            const [moved] = next.splice(from, 1)
            if (moved) next.splice(Math.max(0, Math.min(to, next.length)), 0, moved)
            return { tabs: next }
          }),
        toggleFavorite: (connection, ref) =>
          edit(connection, ({ favorites }) => ({
            favorites: favorites.some(same(ref))
              ? favorites.filter((f) => !same(ref)(f))
              : [...favorites, ref],
          })),
      }
    },
    {
      // One entry per app instance (base path): connection ids repeat across instances.
      name: `gresbase:tables:${basePath}`,
      partialize: ({ byConnection }) => ({ byConnection }),
    },
  ),
)

/** The tabs and favorites of a connection. */
export function useConnectionTables(connection: string): ConnectionTables {
  return useTableTabs((s) => s.byConnection[connection] ?? empty)
}

export const isSameTable = (a: TableRef, b: TableRef) => same(a)(b)
