import { expect, test } from '@playwright/test'
import { setEditor } from './helpers'

test('history and saved queries have context menus', async ({ page }) => {
  await page.goto('/sql')
  await setEditor(page, 'SELECT 25 AS menu_test')
  await page.keyboard.press('Control+Enter')
  const history = page.getByRole('region', { name: 'History' })
  const entry = history.getByRole('button', { name: /SELECT 25 AS menu_test/ }).first()
  await expect(entry).toBeVisible()
  const menu = page.getByRole('menu')

  // Right click on a history entry.
  await entry.click({ button: 'right' })
  await expect(menu.getByRole('menuitem')).toHaveText([
    'Open',
    'Run',
    'Copy SQL',
    'Save as query…',
    'Delete from history',
  ])
  await page.screenshot({ path: '../tmp/e2e/25-history-menu.png' })
  await menu.getByRole('menuitem', { name: 'Save as query…' }).click()
  const dialog = page.getByRole('dialog', { name: 'Save query' })
  await dialog.getByRole('textbox').fill('e2e-menu')
  await dialog.getByRole('button', { name: 'Save' }).click()
  const saved = page.getByRole('region', { name: 'Saved' })
  const link = saved.getByRole('link', { name: 'e2e-menu', exact: true })
  await expect(link).toBeVisible()

  // Keyboard on a saved query: duplicate, then delete both.
  await link.focus()
  await page.keyboard.press('Shift+F10')
  await expect(menu.getByRole('menuitem')).toHaveText([
    'Open',
    'Rename…',
    'Duplicate',
    'Copy SQL',
    'Delete…',
  ])
  await menu.getByRole('menuitem', { name: 'Duplicate' }).click()
  const copy = saved.getByRole('link', { name: 'e2e-menu-copy', exact: true })
  await expect(copy).toBeVisible()
  for (const l of [copy, link]) {
    await l.click({ button: 'right' })
    await menu.getByRole('menuitem', { name: 'Delete…' }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click()
    await expect(l).toHaveCount(0)
  }

  // Delete just that history entry (a fresh browser context: it is the only one).
  await entry.click({ button: 'right' })
  await menu.getByRole('menuitem', { name: 'Delete from history' }).click()
  await expect(history.getByRole('button', { name: /SELECT 25 AS menu_test/ })).toHaveCount(0)
})
