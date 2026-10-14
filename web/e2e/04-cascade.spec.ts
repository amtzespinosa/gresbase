import { expect, test } from '@playwright/test'
import { filters, scalar } from './helpers'

test('delete with cascade shows the real impact', async ({ page, request }) => {
  // An invoice with items and no billing payments (those would block the delete).
  const id = await scalar(
    request,
    `SELECT i.id FROM invoices i
     WHERE EXISTS (SELECT 1 FROM invoice_items it WHERE it.invoice_id = i.id)
       AND NOT EXISTS (SELECT 1 FROM billing.payments p WHERE p.invoice_id = i.id)
     ORDER BY i.id LIMIT 1`,
  )
  const items = await scalar(request, `SELECT count(*) FROM invoice_items WHERE invoice_id = ${id}`)

  await page.goto(`/tables/public/invoices?${filters([{ column: 'id', op: 'eq', value: id }])}`)
  const grid = page.getByRole('grid', { name: 'Rows of invoices' })
  await grid.getByRole('checkbox', { name: 'Select row 1', exact: true }).check()
  await page.getByRole('button', { name: 'Delete 1 row' }).click()
  await page.getByRole('button', { name: 'Save', exact: true }).click()

  const impact = page.getByRole('dialog', { name: 'This delete reaches other tables' })
  const rows = Number(items) === 1 ? '1 row' : `${items} rows`
  await expect(impact.getByText(`Also deletes ${rows} from invoice_items`)).toBeVisible()
  await expect(impact.getByText("You won't be able to undo this save.")).toBeVisible()

  // Cancel first: nothing happens.
  await impact.getByRole('button', { name: 'Cancel' }).click()
  expect(await scalar(request, `SELECT count(*) FROM invoices WHERE id = ${id}`)).toBe('1')

  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await impact.getByRole('button', { name: 'Delete anyway' }).click()
  await expect(page.getByText('Saved 1 change').first()).toBeVisible()
  expect(await scalar(request, `SELECT count(*) FROM invoices WHERE id = ${id}`)).toBe('0')
  expect(await scalar(request, `SELECT count(*) FROM invoice_items WHERE invoice_id = ${id}`)).toBe(
    '0',
  )
})
