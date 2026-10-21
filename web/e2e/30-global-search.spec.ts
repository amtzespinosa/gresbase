import { expect, test } from '@playwright/test'

for (const theme of ['light', 'dark'] as const) {
  test.describe(theme, () => {
    test.use({ colorScheme: theme })

    test('global search: structure and data hits open the table, filtered and highlighted', async ({
      page,
    }) => {
      // From the palette: type, then "Search … in all tables".
      await page.goto('/tables')
      // The shortcut works once the shell is on screen.
      await expect(page.getByRole('link', { name: 'Search all tables' })).toBeVisible()
      await page.keyboard.press('ControlOrMeta+k')
      await page.keyboard.type('user11999')
      await page.getByRole('option', { name: 'Search “user11999” in all tables' }).click()
      await expect(page).toHaveURL(/\/search\?q=user11999/)

      // Results stream in by table: users.email, with the term marked.
      const data = page.getByRole('region', { name: 'Data' })
      const hit = data.getByRole('button', { name: /email/ }).first()
      await expect(hit).toContainText('user11999@example.com')
      await expect(hit.locator('mark')).toHaveText('user11999')
      await expect(page.getByRole('status').filter({ hasText: /row.* in \d+ table/ })).toBeVisible()
      await page.screenshot({ path: `../tmp/e2e/30-global-search-${theme}.png` })

      // A data hit opens its row: filtered by the key, the matching column highlighted.
      await hit.click()
      await expect(page).toHaveURL(/\/tables\/public\/users\?/)
      const grid = page.getByRole('grid', { name: 'Rows of users' })
      await expect(grid.getByRole('gridcell', { name: 'user11999@example.com' })).toBeVisible()
      await expect(grid.locator('[role="columnheader"][data-highlight]')).toContainText('email')
      await expect(page.locator('footer span[aria-live]')).toHaveText(/^1–1/)

      // Structure: a column name, limited to one schema in the URL.
      await page.goto('/search?q=full_na&schemas=%5B%22public%22%5D')
      const structure = page.getByRole('region', { name: 'Structure' })
      await expect(page.getByRole('button', { name: 'Schemas' })).toHaveText('public')
      await structure.getByRole('button', { name: /^public\.users\.full_name/ }).click()
      await expect(page).toHaveURL(/\/tables\/public\/users\?col=full_name/)
      await expect(
        page
          .getByRole('grid', { name: 'Rows of users' })
          .locator('[role="columnheader"][data-highlight]'),
      ).toContainText('full_name')
    })
  })
}
