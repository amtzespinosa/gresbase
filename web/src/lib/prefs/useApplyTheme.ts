import { useEffect } from 'react'
import { resolveTheme, usePrefs } from './store'

/** Keeps <html data-theme> in sync with the preference and, for "system", with the OS. */
export function useApplyTheme() {
  const theme = usePrefs((s) => s.theme)
  useEffect(() => {
    const apply = () => {
      document.documentElement.dataset.theme = resolveTheme(theme)
    }
    apply()
    if (theme !== 'system' || !window.matchMedia) return
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [theme])
}
