import { expect, test } from '@playwright/test'
import { urls } from './helpers'

const db = new URL(
  process.env.DEV_DATABASE_URL ??
    'postgres://gresbase:gresbase@localhost:54329/app?sslmode=disable',
)

test('free mode: sign in with Postgres credentials, work, switch and disconnect', async ({
  page,
  browser,
}) => {
  // Every screen leads to the connection form.
  await page.goto(`${urls.free}/tables`)
  await expect(page).toHaveURL(/\/login/)
  await expect(page.getByRole('heading', { name: 'Connect to PostgreSQL' })).toBeVisible()

  await page.getByLabel('Host').fill(db.hostname)
  await page.getByLabel('Port').fill(db.port)
  await page.getByLabel('Database').fill(db.pathname.slice(1))
  await page.getByLabel('User').fill(db.username)
  await page.getByLabel('Password').fill('wrong-password')
  await page.getByRole('button', { name: 'Connect' }).click()
  await expect(page.getByRole('alert')).toHaveText('PostgreSQL rejected the user or password.')

  await page.getByLabel('Password').fill(decodeURIComponent(db.password))
  await page.getByRole('button', { name: 'Connect' }).click()
  await expect(page).toHaveURL(/\/tables\//)
  await expect(page.getByRole('link', { name: /^Table users / })).toBeVisible()

  // The SQL editor keeps its queries card: saved queries private to this user, and the history.
  await page.getByRole('link', { name: 'SQL editor' }).first().click()
  await expect(page.getByRole('button', { name: 'Run all' })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Saved' })).toBeVisible()
  await expect(page.getByRole('region', { name: 'History' })).toBeVisible()
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  const save = page.getByRole('dialog', { name: 'Save query' })
  await save.getByRole('textbox').fill('free-e2e')
  await save.getByRole('button', { name: 'Save' }).click()
  await expect(
    page
      .getByRole('region', { name: 'Saved' })
      .getByRole('link', { name: 'free-e2e', exact: true }),
  ).toBeVisible()
  await page.screenshot({ path: '../tmp/e2e/14-free-mode-sql.png' })

  // Another browser has no session.
  const other = await browser.newContext()
  const otherPage = await other.newPage()
  await otherPage.goto(`${urls.free}/tables`)
  await expect(otherPage).toHaveURL(/\/login/)
  await other.close()

  // Switch connection: back to the form, prefilled with the last connection, and in again.
  await page.getByRole('button', { name: 'Session options' }).click()
  await page.getByRole('menuitem', { name: 'Switch connection' }).click()
  await page
    .getByRole('dialog', { name: 'Switch connection?' })
    .getByRole('button', { name: 'Switch connection' })
    .click()
  await expect(page.getByRole('heading', { name: 'Connect to PostgreSQL' })).toBeVisible()
  await page.getByLabel('Password').fill(decodeURIComponent(db.password))
  await page.getByRole('button', { name: 'Connect' }).click()
  await expect(page.getByRole('link', { name: /^Table users / })).toBeVisible()

  // Disconnect ends the session on the server; the connection is remembered without password.
  await page.getByRole('button', { name: 'Session options' }).click()
  await page.getByRole('menuitem', { name: 'Disconnect' }).click()
  await page
    .getByRole('dialog', { name: 'Disconnect?' })
    .getByRole('button', { name: 'Disconnect' })
    .click()
  await expect(page).toHaveURL(/\/login/)
  expect((await page.request.get(`${urls.free}/api/v1/connection`)).status()).toBe(401)
  const recent = page.getByRole('button', {
    name: `${db.username}@${db.hostname}:${db.port}/${db.pathname.slice(1)}`,
  })
  await expect(recent).toBeVisible()
  await expect(page.getByLabel('Password')).toHaveValue('')
  await expect(page.getByLabel('Host')).toHaveValue(db.hostname)
})
