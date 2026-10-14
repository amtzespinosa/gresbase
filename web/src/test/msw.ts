import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import type {
  ConfigResponse,
  ConnectionInfo,
  ConnectionList,
  Page,
  SessionResponse,
  SettingsResponse,
  Table,
} from '@/lib/api/types.gen'

export const config: ConfigResponse = {
  version: 'test',
  lang: 'en',
  read_only: false,
  auth_enabled: false,
  base_path: '/',
  data_persistent: true,
  statement_timeout_ms: 30000,
  sql_max_rows: 1000,
  setup_required: false,
  free_mode: false,
  db_host: '',
  db_port: 0,
  db_name: '',
  db_user: '',
}

export const connection: ConnectionInfo = {
  database: 'app',
  user: 'gresbase',
  host: 'db',
  port: 5432,
  server_version: '17.2',
  server_version_num: 170002,
  read_only: false,
  extensions: { pg_stat_statements: false },
  support_level: 'full',
  capabilities: {
    merge: { available: true, min_version: 150000 },
    pg_stat_statements: { available: false, extension: 'pg_stat_statements' },
  },
}

/** Only the DATABASE_URL connection, as with no saved ones. */
export const connections: ConnectionList = {
  default_id: 'env',
  connections: [
    {
      id: 'env',
      source: 'env',
      name: 'app',
      color: 'gray',
      host: 'db',
      port: 5432,
      database: 'app',
      user: 'gresbase',
      sslmode: '',
      read_only: false,
      locked: true,
    },
  ],
}

/** A table with no columns: the default answer for any table, so screens render without errors. */
export const emptyTable = (schema: string, name: string): Table => ({
  schema,
  name,
  kind: 'table',
  comment: null,
  estimated_rows: 0,
  sizes: { total: 0, table: 0, indexes: 0 },
  columns: [],
  primary_key: [],
  constraints: [],
  foreign_keys: [],
  referenced_by: [],
  indexes: [],
  triggers: [],
  has_primary_key: false,
  has_user_triggers: false,
})

export const emptyPage: Page = { columns: [], rows: [], next_cursor: null, has_more: false }

/** The local session without login: the administrator. */
export const session: SessionResponse = {
  auth_enabled: false,
  username: '',
  role: 'admin',
  account_locked: false,
  expires_at: null,
}

export const settings: SettingsResponse = { settings: [], data_persistent: true }

/** Shared MSW server with the endpoints the shell needs; tests add or override with server.use(). */
export const server = setupServer(
  http.get('*/api/v1/config', () => HttpResponse.json(config)),
  http.get('*/api/v1/connections', () => HttpResponse.json(connections)),
  http.get('*/api/v1/auth/session', () => HttpResponse.json(session)),
  http.get('*/api/v1/settings', () => HttpResponse.json(settings)),
  http.get('*/api/v1/c/:conn/connection', () => HttpResponse.json(connection)),
  http.get('*/api/v1/c/:conn/schemas', () => HttpResponse.json(['public'])),
  http.get('*/api/v1/snippets', () => HttpResponse.json([])),
  http.get('*/api/v1/c/:conn/sql/completions', () =>
    HttpResponse.json({ tables: [], functions: [], search_path: ['public'] }),
  ),
  http.get('*/api/v1/c/:conn/sql/transactions', () => HttpResponse.json([])),
  http.get('*/api/v1/c/:conn/schemas/:schema/relations', () => HttpResponse.json([])),
  http.get('*/api/v1/c/:conn/tables/:schema/:table', ({ params }) =>
    HttpResponse.json(emptyTable(String(params.schema), String(params.table))),
  ),
  http.post('*/api/v1/c/:conn/tables/:schema/:table/rows\\:query', () =>
    HttpResponse.json(emptyPage),
  ),
  http.post('*/api/v1/c/:conn/tables/:schema/:table/changesets\\:impact', () =>
    HttpResponse.json({ tables: [] }),
  ),
  http.get('*/api/v1/c/:conn/tables/:schema/:table/dependents', () =>
    HttpResponse.json({ truncate: [], drop: [] }),
  ),
  http.get('*/api/v1/c/:conn/tables/:schema/:table/ddl', () => HttpResponse.json({ ddl: '' })),
  http.get('*/api/v1/c/:conn/tables/:schema/:table/rows/referenced-by', () =>
    HttpResponse.json([]),
  ),
)
