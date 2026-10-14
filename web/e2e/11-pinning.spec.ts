import { expect, test } from '@playwright/test'

test('pinned columns stay while scrolling sideways, pinned rows stay across pages', async ({
  page,
}) => {
  await page.goto('/tables/public/users')
  const grid = page.getByRole('grid', { name: 'Rows of users' })
  const range = page.locator('footer span[aria-live]')
  await expect(range).toHaveText(/^1–50/)

  // Pin email from its header (the lock shows on hover).
  const header = grid.getByRole('columnheader', { name: /^email/ })
  await header.hover()
  await grid.getByRole('button', { name: 'Pin column email' }).click()
  await expect(grid.getByRole('button', { name: 'Unpin column email' })).toBeVisible()

  // Scroll all the way right: email is still on screen, next to the gutter.
  const box = await grid.boundingBox()
  await grid.evaluate((el) => (el.scrollLeft = el.scrollWidth))
  await expect.poll(() => grid.evaluate((el) => el.scrollLeft)).toBeGreaterThan(0)
  const pinned = grid.getByRole('columnheader', { name: /^email/ })
  const after = await pinned.boundingBox()
  expect(after && box && after.x >= box.x && after.x + after.width <= box.x + box.width).toBe(true)
  await grid.evaluate((el) => (el.scrollLeft = 0))

  // Pin the second row, then go to the next page: it is still the first row.
  const email = (await grid.locator('[data-cell="1:3"]').textContent()) ?? ''
  expect(email).not.toBe('')
  await grid.locator('[role="row"][aria-rowindex="3"]').hover()
  await grid.getByRole('button', { name: 'Pin row 2', exact: true }).click()
  await expect(grid.locator('[data-cell="0:3"]')).toHaveText(email)

  await page.getByRole('button', { name: 'Next page' }).click()
  await expect(range).toHaveText(/^51–100/)
  const first = grid.locator('[role="row"][data-pinned]')
  await expect(first).toHaveCount(1)
  await expect(grid.locator('[data-cell="0:3"]')).toHaveText(email)

  // And it stays under the header while scrolling down.
  await grid.evaluate((el) => (el.scrollTop = el.scrollHeight))
  const row = await first.boundingBox()
  expect(row && box && row.y >= box.y && row.y + row.height <= box.y + box.height).toBe(true)

  // Pins survive a reload; "Unpin all" clears them.
  await page.reload()
  await expect(grid.locator('[role="row"][data-pinned]')).toHaveCount(1)
  await page.getByRole('button', { name: 'Unpin all' }).click()
  await expect(grid.locator('[role="row"][data-pinned]')).toHaveCount(0)
  await expect(grid.getByRole('button', { name: 'Unpin column email' })).toHaveCount(0)
})
