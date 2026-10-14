import { expect, test } from '@playwright/test'
import { sql } from './helpers'

const long = 'quarterly_customer_retention_by_acquisition_channel'

test.beforeAll(async ({ request }) => {
  await sql(request, `CREATE TABLE IF NOT EXISTS public.${long} (id int PRIMARY KEY)`)
})
test.afterAll(async ({ request }) => {
  await sql(request, `DROP TABLE IF EXISTS public.${long}`)
})

test('the table list widens from its edge and reveals truncated names over the card', async ({
  page,
}) => {
  await page.goto('/tables/public/users')
  const list = page.getByRole('region', { name: 'Tables' })
  const handle = page.getByRole('separator', { name: /Resize the table list/ })
  const width = async () => (await list.boundingBox())?.width ?? 0
  expect(Math.round(await width())).toBe(240)

  // Hover a truncated name: the full name floats over the card without moving anything.
  const link = list.getByRole('link', { name: new RegExp(long) })
  const before = await link.boundingBox()
  await link.hover()
  const reveal = page.getByTestId('name-reveal')
  await expect(reveal).toHaveText(long)
  const box = await reveal.boundingBox()
  expect(box?.width).toBeGreaterThan(before?.width ?? 0)
  expect(box?.x).toBeCloseTo(before?.x ?? 0, 0)
  expect(await link.boundingBox()).toEqual(before)
  await page.screenshot({ path: '../tmp/e2e/24-reveal.png' })
  // It ignores the pointer: a click opens the table below.
  await reveal.click({ force: true, position: { x: 30, y: 10 } })
  await expect(page).toHaveURL(new RegExp(`/tables/public/${long}`))
  await page.mouse.move(800, 400)
  await expect(reveal).toHaveCount(0)

  // A name that fits shows nothing.
  await list.getByText('users', { exact: true }).hover()
  await expect(reveal).toHaveCount(0)

  // Drag the edge, within limits; double-click resets; the width survives a reload.
  const h = await handle.boundingBox()
  if (!h) throw new Error('no handle')
  await page.mouse.move(h.x + h.width / 2, h.y + h.height / 2)
  await page.mouse.down()
  await page.mouse.move(h.x + 120, h.y + h.height / 2, { steps: 5 })
  await page.mouse.up()
  const dragged = await width()
  expect(dragged).toBeGreaterThan(330)
  await page.reload()
  expect(Math.round(await width())).toBe(Math.round(dragged))
  await handle.dblclick()
  expect(Math.round(await width())).toBe(240)
})

test('the table list context menu: right click, Shift+F10, long press; export and structure', async ({
  page,
}) => {
  await page.goto('/tables/public/users')
  const list = page.getByRole('region', { name: 'Tables' })
  const orgs = list.getByRole('link', { name: /^Table orgs / })
  const menu = page.getByRole('menu')

  // No per-row star or options buttons any more.
  await orgs.hover()
  await expect(list.getByRole('button', { name: /favorites|Actions for/ })).toHaveCount(0)

  await orgs.click({ button: 'right' })
  await expect(menu.getByRole('menuitem')).toHaveText([
    'Open',
    'Open in new tab',
    'Add to favorites',
    'Copy name',
    'View structure',
    'Export CSV',
    'Import CSV…',
    'Empty table…',
    'Delete table…',
  ])
  await page.screenshot({ path: '../tmp/e2e/24-context-menu.png' })
  const download = page.waitForEvent('download')
  await menu.getByRole('menuitem', { name: 'Export CSV' }).click()
  expect((await download).suggestedFilename()).toMatch(/orgs.*\.csv$/)

  // Keyboard: Shift+F10 on the focused row, then pick with the arrows.
  // (The open menu hides the rest of the page from the accessibility tree: measure the row first.)
  const row = await orgs.boundingBox()
  await orgs.focus()
  await page.keyboard.press('Shift+F10')
  await expect(menu).toBeVisible()
  const box = await menu.boundingBox()
  expect(Math.abs((box?.y ?? 0) - ((row?.y ?? 0) + (row?.height ?? 0)))).toBeLessThan(12)
  await menu.getByRole('menuitem', { name: 'View structure' }).press('Enter')
  await expect(page).toHaveURL(/\/tables\/public\/orgs\?tab=structure/)

  // Touch: a long press opens it too.
  const r = await orgs.boundingBox()
  if (!r) throw new Error('no row')
  await orgs.dispatchEvent('pointerdown', {
    pointerType: 'touch',
    isPrimary: true,
    button: 0,
    clientX: r.x + 20,
    clientY: r.y + 10,
  })
  await expect(menu).toBeVisible({ timeout: 2000 })
  await page.keyboard.press('Escape')
})
