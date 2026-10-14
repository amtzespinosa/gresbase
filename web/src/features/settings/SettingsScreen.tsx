import { ExternalLink, Lock, LogOut } from 'lucide-react'
import { useDataLossText } from '@/components/DataLoss'
import { type ReactNode, useId } from 'react'
import { useTranslation } from 'react-i18next'
import { LanguageSwitch } from '@/components/LanguageSwitch'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { SegmentedControl } from '@/components/ui/SegmentedControl'
import { useSignOut } from '@/features/auth/useSignOut'
import { ConnectionsSection } from '@/features/connections/ConnectionsSection'
import { useConfig, useConnection } from '@/lib/api/queries'
import { useServerSettings, useSession } from '@/lib/api/settings'
import type { Setting } from '@/lib/api/types.gen'
import { type Density, type Theme, usePrefs } from '@/lib/prefs/store'
import { PasswordForm } from './PasswordForm'
import { ServerSetting, type SettingKind } from './ServerSetting'

const REPO_URL = 'https://github.com/amtzespinosa/gresbase'

function TextLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-1 text-accent-ink underline-offset-2 hover:underline"
    >
      {children}
      <ExternalLink className="size-3.5" aria-hidden />
    </a>
  )
}

const kinds: Record<string, SettingKind> = {
  lang: 'lang',
  read_only: 'bool',
  sql_max_rows: 'number',
  max_conns: 'number',
  max_pools: 'number',
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  const id = useId()
  return (
    <section aria-labelledby={id} className="flex flex-col">
      <h2 id={id} className="section-label mb-1">
        {title}
      </h2>
      <div className="flex flex-col divide-y divide-border">{children}</div>
    </section>
  )
}

function Row({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-2.5">
      <span className="font-medium">{label}</span>
      {children}
    </div>
  )
}

/**
 * Settings: personal preferences (stored in the browser) for everyone; server settings (PATCH
 * /settings) only for the administrator, never in free mode.
 */
export function SettingsScreen() {
  const { t } = useTranslation()
  const { theme, setTheme, density, setDensity } = usePrefs()
  const config = useConfig().data
  const session = useSession().data
  const connection = useConnection().data
  const signOut = useSignOut()
  const admin = !!config && !config.free_mode && session?.role === 'admin'
  const server = useServerSettings(admin)
  const dataLoss = useDataLossText(server.data?.data_loss)
  const byKey = new Map((server.data?.settings ?? []).map((s) => [s.key, s]))
  const fields = (...keys: string[]) =>
    keys
      .map((k) => byKey.get(k))
      .filter((s): s is Setting => !!s)
      .map((s) => <ServerSetting key={s.key} setting={s} kind={kinds[s.key] ?? 'text'} />)

  return (
    <Card className="flex flex-1 flex-col">
      <header className="flex h-14 shrink-0 items-center border-b border-border px-5">
        <h1 className="text-[19px] font-semibold">{t('settings.title')}</h1>
      </header>
      <div className="min-h-0 flex-1 overflow-auto">
        <div className="flex max-w-2xl flex-col gap-8 p-5">
          <Section title={t('settings.general')}>
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
            <Row label={t('language.label')}>
              <LanguageSwitch />
            </Row>
            <Row label={t('settings.density.label')}>
              <SegmentedControl<Density>
                label={t('settings.density.label')}
                value={density}
                onChange={setDensity}
                options={(['comfortable', 'compact'] as const).map((v) => ({
                  value: v,
                  label: t(`settings.density.${v}`),
                }))}
              />
            </Row>
            {admin && fields('lang')}
          </Section>

          {admin && server.data && !server.data.data_persistent && (
            <p
              role="note"
              className="rounded-[12px] border border-border bg-surface-2 p-3 text-[12.5px]"
            >
              {dataLoss}
            </p>
          )}

          {admin && <ConnectionsSection />}
          {admin && (
            <Section title={t('settings.pools')}>
              {fields('max_conns', 'max_pools', 'pool_idle_timeout')}
            </Section>
          )}

          {admin && (
            <Section title={t('settings.security')}>
              <div className="flex flex-col gap-3 py-2.5">
                <span className="font-medium">{t('settings.account')}</span>
                {!config.auth_enabled ? (
                  <p className="text-[12.5px] text-muted">{t('settings.noAccount')}</p>
                ) : session?.account_locked ? (
                  <p className="flex items-center gap-1.5 text-[12.5px] text-muted">
                    <Lock className="size-3.5" aria-hidden />
                    {t('settings.accountLocked', { user: session.username })}
                  </p>
                ) : (
                  <>
                    <p className="text-[12.5px] text-muted">
                      {t('settings.signedInAs', { user: session?.username ?? '' })}
                    </p>
                    <PasswordForm username={session?.username ?? ''} />
                  </>
                )}
                {config.auth_enabled && (
                  <div>
                    <Button onClick={signOut}>
                      <LogOut className="size-4" aria-hidden />
                      {t('auth.signOut')}
                    </Button>
                  </div>
                )}
              </div>
              {fields('session_ttl', 'allowed_hosts', 'read_only')}
            </Section>
          )}

          {admin && (
            <Section title={t('settings.sqlEditor')}>
              {fields('statement_timeout', 'sql_max_rows', 'import_timeout')}
            </Section>
          )}

          <Section title={t('settings.about')}>
            <Row label={t('settings.version')}>
              <span className="font-mono text-[12.5px]">{config?.version}</span>
            </Row>
            {connection && (
              <Row label={t('settings.postgresVersion')}>
                <span className="font-mono text-[12.5px]">{connection.server_version}</span>
              </Row>
            )}
            <Row label={t('settings.links')}>
              <TextLink href={REPO_URL}>{t('settings.repository')}</TextLink>
            </Row>
            <Row label={t('settings.license')}>
              <span className="flex flex-wrap justify-end gap-x-3 gap-y-1">
                {/* Relative to <base href>: files generated by `task licenses` and embedded with the UI */}
                <TextLink href="licenses/LICENSE.txt">{t('settings.licenseName')}</TextLink>
                <TextLink href="licenses/NOTICE.txt">{t('settings.notice')}</TextLink>
                <TextLink href="licenses/THIRD_PARTY_NOTICES.txt">
                  {t('settings.licenses')}
                </TextLink>
              </span>
            </Row>
          </Section>
        </div>
      </div>
    </Card>
  )
}
