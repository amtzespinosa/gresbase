import { type Locator, expect, test } from '@playwright/test'

/** Header names left to right. */
const headers = (grid: Locator) =>
  grid.locator('[role="columnheader"][aria-colindex] span.font-medium').allTextContents()

test('hide, reorder by dragging and resize columns; the view survives a reload and resets', async ({
  page,
}) => {
  await page.goto('/tables/public/orgs')
  const grid = page.getByRole('grid', { name: 'Rows of orgs' })
  await expect(grid.locator('[data-cell="0:1"]')).not.toBeEmpty()
  expect(await headers(grid)).toEqual(['id', 'name', 'plan', 'created_at'])

  // Hide "plan" from its column menu.
  await grid.getByRole('columnheader', { name: /^plan/ }).hover()
  await grid.getByRole('button', { name: 'Column options for plan' }).click()
  await page.getByRole('menuitem', { name: 'Hide column' }).click()
  await expect.poll(() => headers(grid)).toEqual(['id', 'name', 'created_at'])

  // Drag created_at above id in the Columns panel.
  await page.getByRole('button', { name: 'Columns (1 hidden)' }).click()
  const list = page.getByRole('list', { name: 'Columns' })
  await list.locator('[data-column="created_at"]').dragTo(list.locator('[data-column="id"]'))
  await expect.poll(() => headers(grid)).toEqual(['created_at', 'id', 'name'])
  await page.keyboard.press('Escape')

  // Widen "name" by dragging its resize handle.
  const name = grid.getByRole('columnheader', { name: /^name/ })
  const before = (await name.boundingBox())?.width ?? 0
  const handle = name.locator('.cursor-col-resize')
  const hb = await handle.boundingBox()
  if (!hb) throw new Error('no resize handle')
  await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2)
  await page.mouse.down()
  await page.mouse.move(hb.x + 120, hb.y + hb.height / 2, { steps: 5 })
  await page.mouse.up()
  await expect.poll(async () => (await name.boundingBox())?.width ?? 0).toBeGreaterThan(before + 80)
  const widened = (await name.boundingBox())?.width ?? 0

  // All of it survives a reload.
  await page.reload()
  await expect.poll(() => headers(grid)).toEqual(['created_at', 'id', 'name'])
  await expect.poll(async () => (await name.boundingBox())?.width ?? 0).toBe(widened)

  // Reset view: table order, every column, default widths.
  await page.getByRole('button', { name: 'Columns (1 hidden)' }).click()
  await page.getByRole('button', { name: 'Reset view' }).click()
  await expect.poll(() => headers(grid)).toEqual(['id', 'name', 'plan', 'created_at'])
  await expect.poll(async () => (await name.boundingBox())?.width ?? 0).toBe(before)
})
