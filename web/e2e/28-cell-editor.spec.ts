import { expect, type Page, test } from '@playwright/test'

const bg = (page: Page, selector: string) =>
  page.locator(selector).evaluate((el) => getComputedStyle(el).backgroundColor)

for (const theme of ['light', 'dark'] as const) {
  test.describe(theme, () => {
    test.use({ colorScheme: theme })

    test('the cell editor is the cell itself, grown over its neighbours', async ({ page }) => {
      await page.goto('/tables/public/users')
      const grid = page.getByRole('grid', { name: 'Rows of users' })
      const cell = (row: number, col: number) => grid.locator(`[data-cell="${row}:${col}"]`)
      const editor = page.getByTestId('cell-editor')
      const box = editor.locator('..')

      // A row that is not selected: Enter on the active cell, reached with the keyboard.
      await cell(0, 4).click()
      await page.keyboard.press('ArrowDown')
      await page.keyboard.press('Enter')
      const input = page.getByRole('textbox', { name: 'Edit full_name' })
      await expect(input).toBeFocused()
      expect(
        await grid.locator('[role="row"][aria-rowindex="3"]').getAttribute('aria-selected'),
      ).toBe('false')

      // No field inside: transparent, no border or outline, no rounded corners.
      const field = await input.evaluate((el) => {
        const s = getComputedStyle(el)
        return [s.backgroundColor, s.borderTopWidth, s.outlineStyle, s.borderTopLeftRadius]
      })
      expect(field).toEqual(['rgba(0, 0, 0, 0)', '0px', 'none', '0px'])
      // A 2 px accent border with rounded corners, on the light surface of a plain row.
      const border = await editor.evaluate((el) => {
        const s = getComputedStyle(el)
        return [s.borderTopWidth, s.borderTopStyle, s.borderTopLeftRadius]
      })
      expect(border).toEqual(['2px', 'solid', '6px'])
      expect(await box.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe(
        await bg(page, '[role="row"][aria-rowindex="3"]'),
      )
      // Bigger than its cell, over the neighbours.
      const [e, c] = [await editor.boundingBox(), await cell(1, 4).boundingBox()]
      expect(e && c && e.y < c.y && e.x < c.x && e.y + e.height > c.y + c.height).toBeTruthy()
      await box.screenshot({ path: `../tmp/e2e/28-cell-editor-${theme}.png` })
      if (e) {
        const clip = { x: e.x - 120, y: e.y - 60, width: e.width + 240, height: e.height + 120 }
        await page.screenshot({ path: `../tmp/e2e/28-cell-editor-context-${theme}.png`, clip })
      }

      // Esc leaves the value as it was; Tab saves to the queue and moves to the next column.
      await page.keyboard.press('Escape')
      await expect(editor).toHaveCount(0)
      await page.keyboard.press('Enter')
      await page.keyboard.press('Control+a')
      await page.keyboard.type('Edited in place')
      await page.keyboard.press('Tab')
      await expect(editor).toHaveCount(0)
      await expect(cell(1, 4)).toHaveText('Edited in place')
      await expect(page.getByText('1 pending change')).toBeVisible()

      // A selected row: the editor stays light, not gray.
      await cell(2, 4).dblclick()
      await expect(page.getByRole('textbox', { name: 'Edit full_name' })).toBeFocused()
      expect(await box.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe(
        await bg(page, '[role="row"][aria-rowindex="5"]'),
      )
      await box.screenshot({ path: `../tmp/e2e/28-cell-editor-selected-${theme}.png` })
      await page.keyboard.press('Escape')

      // The other editors take the same frame: enum, date and JSON.
      for (const [col, name] of [
        [6, 'plan'],
        [8, 'birth_date'],
        [10, 'settings'],
      ] as const) {
        await cell(3, col).dblclick()
        await expect(editor).toBeVisible()
        // Keys go to the field once it has the focus (the JSON editor loads on demand).
        await expect
          .poll(() => editor.evaluate((el) => el.contains(document.activeElement)))
          .toBe(true)
        expect(await editor.evaluate((el) => getComputedStyle(el).borderTopWidth)).toBe('2px')
        await box.screenshot({ path: `../tmp/e2e/28-cell-editor-${name}-${theme}.png` })
        await page.keyboard.press('Escape')
        await expect(editor).toHaveCount(0)
      }

      await page.getByRole('button', { name: 'Discard' }).click()
    })
  })
}
