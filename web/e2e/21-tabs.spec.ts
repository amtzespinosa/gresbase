import { expect, test } from '@playwright/test'

test('table tabs, favorites and recents survive a reload', async ({ page }) => {
  await page.goto('/tables/public/orgs')
  const list = page.getByRole('region', { name: 'Tables' })
  const tabs = page.getByRole('navigation', { name: 'Open tables' })
  await expect(tabs.getByRole('link')).toHaveText(['orgs'])

  // Opening more tables adds tabs, in opening order.
  await list.getByRole('link', { name: /^Table users / }).click()
  await list.getByRole('link', { name: /^Table invoices / }).click()
  await expect(tabs.getByRole('link')).toHaveText(['orgs', 'users', 'invoices'])
  await expect(tabs.getByRole('link', { name: 'invoices' })).toHaveAttribute('aria-current', 'page')

  // Drag invoices to the front; close users with its ×.
  await tabs.getByRole('listitem').nth(2).dragTo(tabs.getByRole('listitem').nth(0))
  await expect(tabs.getByRole('link')).toHaveText(['invoices', 'orgs', 'users'])
  await tabs.getByRole('listitem').nth(2).hover()
  await tabs.getByRole('button', { name: 'Close public.users' }).click()
  await expect(tabs.getByRole('link')).toHaveText(['invoices', 'orgs'])

  // Star orgs: it shows above the list.
  await list.getByRole('link', { name: /^Table orgs / }).click({ button: 'right' })
  await page.getByRole('menuitem', { name: 'Add to favorites' }).click()
  const favorites = page.getByRole('region', { name: 'Favorites' })
  await expect(favorites.getByRole('link')).toHaveText(['orgs'])

  // Everything is still there after a reload, and the palette offers favorites and recents.
  await page.reload()
  await expect(tabs.getByRole('link')).toHaveText(['invoices', 'orgs'])
  await expect(favorites.getByRole('link')).toHaveText(['orgs'])
  await page.keyboard.press('Control+k')
  const palette = page.getByRole('dialog')
  await expect(palette.getByRole('group', { name: 'Favorites' })).toContainText('orgs')
  await expect(palette.getByRole('group', { name: 'Recent' })).toContainText('public.users')
  await page.keyboard.press('Escape')

  // Alt+W closes the open tab and opens its neighbor.
  await tabs.getByRole('link', { name: 'invoices' }).click()
  await page.keyboard.press('Alt+w')
  await expect(tabs.getByRole('link')).toHaveText(['orgs'])
  await expect(page).toHaveURL(/\/tables\/public\/orgs/)
})
