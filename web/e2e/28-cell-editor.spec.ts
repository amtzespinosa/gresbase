import { expect, test } from '@playwright/test'

test('the cell editor has a single clean accent border', async ({ page }) => {
  await page.goto('/tables/public/users')
  const grid = page.getByRole('grid', { name: 'Rows of users' })
  await grid.locator('[data-cell="0:4"]').dblclick()
  const input = page.getByRole('textbox', { name: 'Edit full_name' })
  await expect(input).toBeFocused()
  // Only the editor's border is yellow: the focused field inside draws no outline of its own.
  expect(await input.evaluate((el) => getComputedStyle(el).outlineStyle)).toBe('none')
  const editor = page.getByTestId('cell-editor')
  expect(await editor.evaluate((el) => getComputedStyle(el).borderTopStyle)).toBe('solid')
  await editor.screenshot({ path: '../tmp/e2e/28-cell-editor.png' })
  await page.keyboard.press('Escape')
})
