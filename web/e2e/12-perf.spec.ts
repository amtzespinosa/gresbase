/// <reference lib="dom" />
import { expect, test } from '@playwright/test'

// Grid scroll measurement on wide_metrics (32 columns) with 200 rows per page. Not a pass/fail
// check: it prints frame times. Opt-in, because numbers depend on the machine:
//   GRESBASE_PERF=1 task e2e -- 12-perf
test.skip(!process.env.GRESBASE_PERF, 'set GRESBASE_PERF=1 to measure')

interface Stats {
  frames: number
  avgFps: number
  p95: number
  max: number
  longTasks: number
}

test('grid scroll, 200 rows × 32 columns', async ({ page }) => {
  await page.goto('/tables/public/wide_metrics?size=200')
  const grid = page.getByRole('grid', { name: 'Rows of wide_metrics' })
  await expect(grid.locator('[data-cell="0:1"]')).toBeVisible()

  const run = (axis: 'y' | 'x') =>
    grid.evaluate(async (el, axis): Promise<Stats> => {
      // The scroller is the grid or its nearest scrollable ancestor.
      let box: HTMLElement | null = el as HTMLElement
      while (box && box.scrollHeight <= box.clientHeight + 1) box = box.parentElement
      if (!box) throw new Error('no scroll container')
      box.scrollTo(0, 0)
      const end =
        axis === 'y' ? box.scrollHeight - box.clientHeight : box.scrollWidth - box.clientWidth
      let longTasks = 0
      const obs = new PerformanceObserver((l) => (longTasks += l.getEntries().length))
      obs.observe({ type: 'longtask', buffered: false })
      const deltas: number[] = []
      // 40 px per frame, down (or right) to the end and back.
      await new Promise<void>((done) => {
        let pos = 0
        let dir = 1
        let last = performance.now()
        const step = (now: number) => {
          deltas.push(now - last)
          last = now
          pos += 40 * dir
          if (pos >= end) dir = -1
          if (pos <= 0 && dir < 0) return done()
          if (axis === 'y') box.scrollTop = pos
          else box.scrollLeft = pos
          requestAnimationFrame(step)
        }
        requestAnimationFrame(step)
      })
      obs.disconnect()
      deltas.shift()
      const sorted = [...deltas].sort((a, b) => a - b)
      const avg = deltas.reduce((a, b) => a + b, 0) / deltas.length
      return {
        frames: deltas.length,
        avgFps: Math.round(1000 / avg),
        p95: Math.round(sorted[Math.floor(sorted.length * 0.95)] * 10) / 10,
        max: Math.round(sorted[sorted.length - 1] * 10) / 10,
        longTasks,
      }
    }, axis)

  const vertical = await run('y')
  const horizontal = await run('x')
  console.log(JSON.stringify({ vertical, horizontal }))
  expect(vertical.frames).toBeGreaterThan(10)
})
