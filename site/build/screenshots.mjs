// npm run screenshots: real screenshots of the app for the docs, in light and dark and in every
// language, saved as src/img/docs/<name>-<theme>-<lang>.webp (quality 85, at 2x).
// Starts screenshots/compose.yml (gresbase:local + a demo database with invented data), prepares each
// state through the UI and stops everything at the end. Run it where `docker` reaches the Docker that
// has gresbase:local: inside the dev container (DOCKER_HOST=tcp://docker:2375) the app is published on
// the host `docker`, elsewhere on localhost.
import { execFileSync } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { chromium } from 'playwright'
import { siteDir } from './build.mjs'

const compose = ['compose', '-f', join(siteDir, 'screenshots', 'compose.yml')]
const host = process.env.DOCKER_HOST?.match(/^tcp:\/\/([^:/]+)/)?.[1] ?? 'localhost'
const port = process.env.SCREENSHOTS_PORT ?? '18190'
const base = `http://${host}:${port}`
const outDir = join(siteDir, 'src', 'img', 'docs')
const env = { ...process.env, SCREENSHOTS_HOST: host, SCREENSHOTS_PORT: port }
const docker = (...args) => execFileSync('docker', args, { stdio: 'inherit', env })


const MONTHLY = `-- Revenue per month
select date_trunc('month', issued_at) as month,
       count(*) as invoices,
       sum(amount) as revenue
from invoices
where paid_at is not null
group by 1
order by 1 desc;`

/** Each screenshot: a name and how to get the app into that state. */
const SHOTS = [
  {
    name: 'tables',
    async prepare(page) {
      await page.goto(`${base}/tables/public/customers`)
      await page.locator('[data-cell="2:2"]').click()
    },
  },
  {
    name: 'editing',
    async prepare(page) {
      await page.goto(`${base}/tables/public/customers`)
      // Columns: 0 id, 1 name, 2 email, 3 country, 4 plan_id, 5 created_at.
      await page.locator('[data-cell="1:1"]').dblclick()
      await page.keyboard.press('ControlOrMeta+a')
      await page.keyboard.insertText('Owen Hartley-Price')
      await page.keyboard.press('Enter')
      await page.locator('[data-cell="3:2"]').dblclick()
      await page.keyboard.press('ControlOrMeta+a')
      await page.keyboard.insertText('ana.ruiz@example.org')
      await page.keyboard.press('Enter')
      await page.locator('[data-cell="5:1"]').click()
    },
  },
  {
    name: 'sql-editor',
    async prepare(page) {
      await page.goto(`${base}/sql`)
      await page.locator('.cm-content').click()
      await page.keyboard.press('ControlOrMeta+a')
      await page.keyboard.press('Delete')
      await page.keyboard.insertText(MONTHLY)
      await page.keyboard.press('ControlOrMeta+Enter')
      await page.getByRole('region').getByRole('grid').first().waitFor()
    },
  },
  {
    name: 'structure',
    async prepare(page) {
      await page.goto(`${base}/tables/public/orders?tab=structure`)
    },
  },
]

async function waitForApp() {
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(`${base}/healthz`)).ok) return
    } catch {} // not up yet
    await new Promise((r) => setTimeout(r, 1000))
  }
  throw new Error(`Gresbase did not answer on ${base}/healthz`)
}

docker(...compose, 'up', '-d', '--wait')
const browser = await chromium.launch()
try {
  await waitForApp()
  await mkdir(outDir, { recursive: true })
  // The browser encodes the WebP itself (canvas.toBlob), so no image library is needed.
  const encoder = await browser.newPage()
  for (const lang of ['en', 'es']) {
    for (const theme of ['light', 'dark']) {
      for (const shot of SHOTS) {
        const ctx = await browser.newContext({ viewport: { width: 1440, height: 860 }, deviceScaleFactor: 2, colorScheme: theme, reducedMotion: 'reduce' })
        await ctx.addInitScript(([theme, lang]) => {
          localStorage.setItem('gresbase:prefs', JSON.stringify({ state: { theme, lang }, version: 0 }))
        }, [theme, lang])
        const page = await ctx.newPage()
        await shot.prepare(page, lang)
        await page.waitForLoadState('networkidle')
        await page.evaluate(() => document.fonts.ready)
        await page.mouse.move(0, 0)
        // Editing scrolls the grid to the edited cell: show it from its first column.
        await page.evaluate(() => document.querySelectorAll('[role="grid"]').forEach((g) => {
          for (let el = g; el; el = el.parentElement) if (el.scrollWidth > el.clientWidth) { el.scrollLeft = 0; break }
        }))
        await page.waitForTimeout(400)
        const png = await page.screenshot()
        const webp = await encoder.evaluate(async (b64) => {
          const img = new Image()
          img.src = 'data:image/png;base64,' + b64
          await img.decode()
          const canvas = new OffscreenCanvas(img.width, img.height)
          canvas.getContext('2d').drawImage(img, 0, 0)
          const blob = await canvas.convertToBlob({ type: 'image/webp', quality: 0.85 })
          if (blob.type !== 'image/webp') throw new Error('this browser cannot encode WebP')
          const bytes = new Uint8Array(await blob.arrayBuffer())
          let s = ''
          for (const b of bytes) s += String.fromCharCode(b)
          return btoa(s)
        }, png.toString('base64'))
        const file = join(outDir, `${shot.name}-${theme}-${lang}.webp`)
        await writeFile(file, Buffer.from(webp, 'base64'))
        console.log(`saved ${file.slice(siteDir.length + 1)}`)
        await ctx.close()
      }
    }
  }
} finally {
  await browser.close()
  docker(...compose, 'down', '-v')
}
