import { type APIRequestContext, expect, test } from '@playwright/test'
import { sql } from './helpers'

// The second database lives on the same server as the development one.
const devUrl = new URL(
  process.env.DEV_DATABASE_URL ??
    'postgres://gresbase:gresbase@localhost:54329/app?sslmode=disable',
)
const secondUrl = Object.assign(new URL(devUrl), { pathname: '/e2e_second' }).toString()

// DROP DATABASE … WITH (FORCE) needs Postgres 13+: end the sessions first so it also runs on 12.
const dropSecond = async (request: APIRequestContext) => {
  await sql(
    request,
    "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = 'e2e_second'",
  )
  await sql(request, 'DROP DATABASE IF EXISTS e2e_second')
}

test('saved connections: add one, two tabs on different connections, delete it', async ({
  page,
  context,
  request,
}) => {
  await dropSecond(request)
  await sql(request, 'CREATE DATABASE e2e_second')

  // Add the connection from Settings.
  await page.goto('/settings')
  await expect(page).toHaveURL(/\/c\/env\/settings$/)
  const section = page.getByRole('region', { name: 'Connections' })
  await section.getByRole('button', { name: 'Add connection' }).click()
  const dialog = page.getByRole('dialog', { name: 'New connection' })
  await dialog.getByRole('textbox', { name: 'Name' }).fill('second')
  await dialog.getByRole('radio', { name: 'Red' }).check({ force: true })
  await dialog.getByRole('textbox', { name: 'Connection URL' }).fill(secondUrl)
  await dialog.getByRole('button', { name: 'Test connection' }).click()
  await expect(dialog.getByText(/Connected to PostgreSQL/)).toBeVisible()
  await dialog.getByRole('button', { name: 'Save connection' }).click()
  await expect(section.getByText('second', { exact: true })).toBeVisible()

  // Switch this tab to it with the selector, and create a table there.
  await page.getByRole('button', { name: 'Switch connection' }).click()
  await page.getByRole('menuitem', { name: /second/ }).click()
  await expect(page).toHaveURL(/\/c\/c[0-9a-f]{8}\/tables/)
  const secondId = new URL(page.url()).pathname.split('/')[2]
  await page.goto(`/c/${secondId}/sql`)
  await page.locator('.cm-content').click()
  await page.keyboard.insertText('CREATE TABLE only_second (id int);')
  await page.keyboard.press('Control+Enter')
  await expect(page.getByRole('region', { name: 'Results' }).getByRole('alert')).toHaveCount(0)

  // A second tab on DATABASE_URL's connection does not see it; the first tab does.
  const other = await context.newPage()
  await other.goto('/c/env/tables')
  await expect(other.getByRole('link', { name: /users/ }).first()).toBeVisible()
  await expect(other.getByRole('link', { name: /only_second/ })).toHaveCount(0)
  await page.goto(`/c/${secondId}/tables`)
  await expect(
    page.getByRole('region', { name: 'Tables' }).getByRole('link', { name: /only_second/ }),
  ).toBeVisible()
  await expect(page.getByRole('link', { name: /^users/ })).toHaveCount(0)
  // Each tab keeps its connection after a reload.
  await other.reload()
  await expect(other).toHaveURL(/\/c\/env\/tables/)

  // Delete it; the tab that used it falls back to the default connection.
  await page.goto(`/c/${secondId}/settings`)
  await section.getByRole('button', { name: 'Delete second' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Delete connection' }).click()
  await expect(page).toHaveURL(/\/c\/env\/tables/)
  await dropSecond(request)
})
