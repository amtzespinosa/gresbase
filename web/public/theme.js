// Applies the saved theme before the first paint (no flash). A file, not an inline script, so the
// CSP can keep script-src 'self'. Mirrors resolveTheme() in src/lib/prefs/theme.ts.
;(function () {
  var theme = 'system'
  try {
    theme = JSON.parse(localStorage.getItem('gresbase:prefs') || '{}').state.theme || 'system'
  } catch (e) {}
  if (theme !== 'light' && theme !== 'dark') {
    theme = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  }
  document.documentElement.dataset.theme = theme
})()
