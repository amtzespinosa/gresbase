import { Navigate, useNavigate, useSearch } from '@tanstack/react-router'
import { type FormEvent, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { LanguageSwitch } from '@/components/LanguageSwitch'
import { AppIcon } from '@/components/Logo'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { safeRedirect, useLogin } from '@/lib/api/auth'
import { ApiError } from '@/lib/api/client'
import { errorMessage } from '@/lib/api/errors'
import { useConfig } from '@/lib/api/queries'
import { ConnectScreen } from './ConnectScreen'

export function LoginScreen() {
  const { t } = useTranslation()
  const { redirect } = useSearch({ from: '/login' })
  const navigate = useNavigate()
  const config = useConfig()
  const login = useLogin()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')

  if (config.data && !config.data.auth_enabled) return <Navigate to="/tables" replace />
  if (config.data?.free_mode) return <ConnectScreen config={config.data} redirect={redirect} />

  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    login.mutate(
      { username, password },
      {
        onSuccess: () => {
          setPassword('')
          void navigate({ to: safeRedirect(redirect) ?? '/tables', replace: true })
        },
      },
    )
  }

  const error = login.error
  const errorText =
    error instanceof ApiError && error.code === 'unauthorized'
      ? t('login.invalid')
      : error && errorMessage(error, t)

  return (
    <main className="flex h-full items-center justify-center p-3">
      <Card className="flex w-full max-w-[360px] flex-col items-center gap-3 p-8">
        <AppIcon size={48} glow />
        <span className="text-[22px] font-semibold tracking-[-0.04em]">{t('app.name')}</span>
        <h1 className="text-muted">{t('login.title')}</h1>
        <form className="mt-2 flex w-full flex-col gap-3" onSubmit={onSubmit} noValidate>
          <label className="flex flex-col gap-1.5">
            <span className="section-label">{t('login.username')}</span>
            <Input
              name="username"
              autoComplete="username"
              autoFocus
              required
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="section-label">{t('login.password')}</span>
            <Input
              name="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          {errorText && (
            <p role="alert" className="text-danger">
              {errorText}
            </p>
          )}
          <Button
            type="submit"
            variant="primary"
            className="mt-1 w-full"
            disabled={login.isPending || !username || !password}
          >
            {login.isPending ? t('login.submitting') : t('login.submit')}
          </Button>
        </form>
        <LanguageSwitch className="mt-3" />
      </Card>
    </main>
  )
}
