import { expect, test } from '@playwright/test'
import { urls } from './helpers'

test('login, language and theme', async ({ page }) => {
  // Without a session every screen sends you to the login.
  await page.goto(`${urls.auth}/tables`)
  await expect(page).toHaveURL(/\/login/)
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible()

  // Wrong password: translated error, still on the login.
  await page.getByLabel('Username').fill('admin')
  await page.getByLabel('Password').fill('nope')
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByRole('alert')).toHaveText('Wrong username or password.')

  // Spanish from the switch on the login screen.
  await page.getByRole('radio', { name: 'Español' }).click()
  await expect(page.getByRole('heading', { name: 'Iniciar sesión' })).toBeVisible()
  await expect(page.locator('html')).toHaveAttribute('lang', 'es')

  await page.getByLabel('Contraseña').fill('e2e-password')
  await page.getByRole('button', { name: 'Entrar' }).click()
  await expect(page).toHaveURL(/\/tables/)
  await expect(page.getByRole('link', { name: 'Tablas' }).first()).toBeVisible()

  // Theme: the sidebar button cycles light → dark → auto; dark survives a reload.
  const html = page.locator('html')
  const toggle = page.getByRole('button', { name: /^Tema:/ })
  await toggle.click() // auto (the default) → light
  await expect(toggle).toHaveAccessibleName('Tema: Claro')
  await toggle.click()
  await expect(toggle).toHaveAccessibleName('Tema: Oscuro')
  await expect(html).toHaveAttribute('data-theme', 'dark')
  await page.reload()
  await expect(html).toHaveAttribute('data-theme', 'dark')
  await expect(page.getByRole('link', { name: 'Tablas' }).first()).toBeVisible()

  // Sign out from settings: back to the login, and the old session no longer works.
  await page.goto(`${urls.auth}/settings`)
  await page.getByRole('button', { name: 'Cerrar sesión' }).first().click()
  await expect(page).toHaveURL(/\/login/)
  const res = await page.request.get(`${urls.auth}/api/v1/auth/session`)
  expect(res.status()).toBe(401)
})
