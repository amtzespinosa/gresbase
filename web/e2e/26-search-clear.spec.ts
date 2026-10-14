import { expect, test } from '@playwright/test'

for (const theme of ['light', 'dark'] as const) {
  test(`the clear button of the table search is a pointer in --text (${theme})`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: theme })
    await page.goto('/tables/public/users')
    const search = page.getByRole('searchbox', { name: 'Search tables' })
    await search.fill('user')
    // Pseudo-elements of the search input have no computed style: check the shipped rule.
    const rule = await page.evaluate(() =>
      [...document.styleSheets]
        .flatMap((s) => [...s.cssRules])
        .map((r) => r.cssText)
        .find((t) => t.includes('::-webkit-search-cancel-button')),
    )
    expect(rule).toContain('cursor: pointer')
    expect(rule).toContain('var(--text)')
    await page.screenshot({
      path: `../tmp/e2e/search-clear-${theme}.png`,
      clip: { x: 260, y: 90, width: 240, height: 45 },
    })
  })
}
