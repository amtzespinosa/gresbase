import { expect, test } from '@playwright/test'

test.use({ permissions: ['clipboard-read', 'clipboard-write'] })

test('copy a rectangle as TSV, paste from a spreadsheet into the change queue and save', async ({
  page,
}) => {
  await page.goto('/tables/public/users')
  const grid = page.getByRole('grid', { name: 'Rows of users' })
  const cell = (row: number, col: number) => grid.locator(`[data-cell="${row}:${col}"]`)
  await expect(cell(0, 3)).not.toBeEmpty()
  const clipboard = () => page.evaluate(() => navigator.clipboard.readText())
  const write = (text: string) => page.evaluate((t) => navigator.clipboard.writeText(t), text)

  // email and full_name of the first two rows, selected with Shift+arrows.
  const values = await Promise.all([0, 1].flatMap((r) => [3, 4].map((c) => cell(r, c).innerText())))
  await cell(0, 3).click()
  await page.keyboard.press('Shift+ArrowRight')
  await page.keyboard.press('Shift+ArrowDown')
  await expect(cell(1, 4)).toHaveAttribute('aria-selected', 'true')
  await page.keyboard.press('ControlOrMeta+c')
  await expect.poll(clipboard).toBe(`${values[0]}\t${values[1]}\n${values[2]}\t${values[3]}`)

  // Paste full_name and is_active for two rows, as Sheets copies them; one boolean is wrong.
  await write('Pasted One\tfalse\r\nPasted Two\tmaybe\r\n')
  await cell(0, 4).click()
  await page.keyboard.press('ControlOrMeta+v')
  await expect(cell(0, 4)).toHaveText('Pasted One')
  await expect(cell(1, 5)).toHaveAttribute('data-invalid', 'true')
  const pill = page.getByRole('status').filter({ hasText: 'pending' })
  await expect(pill).toContainText('1 invalid value')
  await expect(pill.getByRole('button', { name: 'Save' })).toBeDisabled()

  // Fix it with another paste, then save: the server casts the text to the column types.
  await write('true')
  await cell(1, 5).click()
  await page.keyboard.press('ControlOrMeta+v')
  await expect(cell(1, 5)).not.toHaveAttribute('data-invalid')
  await pill.getByRole('button', { name: 'Save' }).click()
  await expect(pill).toHaveCount(0)
  await page.reload()
  await expect(cell(0, 4)).toHaveText('Pasted One')
  await expect(cell(1, 4)).toHaveText('Pasted Two')
})
