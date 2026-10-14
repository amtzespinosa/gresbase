import { type FormEvent, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { ApiError } from '@/lib/api/client'
import { errorMessage } from '@/lib/api/errors'
import { useChangePassword } from '@/lib/api/settings'
import { toast } from '@/lib/toast'

const MIN_LENGTH = 8

/** Change the administrator's password (asks for the current one; other sessions end). */
export function PasswordForm({ username }: { username: string }) {
  const { t } = useTranslation()
  const change = useChangePassword()
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const short = next.length > 0 && next.length < MIN_LENGTH
  const mismatch = confirm.length > 0 && confirm !== next
  const ready = current !== '' && next.length >= MIN_LENGTH && confirm === next

  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    if (!ready) return
    change.mutate(
      { current_password: current, new_password: next },
      {
        onSuccess: () => {
          setCurrent('')
          setNext('')
          setConfirm('')
          toast({ message: t('settings.password.changed') })
        },
      },
    )
  }
  const error =
    change.error instanceof ApiError && change.error.code === 'forbidden'
      ? t('settings.password.wrongCurrent')
      : change.error && errorMessage(change.error, t)

  return (
    <form
      onSubmit={onSubmit}
      className="flex max-w-sm flex-col gap-3"
      aria-label={t('settings.password.title')}
    >
      {/* Lets password managers file the new password under the right account. */}
      <input type="text" name="username" autoComplete="username" value={username} readOnly hidden />
      <label className="flex flex-col gap-1.5">
        <span className="section-label">{t('settings.password.current')}</span>
        <Input
          type="password"
          autoComplete="current-password"
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
        />
      </label>
      <div className="flex flex-col gap-1.5">
        <label className="flex flex-col gap-1.5">
          <span className="section-label">{t('settings.password.new')}</span>
          <Input
            type="password"
            autoComplete="new-password"
            aria-invalid={short}
            aria-describedby="settings-password-hint"
            value={next}
            onChange={(e) => setNext(e.target.value)}
          />
        </label>
        <span
          id="settings-password-hint"
          className={short ? 'text-[12px] text-danger' : 'text-[12px] text-muted'}
        >
          {t('setup.account.passwordHint')}
        </span>
      </div>
      <label className="flex flex-col gap-1.5">
        <span className="section-label">{t('setup.account.confirm')}</span>
        <Input
          type="password"
          autoComplete="new-password"
          aria-invalid={mismatch}
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
        />
        {mismatch && <span className="text-[12px] text-danger">{t('setup.account.mismatch')}</span>}
      </label>
      {error && (
        <span role="alert" className="text-[12px] text-danger">
          {error}
        </span>
      )}
      <div>
        <Button type="submit" variant="primary" disabled={!ready || change.isPending}>
          {t('settings.password.submit')}
        </Button>
      </div>
    </form>
  )
}
