import { Navigate, useNavigate } from '@tanstack/react-router'
import { useDataLossText } from '@/components/DataLoss'
import { AlertTriangle, CheckCircle2, Database, KeyRound } from 'lucide-react'
import { type FormEvent, type ReactNode, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { LanguageSwitch } from '@/components/LanguageSwitch'
import { AppIcon } from '@/components/Logo'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { SegmentedControl } from '@/components/ui/SegmentedControl'
import { connectionErrorMessage } from '@/lib/api/errors'
import {
  useCompleteSetup,
  useSetupStatus,
  useTestConnection,
  useVerifySetupToken,
} from '@/lib/api/setup'
import type { ConnectionInput, ConnectionTest, SetupStatus } from '@/lib/api/types.gen'
import { cn } from '@/lib/cn'
import { type Theme, usePrefs } from '@/lib/prefs/store'
import { ConnectionForm } from './ConnectionForm'
import { withFixed } from './fixedFields'
import { emptyConnection } from './connectionUrl'
import { type Mode, setupSteps } from './steps'

/** The command that prints the setup token, the same in every language. */
const tokenCommand = (container?: string) =>
  container ? `docker exec ${container} /gresbase setup-token` : 'gresbase setup-token'

/** The setup link in the logs carries the token after "#", which never reaches the server. */
const hashToken = () => /(?:^#|&)token=([^&]+)/.exec(window.location.hash)?.[1] ?? ''

export function SetupWizard() {
  const status = useSetupStatus()
  if (!status.data) return null
  if (!status.data.required) return <Navigate to="/" replace />
  return <Wizard status={status.data} />
}

function Wizard({ status }: { status: SetupStatus }) {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const { theme, setTheme } = usePrefs()
  const [mode, setMode] = useState<Mode>('saved')
  const [index, setIndex] = useState(0)
  const [token, setToken] = useState(hashToken)
  // Take the token out of the address bar (and so of the history) once read.
  useEffect(() => {
    if (hashToken()) history.replaceState(history.state, '', location.pathname + location.search)
  }, [])
  const [username, setUsername] = useState('admin')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [conn, setConn] = useState<ConnectionInput>(emptyConnection)
  const [tested, setTested] = useState<ConnectionTest | null>(null)
  const verify = useVerifySetupToken()
  const test = useTestConnection(token)
  const complete = useCompleteSetup(token)

  const steps = setupSteps(status, mode)
  const step = steps[index]
  const next = () => setIndex((i) => Math.min(i + 1, steps.length - 1))
  const back = () => setIndex((i) => Math.max(i - 1, 0))
  const saveStep = steps[steps.length - 2] // the step whose "Next" saves everything

  const changeConn = (c: ConnectionInput) => {
    setConn(c)
    setTested(null)
    test.reset()
  }
  const passwordShort = password.length > 0 && password.length < 8
  const mismatch = confirm.length > 0 && confirm !== password
  const canContinue =
    step === 'token'
      ? !!token
      : step === 'account'
        ? !!username.trim() && password.length >= 8 && confirm === password
        : step === 'connection'
          ? !!withFixed(conn, status).host && !!withFixed(conn, status).user
          : true

  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    if (!canContinue) return
    if (step === 'token') return verify.mutate(token, { onSuccess: next })
    if (step !== saveStep) return next()
    complete.mutate(
      {
        mode,
        lang: i18n.language,
        admin:
          mode === 'saved' && !status.account_locked
            ? { username: username.trim(), password }
            : undefined,
        connection: mode === 'saved' ? conn : undefined,
      },
      {
        onSuccess: () => {
          setPassword('')
          setConfirm('')
          next()
        },
      },
    )
  }

  const pending = verify.isPending || complete.isPending
  const error = step === 'token' ? verify.error : complete.error
  const done = step === 'done'

  return (
    <main className="flex h-full items-center justify-center overflow-y-auto p-3">
      <Card className="flex w-full max-w-[520px] flex-col gap-5 p-8">
        <div className="flex items-center gap-3">
          <AppIcon size={40} glow />
          <div className="flex flex-col">
            <span className="text-[19px] font-semibold tracking-[-0.03em]">{t('app.name')}</span>
            <span className="text-[12px] text-muted">
              {t('setup.progress', { step: index + 1, total: steps.length })}
            </span>
          </div>
          <ol className="ml-auto flex gap-1.5" aria-hidden>
            {steps.map((s, i) => (
              <li
                key={s}
                className={cn('h-1.5 w-5 rounded-full', i <= index ? 'bg-accent' : 'bg-surface-2')}
              />
            ))}
          </ol>
        </div>

        <form className="flex flex-col gap-5" onSubmit={onSubmit} noValidate>
          <h1 className="text-[22px] font-semibold tracking-[-0.03em]">
            {t(`setup.${step}.title`)}
          </h1>

          {step === 'welcome' && (
            <div className="flex flex-col gap-4">
              <p className="text-muted">{t('setup.welcome.intro')}</p>
              <Row label={t('language.label')}>
                <LanguageSwitch />
              </Row>
              <Row label={t('theme.label')}>
                <SegmentedControl<Theme>
                  label={t('theme.label')}
                  value={theme}
                  onChange={setTheme}
                  options={(['light', 'dark', 'system'] as const).map((v) => ({
                    value: v,
                    label: t(`theme.${v}`),
                  }))}
                />
              </Row>
              {!status.data_persistent && <NoVolume loss={status.data_loss} />}
            </div>
          )}

          {step === 'token' && (
            <div className="flex flex-col gap-3">
              <p className="text-muted">{t('setup.token.intro')}</p>
              <label className="flex flex-col gap-1.5">
                <span className="section-label">{t('setup.token.label')}</span>
                <Input
                  name="setup-token"
                  autoFocus
                  autoComplete="off"
                  spellCheck={false}
                  className="font-mono"
                  value={token}
                  onChange={(e) => setToken(e.target.value.trim())}
                />
              </label>
              <code className="rounded-[var(--radius-control)] bg-surface-2 px-3 py-2 font-mono text-[12px] text-muted">
                {tokenCommand(status.container)}
              </code>
            </div>
          )}

          {step === 'mode' && (
            <div
              role="radiogroup"
              aria-label={t('setup.mode.title')}
              className="flex flex-col gap-3"
            >
              <ModeOption
                checked={mode === 'saved'}
                onSelect={() => setMode('saved')}
                icon={<Database className="size-5" />}
                title={t('setup.mode.saved')}
                badge={t('setup.mode.recommended')}
                hint={t('setup.mode.savedHint')}
              />
              <ModeOption
                checked={mode === 'free'}
                onSelect={() => setMode('free')}
                icon={<KeyRound className="size-5" />}
                title={t('setup.mode.free')}
                hint={t('setup.mode.freeHint')}
              />
            </div>
          )}

          {step === 'account' && (
            <div className="flex flex-col gap-3">
              <p className="text-muted">{t('setup.account.intro')}</p>
              <label className="flex flex-col gap-1.5">
                <span className="section-label">{t('login.username')}</span>
                <Input
                  name="username"
                  autoComplete="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="section-label">{t('login.password')}</span>
                <Input
                  name="password"
                  type="password"
                  aria-label={t('login.password')}
                  aria-describedby="setup-password-hint"
                  autoComplete="new-password"
                  aria-invalid={passwordShort}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <span
                  id="setup-password-hint"
                  className={cn('text-[12px]', passwordShort ? 'text-danger' : 'text-muted')}
                >
                  {t('setup.account.passwordHint')}
                </span>
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="section-label">{t('setup.account.confirm')}</span>
                <Input
                  name="confirm"
                  type="password"
                  aria-label={t('setup.account.confirm')}
                  autoComplete="new-password"
                  aria-invalid={mismatch}
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                />
                {mismatch && (
                  <span className="text-[12px] text-danger">{t('setup.account.mismatch')}</span>
                )}
              </label>
            </div>
          )}

          {step === 'connection' && (
            <div className="flex flex-col gap-4">
              {status.account_locked && (
                <p className="text-muted">
                  {t('setup.account.locked', { user: status.account_username })}
                </p>
              )}
              <ConnectionForm value={conn} onChange={changeConn} fixed={status} showReadOnly />
              <div className="flex flex-wrap items-center gap-3">
                <Button
                  disabled={!canContinue || test.isPending}
                  onClick={() => test.mutate(conn, { onSuccess: setTested })}
                >
                  {test.isPending ? t('setup.connection.testing') : t('setup.connection.test')}
                </Button>
                <span aria-live="polite" className="min-w-0 text-[13px]">
                  {tested && (
                    <span className="flex items-center gap-1.5 text-success">
                      <CheckCircle2 className="size-4 shrink-0" aria-hidden />
                      {t('setup.connection.ok', { version: tested.server_version })} ·{' '}
                      {t(`setup.support.${tested.support_level}`)}
                    </span>
                  )}
                  {test.isError && (
                    <span className="text-danger">{connectionErrorMessage(test.error, t)}</span>
                  )}
                </span>
              </div>
            </div>
          )}

          {done && (
            <div className="flex flex-col gap-3">
              <p className="text-muted">
                {t(mode === 'saved' ? 'setup.done.saved' : 'setup.done.free')}
              </p>
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 rounded-[12px] border border-border bg-surface-2 px-4 py-3">
                <dt className="text-muted">{t('setup.done.mode')}</dt>
                <dd>{t(mode === 'saved' ? 'setup.mode.saved' : 'setup.mode.free')}</dd>
                {mode === 'saved' && (
                  <>
                    <dt className="text-muted">{t('setup.done.account')}</dt>
                    <dd>{status.account_locked ? status.account_username : username}</dd>
                    <dt className="text-muted">{t('setup.done.connection')}</dt>
                    <dd className="truncate font-mono text-[12px]">
                      {t('setup.done.target', { ...withFixed(conn, status) })}
                    </dd>
                  </>
                )}
              </dl>
              {!status.data_persistent && <NoVolume loss={status.data_loss} />}
            </div>
          )}

          {error && (
            <p role="alert" className="text-danger">
              {connectionErrorMessage(error, t)}
            </p>
          )}

          <div className="flex items-center justify-between gap-3">
            {index > 0 && !done ? (
              <Button variant="ghost" onClick={back} disabled={pending}>
                {t('setup.back')}
              </Button>
            ) : (
              <span />
            )}
            {done ? (
              <Button variant="primary" onClick={() => void navigate({ to: '/', replace: true })}>
                {t('setup.enter')}
              </Button>
            ) : (
              <Button type="submit" variant="primary" disabled={!canContinue || pending}>
                {pending
                  ? t('setup.saving')
                  : step === saveStep
                    ? t('setup.finish')
                    : t('setup.next')}
              </Button>
            )}
          </div>
        </form>
      </Card>
    </main>
  )
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span>{label}</span>
      {children}
    </div>
  )
}

function ModeOption(props: {
  checked: boolean
  onSelect: () => void
  icon: ReactNode
  title: string
  hint: string
  badge?: string
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={props.checked}
      onClick={props.onSelect}
      className={cn(
        'flex cursor-pointer items-start gap-3 rounded-[12px] border px-4 py-3 text-left transition-colors',
        'focus-visible:outline-2 focus-visible:outline-accent',
        props.checked ? 'border-accent bg-accent-tint' : 'border-border hover:bg-surface-2',
      )}
    >
      <span className="mt-0.5 text-muted">{props.icon}</span>
      <span className="flex flex-col gap-0.5">
        <span className="flex items-center gap-2 font-medium">
          {props.title}
          {props.badge && (
            <span className="rounded-full bg-surface-2 px-2 py-px text-[11px] text-muted">
              {props.badge}
            </span>
          )}
        </span>
        <span className="text-[13px] text-muted">{props.hint}</span>
      </span>
    </button>
  )
}

/** Warning for a data dir that would lose its files, with the compose snippet to mount a volume. */
function NoVolume({ loss }: { loss: string | undefined }) {
  const { t } = useTranslation()
  const text = useDataLossText(loss)
  return (
    <div
      role="note"
      className="flex flex-col gap-2 rounded-[12px] border border-border bg-surface-2 px-4 py-3"
    >
      <span className="flex items-center gap-2 font-medium">
        <AlertTriangle className="size-4 shrink-0 text-muted" aria-hidden />
        {t('setup.noVolume.title')}
      </span>
      <span className="text-[13px] text-muted">
        {text} {t('setup.noVolume.hint')}
      </span>
      <pre className="overflow-x-auto font-mono text-[12px]">
        {'    volumes:\n      - gresbase-data:/data'}
      </pre>
    </div>
  )
}
