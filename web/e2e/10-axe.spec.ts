import AxeBuilder from '@axe-core/playwright'
import { expect, type Page, test } from '@playwright/test'
import { pick, urls } from './helpers'

async function violations(page: Page) {
  const { violations } = await new AxeBuilder({ page }).analyze()
  return violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)
}

for (const theme of ['light', 'dark'] as const) {
  test.describe(`axe (${theme})`, () => {
    test.use({ colorScheme: theme })

    test('Tables', async ({ page }) => {
      await page.goto('/tables/public/users')
      await expect(page.getByRole('grid', { name: 'Rows of users' })).toBeVisible()
      expect(await violations(page)).toEqual([])
    })

    // Italic muted NULL on the accent tint of an edited cell: the tightest contrast pair.
    test('Edited cell set to NULL', async ({ page }) => {
      await page.goto('/tables/public/users')
      const grid = page.getByRole('grid', { name: 'Rows of users' })
      const cell = grid.locator('[data-cell="0:4"]')
      await cell.click()
      await page.keyboard.press('Control+Backspace')
      await expect(page.getByText('1 pending change')).toBeVisible()
      await expect(cell).toHaveText('NULL')
      expect(await violations(page)).toEqual([])
    })

    // The row and column locks are small icons; their buttons must still be 24×24 px targets.
    test('Pin lock targets', async ({ page }) => {
      await page.goto('/tables/public/users')
      const grid = page.getByRole('grid', { name: 'Rows of users' })
      await grid.getByRole('button', { name: 'Pin row 1', exact: true }).click()
      await grid.getByRole('button', { name: 'Pin column email', exact: true }).click()
      for (const name of ['Unpin row 1', 'Unpin column email']) {
        const box = await grid.getByRole('button', { name, exact: true }).boundingBox()
        expect(box?.width).toBeGreaterThanOrEqual(24)
        expect(box?.height).toBeGreaterThanOrEqual(24)
      }
      const r = await new AxeBuilder({ page }).withRules(['target-size']).analyze()
      const html = (list: typeof r.passes) => list.flatMap((x) => x.nodes.map((n) => n.html))
      expect(html(r.violations)).toEqual([])
      const passed = html(r.passes)
      expect(passed.some((h) => h.includes('"Unpin row 1"'))).toBe(true)
      expect(passed.some((h) => h.includes('"Unpin column email"'))).toBe(true)
    })

    // The row checkboxes: 24×24 px targets, checked and indeterminate states in both themes.
    test('Checkboxes', async ({ page }) => {
      await page.goto('/tables/public/users')
      const grid = page.getByRole('grid', { name: 'Rows of users' })
      const all = grid.getByRole('checkbox', { name: 'Select all rows' })
      await grid.getByRole('checkbox', { name: 'Select row 2', exact: true }).check()
      await expect(all).toHaveAttribute('aria-checked', 'mixed')
      for (const box of [all, grid.getByRole('checkbox', { name: 'Select row 2', exact: true })]) {
        const b = await box.boundingBox()
        expect(b?.width).toBeGreaterThanOrEqual(24)
        expect(b?.height).toBeGreaterThanOrEqual(24)
      }
      expect(await violations(page)).toEqual([])
      const r = await new AxeBuilder({ page }).withRules(['target-size']).analyze()
      expect(r.violations.flatMap((x) => x.nodes.map((n) => n.html))).toEqual([])
      expect(r.passes.flatMap((x) => x.nodes).some((n) => n.html.includes('"Select row 2"'))).toBe(
        true,
      )
      await all.click()
      await expect(all).toHaveAttribute('aria-checked', 'true')
      expect(await violations(page)).toEqual([])
      await page.screenshot({ path: `../tmp/e2e/checkboxes-${theme}.png` })
    })

    // Gray selected rows, with an edited NULL inside a selected row and one outside.
    test('Selected rows', async ({ page }) => {
      await page.goto('/tables/public/users')
      const grid = page.getByRole('grid', { name: 'Rows of users' })
      await grid.locator('[data-cell="0:4"]').click()
      await page.keyboard.press('Control+Backspace')
      await grid.locator('[data-cell="2:1"]').click({ modifiers: ['ControlOrMeta'] })
      await expect(grid.locator('[role=row][data-row-selected]')).toHaveCount(2)
      expect(await violations(page)).toEqual([])
      await grid.locator('[data-cell="3:2"]').click()
      await expect(grid.locator('[role=row][data-row-selected]')).toHaveCount(1)
      expect(await violations(page)).toEqual([])
    })

    test('Structure editing', async ({ page }) => {
      await page.goto('/tables/public/users?tab=structure')
      await page.getByRole('button', { name: 'Add column' }).click()
      const dialog = page.getByRole('dialog', { name: 'Add a column to public.users' })
      await dialog.getByLabel('Column name').fill('nick')
      await dialog.getByLabel('Type', { exact: true }).fill('text')
      await expect(dialog).toContainText('Locks the table (ACCESS EXCLUSIVE)')
      expect(await violations(page)).toEqual([])
    })

    test('Index and foreign key editing', async ({ page }) => {
      await page.goto('/tables/public/invoices?tab=structure')
      await page.getByRole('button', { name: 'Add index' }).click()
      let dialog = page.getByRole('dialog', { name: 'New index on public.invoices' })
      await dialog.getByLabel('Without blocking writes (CONCURRENTLY)').check()
      await expect(dialog).toContainText('leaves an invalid index')
      expect(await violations(page)).toEqual([])
      await page.keyboard.press('Escape')
      await page.getByRole('button', { name: 'Add foreign key' }).click()
      dialog = page.getByRole('dialog', { name: 'New foreign key on public.invoices' })
      await pick(page, 'Referenced table', 'orgs')
      await pick(page, 'Column 1', 'org_id')
      await expect(dialog.locator('pre')).toContainText('FOREIGN KEY')
      expect(await violations(page)).toEqual([])
    })

    test('SQL', async ({ page }) => {
      await page.goto('/sql')
      await expect(page.locator('.cm-content')).toBeVisible()
      expect(await violations(page)).toEqual([])
    })

    test('Settings', async ({ page }) => {
      await page.goto('/settings')
      await expect(page.getByRole('heading', { name: 'SQL editor' })).toBeVisible()
      expect(await violations(page)).toEqual([])
    })

    test('Login', async ({ page }) => {
      await page.goto(`${urls.auth}/login`)
      await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible()
      expect(await violations(page)).toEqual([])
    })
  })
}
