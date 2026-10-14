/**
 * Base path of the app, always ending in "/". The Go server injects `<base href="{base}/">`
 * (GRESBASE_BASE_PATH); the Vite dev server has no <base>, so it is "/".
 */
export const basePath: string = (() => {
  const href = document.querySelector('base')?.getAttribute('href')
  if (!href) return '/'
  const path = new URL(href, window.location.origin).pathname
  return path.endsWith('/') ? path : `${path}/`
})()
