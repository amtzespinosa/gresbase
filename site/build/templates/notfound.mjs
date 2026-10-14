// 404.html, in every language on the same page (Cloudflare Pages serves it for any missing URL). Same
// pieces as the landing hero: app icon, wordmark-sized heading, tagline and the two link buttons.
import { strings } from '../i18n.mjs'
import { esc, urlFor } from './layout.mjs'

const ICON = `<svg role="img" aria-label="Gresbase" viewBox="0 0 24 24" width="66" height="66" fill="none">
          <defs><mask id="nf-cut" maskUnits="userSpaceOnUse" x="0" y="0" width="24" height="24"><rect width="24" height="24" fill="#fff"/><path d="M7.7 12.9c-.1 3-2.8 4.2-5.1 1.7" fill="none" stroke="#000" stroke-width="3.2" stroke-linecap="round"/></mask></defs>
          <g fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 17.5a1.5 1.5 0 0 0 3 0V12C6 6.5 9 3.5 12.5 3.5S20 6.5 21 11.5V20h-2.5v-4H11v4H8.5v-5.5" mask="url(#nf-cut)"/><path d="M7.7 12.9c-.1 3-2.8 4.2-5.1 1.7"/></g>
          <circle cx="9.6" cy="8.4" r="0.9" fill="currentColor"/>
        </svg>`
const BOOK = '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 5a2 2 0 0 1 2-2h12v15H7a2 2 0 0 0-2 2z"/><path d="M5 20a2 2 0 0 0 2 2h12v-4"/></svg>'

export function notFoundPage({ config, assets }) {
  const blocks = config.langs.map((lang) => {
    const L = strings[lang]
    return `      <p class="tagline" lang="${lang}">${esc(L.notFound)}</p>
      <div class="links" lang="${lang}">
        <a class="btn btn-primary" href="${urlFor(config, lang, '/docs/')}">${BOOK}<span>${esc(L.docs)}</span></a>
        <a class="btn btn-secondary" href="${urlFor(config, lang, '/')}">${esc(L.home)}</a>
      </div>`
  }).join('\n')
  const title = config.langs.map((l) => strings[l].notFoundTitle).join(' · ')
  return `<!doctype html>
<html lang="${config.langs[0]}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>404 · ${esc(title)} · gresbase</title>
<meta name="robots" content="noindex">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<script>${assets.themeScript}</script>
<link rel="stylesheet" href="${assets.css}">
</head>
<body>
<div class="page">
  <main>
    <div class="hero">
      <div class="app-icon">
        ${ICON}
      </div>
      <h1>404</h1>
${blocks}
    </div>
  </main>
</div>
</body>
</html>
`
}
