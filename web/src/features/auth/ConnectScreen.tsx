import { useNavigate } from '@tanstack/react-router'
import { History } from 'lucide-react'
import { type FormEvent, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { LanguageSwitch } from '@/components/LanguageSwitch'
import { AppIcon } from '@/components/Logo'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { safeRedirect, useConnect } from '@/lib/api/auth'
import { connectionErrorMessage } from '@/lib/api/errors'
import type { ConfigResponse, ConnectionInput } from '@/lib/api/types.gen'
import { ConnectionForm } from '@/features/setup/ConnectionForm'
import { onlyPassword, withFixed } from '@/features/setup/fixedFields'
import { emptyConnection } from '@/features/setup/connectionUrl'
import { loadRecent, saveRecent } from './recentConnections'

/** Free mode sign-in: the Postgres credentials are the login and nothing is saved on the server. */
export function ConnectScreen({ config, redirect }: { config: ConfigResponse; redirect?: string }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const connect = useConnect()
  const [recent] = useState(loadRecent)
  const [conn, setConn] = useState<ConnectionInput>(() => ({ ...emptyConnection(), ...recent[0] }))

  const sent = withFixed(conn, config)
  // With everything fixed there is nothing to pick from the recent connections.
  const showRecent = recent.length > 0 && !onlyPassword(config)
  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    connect.mutate(conn, {
      onSuccess: () => {
        saveRecent(sent)
        setConn((c) => ({ ...c, password: '' }))
        void navigate({ to: safeRedirect(redirect) ?? '/tables', replace: true })
      },
    })
  }

  return (
    <main className="flex h-full items-center justify-center overflow-y-auto p-3">
      <Card className="flex w-full max-w-[460px] flex-col items-center gap-3 p-8">
        <AppIcon size={48} glow />
        <span className="text-[22px] font-semibold tracking-[-0.04em]">{t('app.name')}</span>
        <h1 className="text-muted">{t('connect.title')}</h1>
        {showRecent && (
          <div className="flex w-full flex-col gap-1.5">
            <span className="section-label flex items-center gap-1">
              <History className="size-3" aria-hidden />
              {t('connect.recent')}
            </span>
            <ul className="flex flex-wrap gap-1.5">
              {recent.map((r) => (
                <li key={`${r.user}@${r.host}:${r.port}/${r.database}`}>
                  <Button
                    size="sm"
                    onClick={() => setConn({ ...emptyConnection(), ...r })}
                    className="font-mono text-[12px]"
                  >
                    {t('setup.done.target', r)}
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        )}
        <form className="mt-2 flex w-full flex-col gap-4" onSubmit={onSubmit} noValidate>
          <ConnectionForm value={conn} onChange={setConn} fixed={config} />
          {connect.error && (
            <p role="alert" className="text-danger">
              {connectionErrorMessage(connect.error, t)}
            </p>
          )}
          <Button
            type="submit"
            variant="primary"
            className="w-full"
            disabled={connect.isPending || !sent.host || !sent.user}
          >
            {connect.isPending ? t('connect.connecting') : t('connect.submit')}
          </Button>
          <p className="text-center text-[12px] text-muted">{t('connect.hint')}</p>
        </form>
        <LanguageSwitch className="mt-1" />
      </Card>
    </main>
  )
}
