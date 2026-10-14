import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import en from '@/locales/en.json'
import es from '@/locales/es.json'
import { PREFS_KEY } from '@/lib/prefs/store'

export const LANGS = ['en', 'es'] as const
export type Lang = (typeof LANGS)[number]

export function isLang(value: unknown): value is Lang {
  return LANGS.includes(value as Lang)
}

/** Language priority: the user's saved choice → the server default (GRESBASE_LANG) → English. */
export function resolveLang(saved: Lang | null | undefined, server: string | undefined): Lang {
  if (saved) return saved
  return isLang(server) ? server : 'en'
}

function savedLang(): Lang | null {
  try {
    const lang: unknown = JSON.parse(localStorage.getItem(PREFS_KEY) ?? '{}').state?.lang
    return isLang(lang) ? lang : null
  } catch {
    return null
  }
}

// Start in the saved language so returning users never see a flash of English.
void i18n.use(initReactI18next).init({
  resources: { en: { translation: en }, es: { translation: es } },
  lng: resolveLang(savedLang(), undefined),
  fallbackLng: 'en',
  supportedLngs: LANGS,
  interpolation: { escapeValue: false },
  initAsync: false,
})

export default i18n
