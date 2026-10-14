// Docs page, ported from site/reference/docs-referencia.html. What the reference builds with JS (logo,
// sidebar, page index, search index) is rendered here at build time; src/js/docs.js keeps the interactions.
import { strings } from '../i18n.mjs'
import { esc, layout, urlFor } from './layout.mjs'

function mammoth(id, size, sw, halo) {
  return '<svg viewBox="0 0 24 24" width="' + size + '" height="' + size + '" fill="none" aria-hidden="true"><defs><mask id="' + id + '" maskUnits="userSpaceOnUse" x="0" y="0" width="24" height="24"><rect width="24" height="24" fill="#fff"/><path d="M7.7 12.9c-.1 3-2.8 4.2-5.1 1.7" fill="none" stroke="#000" stroke-width="' + halo + '" stroke-linecap="round"/></mask></defs><g fill="none" stroke="currentColor" stroke-width="' + sw + '" stroke-linecap="round" stroke-linejoin="round"><path d="M3 17.5a1.5 1.5 0 0 0 3 0V12C6 6.5 9 3.5 12.5 3.5S20 6.5 21 11.5V20h-2.5v-4H11v4H8.5v-5.5" mask="url(#' + id + ')"/><path d="M7.7 12.9c-.1 3-2.8 4.2-5.1 1.7"/></g></svg>'
}

const THEME_ICONS = {
  system: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/></svg>',
  light: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2.5 12h2M19.5 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
  dark: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/></svg>',
}
const EDIT_ICON = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16z"/></svg>'
const CHEVRON = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>'

export const docsUrl = (config, lang, slug) => urlFor(config, lang, `/docs/${slug}/`)

/**
 * page: { slug, title, description, html, headings, updated (Date) }
 * nav: [{ title: {en, es}, pages: [{ slug, title: {en, es} }] }]
 */
export function docsPage({ config, assets, lang, nav, page }) {
  const L = strings[lang]
  const U = L.docsUi
  const flat = nav.flatMap((g) => g.pages.map((p) => ({ ...p, group: g })))
  const at = flat.findIndex((p) => p.slug === page.slug)
  const group = flat[at].group
  const prev = flat[at - 1], next = flat[at + 1]

  const sideNav = nav.map((g) =>
    '<div class="nav-group"><p class="nav-label">' + esc(g.title[lang]) + '</p><ul>' + g.pages.map((p) =>
      '<li><a class="nav-item" href="' + docsUrl(config, lang, p.slug) + '"' + (p.slug === page.slug ? ' aria-current="page"' : '') + '>' + esc(p.title[lang]) + '</a></li>',
    ).join('') + '</ul></div>',
  ).join('')

  const tocItems = page.headings.map((h) =>
    '<li class="' + (h.level === 3 ? 'l3' : 'l2') + '"><a href="#' + h.id + '">' + esc(h.text) + '</a></li>',
  ).join('')

  const langLinks = config.langs.map((l) =>
    `<a href="${docsUrl(config, l, page.slug)}" hreflang="${l}" lang="${l}" aria-label="${esc(strings[l].langName)}"${l === lang ? ' aria-current="page"' : ''}>${l.toUpperCase()}</a>`,
  ).join('\n        ')
  const themeButtons = ['system', 'light', 'dark'].map((o) =>
    `<button type="button" data-theme-opt="${o}" aria-pressed="${o === 'system'}" aria-label="${esc(L.themeOpts[o])}" title="${esc(L.themeOpts[o])}">${THEME_ICONS[o]}</button>`,
  ).join('\n        ')

  const pager = (prev || next) ? `<nav class="pager" aria-label="${esc(U.pagination)}">
          ${prev ? `<a class="pn" href="${docsUrl(config, lang, prev.slug)}"><small>${esc(U.previous)}</small><b>← ${esc(prev.title[lang])}</b></a>` : ''}
          ${next ? `<a class="pn next" href="${docsUrl(config, lang, next.slug)}"><small>${esc(U.next)}</small><b>${esc(next.title[lang])} →</b></a>` : ''}
        </nav>` : ''
  const date = new Intl.DateTimeFormat(U.dateLocale, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(page.updated)
  const edit = config.repoPublic
    ? `<a href="${esc(config.repoUrl)}/edit/main/site/content/${lang}/${page.slug}.md">${EDIT_ICON}${esc(U.edit)}</a>\n          `
    : ''

  const body = `<button type="button" class="menu-btn" id="menu-btn" aria-controls="sidebar" aria-expanded="false" aria-label="${esc(U.openNav)}">
  <span class="brand-icon" style="width:28px;height:28px">${mammoth('cut-menu', 20, 2.1, 3.6)}</span><b>gresbase</b>
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true" style="color:var(--muted)"><path d="M4 7h16M4 12h16M4 17h16"/></svg>
</button>
<div class="scrim" id="scrim"></div>

<div class="layout">

  <aside class="sidebar card" id="sidebar" aria-label="${esc(U.nav)}">
    <div class="side-top">
      <a class="brand" href="${urlFor(config, lang, '/')}" aria-label="${esc(U.home)}">
        <span class="brand-icon">${mammoth('cut-side', 20, 2.1, 3.6)}</span><b>gresbase</b><span>${esc(U.docs)}</span>
      </a>
      <button type="button" class="search-btn" id="search-btn">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4-4"/></svg>
        <span>${esc(U.search)}</span>
        <span class="kbds" aria-hidden="true"><kbd id="mod-key">⌘</kbd><kbd>K</kbd></span>
      </button>
    </div>
    <nav class="side-nav" id="side-nav" aria-label="${esc(U.nav)}">${sideNav}</nav>
    <div class="side-bottom">
      <nav class="seg" aria-label="${esc(L.langLabel)}">
        ${langLinks}
      </nav>
      <div class="seg" role="group" aria-label="${esc(L.theme)}" id="theme-group">
        ${themeButtons}
      </div>
    </div>
  </aside>

  <main class="content card" id="main">
    <div class="content-inner">
      <article class="doc">
        <p class="crumbs"><a href="${docsUrl(config, lang, group.pages[0].slug)}">${esc(group.title[lang])}</a> /</p>
        <h1>${esc(page.title)}</h1>
        <p class="lead">${esc(page.description)}</p>

        <details class="toc-inline"><summary>${esc(U.onThisPage)} ${CHEVRON}</summary><ul>${tocItems}</ul></details>

${page.html}
        ${pager}
        <footer class="doc-foot">
          ${edit}<span>${esc(U.updated)} ${esc(date)}</span>
        </footer>
      </article>
    </div>
  </main>

  <aside class="toc" aria-label="${esc(U.onThisPage)}"><p>${esc(U.onThisPage)}</p><ul id="toc-list">${tocItems}</ul></aside>
</div>

<div class="search-dialog" id="search" role="dialog" aria-modal="true" aria-labelledby="search-input" data-index="${esc(assets.searchIndex)}" data-empty="${esc(U.empty)}" data-empty-hint="${esc(U.emptyHint)}">
  <div class="search-box">
    <div class="search-field">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4-4"/></svg>
      <input id="search-input" type="text" autocomplete="off" spellcheck="false" role="combobox" aria-expanded="true" aria-controls="search-results" aria-autocomplete="list" placeholder="${esc(U.placeholder)}">
      <kbd>esc</kbd>
    </div>
    <div class="search-results" id="search-results" role="listbox"></div>
    <div class="search-foot"><span><kbd>↑</kbd><kbd>↓</kbd> <span>${esc(U.kNav)}</span></span><span><kbd>↵</kbd> <span>${esc(U.kOpen)}</span></span><span><kbd>esc</kbd> <span>${esc(U.kClose)}</span></span></div>
  </div>
</div>`

  return layout({
    config, assets, lang,
    path: `/docs/${page.slug}/`,
    title: `${page.title} · gresbase docs`,
    description: page.description,
    body,
  })
}

/** /docs/ and /es/docs/: redirect to the first page (Cloudflare's _redirects does it too). */
export function docsRedirect({ config, lang, slug }) {
  const to = docsUrl(config, lang, slug)
  return `<!doctype html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<title>gresbase docs</title>
<meta http-equiv="refresh" content="0; url=${to}">
<link rel="canonical" href="${config.siteUrl}${to}">
</head>
<body><a href="${to}">${esc(strings[lang].docsUi.redirect)}</a></body>
</html>
`
}
