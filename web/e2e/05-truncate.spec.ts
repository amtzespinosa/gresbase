import { expect, test } from '@playwright/test'
import { scalar } from './helpers'

test('empty a table by typing its name', async ({ page, request }) => {
  expect(Number(await scalar(request, 'SELECT count(*) FROM "MixedCase"'))).toBeGreaterThan(0)
  await page.goto('/tables/public/MixedCase')
  await page.getByRole('button', { name: 'Actions for MixedCase' }).last().click()
  await page.getByRole('menuitem', { name: 'Empty table…' }).click()

  const dialog = page.getByRole('dialog', { name: 'Empty public.MixedCase' })
  const confirm = dialog.getByRole('button', { name: 'Empty table' })
  const typed = dialog.getByLabel('Type MixedCase to confirm')
  await typed.fill('mixedcase')
  await expect(confirm).toBeDisabled()
  await typed.fill('MixedCase')
  await expect(confirm).toBeEnabled()
  await confirm.click()

  await expect(page.getByText('MixedCase is now empty').first()).toBeVisible()
  expect(await scalar(request, 'SELECT count(*) FROM "MixedCase"')).toBe('0')
  await expect(page.getByText('This table is empty.')).toBeVisible()
})
