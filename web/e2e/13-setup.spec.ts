import { expect, test } from '@playwright/test'
import { urls } from './helpers'

const db =
  process.env.DEV_DATABASE_URL ?? 'postgres://gresbase:gresbase@localhost:54329/app?sslmode=disable'

test('setup wizard: from a fresh Gresbase to browsing tables', async ({
  page,
  request,
  browser,
}) => {
  // Without DATABASE_URL every route leads to the wizard.
  await page.goto(`${urls.setup}/tables`)
  await expect(page).toHaveURL(/\/setup$/)
  await expect(page.getByRole('heading', { name: 'Welcome to Gresbase' })).toBeVisible()
  expect((await (await request.get(`${urls.setup}/healthz`)).json()).status).toBe('setup')

  // Welcome: language. The rest of the wizard follows it.
  await page.getByRole('radio', { name: 'Español' }).click()
  await page.getByRole('button', { name: 'Siguiente' }).click()

  // Mode: saved connection (the default).
  await expect(page.getByRole('heading', { name: '¿Cómo vas a usarlo?' })).toBeVisible()
  await page.getByRole('button', { name: 'Siguiente' }).click()

  // Account.
  await page.getByLabel('Usuario', { exact: true }).fill('admin')
  await page.getByLabel('Contraseña', { exact: true }).fill('e2e-admin-pass')
  await page.getByLabel('Repite la contraseña').fill('e2e-admin-pass')
  await page.getByRole('button', { name: 'Siguiente' }).click()

  // Connection: a wrong password first, then the pasted URL of the dev database.
  await page.getByLabel('URL de conexión').fill(db.replace(/:[^:@/]+@/, ':wrong@'))
  await page.getByRole('button', { name: 'Probar conexión' }).click()
  await expect(page.getByText('PostgreSQL rechazó el usuario o la contraseña.')).toBeVisible()
  await page.getByLabel('URL de conexión').fill(db)
  await page.getByRole('button', { name: 'Probar conexión' }).click()
  await expect(page.getByText(/Conectado a PostgreSQL \d+/)).toBeVisible()

  await page.getByRole('button', { name: 'Guardar y terminar' }).click()
  await expect(page.getByRole('heading', { name: 'Todo listo' })).toBeVisible()
  await page.getByRole('button', { name: 'Entrar en Gresbase' }).click()

  // Signed in on the saved connection.
  await expect(page).toHaveURL(/\/tables\//)
  await expect(page.getByRole('link', { name: /^Tabla users / })).toBeVisible()

  // The wizard is off for good: its endpoints answer 404 and /setup leaves.
  const again = await request.post(`${urls.setup}/api/v1/setup`, {
    headers: { 'X-Gresbase': '1' },
    data: { mode: 'free' },
  })
  expect(again.status()).toBe(404)
  await page.goto(`${urls.setup}/setup`)
  await expect(page).toHaveURL(/\/tables/)

  // A new browser has to sign in with the account the wizard created.
  const fresh = await browser.newContext()
  const other = await fresh.newPage()
  await other.goto(`${urls.setup}/tables`)
  await expect(other).toHaveURL(/\/login/)
  await fresh.close()
})
