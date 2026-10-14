import { expect, test } from '@playwright/test'

/** The opaque yellow of an edited cell inside a selected row (index.css). */
const editedOnSelected = { light: 'rgb(236, 211, 140)', dark: 'rgb(97, 84, 46)' }
/** The light gray of a selected row (index.css). */
const selectedGray = { light: 'rgb(235, 232, 226)', dark: 'rgb(44, 43, 40)' }

for (const theme of ['light', 'dark'] as const) {
  test.describe(theme, () => {
    test.use({ colorScheme: theme })

    test('click, Ctrl/Cmd+click and Shift+click select rows; checkbox and double click unchanged', async ({
      page,
    }) => {
      await page.goto('/tables/public/users')
      const grid = page.getByRole('grid', { name: 'Rows of users' })
      const cell = (row: number, col: number) => grid.locator(`[data-cell="${row}:${col}"]`)
      const row = (n: number) => grid.locator(`[role=row][aria-rowindex="${n + 2}"]`)
      const selected = grid.locator('[role=row][data-row-selected]')
      await expect(cell(0, 3)).not.toBeEmpty()

      await cell(1, 3).click()
      await expect(row(1)).toHaveAttribute('aria-selected', 'true')
      await expect(grid.getByRole('checkbox', { name: 'Select row 2', exact: true })).toBeChecked()
      await cell(3, 3).click({ modifiers: ['ControlOrMeta'] })
      await expect(selected).toHaveCount(2)
      await cell(5, 3).click({ modifiers: ['Shift'] })
      await expect(selected).toHaveCount(3) // rows 3–5: the range from the last clicked row
      await cell(0, 3).click()
      await expect(selected).toHaveCount(1)

      // The checkbox toggles the same selection.
      await grid.getByRole('checkbox', { name: 'Select row 3', exact: true }).check()
      await expect(selected).toHaveCount(2)

      // The selected row is gray, distinct from a normal row; an edited cell in it stays yellow.
      const bg = (n: number) => row(n).evaluate((el) => getComputedStyle(el).backgroundColor)
      expect(await bg(0)).toBe(selectedGray[theme])
      const normal = await bg(1)
      expect(normal).not.toBe(await bg(0))
      // ...and from a hovered row.
      await cell(1, 3).hover()
      await expect.poll(() => bg(1)).not.toBe(normal)
      expect(await bg(1)).not.toBe(await bg(0))
      await cell(0, 4).dblclick()
      const editor = page.getByRole('textbox').last()
      await editor.fill('Selected Edit')
      await editor.press('Enter')
      await expect(cell(0, 4)).toHaveAttribute('data-edited', 'true')
      const inner = await cell(0, 4).evaluate(
        (el) => getComputedStyle(el.firstElementChild as Element).backgroundColor,
      )
      expect(inner).toBe(editedOnSelected[theme])
      await page.screenshot({ path: `../tmp/e2e/row-selection-${theme}.png` })
    })
  })
}
