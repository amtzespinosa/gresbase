import { useMutation } from '@tanstack/react-query'
import { CheckCircle2 } from 'lucide-react'
import { type FormEvent, useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { Input } from '@/components/ui/Input'
import { ConnectionForm } from '@/features/setup/ConnectionForm'
import { withFixed } from '@/features/setup/fixedFields'
import { emptyConnection } from '@/features/setup/connectionUrl'
import { labelColor, labelColors, testConnection, useConnectionAction } from '@/lib/api/connections'
import { connectionErrorMessage, errorMessage } from '@/lib/api/errors'
import { useConfig } from '@/lib/api/queries'
import type { ConnectionEntry, ConnectionInput, LabelColor } from '@/lib/api/types.gen'
import { cn } from '@/lib/cn'

/** Create (no `entry`) or edit a saved connection: name, label color, connection data, test. */
export function ConnectionDialog({
  open,
  onOpenChange,
  entry,
  onSaved,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  entry?: ConnectionEntry
  onSaved?: (saved: ConnectionEntry) => void
}) {
  return open ? <Body {...{ onOpenChange, entry, onSaved }} /> : null
}

function Body({
  onOpenChange,
  entry,
  onSaved,
}: {
  onOpenChange: (open: boolean) => void
  entry?: ConnectionEntry
  onSaved?: (saved: ConnectionEntry) => void
}) {
  const { t } = useTranslation()
  const id = useId()
  const config = useConfig().data
  const action = useConnectionAction()
  const [name, setName] = useState(entry?.name ?? '')
  const [color, setColor] = useState<LabelColor>(entry?.color ?? 'gray')
  const [conn, setConn] = useState<ConnectionInput>(() =>
    entry
      ? {
          host: entry.host,
          port: entry.port,
          database: entry.database,
          user: entry.user,
          password: '',
          sslmode: (entry.sslmode || 'prefer') as ConnectionInput['sslmode'],
          read_only: entry.read_only,
        }
      : emptyConnection(),
  )
  const test = useMutation({ mutationFn: () => testConnection(conn, entry?.id) })
  const sent = withFixed(conn, config)
  const valid = sent.host.trim() !== '' && sent.user.trim() !== ''

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!valid) return
    const body = { name, color, connection: conn }
    action.mutate(entry ? { kind: 'update', id: entry.id, body } : { kind: 'create', body }, {
      onSuccess: (saved) => {
        onOpenChange(false)
        if (saved) onSaved?.(saved)
      },
    })
  }

  return (
    <Dialog
      open
      onOpenChange={onOpenChange}
      title={entry ? t('connections.editTitle', { name: entry.name }) : t('connections.newTitle')}
      footer={
        <>
          <Button onClick={() => onOpenChange(false)}>{t('confirm.cancel')}</Button>
          <Button variant="primary" type="submit" form={id} disabled={!valid || action.isPending}>
            {action.isPending ? t('connections.saving') : t('connections.save')}
          </Button>
        </>
      }
    >
      <form id={id} onSubmit={submit} className="flex max-h-[65vh] flex-col gap-4 overflow-y-auto">
        <label className="flex flex-col gap-1.5">
          <span className="section-label">{t('connections.name')}</span>
          <Input
            name="name"
            value={name}
            maxLength={100}
            placeholder={conn.database || t('connections.namePlaceholder')}
            autoComplete="off"
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <fieldset className="flex flex-col gap-1.5">
          <legend className="section-label mb-1.5">{t('connections.color')}</legend>
          <div className="flex gap-2">
            {labelColors.map((c) => (
              <label
                key={c}
                className={cn(
                  'grid size-7 cursor-pointer place-items-center rounded-full border-2',
                  color === c ? 'border-text' : 'border-transparent',
                  'has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-accent',
                )}
              >
                <input
                  type="radio"
                  name="color"
                  value={c}
                  checked={color === c}
                  onChange={() => setColor(c)}
                  className="sr-only"
                  aria-label={t(`connections.colors.${c}`)}
                />
                <span
                  aria-hidden
                  className="size-5 rounded-full"
                  style={{ background: labelColor(c) }}
                />
              </label>
            ))}
          </div>
        </fieldset>
        <ConnectionForm
          value={conn}
          onChange={(v) => {
            setConn(v)
            test.reset()
          }}
          fixed={config}
          passwordPlaceholder={entry ? t('connections.keepPassword') : undefined}
          showReadOnly
        />
        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" disabled={!valid || test.isPending} onClick={() => test.mutate()}>
            {test.isPending ? t('setup.connection.testing') : t('setup.connection.test')}
          </Button>
          <span aria-live="polite" className="min-w-0 text-[13px]">
            {test.data && (
              <span className="flex items-center gap-1.5 text-success">
                <CheckCircle2 className="size-4 shrink-0" aria-hidden />
                {t('setup.connection.ok', { version: test.data.server_version })} ·{' '}
                {t(`setup.support.${test.data.support_level}`)}
              </span>
            )}
            {test.isError && (
              <span className="text-danger">{connectionErrorMessage(test.error, t)}</span>
            )}
          </span>
        </div>
        {action.isError && (
          <p role="alert" className="text-[12px] text-danger">
            {errorMessage(action.error, t)}
          </p>
        )}
      </form>
    </Dialog>
  )
}
