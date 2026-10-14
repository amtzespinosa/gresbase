// npm run compare: the landing (390/1440 px) and the docs quick start (390/1024/1440 px), EN and ES, light
// and dark, pixel by pixel against site/reference/*.html, at rest. The docs are built in a temporary
// folder with the reference's sample quick start (content of commit SAMPLE_COMMIT) and SITE_REPO_PUBLIC=true,
// because the reference shows that text and the "Edit on GitHub" link. The references use the image
// ghcr.io/OWNER/…, replaced here by the one of site.config.mjs.
// At rest: every animation frozen at its start and baked into static styles; a tall viewport for the
// landing. Even so Chrome now and then rasterizes the silhouettes at the right edge differently (it
// happens comparing the reference with itself too): if a single landing case differs, run it again.
// COMPARE_LANDING_WIDTHS=390,768,1280,1440 checks more landing widths; COMPARE_NO_SILS=1 hides the
// silhouettes on both pages (they are the only source of that occasional noise).
// Run it where Playwright's Chromium is installed (the dev container).
import { execFileSync, spawn } from 'node:child_process'
import { cp, mkdir, rm, symlink, writeFile } from 'node:fs/promises'
import { readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { chromium } from 'playwright'
import { siteDir } from './build.mjs'

const SAMPLE_COMMIT = '8b664ad'
const PORT = Number(process.env.COMPARE_PORT ?? 4396)
const SITE = `http://localhost:${PORT}`
const config = (await import(join(siteDir, 'site.config.mjs'))).default
const ref = (f) => readFileSync(join(siteDir, 'reference', f), 'utf8').replaceAll('ghcr.io/OWNER/gresbase:latest', config.image)

// A copy of site/ with the sample content, next to a copy of assets/brand (the build reads ../assets/brand).
const work = join(tmpdir(), 'gresbase-site-compare')
await rm(work, { recursive: true, force: true })
await mkdir(join(work, 'site', 'content', 'en'), { recursive: true })
await mkdir(join(work, 'site', 'content', 'es'), { recursive: true })
await cp(join(siteDir, '..', 'assets', 'brand'), join(work, 'assets', 'brand'), { recursive: true })
for (const d of ['build', 'src', 'public', 'site.config.mjs', 'package.json']) await cp(join(siteDir, d), join(work, 'site', d), { recursive: true })
await symlink(join(siteDir, 'node_modules'), join(work, 'site', 'node_modules'))
for (const f of ['nav.yml', 'en/quick-start.md', 'es/quick-start.md']) {
  const text = execFileSync('git', ['-c', 'safe.directory=*', 'show', `${SAMPLE_COMMIT}:site/content/${f}`], { cwd: siteDir, encoding: 'utf8' })
  await writeFile(join(work, 'site', 'content', f), text)
}
const env = { ...process.env, SITE_REPO_PUBLIC: 'true', SITE_DIST: join(work, 'site', 'dist'), SITE_PORT: String(PORT), GRESBASE_DEV_HOST: '127.0.0.1' }
execFileSync(process.execPath, ['build/build.mjs', '--prod'], { cwd: join(work, 'site'), env, stdio: ['ignore', 'ignore', 'inherit'] })
const server = spawn(process.execPath, ['build/dev-server.mjs', '--preview'], { cwd: join(work, 'site'), env, stdio: 'ignore' })
for (let i = 0; i < 50; i++) {
  try { if ((await fetch(SITE + '/')).ok) break } catch {} // starting
  await new Promise((r) => setTimeout(r, 200))
}
const b = await chromium.launch()
async function shot(page) {
  await page.evaluate(() => document.fonts.ready)
  await page.mouse.move(0, 0)
  await page.addStyleTag({ content: '.sil { will-change: auto !important; }' + (process.env.COMPARE_NO_SILS ? ' .sils { display: none !important; }' : '') })
  await page.evaluate(() => { document.activeElement?.blur(); document.body.style.display = 'none'; void document.body.offsetHeight; document.body.style.display = '' })
  await page.waitForTimeout(100)
  await page.evaluate(() => {
    const anims = document.getAnimations(); anims.forEach((a) => { a.pause(); a.currentTime = 0 })
    anims.map((a) => { const el = a.effect.target, cs = getComputedStyle(el, a.effect.pseudoElement); return [a, el, cs.transform, cs.opacity] })
      .forEach(([a, el, t, o]) => { a.cancel(); if (!a.effect.pseudoElement) { el.style.transform = t; el.style.opacity = o; el.style.transition = 'none' } })
  })
  await page.waitForTimeout(300)
  return page.screenshot({ fullPage: true })
}
const dp = await b.newPage()
const diff = (a, c) => dp.evaluate(async ([a, c]) => {
  const load = (s) => new Promise((r) => { const i = new Image(); i.onload = () => r(i); i.src = 'data:image/png;base64,' + s })
  const [ia, ib] = await Promise.all([load(a), load(c)])
  if (ia.width !== ib.width || ia.height !== ib.height) return `size ${ia.width}x${ia.height} vs ${ib.width}x${ib.height}`
  const d = (img) => { const cv = new OffscreenCanvas(img.width, img.height), x = cv.getContext('2d'); x.drawImage(img, 0, 0); return x.getImageData(0, 0, img.width, img.height).data }
  const da = d(ia), db = d(ib); let n = 0
  for (let i = 0; i < da.length; i += 4) if (da[i] !== db[i] || da[i + 1] !== db[i + 1] || da[i + 2] !== db[i + 2]) n++
  return n
}, [a.toString('base64'), c.toString('base64')])
const suites = [
  { name: 'landing', ref: ref('landing-referencia.html'), widths: (process.env.COMPARE_LANDING_WIDTHS ?? '390,1440').split(',').map(Number), height: 2400, path: (l) => (l === 'es' ? '/es/' : '/') },
  { name: 'docs', ref: ref('docs-referencia.html'), widths: [390, 1024, 1440], height: 900, path: (l) => (l === 'es' ? '/es/docs/quick-start/' : '/docs/quick-start/') },
]
let failed = 0
for (const s of suites) for (const lang of ['en', 'es']) for (const width of s.widths) for (const scheme of ['light', 'dark']) {
  const opts = { viewport: { width, height: s.height }, colorScheme: scheme }
  const c1 = await b.newContext(opts), c2 = await b.newContext(opts)
  const r = await c1.newPage(); await r.setContent(s.ref, { waitUntil: 'networkidle' })
  if (lang === 'es') { await r.evaluate(() => document.querySelector('[data-lang="es"]').click()); await r.evaluate(() => window.scrollTo(0, 0)) }
  const p = await c2.newPage(); await p.goto(SITE + s.path(lang), { waitUntil: 'networkidle' })
  const n = await diff(await shot(r), await shot(p))
  if (n !== 0) failed++
  console.log(`${n === 0 ? 'SAME' : 'DIFF'} ${s.name} ${lang}-${width}-${scheme} ${n === 0 ? '' : n}`)
  await c1.close(); await c2.close()
}
await b.close()
server.kill()
console.log(failed ? `\ncompare failed (${failed})` : '\ncompare passed')
process.exit(failed ? 1 : 0)
