import { useTranslation } from 'react-i18next'
import { Flag } from '@/components/Flag'
import { SegmentedControl } from '@/components/ui/SegmentedControl'
import { type Lang, LANGS } from '@/lib/i18n'
import { usePrefs } from '@/lib/prefs/store'

/** Flag + EN / ES segmented control; the choice is saved and wins over GRESBASE_LANG. */
export function LanguageSwitch({ className }: { className?: string }) {
  const { t, i18n } = useTranslation()
  const setLang = usePrefs((s) => s.setLang)
  return (
    <SegmentedControl<Lang>
      label={t('language.label')}
      value={i18n.language as Lang}
      onChange={setLang}
      className={className}
      options={LANGS.map((lang) => ({
        value: lang,
        ariaLabel: t(`language.${lang}`),
        label: (
          <>
            <Flag lang={lang} /> {lang.toUpperCase()}
          </>
        ),
      }))}
    />
  )
}
