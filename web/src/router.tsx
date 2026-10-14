import type { QueryClient } from '@tanstack/react-query'
import {
  createRootRouteWithContext,
  createRoute,
  createRouter,
  lazyRouteComponent,
  type RouterHistory,
  redirect,
  stripSearchParams,
} from '@tanstack/react-router'
import { RouteError } from '@/components/ErrorPanel'
import { basePath } from '@/lib/basePath'
import { ApiError, currentConnection, setConnection } from '@/lib/api/client'
import { connectionsQuery } from '@/lib/api/connections'
import { LoginScreen } from '@/features/auth/LoginScreen'
import { AppShell } from '@/features/shell/AppShell'
import { NoConnection } from '@/features/shell/NoConnection'
import { z } from 'zod'
import { TableView } from '@/features/tables/TableView'
import { searchDefaults, tableSearch } from '@/features/tables/tableSearch'
import { useSqlEditor } from '@/features/sql/store'
import { SetupGate } from '@/features/setup/SetupGate'
import { TablesIndex, TablesScreen } from '@/routes/screens'

// Heavy screens (CodeMirror, the wizard, settings) load on first visit, outside the initial bundle.
const SqlScreen = lazyRouteComponent(() => import('@/features/sql/SqlScreen'), 'SqlScreen')
const SettingsScreen = lazyRouteComponent(
  () => import('@/features/settings/SettingsScreen'),
  'SettingsScreen',
)
const SetupWizard = lazyRouteComponent(() => import('@/features/setup/SetupWizard'), 'SetupWizard')
const SearchScreen = lazyRouteComponent(
  () => import('@/features/search/SearchScreen'),
  'SearchScreen',
)

export interface RouterContext {
  queryClient: QueryClient
}

const rootRoute = createRootRouteWithContext<RouterContext>()({ component: SetupGate })

/** Queries that do not depend on the connection: kept when it changes. */
const globalQueries = new Set([
  'config',
  'connections',
  'session',
  'snippets',
  'snippet',
  'settings',
])

const sqlSearch = z.object({ sql: z.string().optional().catch(undefined) })

/**
 * Every screen lives under the connection it works on (`/c/$connectionId/…`), so two browser tabs
 * can use different connections. Changing the connection in a tab forgets everything cached for
 * the previous one and remounts the shell.
 */
const connRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/c/$connectionId',
  beforeLoad: ({ params, context }) => {
    const prev = currentConnection()
    if (prev === params.connectionId) return
    setConnection(params.connectionId)
    if (prev !== undefined) {
      context.queryClient.removeQueries({
        predicate: (q) => !globalQueries.has(String(q.queryKey[0])),
      })
    }
    // The SQL editor shows this connection's query tabs (an open transaction stays with the other).
    useSqlEditor.getState().switchConnection(params.connectionId)
  },
  remountDeps: ({ params }) => params.connectionId,
  component: AppShell,
})

const connIndexRoute = createRoute({
  getParentRoute: () => connRoute,
  path: '/',
  beforeLoad: ({ params }) => {
    throw redirect({ to: '/c/$connectionId/tables', params })
  },
})

const tablesRoute = createRoute({
  getParentRoute: () => connRoute,
  path: '/tables',
  component: TablesScreen,
})
const tablesIndexRoute = createRoute({
  getParentRoute: () => tablesRoute,
  path: '/',
  component: TablesIndex,
})
const tableRoute = createRoute({
  getParentRoute: () => tablesRoute,
  path: '$schema/$table',
  validateSearch: tableSearch,
  search: { middlewares: [stripSearchParams(searchDefaults)] },
  component: TableView,
})

const sqlRoute = createRoute({
  getParentRoute: () => connRoute,
  path: '/sql',
  // `sql` hands a query to the editor ("Open in SQL editor" from the grid).
  validateSearch: sqlSearch,
  component: SqlScreen,
})
const sqlSnippetRoute = createRoute({
  getParentRoute: () => connRoute,
  path: '/sql/$snippetId',
  component: SqlScreen,
})

/** The global search: the term and the schemas live in the URL, so a search can be shared. */
const globalSearch = z.object({
  q: z.string().optional().catch(undefined),
  schemas: z.array(z.string()).optional().catch(undefined),
})
const searchRoute = createRoute({
  getParentRoute: () => connRoute,
  path: '/search',
  validateSearch: globalSearch,
  component: SearchScreen,
})

const settingsRoute = createRoute({
  getParentRoute: () => connRoute,
  path: '/settings',
  component: SettingsScreen,
})

/** The connection of the routes without one: the session's default (DATABASE_URL's, else the
 *  first saved one, or the free mode session's own). */
async function defaultConnection(qc: QueryClient) {
  let id: string
  try {
    // Always asked: a sign-in (free mode) changes the session's default.
    id = (await qc.fetchQuery({ ...connectionsQuery, staleTime: 0 })).default_id
  } catch (err) {
    if (err instanceof ApiError && err.code === 'setup_required') throw redirect({ to: '/setup' })
    // 401 already sent the app to /login (setUnauthorizedHandler).
    throw err
  }
  if (!id) throw redirect({ to: '/no-connection' })
  return id
}

// The routes of earlier versions (and bookmarks) redirect to the default connection.
const legacy = {
  index: createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    beforeLoad: async ({ context }) => {
      const connectionId = await defaultConnection(context.queryClient)
      throw redirect({ to: '/c/$connectionId/tables', params: { connectionId }, replace: true })
    },
  }),
  tables: createRoute({
    getParentRoute: () => rootRoute,
    path: '/tables',
    beforeLoad: async ({ context }) => {
      const connectionId = await defaultConnection(context.queryClient)
      throw redirect({ to: '/c/$connectionId/tables', params: { connectionId }, replace: true })
    },
  }),
  table: createRoute({
    getParentRoute: () => rootRoute,
    path: '/tables/$schema/$table',
    validateSearch: tableSearch,
    beforeLoad: async ({ context, params, search }) => {
      const connectionId = await defaultConnection(context.queryClient)
      throw redirect({
        to: '/c/$connectionId/tables/$schema/$table',
        params: { ...params, connectionId },
        search,
        replace: true,
      })
    },
  }),
  sql: createRoute({
    getParentRoute: () => rootRoute,
    path: '/sql',
    validateSearch: sqlSearch,
    beforeLoad: async ({ context, search }) => {
      const connectionId = await defaultConnection(context.queryClient)
      throw redirect({
        to: '/c/$connectionId/sql',
        params: { connectionId },
        search,
        replace: true,
      })
    },
  }),
  sqlSnippet: createRoute({
    getParentRoute: () => rootRoute,
    path: '/sql/$snippetId',
    beforeLoad: async ({ context, params }) => {
      const connectionId = await defaultConnection(context.queryClient)
      throw redirect({
        to: '/c/$connectionId/sql/$snippetId',
        params: { ...params, connectionId },
        replace: true,
      })
    },
  }),
  search: createRoute({
    getParentRoute: () => rootRoute,
    path: '/search',
    validateSearch: globalSearch,
    beforeLoad: async ({ context, search }) => {
      const connectionId = await defaultConnection(context.queryClient)
      throw redirect({
        to: '/c/$connectionId/search',
        params: { connectionId },
        search,
        replace: true,
      })
    },
  }),
  settings: createRoute({
    getParentRoute: () => rootRoute,
    path: '/settings',
    beforeLoad: async ({ context }) => {
      const connectionId = await defaultConnection(context.queryClient)
      throw redirect({ to: '/c/$connectionId/settings', params: { connectionId }, replace: true })
    },
  }),
}

const noConnectionRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/no-connection',
  component: NoConnection,
})

const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/login',
  validateSearch: (s: Record<string, unknown>): { redirect?: string } =>
    typeof s.redirect === 'string' ? { redirect: s.redirect } : {},
  component: LoginScreen,
})

const setupRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/setup',
  component: SetupWizard,
})

const routeTree = rootRoute.addChildren([
  connRoute.addChildren([
    connIndexRoute,
    tablesRoute.addChildren([tablesIndexRoute, tableRoute]),
    sqlRoute,
    sqlSnippetRoute,
    searchRoute,
    settingsRoute,
  ]),
  ...Object.values(legacy),
  noConnectionRoute,
  loginRoute,
  setupRoute,
])

export function makeRouter(queryClient: QueryClient, history?: RouterHistory) {
  return createRouter({
    routeTree,
    basepath: basePath,
    history,
    context: { queryClient },
    defaultPreload: 'intent',
    defaultErrorComponent: RouteError,
  })
}

export type AppRouter = ReturnType<typeof makeRouter>

declare module '@tanstack/react-router' {
  interface Register {
    router: AppRouter
  }
}
