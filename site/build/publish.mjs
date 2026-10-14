// Files for Cloudflare Pages, generated from the build: sitemap.xml, robots.txt and _headers.
// (_redirects is static, in public/.)
import { createHash } from 'node:crypto'
import { urlFor } from './templates/layout.mjs'

/** sitemap.xml: every page in every language, with its hreflang alternates. */
export function sitemap(config, paths) {
  const abs = (lang, path) => config.siteUrl + urlFor(config, lang, path)
  const urls = paths.flatMap((path) =>
    config.langs.map((lang) => `  <url>
    <loc>${abs(lang, path)}</loc>
${config.langs.map((l) => `    <xhtml:link rel="alternate" hreflang="${l}" href="${abs(l, path)}"/>`).join('\n')}
    <xhtml:link rel="alternate" hreflang="x-default" href="${abs(config.langs[0], path)}"/>
  </url>`),
  )
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${urls.join('\n')}
</urlset>
`
}

export const robots = (config) => `User-agent: *
Allow: /

Sitemap: ${config.siteUrl}/sitemap.xml
`

/**
 * _headers: security headers everywhere, a year of immutable cache for files with a hash in their
 * name, a short cache for HTML. Cloudflare joins the values of a header that several rules set, so
 * Cache-Control is set by rules that never overlap. The CSP allows only this origin; the inline theme
 * script goes in by its hash, and style attributes (the silhouettes' custom properties, the app
 * screenshot built in HTML) need 'unsafe-inline' in style-src.
 */
export function headers(themeScript) {
  const sha = createHash('sha256').update(themeScript).digest('base64')
  const csp = [
    "default-src 'self'",
    `script-src 'self' 'sha256-${sha}'`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self'",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; ')
  const immutable = '  Cache-Control: public, max-age=31536000, immutable'
  const html = '  Cache-Control: public, max-age=300, must-revalidate'
  return `/*
  Content-Security-Policy: ${csp}
  X-Content-Type-Options: nosniff
  X-Frame-Options: DENY
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()

${['/css/*', '/js/*', '/fonts/*', '/img/*', '/search-*'].map((p) => `${p}\n${immutable}`).join('\n\n')}

${['/', '/index.html', '/404.html', '/docs/*', '/es/*'].map((p) => `${p}\n${html}`).join('\n\n')}

/favicon.svg
  Cache-Control: public, max-age=86400

/sitemap.xml
${html}

/robots.txt
${html}
`
}
