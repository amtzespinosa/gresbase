import { Lock } from 'lucide-react'
import { CheckboxField } from '@/components/ui/Checkbox'
import { type ReactNode, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import type { ConnectionInput } from '@/lib/api/types.gen'
import { parseConnectionUrl, SSL_MODES, type SslMode } from './connectionUrl'
import { type FixedFields, onlyPassword } from './fixedFields'

interface ConnectionFormProps {
  value: ConnectionInput
  onChange: (value: ConnectionInput) => void
  /** Fields fixed by GRESBASE_DB_HOST/PORT/NAME/USER: shown filled and locked. */
  fixed?: FixedFields
  /** The read-only switch (saved connections; free mode has none). */
  showReadOnly?: boolean
  /** Placeholder of the password field (editing: "leave empty to keep it"). */
  passwordPlaceholder?: string
}

function Field({
  label,
  children,
  className,
}: {
  label: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <label className={`flex min-w-0 flex-col gap-1.5 ${className ?? ''}`}>
      <span className="section-label flex items-center gap-1">{label}</span>
      {children}
    </label>
  )
}

/** Host, port, database, user, password and SSL of a Postgres connection, or a pasted URL. */
export function ConnectionForm({
  value,
  onChange,
  fixed,
  showReadOnly,
  passwordPlaceholder,
}: ConnectionFormProps) {
  const { t } = useTranslation()
  const fixedHost = fixed?.db_host || undefined
  const fixedPort = fixed?.db_port || undefined
  const fixedDatabase = fixed?.db_name || undefined
  const fixedUser = fixed?.db_user || undefined
  const passwordOnly = onlyPassword(fixed)
  const [url, setUrl] = useState('')
  const [urlInvalid, setUrlInvalid] = useState(false)
  const set = <K extends keyof ConnectionInput>(k: K, v: ConnectionInput[K]) =>
    onChange({ ...value, [k]: v })
  const lock = (env: string) => (
    <Lock className="size-3" aria-label={t('setup.connection.lockedBy', { env })} />
  )

  const applyUrl = (text: string) => {
    setUrl(text)
    if (!text.trim()) return setUrlInvalid(false)
    const parsed = parseConnectionUrl(text)
    setUrlInvalid(!parsed)
    if (parsed) onChange({ ...value, ...parsed })
  }

  return (
    <div className="grid grid-cols-6 gap-3">
      {/* With everything fixed, a URL has nothing left to fill. */}
      {!passwordOnly && (
        <Field label={t('setup.connection.url')} className="col-span-6">
          <Input
            name="url"
            aria-label={t('setup.connection.url')}
            value={url}
            placeholder={t('setup.connection.urlPlaceholder')}
            aria-invalid={urlInvalid}
            aria-describedby="connection-url-hint"
            autoComplete="off"
            spellCheck={false}
            className="font-mono text-[12px]"
            onChange={(e) => applyUrl(e.target.value)}
          />
          <span
            id="connection-url-hint"
            className={`text-[12px] ${urlInvalid ? 'text-danger' : 'text-muted'}`}
          >
            {urlInvalid ? t('setup.connection.urlInvalid') : t('setup.connection.urlHint')}
          </span>
        </Field>
      )}
      <Field
        label={
          <>
            {t('setup.connection.host')} {fixedHost && lock('GRESBASE_DB_HOST')}
          </>
        }
        className="col-span-4"
      >
        <Input
          name="host"
          value={fixedHost ?? value.host}
          disabled={!!fixedHost}
          autoComplete="off"
          spellCheck={false}
          onChange={(e) => set('host', e.target.value)}
        />
      </Field>
      <Field
        label={
          <>
            {t('setup.connection.port')} {fixedPort ? lock('GRESBASE_DB_PORT') : null}
          </>
        }
        className="col-span-2"
      >
        <Input
          name="port"
          inputMode="numeric"
          value={fixedPort ?? (value.port || '')}
          disabled={!!fixedPort}
          onChange={(e) => set('port', Number(e.target.value.replace(/\D/g, '')) || 0)}
        />
      </Field>
      <Field
        label={
          <>
            {t('setup.connection.database')} {fixedDatabase && lock('GRESBASE_DB_NAME')}
          </>
        }
        className="col-span-6"
      >
        <Input
          name="database"
          value={fixedDatabase ?? value.database}
          disabled={!!fixedDatabase}
          autoComplete="off"
          spellCheck={false}
          onChange={(e) => set('database', e.target.value)}
        />
      </Field>
      <Field
        label={
          <>
            {t('setup.connection.user')} {fixedUser && lock('GRESBASE_DB_USER')}
          </>
        }
        className="col-span-3"
      >
        <Input
          name="user"
          value={fixedUser ?? value.user}
          disabled={!!fixedUser}
          autoComplete="off"
          spellCheck={false}
          onChange={(e) => set('user', e.target.value)}
        />
      </Field>
      <Field label={t('setup.connection.password')} className="col-span-3">
        <Input
          name="password"
          type="password"
          value={value.password}
          placeholder={passwordPlaceholder}
          autoComplete="new-password"
          autoFocus={passwordOnly}
          onChange={(e) => set('password', e.target.value)}
        />
      </Field>
      <Field label={t('setup.connection.ssl')} className="col-span-3">
        <Select
          aria-label={t('setup.connection.ssl')}
          value={value.sslmode}
          onValueChange={(v) => set('sslmode', v as SslMode)}
          options={SSL_MODES.map((m) => ({ value: m, label: m }))}
        />
      </Field>
      {showReadOnly && (
        <CheckboxField
          className="col-span-3 self-end pb-1"
          label={t('setup.connection.readOnly')}
          checked={value.read_only}
          onChange={(v) => set('read_only', v)}
        />
      )}
    </div>
  )
}
