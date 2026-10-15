// Landing, ported from site/reference/landing-referencia.html. The markup the reference builds with JS
// (silhouettes, code, steps, app screenshots, carousel) is rendered here at build time with the same
// functions, so the page reads without JavaScript; src/js/landing.js keeps only the interactions.
import { strings } from '../i18n.mjs'
import { esc, layout, urlFor } from './layout.mjs'

/* ---------- Mamut (SVG) ---------- */
const BODY = 'M3 17.5a1.5 1.5 0 0 0 3 0V12C6 6.5 9 3.5 12.5 3.5S20 6.5 21 11.5V20h-2.5v-4H11v4H8.5v-5.5'
const TUSK = 'M7.7 12.9c-.1 3-2.8 4.2-5.1 1.7'
function mammoth(id, sw, halo, eye) {
  return '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><defs><mask id="' + id + '" maskUnits="userSpaceOnUse" x="0" y="0" width="24" height="24"><rect width="24" height="24" fill="#fff"/><path d="' + TUSK + '" fill="none" stroke="#000" stroke-width="' + halo + '" stroke-linecap="round"/></mask></defs>' +
    '<g fill="none" stroke="currentColor" stroke-width="' + sw + '" stroke-linecap="round" stroke-linejoin="round"><path d="' + BODY + '" mask="url(#' + id + ')"/><path d="' + TUSK + '"/></g>' +
    (eye ? '<circle cx="9.6" cy="8.4" r="0.9" fill="currentColor"/>' : '') + '</svg>'
}

/* ---------- Siluetas ---------- */
/* Todas miran a la izquierda, que es hacia donde caminan. Más grandes = más cerca = más rápidas.
   d: segundos en cruzar la pantalla · ph: punto de partida (0–1) · b: ritmo del balanceo
   l: posición fija cuando se pide reducir movimiento.
   Up to 640 px wide landing.css caps them at 110 px (the reference does it in JS at load). */
const SILS = [
  { l: '5%',  t: 150,  s: 190, d: 150, ph: .08, b: 3.6, y: false, sm: false },
  { l: '79%', t: 80,   s: 118, d: 190, ph: .55, b: 3.0, y: true,  sm: true },
  { l: '85%', t: 560,  s: 230, d: 135, ph: .32, b: 4.2, y: false, sm: false },
  { l: '-3%', t: 900,  s: 160, d: 165, ph: .78, b: 3.4, y: false, sm: true },
  { l: '66%', t: 1290, s: 108, d: 200, ph: .2,  b: 2.8, y: true,  sm: false },
  { l: '7%',  t: 1500, s: 210, d: 145, ph: .62, b: 3.9, y: false, sm: false },
]
const sils = () =>
  SILS.map(function (m, i) {
    return '<div class="sil' + (m.y ? ' y' : '') + (m.sm ? '' : ' hide-sm') + '" style="--l:' + m.l + ';--t:' + m.t + 'px;--size:' + m.s + 'px;' +
      '--d:' + m.d + 's;--delay:' + (-m.d * m.ph).toFixed(1) + 's;--b:' + m.b + 's"><div class="sil-in">' + mammoth('sil-cut-' + i, 1.1, 2.5, false) + '</div></div>'
  }).join('')

/* ---------- Código ---------- */
const URL_ = 'postgres://USER:PASSWORD@HOST:5432/DBNAME'
// The tab shown first: the one-command demo.
const FIRST_TAB = 'demo'
const DEMO_FILE = 'docker-compose.demo.yml'
function codeLines(tab, L, config) {
  const IMAGE = config.image
  const PORTS = '127.0.0.1:' + config.hostPort + ':8080'
  if (tab === 'demo') return [
    [['c', L.demoComment]],
    [['f', 'curl'], ['x', ' '], ['a', '-fsSLO'], ['x', ' '], ['s', config.repoRawUrl + '/main/deploy/' + DEMO_FILE]],
    [['f', 'docker'], ['x', ' compose '], ['a', '-f'], ['x', ' ' + DEMO_FILE + ' up '], ['a', '-d']],
  ]
  if (tab === 'run') return [
    [['f', 'docker'], ['x', ' run -d '], ['a', '--name'], ['x', ' gresbase '], ['p', '\\']],
    [['x', '  '], ['a', '-e'], ['x', ' DATABASE_URL='], ['s', URL_], ['x', ' '], ['p', '\\']],
    [['x', '  '], ['a', '-e'], ['x', ' GRESBASE_READ_ONLY='], ['s', 'false'], ['x', ' '], ['p', '\\']],
    [['x', '  '], ['a', '-p'], ['x', ' '], ['n', PORTS], ['x', ' '], ['p', '\\']],
    [['x', '  '], ['a', '-v'], ['x', ' gresbase-data:/data '], ['p', '\\']],
    [['x', '  '], ['a', '--restart'], ['x', ' unless-stopped '], ['p', '\\']],
    [['x', '  '], ['s', IMAGE]],
  ]
  return [
    [['k', 'services'], ['p', ':']],
    [['x', '  '], ['k', 'gresbase'], ['p', ':']],
    [['x', '    '], ['k', 'image'], ['p', ': '], ['s', IMAGE]],
    [['x', '    '], ['k', 'restart'], ['p', ': '], ['s', 'unless-stopped']],
    [['x', '    '], ['k', 'environment'], ['p', ':']],
    [['x', '      '], ['c', L.comment]],
    [['x', '      '], ['k', 'DATABASE_URL'], ['p', ': '], ['s', URL_]],
    [['x', '      '], ['k', 'GRESBASE_READ_ONLY'], ['p', ': '], ['s', '"false"']],
    [['x', '    '], ['k', 'volumes'], ['p', ':']],
    [['x', '      '], ['p', '- '], ['s', 'gresbase-data:/data']],
    [['x', '    '], ['k', 'ports'], ['p', ':']],
    [['x', '      '], ['p', '- '], ['s', '"' + PORTS + '"']],
    [],
    [['k', 'volumes'], ['p', ':']],
    [['x', '  '], ['k', 'gresbase-data'], ['p', ':']],
  ]
}
function renderLines(lines) {
  return lines.map(function (l, i) {
    const body = l.length ? l.map(function (t) { return '<span class="tk-' + t[0] + '">' + esc(t[1]) + '</span>' }).join('') : ' '
    return '<div class="code-line"><span class="ln" aria-hidden="true">' + (i + 1) + '</span><span class="lc">' + body + '</span></div>'
  }).join('')
}
/** What the Copy button puts in the clipboard. */
const plainText = (lines) => lines.map((l) => l.map((t) => t[1]).join('')).join('\n') + '\n'

function codePanel(tab, L, config) {
  const lines = codeLines(tab, L, config)
  // Newlines as &#10;: the production HTML minifier trims every line.
  const copy = esc(plainText(lines)).replace(/\n/g, '&#10;')
  return '<div class="code mono" role="tabpanel" id="code-' + tab + '" data-copy="' + copy + '"' + (tab === FIRST_TAB ? '' : ' hidden') + '>' + renderLines(lines) + '</div>'
}
function stepsList(tab, L, config) {
  const steps = tab === 'run' ? L.stepsRun : tab === 'demo' ? L.stepsDemo : L.stepsCompose
  return '<ol class="steps" id="steps-' + tab + '"' + (tab === FIRST_TAB ? '' : ' hidden') + '>' + steps.map(function (s, i) {
    const code = s[1].replace('{port}', config.hostPort)
    return '<li><span class="step-n mono">' + (i + 1) + '</span><span>' + esc(s[0]) + '</span>' + (code ? '<code class="mono">' + esc(code) + '</code>' : '') + '</li>'
  }).join('') + '</ol>'
}

/* ---------- Captura de la app ---------- */
const IC = {
  table: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18M9 4v16"/></svg>',
  sql: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 7l5 5-5 5M12 17h7"/></svg>',
  roles: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="8" r="3.5"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6M16 4.5a3.5 3.5 0 0 1 0 7M21 20c0-2.6-1.7-4.9-4-5.7"/></svg>',
  gear: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/></svg>',
  tsm: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18M9 4v16"/></svg>',
  search: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="11" cy="11" r="6"/><path d="M20 20l-4.5-4.5"/></svg>',
  filter: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M4 5h16l-6 7.5V19l-4-2v-4.5z"/></svg>',
  sort: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M7 4v16M3.5 16.5L7 20l3.5-3.5M17 20V4M13.5 7.5L17 4l3.5 3.5"/></svg>',
  dl: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4v11M7 10l5 5 5-5M5 20h14"/></svg>',
  plus: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
  key: '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="var(--accent-ink)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="15" r="4"/><path d="M11 12l8-8M16 7l2 2"/></svg>',
  fk: '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="var(--accent-ink)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 17L17 7M8 7h9v9"/></svg>',
  check: '<svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
  play: '<svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><path d="M7 5l12 7-12 7z"/></svg>',
}

function sidebar(A, view, n) {
  const icons = [IC.table, IC.sql, IC.roles, IC.gear]
  const nav = A.nav.map(function (name, i) {
    const on = (view === 'tables' && i === 0) || (view === 'sql' && i === 1)
    return '<div class="s-nav' + (on ? ' on' : '') + '">' + icons[i] + '<span>' + esc(name) + '</span></div>'
  }).join('')
  return '<div class="s-card s-side"><div class="s-brand"><div class="s-logo" style="width:26px;height:26px">' +
    mammoth('as-cut-' + n, 2.1, 3.6, false).replace('<svg ', '<svg width="19" height="19" ') + '</div><b>gresbase</b></div>' + nav +
    '<div class="s-conn"><i></i><div style="min-width:0"><b>production</b><small class="mono">db.internal:5432 · PG 17</small></div></div></div>'
}

function tablesView(A) {
  const tables = ['customers', 'events', 'invoices', 'orders', 'plans', 'products', 'subscriptions'].map(function (t) {
    return '<div class="s-item mono' + (t === 'customers' ? ' on' : '') + '">' + IC.tsm + esc(t) + '</div>'
  }).join('')
  const cols = [['id', 'int8', 'pk'], ['name', 'text', ''], ['email', 'text', ''], ['country', 'char(2)', ''], ['plan_id', 'int4', 'fk'], ['created_at', 'timestamptz', '']]
  const head = '<div class="s-row hd"><div class="s-cb"><i class="on"><span style="width:7px;height:1.6px;background:var(--on-accent);border-radius:1px;display:block"></span></i></div>' +
    cols.map(function (c) { return '<div class="s-cell">' + (c[2] === 'pk' ? IC.key : c[2] === 'fk' ? IC.fk : '') + '<b>' + c[0] + '</b><small>' + c[1] + '</small></div>' }).join('') + '</div>'
  const data = [
    ['1', 'Lucía Romero', 'lucia@example.com', 'ES', '3', '2026-03-02 09:14'],
    ['2', 'Owen Hartley', 'owen@example.com', 'GB', '1', '2026-03-05 17:40'],
    ['3', 'Marta Gil', 'marta@example.com', 'ES', null, '2026-03-09 11:02'],
    ['4', 'Kenji Mori', 'kenji@example.com', 'JP', '2', '2026-03-11 08:27'],
    ['5', 'Ana Ruiz', 'ana@example.com', 'ES', '3', '2026-03-14 19:55'],
    ['6', 'Paul Weber', 'paul@example.com', 'DE', '1', '2026-03-20 13:31'],
    ['7', 'Sara Costa', 'sara@example.com', 'PT', '2', '2026-03-21 10:06'],
    ['8', 'Iván Soler', 'ivan@example.com', 'ES', '1', '2026-03-24 16:48'],
  ]
  const rows = data.map(function (r, ri) {
    const sel = ri === 3, del = ri === 5
    const cells = r.map(function (v, ci) {
      let cls = 's-cell'
      if (v === null) cls += ' c-null'
      else if (ci === 4 && !del) cls += ' c-fk'
      if (ri === 1 && ci === 1) cls += ' c-edit'
      return '<div class="' + cls + '">' + (v === null ? 'NULL' : esc(v)) + (ci === 4 && v !== null && !del ? '<span style="font-size:10px">↗</span>' : '') + '</div>'
    }).join('')
    return '<div class="s-row mono' + (sel ? ' sel' : '') + (del ? ' del' : '') + '"><div class="s-cb"><i class="' + (sel ? 'on' : '') + '">' + (sel ? IC.check : '') + '</i></div>' + cells + '</div>'
  }).join('')
  return '<div class="s-card s-list"><div class="s-label">' + esc(A.tables) + '</div><div class="s-search">' + IC.search + esc(A.search) + '</div>' + tables + '</div>' +
    '<div class="s-card s-main">' +
      '<div class="s-head"><div class="s-title"><span class="sch">public /</span><b>customers</b><small class="mono">' + esc(A.rows) + '</small></div>' +
      '<div class="s-tabs"><span class="on">' + esc(A.tabs[0]) + '</span><span>' + esc(A.tabs[1]) + '</span><span>' + esc(A.tabs[2]) + '</span></div></div>' +
      '<div class="s-tools"><span class="s-btn">' + IC.filter + esc(A.filter) + '</span><span class="s-btn">' + IC.sort + esc(A.sort) + '</span>' +
      '<span class="s-chip mono">created_at &gt; \'2026-03-01\' <span style="opacity:.8">×</span></span><span style="flex:1"></span>' +
      '<span class="s-btn">' + IC.dl + 'CSV</span><span class="s-btn pri">' + IC.plus + esc(A.insert) + '</span></div>' +
      '<div class="s-grid">' + head + rows + '</div>' +
      '<div class="s-pill"><i></i><span style="font-weight:500">' + esc(A.pending) + '</span><u>' + esc(A.diff) + '</u><span class="ghost">' + esc(A.discard) + '</span><span class="save">' + esc(A.save) + '</span></div>' +
    '</div>'
}

function sqlView(A) {
  const saved = A.savedNames.map(function (n, i) { return '<div class="s-item' + (i === 0 ? ' on' : '') + '" style="font-weight:500;font-size:12px">' + esc(n) + '</div>' }).join('')
  const hist = ['select * from orders where status = …', 'update plans set price = 19 where id = 2', 'explain analyze select * from events …', 'select count(*) from customers']
    .map(function (q, i) { return '<div class="s-hist"><span class="mono">' + esc(q) + '</span><small>' + esc(A.when[i]) + '</small></div>' }).join('')
  const sql = [
    [['c', A.sqlComment]],
    [['a', 'select '], ['f', 'date_trunc'], ['p', '('], ['s', "'month'"], ['p', ', '], ['x', 'paid_at'], ['p', ') '], ['a', 'as'], ['x', ' month'], ['p', ',']],
    [['x', '       '], ['f', 'sum'], ['p', '('], ['x', 'amount'], ['p', ') '], ['a', 'as'], ['x', ' revenue'], ['p', ',']],
    [['x', '       '], ['f', 'count'], ['p', '(*) '], ['a', 'as'], ['x', ' invoices']],
    [['a', 'from'], ['x', ' invoices']],
    [['a', 'where'], ['x', ' paid_at '], ['p', '> '], ['f', 'now'], ['p', '() - '], ['a', 'interval '], ['s', "'6 months'"]],
    [['a', 'group by '], ['n', '1']],
    [['a', 'order by '], ['n', '1'], ['a', ' desc'], ['p', ';']],
  ]
  const res = [['2026-09-01', '48210.00', '312'], ['2026-08-01', '45980.50', '298'], ['2026-07-01', '44102.25', '291'], ['2026-06-01', '41876.00', '277'], ['2026-05-01', '39450.75', '260'], ['2026-04-01', '37020.00', '248']]
    .map(function (r) { return '<div class="s-r3 mono"><span>' + r[0] + '</span><span>' + r[1] + '</span><span>' + r[2] + '</span></div>' }).join('')
  return '<div class="s-card s-list"><div style="padding:2px 4px 8px;font-size:13px;font-weight:600">' + esc(A.queries) + '</div><div class="s-label" style="padding-top:4px">' + esc(A.saved) + '</div>' + saved +
    '<div class="s-label" style="padding-top:14px">' + esc(A.history) + '</div>' + hist + '</div>' +
    '<div class="s-col"><div class="s-card" style="overflow:hidden"><div class="s-ed-head"><b>' + esc(A.queryTitle) + '</b><small class="mono">timeout 30s</small><span style="flex:1"></span>' +
    '<span class="s-btn" style="font-size:11.5px;font-weight:500">' + esc(A.save) + '</span><span class="s-btn pri" style="font-size:11.5px">' + IC.play + esc(A.run) + '<span class="mono" style="font-size:10.5px;opacity:.7">⌘↵</span></span></div>' +
    '<div class="s-ed mono">' + renderLines(sql) + '</div></div>' +
    '<div class="s-card s-res"><div class="s-res-head"><b>' + esc(A.results) + '</b><small class="mono">' + esc(A.resMeta) + '</small></div>' +
    '<div class="s-r3 hd"><span>month <small>timestamptz</small></span><span>revenue <small>numeric</small></span><span>invoices <small>int8</small></span></div>' + res + '</div></div>'
}

function shot(view, lang, themeClass, n) {
  const A = strings[lang].app
  return '<div class="shot ' + (themeClass || '') + '" role="img" aria-label="' + esc(A.aria) + '">' + sidebar(A, view, n) + (view === 'sql' ? sqlView(A) : tablesView(A)) + '</div>'
}

const ICON_BOOK = '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 5a2 2 0 0 1 2-2h12v15H7a2 2 0 0 0-2 2z"/><path d="M5 20a2 2 0 0 0 2 2h12v-4"/></svg>'
const ICON_BRANCH = '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="6" cy="5.5" r="2.3"/><circle cx="6" cy="18.5" r="2.3"/><circle cx="18" cy="8" r="2.3"/><path d="M6 7.8v8.4M18 10.3c0 4.2-6.5 3.2-11.2 6.4"/></svg>'

export function landingPage({ config, assets, lang }) {
  const L = strings[lang]
  const other = config.langs.find((l) => l !== lang)
  const docs = urlFor(config, lang, '/docs/')
  const langLinks = config.langs
    .map((l) => `<a href="${urlFor(config, l, '/')}" hreflang="${l}" lang="${l}" aria-label="${esc(strings[l].langName)}"${l === lang ? ' aria-current="page"' : ''}>${l.toUpperCase()}</a>`)
    .join('\n      ')

  const body = `<div class="page">

  <!-- Siluetas: mamut SIN ojo, trazo fino, halo por máscara (id único por silueta) -->
  <div class="sils" aria-hidden="true" id="sils">${sils()}</div>

  <header class="controls">
    <nav class="seg" aria-label="${esc(L.langLabel)}">
      ${langLinks}
    </nav>
    <!-- Tema: por defecto «Sistema»; Claro u Oscuro solo si la persona lo elige (se guarda) -->
    <div class="seg theme" role="group" aria-label="${esc(L.theme)}" id="theme-group">
      <button type="button" data-theme-opt="system" aria-pressed="true" aria-label="${esc(L.themeOpts.system)}" title="${esc(L.themeOpts.system)}">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/></svg>
      </button>
      <button type="button" data-theme-opt="light" aria-pressed="false" aria-label="${esc(L.themeOpts.light)}" title="${esc(L.themeOpts.light)}">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2.5 12h2M19.5 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>
      </button>
      <button type="button" data-theme-opt="dark" aria-pressed="false" aria-label="${esc(L.themeOpts.dark)}" title="${esc(L.themeOpts.dark)}">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/></svg>
      </button>
    </div>
  </header>

  <main>
    <div class="hero">
      <div class="app-icon">
        <svg role="img" aria-label="Gresbase" viewBox="0 0 24 24" width="66" height="66" fill="none">
          <defs><mask id="hero-cut" maskUnits="userSpaceOnUse" x="0" y="0" width="24" height="24"><rect width="24" height="24" fill="#fff"/><path d="M7.7 12.9c-.1 3-2.8 4.2-5.1 1.7" fill="none" stroke="#000" stroke-width="3.2" stroke-linecap="round"/></mask></defs>
          <g fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 17.5a1.5 1.5 0 0 0 3 0V12C6 6.5 9 3.5 12.5 3.5S20 6.5 21 11.5V20h-2.5v-4H11v4H8.5v-5.5" mask="url(#hero-cut)"/><path d="M7.7 12.9c-.1 3-2.8 4.2-5.1 1.7"/></g>
          <circle cx="9.6" cy="8.4" r="0.9" fill="currentColor"/>
        </svg>
      </div>
      <h1>gresbase</h1>
      <p class="tagline">${esc(L.tagline)}</p>
      <p class="meta mono">${esc(L.meta)}</p>
      <div class="links">
        <a class="btn btn-primary" href="${docs}">
          ${ICON_BOOK}
          <span>${esc(L.docs)}</span>
        </a>
        <a class="btn btn-secondary" href="${esc(config.repoUrl)}">
          ${ICON_BRANCH}
          GitHub
        </a>
      </div>
    </div>

    <section class="quick" aria-labelledby="qs-title">
      <h2 class="section-label" id="qs-title">${esc(L.quick)}</h2>
      <div class="card">
        <div class="card-head">
          <div class="seg" role="tablist" aria-label="${esc(L.format)}">
            <button type="button" role="tab" data-tab="demo" aria-controls="code-demo" aria-selected="true">${esc(L.demo)}</button>
            <button type="button" role="tab" data-tab="compose" aria-controls="code-compose" aria-selected="false">docker-compose.yml</button>
            <button type="button" role="tab" data-tab="run" aria-controls="code-run" aria-selected="false">docker run</button>
          </div>
          <button type="button" class="copy-btn" id="copy-btn" aria-label="${esc(L.copy)}" data-copied="${esc(L.copied)}">
            <svg class="ico" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/></svg>
            <svg class="ok" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>
            <span class="label" aria-live="polite">${esc(L.copy)}</span>
          </button>
        </div>
        <div class="code-wrap">${codePanel('demo', L, config)}${codePanel('compose', L, config)}${codePanel('run', L, config)}</div>
      </div>
      ${stepsList('demo', L, config)}${stepsList('compose', L, config)}${stepsList('run', L, config)}
    </section>

    <section class="screens" aria-label="${esc(L.screens)}" aria-roledescription="${esc(L.carousel)}" id="screens" style="--interval: 6.5s" data-captions="${esc(JSON.stringify(L.captions))}" data-dots="${esc(JSON.stringify(L.dots))}">
      <div class="frame">
        <div class="stage" id="stage">
          <div class="stage-inner">
            <div class="slide on" data-slide="0">${shot('tables', lang, '', 1)}</div>
            <div class="slide" data-slide="1" aria-hidden="true">${shot('sql', lang, '', 2)}</div>
            <div class="slide" data-slide="2" aria-hidden="true">${shot('tables', other, 't-dark', 3)}</div>
            <div class="slide slide-gif" data-slide="3" data-interval="8s" aria-hidden="true"><img class="gif-light" src="/img/${assets.searchGif.light}" width="980" height="560" alt="" loading="lazy"><img class="gif-dark" src="/img/${assets.searchGif.dark}" width="980" height="560" alt="" loading="lazy"></div>
          </div>
        </div>
      </div>
      <div class="caption-row">
        <p class="caption" id="caption" aria-live="polite">${esc(L.captions[0])}</p>
        <div class="carousel-nav">
          <button type="button" class="chev" id="prev" aria-label="${esc(L.prev)}"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg></button>
          <div class="dots" id="dots">${L.dots.map((d, i) => '<button type="button" class="dot" data-i="' + i + '" aria-label="' + esc(d) + '" aria-pressed="' + (i === 0) + '"><span></span></button>').join('')}</div>
          <button type="button" class="chev" id="next" aria-label="${esc(L.next)}"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg></button>
        </div>
      </div>
    </section>

    <footer>
      <div class="foot-brand">
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" aria-hidden="true">
          <defs><mask id="ft-cut" maskUnits="userSpaceOnUse" x="0" y="0" width="24" height="24"><rect width="24" height="24" fill="#fff"/><path d="M7.7 12.9c-.1 3-2.8 4.2-5.1 1.7" fill="none" stroke="#000" stroke-width="3.6" stroke-linecap="round"/></mask></defs>
          <g fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 17.5a1.5 1.5 0 0 0 3 0V12C6 6.5 9 3.5 12.5 3.5S20 6.5 21 11.5V20h-2.5v-4H11v4H8.5v-5.5" mask="url(#ft-cut)"/><path d="M7.7 12.9c-.1 3-2.8 4.2-5.1 1.7"/></g>
        </svg>
        <span>gresbase</span>
      </div>
      <nav aria-label="${esc(L.links)}">
        <a href="${docs}">${esc(L.docs)}</a>
        <a href="${esc(config.repoUrl)}">GitHub</a>
        <a href="${esc(config.repoUrl)}/blob/main/LICENSE">${esc(L.license)}</a>
      </nav>
    </footer>
  </main>
</div>`

  return layout({ config, assets, lang, path: '/', title: L.title, description: L.description, body })
}
