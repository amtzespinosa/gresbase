import { Lock } from 'lucide-react'
import { type FormEvent, useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Tooltip } from '@/components/ui/Tooltip'
import { errorMessage } from '@/lib/api/errors'
import { usePatchSetting } from '@/lib/api/settings'
import type { Setting } from '@/lib/api/types.gen'

export type SettingKind = 'text' | 'number' | 'bool' | 'lang'

/** One server setting: its value, where it comes from (lock when an env var sets it) and Save. */
export function ServerSetting({ setting, kind }: { setting: Setting; kind: SettingKind }) {
  const { t } = useTranslation()
  const id = useId()
  const patch = usePatchSetting()
  const [draft, setDraft] = useState<string | null>(null)
  const value = draft ?? setting.value
  const dirty = draft !== null && draft !== setting.value
  const label = t(`settings.keys.${setting.key}.label`)
  const lockText = t('settings.lockedBy', { env: setting.env })

  const save = (next = value) =>
    patch.mutate({ key: setting.key, value: next }, { onSuccess: () => setDraft(null) })
  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    if (dirty) save()
  }

  const control =
    kind === 'bool' || kind === 'lang' ? (
      <Select
        id={id}
        aria-label={label}
        value={value}
        disabled={setting.locked}
        onValueChange={(v) => {
          setDraft(v)
          if (v !== setting.value) save(v)
        }}
        options={
          kind === 'bool'
            ? [
                { value: 'true', label: t('settings.on') },
                { value: 'false', label: t('settings.off') },
              ]
            : [
                { value: 'en', label: t('language.en') },
                { value: 'es', label: t('language.es') },
              ]
        }
      />
    ) : (
      <Input
        id={id}
        type={kind === 'number' ? 'number' : 'text'}
        inputMode={kind === 'number' ? 'numeric' : undefined}
        value={value}
        disabled={setting.locked}
        aria-describedby={`${id}-hint`}
        aria-invalid={patch.isError || undefined}
        onChange={(e) => setDraft(e.target.value)}
        className="font-mono text-[12.5px]"
      />
    )

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-1 py-2.5">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="flex min-w-0 flex-col">
          <label htmlFor={id} className="flex items-center gap-1.5 font-medium">
            {label}
            {setting.locked && (
              <Tooltip content={lockText}>
                <span role="img" tabIndex={0} aria-label={lockText} className="text-muted">
                  <Lock className="size-3.5" aria-hidden />
                </span>
              </Tooltip>
            )}
            {setting.restart_required && <Badge tone="accent">{t('settings.restart')}</Badge>}
          </label>
          <span id={`${id}-hint`} className="text-[12px] text-muted">
            {setting.locked ? lockText : t(`settings.keys.${setting.key}.hint`)}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-52">{control}</div>
          {kind !== 'bool' && kind !== 'lang' && (
            <Button type="submit" size="sm" disabled={!dirty || patch.isPending}>
              {t('settings.save')}
            </Button>
          )}
        </div>
      </div>
      {patch.isError && (
        <span role="alert" className="text-[12px] text-danger">
          {errorMessage(patch.error, t)}
        </span>
      )}
    </form>
  )
}
