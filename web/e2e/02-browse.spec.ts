import { expect, test } from '@playwright/test'
import { pick, scalar } from './helpers'

test('browse tables: filter, sort and paginate', async ({ page, request }) => {
  await page.goto('/tables')
  const list = page.getByRole('region', { name: 'Tables' })
  await list.getByRole('link', { name: /^Table users / }).click()
  await expect(page).toHaveURL(/\/tables\/public\/users/)
  const grid = page.getByRole('grid', { name: 'Rows of users' })
  await expect(grid).toBeVisible()
  const range = page.locator('footer span[aria-live]')

  // Search in the table list.
  await list.getByRole('searchbox').fill('invoice')
  await expect(list.getByRole('link', { name: /^Table invoice_items / })).toBeVisible()
  await expect(list.getByRole('link', { name: /^Table orgs / })).toHaveCount(0)
  await list.getByRole('searchbox').fill('')

  // Filter: email contains user1.
  await page.getByRole('button', { name: 'Filter' }).click()
  await pick(page, 'Column', 'email')
  await pick(page, 'Operator', 'contains')
  await page.getByLabel('Value').fill('user1')
  await page.getByRole('button', { name: 'Add filter' }).click()
  await expect(page).toHaveURL(/filters=/)
  const expected = await scalar(request, "SELECT count(*) FROM users WHERE email ILIKE '%user1%'")
  await page.getByRole('button', { name: 'Exact count' }).click()
  await expect(range).toHaveText(`1–50 of ${Number(expected).toLocaleString('en-US')}`)

  // Sort by email, then shift+click for a second key.
  await grid.getByRole('button', { name: /email/ }).first().click()
  await grid
    .getByRole('button', { name: /full_name/ })
    .first()
    .click({ modifiers: ['Shift'] })
  await expect
    .poll(() => JSON.parse(new URL(page.url()).searchParams.get('sort') ?? '[]'))
    .toEqual([
      { column: 'email', dir: 'asc' },
      { column: 'full_name', dir: 'asc' },
    ])
  const firstEmail = await scalar(
    request,
    "SELECT email FROM users WHERE email ILIKE '%user1%' ORDER BY email, full_name LIMIT 1",
  )
  await expect(grid.locator('[data-cell="0:3"]')).toHaveText(firstEmail)

  // Paginate forwards and back with the keyset cursor.
  await page.getByRole('button', { name: 'Next page' }).click()
  await expect(range).toHaveText(new RegExp(`^51–100 of`))
  const page2 = await scalar(
    request,
    "SELECT email FROM users WHERE email ILIKE '%user1%' ORDER BY email, full_name, id OFFSET 50 LIMIT 1",
  )
  await expect(grid.locator('[data-cell="0:3"]')).toHaveText(page2)
  await page.getByRole('button', { name: 'Previous page' }).click()
  await expect(range).toHaveText(new RegExp(`^1–50 of`))

  // The state lives in the URL: a reload keeps filters and sort.
  await page.reload()
  await expect(grid.locator('[data-cell="0:3"]')).toHaveText(firstEmail)
  await expect(page.getByText('user1', { exact: false }).first()).toBeVisible()
})
