// Builds the site into dist/. `node build/build.mjs --prod` minifies and hashes; the dev server
// imports build() and rebuilds on every change.
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { copyFile, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { parse as parseYaml } from 'yaml'
import { strings } from './i18n.mjs'
import { createMarkdown, frontMatter } from './markdown.mjs'
import { docsPage, docsRedirect, docsUrl } from './templates/docs.mjs'
import { landingPage } from './templates/landing.mjs'
import { notFoundPage } from './templates/notfound.mjs'
import { headers, robots, sitemap } from './publish.mjs'

export const siteDir = join(dirname(fileURLToPath(import.meta.url)), '..')
// SITE_DIST: another output folder (npm run audit builds into a temporary one).
export const distDir = process.env.SITE_DIST ?? join(siteDir, 'dist')
const brandDir = join(siteDir, '..', 'assets', 'brand')

const read = (...p) => readFile(join(siteDir, ...p), 'utf8')

async function write(path, content) {
  await mkdir(dirname(join(distDir, path)), { recursive: true })
  await writeFile(join(distDir, path), content)
}

// ponytail: regex minifiers, enough for our own hand-written CSS/JS/HTML; a real minifier if output grows.
const minifyCss = (css) =>
  css
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\s+/g, ' ')
    // Only after ':' — the space before it matters: ".doc :not(pre)" is not ".doc:not(pre)".
    .replace(/\s*([{};,>])\s*/g, '$1')
    .replace(/:\s+/g, ':')
    .replace(/;}/g, '}')
    .trim()
const minifyJs = (js) =>
  js
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('//'))
    .join('\n')
/** Drops indentation and blank lines outside <pre>, where whitespace matters. */
const minifyHtml = (html) =>
  html
    .split(/(<pre[\s\S]*?<\/pre>)/)
    .map((part, i) => (i % 2 ? part : part.split('\n').map((l) => l.trim()).filter(Boolean).join('\n')))
    .join('')

const hash = (s) => createHash('sha256').update(s).digest('hex').slice(0, 10)

/** Writes a CSS or JS bundle and returns its URL (hashed in production). */
async function bundle(kind, name, files, prod, fonts = {}) {
  let code = (await Promise.all(files.map((f) => read('src', kind, f)))).join('\n')
  code = code.replace(/url\(\.\.\/fonts\/([^)]+)\)/g, (m, f) => `url(../fonts/${fonts[f] ?? f})`)
  if (prod) code = kind === 'css' ? minifyCss(code) : minifyJs(code)
  const file = prod ? `${kind}/${name}.${hash(code)}.${kind}` : `${kind}/${name}.${kind}`
  await write(file, code)
  return `/${file}`
}

async function copyDir(from, to) {
  await mkdir(join(distDir, to), { recursive: true })
  for (const f of await readdir(from).catch(() => [])) await copyFile(join(from, f), join(distDir, to, f))
}

/** Copies a file into dist/<toDir>/, with a content hash in its name in production. Returns the name. */
async function copyHashed(from, toDir, prod) {
  const name = basename(from)
  const out = prod ? name.replace(/(\.[^.]+)$/, `.${hash(await readFile(from))}$1`) : name
  await mkdir(join(distDir, toDir), { recursive: true })
  await copyFile(from, join(distDir, toDir, out))
  return out
}

/** Width and height of a WebP file (VP8, VP8L or VP8X). */
export function webpSize(buf) {
  if (buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WEBP') throw new Error('not a WebP file')
  const chunk = buf.toString('ascii', 12, 16)
  if (chunk === 'VP8X') return { width: 1 + buf.readUIntLE(24, 3), height: 1 + buf.readUIntLE(27, 3) }
  if (chunk === 'VP8 ') return { width: buf.readUInt16LE(26) & 0x3fff, height: buf.readUInt16LE(28) & 0x3fff }
  if (chunk === 'VP8L') {
    const b = buf.readUInt32LE(21)
    return { width: 1 + (b & 0x3fff), height: 1 + ((b >> 14) & 0x3fff) }
  }
  throw new Error(`unknown WebP chunk ${chunk}`)
}

/**
 * Screenshots in src/img/docs/<name>-<light|dark>-<lang>.webp, copied to dist/img/docs/ (hashed in
 * production) when `prod` is not null. Returns name → lang → theme → { url, file, width, height }.
 */
async function docsImages(prod) {
  const dir = join(siteDir, 'src', 'img', 'docs')
  const images = {}
  for (const f of await readdir(dir).catch(() => [])) {
    const m = f.match(/^([\w-]+)-(light|dark)-(\w+)\.webp$/)
    if (!m) throw new Error(`src/img/docs/${f}: name it <name>-<light|dark>-<lang>.webp`)
    const out = prod === null ? f : await copyHashed(join(dir, f), 'img/docs', prod)
    ;((images[m[1]] ??= {})[m[3]] ??= {})[m[2]] = { url: '/img/docs/' + out, file: f, ...webpSize(await readFile(join(dir, f))) }
  }
  return images
}

/**
 * Last commit date of every file under content/, from one git call (one call per file takes about a
 * second each on a Windows bind mount). Files without commits are missing: use their mtime.
 */
function commitDates() {
  const dates = new Map()
  try {
    const log = execFileSync('git', ['-c', 'safe.directory=*', 'log', '--format=@%cI', '--name-only', '--', 'content'],
      { cwd: siteDir, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
    const top = execFileSync('git', ['-c', 'safe.directory=*', 'rev-parse', '--show-toplevel'], { cwd: siteDir, encoding: 'utf8' }).trim()
    let date
    for (const line of log.split('\n')) {
      if (line.startsWith('@')) date = new Date(line.slice(1))
      else if (line && !dates.has(join(top, line))) dates.set(join(top, line), date)
    }
  } catch {} // no git: every page falls back to its mtime
  return dates
}
async function updated(file, dates) {
  return dates.get(file) ?? (await stat(file)).mtime
}

/** nav.yml → [{ title: {en, es}, pages: [{ slug, title: {en, es} }] }], every title in every language. */
function readNav(src, langs) {
  const nav = parseYaml(src).map((g) => ({
    title: g.title,
    pages: g.pages.map((p) => ({ slug: p.slug, title: Object.fromEntries(langs.map((l) => [l, p[l]])) })),
  }))
  const seen = new Set()
  for (const g of nav) {
    for (const l of langs) if (!g.title?.[l]) throw new Error(`content/nav.yml: section without a "${l}" title`)
    for (const p of g.pages) {
      if (seen.has(p.slug)) throw new Error(`content/nav.yml: "${p.slug}" appears twice`)
      seen.add(p.slug)
      for (const l of langs) if (!p.title[l]) throw new Error(`content/nav.yml: "${p.slug}" has no "${l}" title`)
    }
  }
  return nav
}

/**
 * Renders content/<lang>/*.md. Fails on: a page without its translation, a page missing from nav.yml,
 * a link to a page or anchor that does not exist. A page listed in nav.yml with no file yet in any
 * language is only a warning here (npm run check fails on it).
 */
export async function renderDocs(config, images = null) {
  images ??= await docsImages(null)
  const used = new Set()
  const nav = readNav(await read('content', 'nav.yml'), config.langs)
  const inNav = new Set(nav.flatMap((g) => g.pages.map((p) => p.slug)))
  const files = {}
  for (const l of config.langs) {
    files[l] = new Set((await readdir(join(siteDir, 'content', l)).catch(() => [])).filter((f) => f.endsWith('.md')).map((f) => f.slice(0, -3)))
  }
  const all = new Set(config.langs.flatMap((l) => [...files[l]]))
  const errors = []
  for (const slug of all) {
    for (const l of config.langs) if (!files[l].has(slug)) errors.push(`content/${l}/${slug}.md is missing (it exists in another language)`)
    if (!inNav.has(slug)) errors.push(`content/*/${slug}.md is not in content/nav.yml`)
  }
  const pending = [...inNav].filter((s) => !all.has(s))
  const vars = { image: config.image, imageName: config.image.replace(/:[w.-]+$/, ''), port: String(config.hostPort), repo: config.repoUrl }
  const md = createMarkdown()
  const dates = commitDates()
  const pages = {}
  for (const lang of config.langs) {
    pages[lang] = {}
    for (const slug of files[lang]) {
      const where = `content/${lang}/${slug}.md`
      const file = join(siteDir, 'content', lang, slug + '.md')
      const src = (await readFile(file, 'utf8')).replace(/\{\{(\w+)\}\}/g, (m, k) => {
        if (!(k in vars)) errors.push(`${where}: unknown variable {{${k}}}`)
        return vars[k] ?? m
      })
      const { data, body } = frontMatter(src, where)
      if (!data.description) errors.push(`${where}: front matter needs a description`)
      const image = (src, alt) => {
        const name = src.replace(/.webp$/, '')
        const shot = images[name]?.[lang]
        if (!alt) errors.push(`${where}: image ${src} needs alt text`)
        if (!shot?.light || !shot?.dark) {
          errors.push(`${where}: image ${src} needs src/img/docs/${name}-light-${lang}.webp and ${name}-dark-${lang}.webp`)
          return null
        }
        used.add(shot.light.file).add(shot.dark.file)
        return shot
      }
      const env = { lang, slug, where, ui: strings[lang].docsUi, pageUrl: (s) => docsUrl(config, lang, s), image, links: [], headings: [] }
      const html = md.render(body, env)
      const title = nav.flatMap((g) => g.pages).find((p) => p.slug === slug)?.title[lang] ?? slug
      pages[lang][slug] = { slug, title, description: data.description ?? '', html, headings: env.headings, links: env.links, updated: await updated(file, dates), where }
    }
  }
  for (const lang of config.langs) {
    for (const page of Object.values(pages[lang])) {
      for (const { slug, anchor } of page.links) {
        if (!inNav.has(slug)) errors.push(`${page.where}: link to "${slug}.md", which is not in nav.yml`)
        else if (!pages[lang][slug]) console.warn(`warning: ${page.where} links to "${slug}", which has no page yet`)
        else if (anchor && !pages[lang][slug].headings.some((h) => h.id === anchor)) errors.push(`${page.where}: link to "${slug}#${anchor}", which has no such heading`)
      }
    }
  }
  if (errors.length) throw new Error('docs:\n  ' + errors.join('\n  '))
  for (const s of pending) console.warn(`warning: content/nav.yml lists "${s}", which has no page yet`)
  const unused = Object.values(images).flatMap((byLang) => Object.values(byLang).flatMap((byTheme) => Object.values(byTheme)))
    .map((i) => i.file).filter((file) => !used.has(file))
  return { nav, pages, pending, unused }
}

/** One entry per page and one per h2/h3, in nav order. */
function searchIndex(config, lang, nav, pages) {
  const entries = []
  for (const g of nav) {
    for (const p of g.pages) {
      const page = pages[lang][p.slug]
      if (!page) continue
      const url = docsUrl(config, lang, p.slug)
      entries.push({ page: page.title, section: g.title[lang], heading: '', text: page.description, href: url })
      for (const h of page.headings) entries.push({ page: page.title, section: '', heading: h.text, text: h.body, href: url + '#' + h.id })
    }
  }
  return JSON.stringify(entries)
}

export async function build({ prod = false, reload = '' } = {}) {
  const started = performance.now()
  // Fresh import so the dev server picks up config changes.
  const config = (await import(`${pathToFileURL(join(siteDir, 'site.config.mjs'))}?t=${Date.now()}`)).default

  await rm(distDir, { recursive: true, force: true })
  const fonts = {}
  for (const f of await readdir(join(siteDir, 'src', 'fonts'))) {
    if (f.endsWith('.woff2')) fonts[f] = await copyHashed(join(siteDir, 'src', 'fonts', f), 'fonts', prod)
    else await copyHashed(join(siteDir, 'src', 'fonts', f), 'fonts', false) // OFL licences travel with the fonts
  }
  await copyFile(join(brandDir, 'favicon.svg'), join(distDir, 'favicon.svg'))

  const themeScript = await read('src', 'js', 'theme.js')
  const assets = {
    css: await bundle('css', 'landing', ['tokens.css', 'base.css', 'landing.css'], prod, fonts),
    js: await bundle('js', 'landing', ['landing.js'], prod),
    themeScript: prod ? minifyJs(themeScript) : themeScript,
    searchGif: {
      light: await copyHashed(join(siteDir, 'src', 'img', 'landing', 'search-light.gif'), 'img', prod),
      dark: await copyHashed(join(siteDir, 'src', 'img', 'landing', 'search-dark.gif'), 'img', prod),
    },
    reload,
  }
  for (const lang of config.langs) {
    let html = landingPage({ config, assets, lang })
    if (prod) html = minifyHtml(html)
    await write(lang === config.langs[0] ? 'index.html' : `${lang}/index.html`, html)
  }

  const { nav, pages } = await renderDocs(config, await docsImages(prod))
  const docsAssets = {
    css: await bundle('css', 'docs', ['tokens.css', 'base.css', 'docs.css'], prod, fonts),
    js: await bundle('js', 'docs', ['docs.js'], prod),
    themeScript: assets.themeScript,
    reload,
  }
  const first = nav.flatMap((g) => g.pages).find((p) => pages[config.langs[0]][p.slug])
  for (const lang of config.langs) {
    const json = searchIndex(config, lang, nav, pages)
    const file = prod ? `search-${lang}.${hash(json)}.json` : `search-${lang}.json`
    await write(file, json)
    const prefix = lang === config.langs[0] ? '' : `${lang}/`
    for (const page of Object.values(pages[lang])) {
      let html = docsPage({ config, assets: { ...docsAssets, searchIndex: '/' + file }, lang, nav, page })
      if (prod) html = minifyHtml(html)
      await write(`${prefix}docs/${page.slug}/index.html`, html)
    }
    if (first) await write(`${prefix}docs/index.html`, docsRedirect({ config, lang, slug: first.slug }))
  }

  let notFound = notFoundPage({ config, assets })
  if (prod) notFound = minifyHtml(notFound)
  await write('404.html', notFound)
  const docPaths = nav.flatMap((g) => g.pages).filter((p) => pages[config.langs[0]][p.slug]).map((p) => `/docs/${p.slug}/`)
  await write('sitemap.xml', sitemap(config, ['/', ...docPaths]))
  await write('robots.txt', robots(config))
  await write('_headers', headers(assets.themeScript))
  await copyDir(join(siteDir, 'public'), '.')

  console.log(`built ${prod ? 'production' : 'development'} site in ${Math.round(performance.now() - started)} ms`)
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  await build({ prod: process.argv.includes('--prod') })
}
