import { expect, test } from '@playwright/test'
import { setEditor } from './helpers'

test('save a query and open it from the command palette', async ({ page }) => {
  await page.goto('/sql')
  await setEditor(page, 'SELECT number, total FROM invoices WHERE paid ORDER BY total DESC LIMIT 5')
  await page.keyboard.press('Control+s')
  const dialog = page.getByRole('dialog', { name: 'Save query' })
  await dialog.getByLabel('Name').fill('e2e/top paid invoices')
  await dialog.getByRole('button', { name: 'Save' }).click()
  await expect(page).toHaveURL(/\/sql\/e2e%2Ftop%20paid%20invoices\.sql$/)
  await expect(
    page.getByRole('region', { name: 'Saved' }).getByRole('link', { name: 'top paid invoices' }),
  ).toBeVisible()

  // From another screen, in a fresh tab of the app.
  await page.goto('/tables')
  // The shortcut works once the shell is on screen.
  await expect(page.getByRole('link', { name: 'Search all tables' })).toBeVisible()
  await page.keyboard.press('Control+k')
  const palette = page.getByRole('dialog', { name: 'Command palette' })
  await expect(palette).toBeVisible()
  await page.keyboard.type('top paid')
  await palette.getByRole('option', { name: 'e2e/top paid invoices' }).click()
  await expect(page).toHaveURL(/\/sql\/e2e%2Ftop%20paid%20invoices\.sql$/)
  await expect(page.locator('.cm-content')).toContainText('WHERE paid ORDER BY total DESC')
})
