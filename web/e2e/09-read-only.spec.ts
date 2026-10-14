import { expect, test } from '@playwright/test'
import { setEditor, urls } from './helpers'

test('read-only instance blocks every write', async ({ page }) => {
  await page.goto(`${urls.readOnly}/tables/public/users`)
  await expect(page.locator('aside').getByText('Read-only', { exact: true })).toBeVisible()
  const grid = page.getByRole('grid', { name: 'Rows of users' })
  await expect(grid).toBeVisible()
  for (const name of ['Insert row', 'Import CSV', 'Actions for users'])
    await expect(page.getByRole('button', { name })).toHaveCount(0)
  await expect(page.getByRole('checkbox')).toHaveCount(0)
  // The table list menu keeps only what does not write.
  await page
    .getByRole('region', { name: 'Tables' })
    .getByRole('link', { name: /^Table users / })
    .click({ button: 'right' })
  await expect(page.getByRole('menu').getByRole('menuitem')).toHaveText([
    'Open',
    'Open in new tab',
    'Add to favorites',
    'Copy name',
    'View structure',
    'Export CSV',
  ])
  await page.keyboard.press('Escape')
  await grid.locator('[data-cell="0:4"]').dblclick()
  await expect(page.getByRole('textbox', { name: 'Edit full_name' })).toHaveCount(0)

  // The API refuses writes before touching the database.
  const res = await page.request.post(`${urls.readOnly}/api/v1/tables/public/users/changesets`, {
    headers: { 'X-Gresbase': '1' },
    data: { ops: [{ kind: 'insert', values: { email: 'ro@example.com' } }] },
  })
  expect(res.status()).toBe(403)
  expect(((await res.json()) as { error: { code: string } }).error.code).toBe('read_only')

  // SQL runs in a read-only transaction: no transaction mode, writes fail with a clear error.
  await page.goto(`${urls.readOnly}/sql`)
  await expect(page.getByRole('switch', { name: 'Transaction mode' })).toHaveCount(0)
  await setEditor(page, 'DELETE FROM sessions;')
  await page.keyboard.press('Control+Enter')
  await expect(page.getByRole('region', { name: 'Results' }).getByRole('alert')).toContainText(
    'read-only',
  )
})
