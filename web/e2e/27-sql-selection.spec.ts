import { expect, test } from '@playwright/test'
import { setEditor } from './helpers'

const doc = (page: import('@playwright/test').Page) =>
  page.locator('.cm-content').evaluate((el) => (el as HTMLElement).innerText.replace(/\n$/, ''))

test('the SQL editor selects text with the mouse and the keyboard, and deletes the selection', async ({
  page,
}) => {
  await page.goto('/sql')
  await setEditor(page, 'SELECT 1 AS one')
  // Where the characters of the first line are on screen.
  const at = (offset: number) =>
    page
      .locator('.cm-line')
      .first()
      .evaluate((line, offset) => {
        // The line is split into highlighted spans: find the text node that holds the offset.
        const walker = document.createTreeWalker(line, NodeFilter.SHOW_TEXT)
        let node = walker.nextNode() as Text
        while (offset > node.length) {
          offset -= node.length
          node = walker.nextNode() as Text
        }
        const range = document.createRange()
        range.setStart(node, offset)
        range.setEnd(node, offset)
        const r = range.getBoundingClientRect()
        return { x: r.left, y: r.top + r.height / 2 }
      }, offset)
  // The opaque active line would cover the selection, which is drawn under the text.
  const activeLineBg = () =>
    page.locator('.cm-activeLine').evaluate((el) => getComputedStyle(el).backgroundColor)

  // Mouse: drag over "SELECT ", then delete it.
  const start = await at(0)
  const end = await at(7)
  await page.mouse.move(start.x + 1, start.y)
  await page.mouse.down()
  await page.mouse.move(end.x, end.y, { steps: 5 })
  await page.mouse.up()
  await expect(page.locator('.cm-selectionBackground')).toBeVisible()
  expect(await activeLineBg()).toBe('rgba(0, 0, 0, 0)')
  await page.screenshot({ path: '../tmp/e2e/27-mouse-selection.png' })
  await page.keyboard.press('Backspace')
  await expect.poll(() => doc(page)).toBe('1 AS one')

  // Shift+arrows and Shift+Home/End.
  await page.keyboard.press('End')
  await page.keyboard.press('Shift+ArrowLeft')
  await page.keyboard.press('Shift+ArrowLeft')
  await page.keyboard.press('Shift+ArrowLeft')
  await page.keyboard.press('Delete')
  await expect.poll(() => doc(page)).toBe('1 AS ')
  await page.keyboard.press('Shift+Home')
  expect(await activeLineBg()).toBe('rgba(0, 0, 0, 0)')
  await page.screenshot({ path: '../tmp/e2e/27-keyboard-selection.png' })
  await page.keyboard.press('Backspace')
  await expect.poll(() => doc(page)).toBe('')

  // Ctrl+A over several lines.
  await page.keyboard.insertText('SELECT 1;\nSELECT 2;')
  await page.keyboard.press('Control+a')
  await page.screenshot({ path: '../tmp/e2e/27-select-all.png' })
  await page.keyboard.press('Backspace')
  await expect.poll(() => doc(page)).toBe('')
  // Without a selection, the active line is highlighted again.
  expect(await activeLineBg()).not.toBe('rgba(0, 0, 0, 0)')
})
