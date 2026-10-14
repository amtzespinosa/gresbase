import { fileURLToPath, URL } from 'node:url'
import { defineConfig, devices } from '@playwright/test'
import { ports } from './e2e/helpers'

// End-to-end tests (./e2e) against the compiled binary (../bin/gresbase) and the development
// database. `task e2e` resets the database, builds the binary and runs this config.
const root = fileURLToPath(new URL('..', import.meta.url))
const db =
  process.env.DEV_DATABASE_URL ?? 'postgres://gresbase:gresbase@localhost:54329/app?sslmode=disable'

const server = (port: number, env: Record<string, string>) => ({
  command: `rm -rf tmp/e2e/${port} && mkdir -p tmp/e2e/${port} && exec bin/gresbase`,
  cwd: root,
  url: `http://localhost:${port}/healthz`,
  reuseExistingServer: false,
  timeout: 60_000,
  env: {
    DATABASE_URL: db,
    GRESBASE_PORT: String(port),
    GRESBASE_DATA_DIR: `tmp/e2e/${port}`,
    GRESBASE_LOG_LEVEL: 'warn',
    ...env,
  },
})

export default defineConfig({
  testDir: './e2e',
  outputDir: '../tmp/e2e/results',
  // Scenarios share one database and run in file order.
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI
    ? [['list'], ['html', { open: 'never', outputFolder: '../tmp/e2e/report' }]]
    : 'list',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    ...devices['Desktop Chrome'],
    baseURL: `http://localhost:${ports.local}`,
    viewport: { width: 1440, height: 900 },
    trace: 'retain-on-failure',
    acceptDownloads: true,
  },
  // Instances: no login (most scenarios), login enabled, read-only, a fresh one without
  // DATABASE_URL for the setup wizard and one in free mode.
  webServer: [
    server(ports.local, {}),
    server(ports.auth, { GRESBASE_USER: 'admin', GRESBASE_PASSWORD: 'e2e-password' }),
    server(ports.readOnly, { GRESBASE_READ_ONLY: 'true' }),
    server(ports.setup, { DATABASE_URL: '' }),
    server(ports.free, { DATABASE_URL: '', GRESBASE_MODE_FREE: 'true' }),
  ],
})
