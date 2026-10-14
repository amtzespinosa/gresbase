// Markdown → the HTML of site/reference/docs-referencia.html. markdown-it plus:
//   :::steps / :::note / :::tip / :::warning / :::danger … :::   (nestable)
//   :::tabs with "@tab Label {#id}" lines, each followed by a fenced block
//   ```lang title="file.yml"   → code block with a file header
//   ## Heading {#custom-id}     → id + "#" anchor (h2/h3 also feed the page index and the search)
//   [text](./page.md#anchor)    → final URL in the page's language (validated by the build)
//   {{image}} {{imageName}} {{port}} {{repo}} → values from site.config.mjs (imageName: without the tag)
//   ![Alt text](tables.webp)    → screenshot src/img/docs/tables-<light|dark>-<lang>.webp, switched with the theme
// Code is highlighted with the reference's own classes (tk-*), not with a theme.
import MarkdownIt from 'markdown-it'
import { parse as parseYaml } from 'yaml'

export const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

export const slugify = (s) =>
  s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

/* ---------- Highlighting ---------- */
const span = (c, t) => `<span class="tk-${c}">${esc(t)}</span>`

function yamlValue(v) {
  if (!v) return ''
  const c = v.match(/^(.*?)(\s+#.*)$/)
  if (c) return yamlValue(c[1]) + c[2].match(/^\s*/)[0] + span('c', c[2].trim())
  return span(/^-?\d+(\.\d+)?$|^(true|false|null)$/.test(v) ? 'n' : 's', v)
}
function yaml(code) {
  return code.split('\n').map((line) => {
    let m
    if ((m = line.match(/^(\s*)(#.*)$/))) return m[1] + span('c', m[2])
    if ((m = line.match(/^(\s*)-(\s+)(.*)$/))) return m[1] + span('p', '-') + m[2] + yamlValue(m[3])
    if ((m = line.match(/^(\s*)([\w.-]+)(:)(\s*)(.*)$/))) return m[1] + span('k', m[2]) + span('p', m[3]) + m[4] + yamlValue(m[5])
    return esc(line)
  }).join('\n')
}

// ponytail: flags that take a value, by name (docker and the few tools the docs use); a real shell
// grammar if the docs ever need more.
const VALUE_FLAGS = new Set(['--name', '-e', '--env', '--env-file', '-p', '--publish', '-v', '--volume', '--restart',
  '--network', '--mount', '-u', '--user', '-w', '--workdir', '--platform', '--build-arg', '-t', '--tag', '-o', '--output'])
const IMAGE = /^[a-z0-9.-]+\.[a-z]{2,}(:\d+)?\/[\w./-]+(:[\w.-]+)?$/
function shell(code) {
  let continued = false
  return code.split('\n').map((line) => {
    if (/^\s*#/.test(line)) return line.match(/^\s*/)[0] + span('c', line.trim())
    const parts = line.split(/(\s+)/)
    const words = parts.filter((p, i) => i % 2 === 0)
    let w = -1, first = !continued
    const out = parts.map((p, i) => {
      if (i % 2) return p
      w++
      if (!p) return ''
      if (first) { first = false; return span('f', p) }
      if (p === '\\' || p === '|' || p === '&&') { if (p !== '\\') first = true; return span('p', p) }
      if (/^-{1,2}[\w-]+$/.test(p)) return VALUE_FLAGS.has(p) && words[w + 1] && words[w + 1] !== '\\' ? span('a', p) : esc(p)
      const kv = p.match(/^([A-Z_][A-Z0-9_]*=)(.+)$/)
      if (kv) return esc(kv[1]) + span('s', kv[2])
      if (/^(['"]).*\1$/.test(p) || IMAGE.test(p)) return span('s', p)
      if (/^[\d.:]+$/.test(p) && /\d/.test(p)) return span('n', p)
      return esc(p)
    }).join('')
    continued = /\\$/.test(line.trimEnd())
    return out
  }).join('\n')
}

const SQL_KW = new Set(('select from where and or not in is null as on join left right inner outer full cross group by order ' +
  'having limit offset insert into values update set delete create table index view alter drop add column constraint primary key ' +
  'foreign references unique check default begin commit rollback with returning distinct case when then else end asc desc ' +
  'interval explain analyze grant revoke to role user exists between like ilike true false union all if cascade').split(' '))
function sql(code) {
  return code.replace(/(--[^\n]*)|('(?:[^']|'')*')|(\b\d+(?:\.\d+)?\b)|([A-Za-z_][\w$]*)(?=\s*\()|([A-Za-z_][\w$]*)|([(),;*=<>]+)|([^]+?)/g,
    (m, com, str, num, fn, word, punct) =>
      com ? span('c', com) : str ? span('s', str) : num ? span('n', num) : fn ? span(SQL_KW.has(fn.toLowerCase()) ? 'a' : 'f', fn)
        : word ? (SQL_KW.has(word.toLowerCase()) ? span('a', word) : esc(word)) : punct ? span('p', punct) : esc(m))
}

export function highlight(code, lang) {
  if (/^ya?ml$/.test(lang)) return yaml(code)
  if (/^(sh|bash|shell|console)$/.test(lang)) return shell(code)
  if (lang === 'sql') return sql(code)
  return esc(code)
}

/* ---------- Pieces of the reference ---------- */
const ICONS = {
  note: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/></svg>',
  tip: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z"/></svg>',
  warning: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3l9.5 17h-19z"/><path d="M12 10v4M12 17h.01"/></svg>',
  danger: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M15 9l-6 6M9 9l6 6"/></svg>',
}
const copyButton = (ui) =>
  `<button type="button" class="copy" aria-label="${esc(ui.copyCode)}" data-copied="${esc(ui.copied)}"><svg class="ico" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/></svg><svg class="ok" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg><span class="label">${esc(ui.copy)}</span></button>`
const pre = (code, lang) => `<pre><code>${highlight(code.replace(/\n$/, ''), lang)}</code></pre>`

function tabsBlock(raw, ui, where) {
  const tabs = raw.split(/^@tab[ \t]+/m).slice(1).map((part) => {
    const nl = part.indexOf('\n')
    let label = part.slice(0, nl).trim(), id
    const idm = label.match(/\s*\{#([\w-]+)\}$/)
    if (idm) { id = idm[1]; label = label.slice(0, idm.index) } else id = slugify(label)
    const fm = part.slice(nl + 1).match(/^\s*```(\w*)[^\n]*\n([\s\S]*?)\n```\s*$/)
    if (!fm) throw new Error(`${where}: every @tab needs one fenced code block (tab "${label}")`)
    return { id, label, lang: fm[1], code: fm[2] }
  })
  if (!tabs.length) throw new Error(`${where}: :::tabs without @tab`)
  return `<div class="code-block" data-tabs>
<div class="code-head">
<div class="seg" role="tablist" aria-label="${esc(ui.format)}">
${tabs.map((t, i) => `<button type="button" role="tab" aria-selected="${i === 0}" data-tab="${esc(t.id)}">${esc(t.label)}</button>`).join('\n')}
</div>
${copyButton(ui)}
</div>
${tabs.map((t, i) => `<div class="tab-panel" data-panel="${esc(t.id)}"${i ? ' hidden' : ''}>${pre(t.code, t.lang)}</div>`).join('\n')}
</div>
`
}

/* ---------- Containers (:::name … :::) ---------- */
const CONTAINERS = new Set(['steps', 'tabs', 'note', 'tip', 'warning', 'danger'])
function container(state, startLine, endLine, silent) {
  const line = state.src.slice(state.bMarks[startLine] + state.tShift[startLine], state.eMarks[startLine])
  const m = line.match(/^:::(\w+)\s*$/)
  if (!m) return false
  if (!CONTAINERS.has(m[1])) throw new Error(`${state.env.where}:${startLine + 1}: unknown container :::${m[1]}`)
  if (silent) return true
  let depth = 1, next = startLine, fence = false
  while (++next < endLine) {
    const l = state.src.slice(state.bMarks[next] + state.tShift[next], state.eMarks[next]).trim()
    if (l.startsWith('```')) fence = !fence
    if (fence) continue
    if (/^:::\w/.test(l)) depth++
    else if (l === ':::' && --depth === 0) break
  }
  if (depth) throw new Error(`${state.env.where}:${startLine + 1}: :::${m[1]} is never closed`)
  if (m[1] === 'tabs') {
    const t = state.push('gb_tabs', '', 0)
    t.content = state.getLines(startLine + 1, next, state.blkIndent, false)
    t.map = [startLine, next + 1]
  } else {
    state.push('gb_open', '', 1).info = m[1]
    const [parent, lineMax] = [state.parentType, state.lineMax]
    state.parentType = 'gb'
    state.lineMax = next
    state.md.block.tokenize(state, startLine + 1, next)
    state.parentType = parent
    state.lineMax = lineMax
    state.push('gb_close', '', -1).info = m[1]
  }
  state.line = next + 1
  return true
}

/* ---------- Core pass: ids, anchors, steps, links, page index ---------- */
// Ids the docs template already uses: a heading with one of them would break the page's scripts.
const RESERVED_IDS = new Set(['menu-btn', 'scrim', 'sidebar', 'search-btn', 'mod-key', 'side-nav', 'theme-group', 'main', 'toc-list', 'search', 'search-input', 'search-results'])

function inlineText(tok) {
  return (tok.children ?? []).filter((c) => c.type === 'text' || c.type === 'code_inline').map((c) => c.content).join('')
}
function corePass(state) {
  const { env } = state
  const tokens = state.tokens
  const out = []
  const stepsLevels = []
  const seen = new Set()
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i]
    if (t.type === 'gb_open' && t.info === 'steps') stepsLevels.push({ level: t.level, open: false })
    if (t.type === 'gb_close' && t.info === 'steps') {
      const s = stepsLevels.pop()
      if (s.open) out.push(Object.assign(new state.Token('html_block', '', 0), { content: '</li>\n' }))
    }
    const steps = stepsLevels.at(-1)
    if (t.type === 'heading_open' && steps && t.tag === 'h3' && t.level === steps.level + 1) {
      out.push(Object.assign(new state.Token('html_block', '', 0), { content: (steps.open ? '</li>\n' : '') + '<li>\n' }))
      steps.open = true
    } else if (steps && !steps.open && t.level === steps.level + 1 && t.type !== 'gb_close' && t.nesting !== -1) {
      throw new Error(`${env.where}: content inside :::steps must start with a ### heading`)
    }
    if (t.type === 'heading_open' && (t.tag === 'h2' || t.tag === 'h3')) {
      const inline = tokens[i + 1]
      const last = inline.children.at(-1)
      let id
      const idm = last?.type === 'text' && last.content.match(/\s*\{#([\w-]+)\}$/)
      if (idm) { id = idm[1]; last.content = last.content.slice(0, idm.index) } else id = slugify(inlineText(inline))
      if (seen.has(id)) throw new Error(`${env.where}: duplicate heading id "${id}"`)
      if (RESERVED_IDS.has(id)) throw new Error(`${env.where}: heading id "${id}" is used by the page template; pick another one`)
      seen.add(id)
      t.attrSet('id', id)
      const anchor = new state.Token('html_inline', '', 0)
      anchor.content = `<a class="anchor" href="#${id}" aria-label="${esc(env.ui.anchor)}">#</a>`
      inline.children.push(anchor)
      // Search text: what follows the heading up to the next h2/h3.
      let text = ''
      for (let j = i + 3; j < tokens.length && text.length < 240; j++) {
        if (tokens[j].type === 'heading_open' && /^h[23]$/.test(tokens[j].tag)) break
        if (tokens[j].type === 'inline') text += ' ' + inlineText(tokens[j])
      }
      env.headings.push({ id, level: Number(t.tag[1]), text: inlineText(inline).trim(), body: text.replace(/\s+/g, ' ').trim().slice(0, 240) })
    }
    if (t.type === 'inline') {
      for (const c of t.children) {
        if (c.type !== 'link_open') continue
        const href = c.attrGet('href')
        const lm = href.match(/^(?:\.\/)?([\w-]+)\.md(?:#([\w-]+))?$/)
        if (lm) {
          env.links.push({ slug: lm[1], anchor: lm[2] })
          c.attrSet('href', env.pageUrl(lm[1]) + (lm[2] ? '#' + lm[2] : ''))
        } else if (href.startsWith('#')) {
          env.links.push({ slug: env.slug, anchor: href.slice(1) })
        }
      }
    }
    out.push(t)
  }
  state.tokens = out
}

export function createMarkdown() {
  const md = new MarkdownIt({ html: true, linkify: false, typographer: false })
  md.block.ruler.before('fence', 'gb_container', container, { alt: ['paragraph', 'reference', 'blockquote', 'list'] })
  md.core.ruler.push('gb_core', corePass)
  const r = md.renderer.rules
  r.strong_open = () => '<b>'
  r.strong_close = () => '</b>'
  r.table_open = () => '<div class="table-wrap">\n<table>\n'
  r.table_close = () => '</table>\n</div>\n'
  r.gb_tabs = (tokens, i, o, env) => tabsBlock(tokens[i].content, env.ui, env.where)
  r.gb_open = (tokens, i) => {
    const kind = tokens[i].info
    return kind === 'steps' ? '<ol class="steps">\n' : `<div class="callout ${kind}" role="note">\n${ICONS[kind]}\n<div>`
  }
  r.gb_close = (tokens, i) => (tokens[i].info === 'steps' ? '</ol>\n' : '</div></div>\n')
  r.image = (tokens, i, o, env) => {
    const t = tokens[i]
    const alt = md.renderer.renderInlineAsText(t.children, o, env).trim()
    const shot = env.image(t.attrGet('src'), alt)
    if (!shot) return ''
    return ['light', 'dark'].map((theme) =>
      `<img class="shot shot-${theme}" src="${shot[theme].url}" width="${shot[theme].width}" height="${shot[theme].height}" alt="${esc(alt)}" loading="lazy" decoding="async">`,
    ).join('')
  }
  r.fence = (tokens, i, o, env) => {
    const t = tokens[i]
    const lang = t.info.trim().split(/\s+/)[0] || ''
    const title = t.info.match(/title="([^"]*)"/)?.[1]
    return `<div class="code-block"><div class="code-head">${title ? `<span class="file">${esc(title)}</span>` : ''}${copyButton(env.ui)}</div>\n${pre(t.content, lang)}</div>\n`
  }
  return md
}

/** Splits the YAML front matter (description and, optionally, title) from the body. */
export function frontMatter(src, where) {
  const m = src.match(/^---\n([\s\S]*?)\n---\n?/)
  if (!m) throw new Error(`${where}: missing front matter (--- description: … ---)`)
  return { data: parseYaml(m[1]) ?? {}, body: src.slice(m[0].length) }
}
