import type { ConnectionInput } from '@/lib/api/types.gen'

/** The connection fields the environment fixes (config or setup status), "" or 0 when free. */
export interface FixedFields {
  db_host?: string
  db_port?: number
  db_name?: string
  db_user?: string
}

/** Every field but the password is fixed: the form only asks for the password. */
export const onlyPassword = (f: FixedFields | undefined) => !!(f?.db_host && f.db_name && f.db_user)

/** The form value with the fixed fields applied: what is actually sent and saved. */
export const withFixed = (c: ConnectionInput, f: FixedFields | undefined): ConnectionInput => ({
  ...c,
  host: f?.db_host || c.host,
  port: f?.db_port || c.port,
  database: f?.db_name || c.database,
  user: f?.db_user || c.user,
})
