// Local server on port 4321. Default: development build, rebuild on change and live reload.
// --preview: serves dist/ as it is (run `npm run build` first), no watching.
import { readFile, readdir, stat } from 'node:fs/promises'
import { createServer } from 'node:http'
import { extname, join, normalize, sep } from 'node:path'
import { build, distDir, siteDir } from './build.mjs'

const preview = process.argv.includes('--preview')
const host = process.env.GRESBASE_DEV_HOST || '127.0.0.1'
const port = Number(process.env.SITE_PORT || 4321)

const types = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
  '.xml': 'application/xml',
  '.txt': 'text/plain; charset=utf-8',
}

/**
 * Rules of dist/_headers (Cloudflare Pages format: a path pattern, then indented "Name: value" lines),
 * applied in --preview so the CSP and the caching are tested locally. Like Cloudflare, a header set
 * by several matching rules gets its values joined with ", ".
 */
async function readHeaders() {
  const rules = []
  const text = await readFile(join(distDir, '_headers'), 'utf8').catch(() => '')
  for (const line of text.split('\n')) {
    if (!line.trim()) continue
    if (!/^\s/.test(line)) rules.push({ re: new RegExp('^' + line.trim().replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$'), headers: [] })
    else rules.at(-1)?.headers.push(line.trim().split(/:\s*(.*)/s).slice(0, 2))
  }
  return (path) => {
    const out = {}
    for (const r of rules) if (r.re.test(path)) for (const [k, v] of r.headers) out[k] = out[k] ? `${out[k]}, ${v}` : v
    return out
  }
}
const headersFor = preview ? await readHeaders() : () => ({})

const clients = new Set()
const reload = `<script>new EventSource('/__reload').onmessage = () => location.reload()</script>`

/** File of dist/ for a URL path: /es/ → es/index.html. null when outside dist/ or missing. */
async function resolve(urlPath) {
  let file
  try {
    file = normalize(join(distDir, decodeURIComponent(urlPath)))
  } catch {
    return null // malformed %-escape
  }
  if (file !== distDir && !file.startsWith(distDir + sep)) return null
  for (const f of [file, join(file, 'index.html')]) {
    if ((await stat(f).catch(() => null))?.isFile()) return f
  }
  return null
}

const server = createServer(async (req, res) => {
  const path = new URL(req.url, 'http://x').pathname
  if (path === '/__reload' && !preview) {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' })
    clients.add(res)
    req.on('close', () => clients.delete(res))
    return
  }
  const file = await resolve(path)
  if (!file) {
    const notFound = await resolve('/404.html')
    res.writeHead(404, { 'Content-Type': types['.html'], ...headersFor('/404.html') })
    return res.end(notFound ? await readFile(notFound) : 'Not found')
  }
  if (!path.endsWith('/') && file.endsWith('index.html') && !path.endsWith('.html')) {
    res.writeHead(301, { Location: `${path}/` })
    return res.end()
  }
  res.writeHead(200, { 'Content-Type': types[extname(file)] ?? 'application/octet-stream', 'Cache-Control': 'no-cache', ...headersFor(path) })
  res.end(await readFile(file))
})

if (!preview) {
  await build({ reload })
  // Polls mtimes instead of fs.watch: edits made on Windows do not raise inotify events inside a
  // Docker bind mount. build/ is not watched: Node caches its modules, so template changes need a restart.
  // ponytail: full scan every 500 ms and full rebuild on change; fine for a few hundred files.
  const snapshot = async () => {
    const parts = []
    for (const dir of ['src', 'content']) {
      const files = await readdir(join(siteDir, dir), { recursive: true }).catch(() => [])
      for (const f of files) parts.push(`${f}:${(await stat(join(siteDir, dir, f)).catch(() => null))?.mtimeMs}`)
    }
    parts.push((await stat(join(siteDir, 'site.config.mjs'))).mtimeMs)
    return parts.join('|')
  }
  let last = await snapshot()
  const poll = async () => {
    const now = await snapshot()
    if (now !== last) {
      last = now
      try {
        await build({ reload })
        for (const c of clients) c.write('data: reload\n\n')
      } catch (err) {
        console.error(err)
      }
    }
    setTimeout(poll, 500)
  }
  setTimeout(poll, 500)
}

server.listen(port, host, () => {
  console.log(`${preview ? 'preview of dist/' : 'dev server'} at http://localhost:${port}`)
})
