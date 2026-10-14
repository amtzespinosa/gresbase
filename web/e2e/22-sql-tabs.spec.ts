import { expect, test } from '@playwright/test'
import { scalar, setEditor } from './helpers'

test('query tabs keep their text across a reload; :name parameters run bound', async ({
  page,
  request,
}) => {
  await page.goto('/sql')
  const tabs = page.getByRole('list', { name: 'Query tabs' })
  const results = page.getByRole('region', { name: 'Results' })

  // A parameter whose value looks like an injection is just a value: no rows, table intact.
  const before = await scalar(request, 'SELECT count(*) FROM users')
  await setEditor(page, 'SELECT id, email FROM users WHERE email = :email')
  await page.getByRole('button', { name: 'Run', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Parameter values' })
  await dialog.getByRole('textbox', { name: ':email' }).fill("x' OR '1'='1")
  await dialog.getByRole('button', { name: 'Run' }).click()
  await expect(results.getByText('The query returned no rows.')).toBeVisible()
  expect(await scalar(request, 'SELECT count(*) FROM users')).toBe(before)

  // A real value, typed by the server (id is bigint), in a second tab.
  await page.getByRole('button', { name: 'New tab' }).click()
  await expect(tabs.getByRole('listitem')).toHaveCount(2)
  await setEditor(page, 'SELECT email FROM users WHERE id = :id')
  await page.keyboard.press('Control+Enter')
  await dialog.getByRole('textbox', { name: ':id' }).fill('1')
  await dialog.getByRole('textbox', { name: ':id' }).press('Enter')
  await expect(results.getByText('1 row')).toBeVisible()

  // Rename it, reload: both tabs and their texts are back.
  await tabs.getByRole('listitem').nth(1).getByRole('button').first().dblclick()
  await page.getByRole('textbox', { name: 'Name' }).fill('by id')
  await page.getByRole('button', { name: 'Rename' }).click()
  await page.reload()
  await expect(tabs.getByRole('listitem')).toHaveText(['Untitled query', 'by id'])
  await expect(page.locator('.cm-content')).toContainText('WHERE id = :id')
  await tabs.getByRole('button', { name: /^Untitled query/ }).click()
  await expect(page.locator('.cm-content')).toContainText('WHERE email = :email')

  // The first tab remembers its value.
  await page.getByRole('button', { name: 'Run', exact: true }).click()
  await expect(dialog.getByRole('textbox', { name: ':email' })).toHaveValue("x' OR '1'='1")
})
