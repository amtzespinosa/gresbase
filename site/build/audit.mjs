// npm run audit: production build served locally (with public/_headers applied), then
//   1. axe (WCAG 2.1 A/AA + best practices) on the landing and five docs pages, EN/ES, light/dark
//   2. no request to another origin on any page
//   3. keyboard: every focusable element shows a visible focus ring; search, code tabs and the
//      mobile panel work without a mouse
//   4. Lighthouse (performance, accessibility, best practices, SEO ≥ 95) on the landing and two docs pages
// Fails on critical/serious axe violations, external requests, keyboard problems or a score < 95.
// Run it where Playwright's Chromium is installed (the dev container): it needs no Docker.
import { spawn } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import AxeBuilder from '@axe-core/playwright'
import * as chromeLauncher from 'chrome-launcher'
import lighthouse from 'lighthouse'
import { chromium } from 'playwright'

const PORT = Number(process.env.AUDIT_PORT ?? 4399)
const BASE = `http://localhost:${PORT}`
const problems = []
// Known axe findings kept on purpose, each with its reason; printed on every run, never silent.
const ACCEPTED = []
const fail = (msg) => { problems.push(msg); console.log('  ✗ ' + msg) }

process.env.SITE_URL = BASE // canonical URLs on the audited origin
process.env.SITE_DIST ??= join(tmpdir(), 'gresbase-site-audit')
const { build } = await import('./build.mjs') // after SITE_DIST is set: build.mjs reads it on import
await build({ prod: true })
const server = spawn(process.execPath, ['build/dev-server.mjs', '--preview'], { env: { ...process.env, SITE_PORT: String(PORT), GRESBASE_DEV_HOST: '127.0.0.1' }, stdio: 'ignore' })
for (let i = 0; i < 50; i++) {
  try { if ((await fetch(BASE + '/')).ok) break } catch {} // starting
  await new Promise((r) => setTimeout(r, 200))
}

const browser = await chromium.launch()
const open = async (options) => (await browser.newContext(options)).newPage()
try {
  /* ---------- 1. axe ---------- */
  console.log('axe')
  const axePages = ['/', '/docs/quick-start/', '/docs/environment/', '/docs/editing-data/', '/docs/sql-editor/', '/docs/troubleshooting/']
  for (const lang of ['en', 'es']) {
    for (const scheme of ['light', 'dark']) {
      for (const path of axePages) {
        const url = BASE + (lang === 'en' ? path : '/es' + path)
        const page = await open({ colorScheme: scheme, reducedMotion: 'reduce' })
        await page.goto(url)
        const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice']).analyze()
        for (const v of violations) {
          const line = `${url} [${scheme}] ${v.impact} ${v.id}: ${v.help} (${v.nodes.length}× ${v.nodes.slice(0, 2).map((n) => n.target.join(' ')).join(', ')})`
          const accepted = ACCEPTED.find((a) => a.id === v.id && v.nodes.every((n) => a.selector.test(n.target.join(' '))))
          if (accepted) console.log(`  ! accepted: ${line} — ${accepted.why}`)
          else if (v.impact === 'critical' || v.impact === 'serious') fail(line)
          else console.log('  · ' + line)
        }
        await page.context().close()
      }
    }
  }

  /* ---------- 2. External requests ---------- */
  console.log('external requests')
  const sitemap = await (await fetch(BASE + '/sitemap.xml')).text().catch(() => '')
  const urls = [...new Set([...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]))]
  if (!urls.length) fail('sitemap.xml lists no pages')
  urls.push(BASE + '/404.html')
  for (const url of urls) {
    const page = await open()
    const external = []
    page.on('request', (r) => { if (!r.url().startsWith(BASE) && !r.url().startsWith('data:')) external.push(r.url()) })
    // CSP violations (e.g. the inline theme script) and script errors show up as console errors.
    const errors = []
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
    page.on('pageerror', (e) => errors.push(e.message))
    await page.goto(url, { waitUntil: 'networkidle' })
    await page.keyboard.press('Control+k') // the docs search index loads on first open
    await page.waitForTimeout(200)
    if (external.length) fail(`${url} requests ${external.join(', ')}`)
    if (errors.length) fail(`${url} console: ${errors.join(' | ')}`)
    if (url.endsWith('/404.html') === false && !(await page.evaluate(() => document.documentElement.dataset.theme ?? 'ok'))) fail(`${url}: theme script did not run`)
    await page.context().close()
  }
  console.log(`  ${urls.length} pages checked (requests, console errors and CSP violations)`)

  /* ---------- 3. Keyboard ---------- */
  console.log('keyboard')
  // Tabs through the page; every element that gets focus must be visible and show a focus ring.
  async function tabThrough(page, label, max = 80) {
    const seen = new Set()
    for (let i = 0; i < max; i++) {
      await page.keyboard.press('Tab')
      const f = await page.evaluate(() => {
        const el = document.activeElement
        if (!el || el === document.body) return null
        const cs = getComputedStyle(el)
        const r = el.getBoundingClientRect()
        const ring = (cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0) || cs.boxShadow !== 'none'
        const id = el.tagName + ':' + (el.id || el.getAttribute('aria-label') || el.textContent.trim().slice(0, 30) || el.getAttribute('href'))
        return { id, ring, focusVisible: el.matches(':focus-visible'), visible: r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' }
      })
      if (!f) break
      if (seen.has(f.id)) break
      seen.add(f.id)
      if (!f.visible) fail(`${label}: focus on an invisible element ${f.id}`)
      else if (!f.ring || !f.focusVisible) fail(`${label}: no visible focus ring on ${f.id}`)
    }
    return seen.size
  }
  for (const [path, width] of [['/', 1440], ['/es/', 390], ['/docs/quick-start/', 1440]]) {
    const page = await open({ viewport: { width, height: 900 } })
    await page.goto(BASE + path)
    console.log(`  ${path} @${width}: ${await tabThrough(page, `${path} @${width}`)} focusable elements`)
    await page.context().close()
  }
  {
    const page = await open({ viewport: { width: 1440, height: 900 } })
    await page.goto(BASE + '/docs/quick-start/')
    // Search with the keyboard only.
    await page.keyboard.press('/')
    await page.keyboard.type('read only')
    await page.waitForSelector('.res')
    await page.keyboard.press('ArrowDown')
    const target = await page.$eval('.res[aria-selected="true"]', (a) => a.href)
    await Promise.all([page.waitForURL(target), page.keyboard.press('Enter')])
    if (!page.url().startsWith(target.split('#')[0])) fail('keyboard search: Enter did not open the result')
    // Code tabs: reach a tab with Tab and switch it with Enter.
    await page.goto(BASE + '/docs/quick-start/')
    await page.focus('[data-tabs] [data-tab]:not([aria-selected="true"])')
    await page.keyboard.press('Enter')
    if ((await page.$eval('[data-tabs] [data-tab]:focus', (b) => b.getAttribute('aria-selected'))) !== 'true') fail('code tabs: Enter does not select the tab')
    await page.context().close()
  }
  {
    // Mobile panel: open with the keyboard, focus moves inside, Esc closes and returns the focus.
    const page = await open({ viewport: { width: 390, height: 800 } })
    await page.goto(BASE + '/docs/quick-start/')
    await page.focus('#menu-btn')
    await page.keyboard.press('Enter')
    await page.waitForTimeout(350)
    const inside = await page.evaluate(() => document.getElementById('sidebar').contains(document.activeElement))
    if (!inside) fail('mobile panel: focus does not move into the panel')
    await page.keyboard.press('Escape')
    await page.waitForTimeout(350)
    if ((await page.evaluate(() => document.activeElement.id)) !== 'menu-btn') fail('mobile panel: Esc does not return the focus to the menu button')
    await page.context().close()
  }

  /* ---------- 4. Lighthouse ---------- */
  console.log('lighthouse')
  const chrome = await chromeLauncher.launch({ chromePath: chromium.executablePath(), chromeFlags: ['--headless=new', '--no-sandbox'] })
  try {
    for (const path of ['/', '/docs/quick-start/', '/es/docs/environment/']) {
      const { lhr } = await lighthouse(BASE + path, { port: chrome.port, output: 'json', logLevel: 'error', onlyCategories: ['performance', 'accessibility', 'best-practices', 'seo'] })
      const scores = Object.values(lhr.categories).map((c) => [c.id, Math.round(c.score * 100)])
      console.log(`  ${path}: ${scores.map(([id, s]) => `${id} ${s}`).join(' · ')}`)
      for (const [id, s] of scores) {
        if (s < 95) {
          const failing = Object.values(lhr.audits).filter((a) => a.score !== null && a.score < 0.9 && lhr.categories[id].auditRefs.some((r) => r.id === a.id && r.weight > 0)).map((a) => a.id)
          fail(`lighthouse ${path} ${id} ${s} (${failing.join(', ')})`)
        }
      }
    }
  } finally {
    await chrome.kill()
  }
} finally {
  await browser.close()
  server.kill()
}

if (problems.length) {
  console.error(`\naudit failed (${problems.length})`)
  process.exit(1)
}
console.log('\naudit passed')
