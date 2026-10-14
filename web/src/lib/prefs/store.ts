import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Lang } from '@/lib/i18n'

export type Theme = 'light' | 'dark' | 'system'
export type Density = 'comfortable' | 'compact'

/**
 * Something the user opened, for the palette's "Recent" group: a table or a saved query, on a
 * connection (items saved before connections existed have none: they belong to `env`).
 */
export type RecentItem = { connection?: string } & (
  { kind: 'table'; schema: string; table: string } | { kind: 'snippet'; path: string }
)

const MAX_RECENT = 6

/** The connection a recent item belongs to. */
export const recentConnection = (r: RecentItem) => r.connection ?? 'env'

const sameItem = (a: RecentItem, b: RecentItem) =>
  recentConnection(a) === recentConnection(b) &&
  (a.kind === 'table'
    ? b.kind === 'table' && a.schema === b.schema && a.table === b.table
    : b.kind === 'snippet' && a.path === b.path)

interface PrefsState {
  theme: Theme
  /** Row height of the data grids. */
  density: Density
  /** null until the user toggles it: then the default depends on the viewport width. */
  sidebarCollapsed: boolean | null
  /** null until the user picks one: then the server default (GRESBASE_LANG) applies. */
  lang: Lang | null
  /** Schema picked in the table browser; null means "public" (or the first one). */
  schema: string | null
  /** Most recent first; up to MAX_RECENT per connection. */
  recent: RecentItem[]
  /** Width in px of the table list card; null is the default width. */
  tableListWidth: number | null
  setTheme: (theme: Theme) => void
  setDensity: (density: Density) => void
  setSidebarCollapsed: (collapsed: boolean) => void
  setLang: (lang: Lang) => void
  setSchema: (schema: string) => void
  addRecent: (item: RecentItem) => void
  setTableListWidth: (width: number | null) => void
}

// public/theme.js and lib/i18n read the same key before React loads; keep them in sync.
export const PREFS_KEY = 'gresbase:prefs'

export const usePrefs = create<PrefsState>()(
  persist(
    (set) => ({
      theme: 'system',
      density: 'comfortable',
      sidebarCollapsed: null,
      lang: null,
      schema: null,
      recent: [],
      tableListWidth: null,
      setTheme: (theme) => set({ theme }),
      setDensity: (density) => set({ density }),
      setSidebarCollapsed: (sidebarCollapsed) => set({ sidebarCollapsed }),
      setLang: (lang) => set({ lang }),
      setSchema: (schema) => set({ schema }),
      setTableListWidth: (tableListWidth) => set({ tableListWidth }),
      addRecent: (item) =>
        set(({ recent }) => {
          const conn = recentConnection(item)
          const rest = recent.filter((r) => !sameItem(r, item))
          const mine = rest.filter((r) => recentConnection(r) === conn).slice(0, MAX_RECENT - 1)
          return {
            recent: [item, ...rest.filter((r) => recentConnection(r) !== conn || mine.includes(r))],
          }
        }),
    }),
    {
      name: PREFS_KEY,
      partialize: ({ theme, density, sidebarCollapsed, lang, schema, recent, tableListWidth }) => ({
        theme,
        density,
        sidebarCollapsed,
        lang,
        schema,
        recent,
        tableListWidth,
      }),
    },
  ),
)

export function resolveTheme(theme: Theme): 'light' | 'dark' {
  if (theme !== 'system') return theme
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export function isSidebarCollapsed(stored: boolean | null): boolean {
  return stored ?? window.innerWidth < 1024
}
