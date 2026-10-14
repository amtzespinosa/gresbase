import { useTranslation } from 'react-i18next'

/** Plain number in the user's language: 12,400 / 12.400. */
export function formatNumber(n: number, lang: string): string {
  return new Intl.NumberFormat(lang).format(n)
}

// Intl's compact notation says "12 mil" in Spanish; the design asks for "≈12,4 k" / "≈12.4k".
const units = [
  { min: 1e6, div: 1e6, suffix: { en: 'M', es: ' M' } },
  { min: 1e3, div: 1e3, suffix: { en: 'k', es: ' k' } },
] as const

/** Approximate count for estimates such as reltuples: "≈12.4k" (en) / "≈12,4 k" (es). */
export function formatApprox(n: number, lang: string): string {
  const unit = units.find((u) => Math.abs(n) >= u.min)
  if (!unit) return `≈${formatNumber(n, lang)}`
  const value = new Intl.NumberFormat(lang, { maximumFractionDigits: 1 }).format(n / unit.div)
  return `≈${value}${lang === 'es' ? unit.suffix.es : unit.suffix.en}`
}

/** Date and time in the user's language. */
export function formatDateTime(date: Date | number, lang: string): string {
  return new Intl.DateTimeFormat(lang, { dateStyle: 'medium', timeStyle: 'short' }).format(date)
}

/** A byte size in the user's language: "512 B", "1.2 kB" / "1,2 kB". */
export function formatBytes(n: number, lang: string): string {
  const units = ['byte', 'kilobyte', 'megabyte', 'gigabyte', 'terabyte'] as const
  let i = 0
  while (Math.abs(n) >= 1024 && i < units.length - 1) {
    n /= 1024
    i++
  }
  return new Intl.NumberFormat(lang, {
    style: 'unit',
    unit: units[i],
    unitDisplay: 'short',
    maximumFractionDigits: i === 0 ? 0 : 1,
  }).format(n)
}

/** The format helpers bound to the current language. */
export function useFormat() {
  const { i18n } = useTranslation()
  const lang = i18n.language
  return {
    number: (n: number) => formatNumber(n, lang),
    approx: (n: number) => formatApprox(n, lang),
    dateTime: (d: Date | number) => formatDateTime(d, lang),
    bytes: (n: number) => formatBytes(n, lang),
  }
}
