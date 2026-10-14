// npm run check: everything the build checks (translations, nav.yml, links and anchors) plus what keeps
// the docs tied to the code. Fails on any problem, warnings included:
//   - a page listed in nav.yml without a file, or a link to one
//   - an environment variable read by the Go code (GRESBASE_*, DATABASE_URL) missing from environment.md
//     in any language, or a GRESBASE_* variable in the docs that the code does not read
//   - a screenshot in src/img/docs/ that no page uses (missing images and empty alt texts already
//     fail the build)
//   - a shortcut of web/src/lib/shortcuts.ts whose description (from the app's locale files) is not in
//     shortcuts.md in that language
import { readFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { renderDocs, siteDir } from './build.mjs'

const repo = join(siteDir, '..')
const problems = []
const warn = console.warn
console.warn = (msg) => problems.push(String(msg).replace(/^warning: /, ''))

const config = (await import(pathToFileURL(join(siteDir, 'site.config.mjs')).href)).default
let docs = null
try {
  docs = await renderDocs(config)
} catch (err) {
  problems.push(err.message)
}

/** Every non-test .go file under dir. */
async function goFiles(dir) {
  const out = []
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name)
    if (e.isDirectory()) out.push(...(await goFiles(p)))
    else if (e.name.endsWith('.go') && !e.name.endsWith('_test.go')) out.push(p)
  }
  return out
}
const envVars = new Set()
for (const dir of ['cmd', 'internal']) {
  for (const f of await goFiles(join(repo, dir))) {
    for (const m of (await readFile(f, 'utf8')).matchAll(/"(GRESBASE_[A-Z0-9_]+|DATABASE_URL)"/g)) envVars.add(m[1])
  }
}
// Not configuration: only the test helpers and the dev tooling read these.
for (const v of [...envVars]) if (/^GRESBASE_DEV_/.test(v)) envVars.delete(v)

const shortcutsTs = await readFile(join(repo, 'web/src/lib/shortcuts.ts'), 'utf8')
const shortcutLabels = [...shortcutsTs.matchAll(/label: '([\w.]+)'/g)].map((m) => m[1])

if (docs) {
  for (const f of docs.unused) problems.push(`src/img/docs/${f} is not used by any page`)
  for (const lang of config.langs) {
    const env = docs.pages[lang].environment
    if (!env) problems.push(`content/${lang}/environment.md is missing`)
    else for (const v of envVars) if (!env.html.includes(`<code>${v}</code>`)) problems.push(`content/${lang}/environment.md does not document ${v}`)

    for (const page of Object.values(docs.pages[lang])) {
      for (const m of page.html.matchAll(/GRESBASE_[A-Z0-9_]+/g)) {
        if (!envVars.has(m[0])) problems.push(`${page.where}: ${m[0]} is not read by the code`)
      }
    }

    const locale = JSON.parse(await readFile(join(repo, `web/src/locales/${lang}.json`), 'utf8'))
    const sc = docs.pages[lang].shortcuts
    if (!sc) problems.push(`content/${lang}/shortcuts.md is missing`)
    else {
      for (const key of shortcutLabels) {
        const text = key.split('.').reduce((o, k) => o?.[k], locale)
        if (!text) problems.push(`web/src/locales/${lang}.json has no ${key}`)
        else if (!sc.html.includes(text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'))) problems.push(`content/${lang}/shortcuts.md does not describe "${text}" (${key})`)
      }
    }
  }
}

console.warn = warn
const unique = [...new Set(problems)]
if (unique.length) {
  console.error(`check failed (${unique.length}):\n  ` + unique.join('\n  '))
  process.exit(1)
}
console.log(`check passed: ${Object.keys(docs.pages[config.langs[0]]).length} pages per language, ${envVars.size} environment variables, ${shortcutLabels.length} shortcuts`)
