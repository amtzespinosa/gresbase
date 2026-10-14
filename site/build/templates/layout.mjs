/** Escapes text for HTML content and attribute values. */
export const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])

/** URL of `path` (starting with /) in `lang`: the first language lives at the root. */
export const urlFor = (config, lang, path) => (lang === config.langs[0] ? path : `/${lang}${path}`)

/**
 * Full HTML document. `assets` comes from the build: the inline theme script, the stylesheet, the
 * page script and, in development, the live reload snippet.
 */
export function layout({ config, assets, lang, path, title, description, body }) {
  const alternates = config.langs
    .map((l) => `<link rel="alternate" hreflang="${l}" href="${config.siteUrl}${urlFor(config, l, path)}">`)
    .join('\n')
  return `<!doctype html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${config.siteUrl}${urlFor(config, lang, path)}">
${alternates}
<link rel="alternate" hreflang="x-default" href="${config.siteUrl}${path}">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<script>${assets.themeScript}</script>
<link rel="stylesheet" href="${assets.css}">
</head>
<body>
${body}
${assets.js ? `<script src="${assets.js}"></script>` : ''}
${assets.reload ?? ''}
</body>
</html>
`
}
