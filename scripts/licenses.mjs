#!/usr/bin/env node
// Third-party license report for what ships in the binary: Go modules linked into cmd/gresbase (plus
// the Go standard library) and the production dependencies of web/ (bundled into the embedded UI).
//   node scripts/licenses.mjs          regenerate the files below
//   node scripts/licenses.mjs --check  fail if they are stale or a license is not on the allow list
// Writes docs/third-party-licenses.md (tables) and web/public/licenses/ (LICENSE.txt, NOTICE.txt and
// THIRD_PARTY_NOTICES.txt with every license text), which Vite copies into the embedded UI.
import { execFileSync } from 'node:child_process'
import { readdirSync, readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const root = new URL('..', import.meta.url).pathname
const check = process.argv.includes('--check')

// Licenses compatible with distributing Gresbase under Apache-2.0 (see docs/decisions.md).
const ALLOWED = new Set([
  'MIT', 'ISC', '0BSD', 'BSD-2-Clause', 'BSD-3-Clause', 'Apache-2.0', 'Unlicense', 'CC0-1.0',
  'Python-2.0', 'BlueOak-1.0.0', 'MPL-2.0', 'OFL-1.1',
])

const run = (cmd, args, cwd = root) => execFileSync(cmd, args, { cwd, encoding: 'utf8', maxBuffer: 64 << 20 })

function licenseFile(dir) {
  const name = readdirSync(dir).sort().find((f) => /^(licen[cs]e|copying)(\.|$|-)/i.test(f))
  return name ? readFileSync(join(dir, name), 'utf8').replace(/\r\n/g, '\n').trim() : null
}

// Go module LICENSE files carry no SPDX id: recognize the few texts in use, anything else is UNKNOWN.
function goLicense(text) {
  if (!text) return 'UNKNOWN'
  if (/Apache License\s+Version 2\.0/.test(text)) return 'Apache-2.0'
  if (/Permission is hereby granted, free of charge/.test(text)) return 'MIT'
  if (/Redistribution and use in source and binary forms/.test(text))
    return /Neither the name/.test(text) ? 'BSD-3-Clause' : 'BSD-2-Clause'
  return 'UNKNOWN'
}

// A few npm packages declare a license but ship no file: record the author and, for MIT (which asks
// for its notice to be kept), the standard text.
const MIT = `Permission is hereby granted, free of charge, to any person obtaining a copy of this software and
associated documentation files (the "Software"), to deal in the Software without restriction, including
without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the
following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial
portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT
LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO
EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER
IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
USE OR OTHER DEALINGS IN THE SOFTWARE.`
function missingText(license, author) {
  const head = `The package ships no license file. Declared license: ${license}${author ? `; author: ${author}` : ''}.`
  return license === 'MIT' ? `${head}\n\nCopyright (c) ${author ?? 'the package authors'}\n\n${MIT}` : head
}

function allowed(expr) {
  const e = expr.replace(/[()]/g, '')
  if (e.includes(' OR ')) return e.split(' OR ').some((p) => ALLOWED.has(p.trim()))
  return e.split(' AND ').every((p) => ALLOWED.has(p.trim()))
}

const goPkgs = run('go', ['list', '-deps', '-f', '{{if .Module}}{{.Module.Path}}\t{{.Module.Version}}\t{{.Module.Dir}}{{end}}', './cmd/gresbase'])
  .split('\n')
  .filter((l) => l && !l.startsWith('github.com/amtzespinosa/gresbase\t'))
const goMods = [...new Set(goPkgs)].sort().map((l) => {
  const [name, version, dir] = l.split('\t')
  const text = licenseFile(dir)
  return { name, version, license: goLicense(text), text }
})
const goroot = run('go', ['env', 'GOROOT']).trim()
const stdText = licenseFile(goroot)
goMods.unshift({ name: 'Go standard library', version: '', license: goLicense(stdText), text: stdText })

const webPkgs = []
for (const [license, pkgs] of Object.entries(JSON.parse(run('pnpm', ['licenses', 'list', '--prod', '--json'], join(root, 'web'))))) {
  for (const p of pkgs)
    p.versions.forEach((version, i) =>
      webPkgs.push({ name: p.name, version, license, text: licenseFile(p.paths[i]) ?? missingText(license, p.author) }),
    )
}
webPkgs.sort((a, b) => a.name.localeCompare(b.name) || a.version.localeCompare(b.version))

const all = [...goMods, ...webPkgs]
const bad = all.filter((p) => !allowed(p.license))

const counts = {}
for (const p of all) counts[p.license] = (counts[p.license] ?? 0) + 1
const table = (rows) => ['| Paquete | Versión | Licencia |', '| --- | --- | --- |', ...rows.map((p) => `| \`${p.name}\` | ${p.version || '—'} | ${p.license} |`)].join('\n')

const md = `# Licencias de terceros

Generado por \`task licenses\` (\`scripts/licenses.mjs\`); no lo edites a mano. \`task lint\` comprueba que
está al día y que todas las licencias están en la lista de compatibles con Apache 2.0.

Gresbase se distribuye bajo **Apache License 2.0** (\`LICENSE\`, \`NOTICE\`). Esta lista cubre lo que va
dentro del binario: los módulos de Go enlazados en \`cmd/gresbase\` (más la biblioteca estándar de Go) y
las dependencias de producción de \`web/\`, incluidas las fuentes Geist y Geist Mono (SIL OFL 1.1), que se
empaquetan en la interfaz embebida. Las dependencias de desarrollo y de test (testcontainers, Vitest,
Playwright…) no se distribuyen.

Los textos completos de cada licencia están en \`web/public/licenses/THIRD_PARTY_NOTICES.txt\`, que viaja
embebido en el binario (\`/licenses/THIRD_PARTY_NOTICES.txt\` en la propia app y en Ajustes → Acerca de),
en \`/licenses/\` dentro de la imagen y en los archivos de release.

## Resumen

| Licencia | Paquetes |
| --- | --- |
${Object.entries(counts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([l, n]) => `| ${l} | ${n} |`).join('\n')}

Licencias menos habituales: \`Python-2.0\` (\`argparse\`, licencia PSF, permisiva), \`CC0-1.0\` y \`Unlicense\`
(dominio público), \`0BSD\` (\`tslib\`). Las fuentes van con SIL OFL 1.1, que permite empaquetarlas con
software bajo cualquier licencia siempre que no se vendan por separado y conserven su licencia.

${bad.length ? `**Licencias fuera de la lista de compatibles:** ${bad.map((p) => `\`${p.name}\` (${p.license})`).join(', ')}.` : 'Todas las licencias son compatibles con Apache 2.0.'}

## Go (${goMods.length})

${table(goMods)}

## Web (${webPkgs.length})

${table(webPkgs)}
`

const sep = '\n\n' + '-'.repeat(80) + '\n\n'
const notices = `Gresbase includes the third-party software listed below. Each component is distributed under its
own license, reproduced here.` + sep + all.map((p) => `${p.name}${p.version ? ' ' + p.version : ''} (${p.license})\n\n${p.text ?? 'No license file found.'}`).join(sep) + '\n'

const outputs = {
  'docs/third-party-licenses.md': md,
  'web/public/licenses/LICENSE.txt': readFileSync(join(root, 'LICENSE'), 'utf8'),
  'web/public/licenses/NOTICE.txt': readFileSync(join(root, 'NOTICE'), 'utf8'),
  'web/public/licenses/THIRD_PARTY_NOTICES.txt': notices,
}

let failed = false
if (bad.length) {
  console.error('Licenses not on the allow list: ' + bad.map((p) => `${p.name}@${p.version} (${p.license})`).join(', '))
  failed = true
}
for (const [path, content] of Object.entries(outputs)) {
  const full = join(root, path)
  if (check) {
    if (!existsSync(full) || readFileSync(full, 'utf8') !== content) {
      console.error(`${path} is stale, run task licenses`)
      failed = true
    }
  } else {
    mkdirSync(join(full, '..'), { recursive: true })
    writeFileSync(full, content)
  }
}
if (!check) console.log(`${goMods.length} Go modules, ${webPkgs.length} web packages`)
process.exit(failed ? 1 : 0)
