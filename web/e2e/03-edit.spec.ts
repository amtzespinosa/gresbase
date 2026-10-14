import { expect, test } from '@playwright/test'
import { filters, scalar } from './helpers'

test('edit, insert, delete, diff, save, undo and redo', async ({ page, request }) => {
  const id = await scalar(request, 'SELECT min(id) FROM users')
  const original = await scalar(
    request,
    `SELECT coalesce(full_name, 'NULL') FROM users WHERE id = ${id}`,
  )
  await page.goto(`/tables/public/users?${filters([{ column: 'id', op: 'eq', value: id }])}`)
  const grid = page.getByRole('grid', { name: 'Rows of users' })
  const name = grid.locator('[data-cell="0:4"]')
  await expect(name).toHaveText(original)

  // Inline edit: queued and tinted, nothing written yet.
  await name.dblclick()
  await page.getByRole('textbox', { name: 'Edit full_name' }).fill('E2E Edited')
  await page.keyboard.press('Enter')
  await expect(page.getByText('1 pending change')).toBeVisible()
  expect(await scalar(request, `SELECT full_name FROM users WHERE id = ${id}`)).toBe(original)

  // Insert a row from the side panel.
  await page.getByRole('button', { name: 'Insert row' }).click()
  await page.getByRole('textbox', { name: 'email', exact: true }).fill('e2e-insert@example.com')
  await page.getByRole('button', { name: 'Add to queue' }).click()
  await expect(page.getByText('2 pending changes')).toBeVisible()

  // Diff shows both operations and their SQL.
  await page.getByRole('button', { name: 'View diff' }).click()
  const diff = page.getByRole('dialog', { name: '2 pending changes' })
  await expect(diff.getByText(/UPDATE/).first()).toBeVisible()
  await expect(diff.getByText(/INSERT/).first()).toBeVisible()
  await page.keyboard.press('Escape')

  // Save: one transaction.
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page.getByText('Saved 2 changes').first()).toBeVisible()
  expect(await scalar(request, `SELECT full_name FROM users WHERE id = ${id}`)).toBe('E2E Edited')
  expect(
    await scalar(request, "SELECT count(*) FROM users WHERE email = 'e2e-insert@example.com'"),
  ).toBe('1')

  // Undo after saving runs the inverse operations; redo applies them again.
  await grid.locator('[data-cell="0:0"]').click()
  await page.keyboard.press('Control+z')
  await expect(page.getByText('Change undone').first()).toBeVisible()
  await expect
    .poll(() => scalar(request, `SELECT coalesce(full_name, 'NULL') FROM users WHERE id = ${id}`))
    .toBe(original)
  expect(
    await scalar(request, "SELECT count(*) FROM users WHERE email = 'e2e-insert@example.com'"),
  ).toBe('0')
  await page.keyboard.press('Control+Shift+z')
  await expect(page.getByText('Change redone').first()).toBeVisible()
  await expect
    .poll(() => scalar(request, `SELECT full_name FROM users WHERE id = ${id}`))
    .toBe('E2E Edited')

  // Delete the inserted row: struck through in the queue, gone after saving.
  await page.goto(
    `/tables/public/users?${filters([{ column: 'email', op: 'eq', value: 'e2e-insert@example.com' }])}`,
  )
  await expect(grid.locator('[data-cell="0:3"]')).toHaveText('e2e-insert@example.com')
  await grid.getByRole('checkbox', { name: 'Select row 1', exact: true }).check()
  await page.getByRole('button', { name: 'Delete 1 row' }).click()
  await page.getByRole('button', { name: 'View diff' }).click()
  await expect(
    page
      .getByRole('dialog')
      .getByText(/DELETE/)
      .first(),
  ).toBeVisible()
  await page.keyboard.press('Escape')
  await page.keyboard.press('Control+s')
  await expect(page.getByText('Saved 1 change').first()).toBeVisible()
  expect(
    await scalar(request, "SELECT count(*) FROM users WHERE email = 'e2e-insert@example.com'"),
  ).toBe('0')
})
