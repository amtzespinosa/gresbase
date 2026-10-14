import { expect, test, type Page } from '@playwright/test'

// Distance from the footer's bottom edge to the panel's: 1px is the panel border.
const gap = (page: Page) =>
  page.getByTestId('row-sheet-footer').evaluate((footer) => {
    const panel = footer.closest('[role="dialog"]')
    return (panel?.getBoundingClientRect().bottom ?? NaN) - footer.getBoundingClientRect().bottom
  })

test('the row panel footer stays on the bottom edge, with the fields scrolling above it', async ({
  page,
}) => {
  // Few fields: the footer is still at the bottom, not right after them.
  await page.goto('/tables/public/orgs')
  await page.getByRole('button', { name: 'Insert row' }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByRole('button', { name: 'Add to queue' })).toBeVisible()
  expect(await gap(page)).toBeLessThanOrEqual(1)
  await page.screenshot({ path: '../tmp/e2e/29-row-sheet-short.png' })
  await page.keyboard.press('Escape')

  await page.goto('/tables/public/users')
  await page.getByRole('button', { name: 'Insert row' }).click()
  await expect(dialog.getByRole('button', { name: 'Add to queue' })).toBeVisible()

  // A short window: the fields scroll, the footer doesn't move.
  await page.setViewportSize({ width: 1000, height: 420 })
  expect(await gap(page)).toBeLessThanOrEqual(1)
  const fields = page.getByTestId('row-sheet-footer').locator('xpath=preceding-sibling::div')
  await fields.evaluate((el) => el.scrollTo(0, el.scrollHeight))
  expect(await fields.evaluate((el) => el.scrollTop)).toBeGreaterThan(0)
  expect(await gap(page)).toBeLessThanOrEqual(1)
  await expect(dialog.getByRole('button', { name: 'Add to queue' })).toBeInViewport()
  await page.screenshot({ path: '../tmp/e2e/29-row-sheet-scrolled.png' })
})
