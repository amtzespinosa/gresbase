import { useEffect } from 'react'
import { useConfig } from '@/lib/api/queries'
import { usePrefs } from '@/lib/prefs/store'
import i18n, { resolveLang } from '.'

/** Switches i18next and <html lang> to saved choice → GRESBASE_LANG → English. */
export function useApplyLang() {
  const saved = usePrefs((s) => s.lang)
  const { data: config } = useConfig()
  const lang = resolveLang(saved, config?.lang)
  useEffect(() => {
    if (i18n.language !== lang) void i18n.changeLanguage(lang)
    document.documentElement.lang = lang
  }, [lang])
}
