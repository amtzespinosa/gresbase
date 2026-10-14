import { useNavigate } from '@tanstack/react-router'
import { Lock, Pencil, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { LabelDot } from '@/components/LabelDot'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { IconButton } from '@/components/ui/IconButton'
import { Tooltip } from '@/components/ui/Tooltip'
import { useConnectionAction, useConnectionId, useConnections } from '@/lib/api/connections'
import { errorMessage } from '@/lib/api/errors'
import { useConfig } from '@/lib/api/queries'
import type { ConnectionEntry } from '@/lib/api/types.gen'
import { toast } from '@/lib/toast'
import { ConnectionDialog } from './ConnectionDialog'

/** Settings → Connections: the saved connections (administrator) and the locked DATABASE_URL one. */
export function ConnectionsSection() {
  const { t } = useTranslation()
  const config = useConfig().data
  const list = useConnections()
  const current = useConnectionId()
  const navigate = useNavigate()
  const action = useConnectionAction()
  const [editing, setEditing] = useState<ConnectionEntry | 'new' | null>(null)
  const [deleting, setDeleting] = useState<ConnectionEntry | null>(null)
  const connections = list.data?.connections ?? []
  // Free mode saves nothing; other sessions than the administrator get an empty list.
  if (!config || config.free_mode || connections.length === 0) return null

  const remove = (c: ConnectionEntry) =>
    action.mutate(
      { kind: 'delete', id: c.id },
      {
        onSuccess: () => {
          setDeleting(null)
          toast({ message: t('connections.deleted', { name: c.name }) })
          // This tab worked on it: go to whatever connection is left.
          if (c.id === current) void navigate({ to: '/' })
        },
        onError: (err) =>
          toast({ tone: 'danger', message: errorMessage(err, t), duration: 10_000 }),
      },
    )

  return (
    <section aria-label={t('connections.title')} className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <h2 className="section-label">{t('connections.title')}</h2>
        <Button size="sm" onClick={() => setEditing('new')}>
          <Plus className="size-4" aria-hidden />
          {t('connections.add')}
        </Button>
      </div>
      <ul className="flex flex-col divide-y divide-border rounded-[12px] border border-border">
        {connections.map((c) => (
          <li key={c.id} className="flex items-center gap-3 px-3 py-2.5">
            <LabelDot color={c.color} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="truncate font-medium">{c.name}</span>
                {c.id === current && <Badge tone="accent">{t('connections.current')}</Badge>}
                {c.read_only && <Badge>{t('access.readOnly')}</Badge>}
              </div>
              <div className="truncate font-mono text-[11px] text-muted">
                {c.user}@{c.host}:{c.port}/{c.database}
              </div>
            </div>
            {c.locked ? (
              <Tooltip content={t('connections.locked')}>
                <span
                  role="img"
                  tabIndex={0}
                  aria-label={t('connections.locked')}
                  className="text-muted"
                >
                  <Lock className="size-4" aria-hidden />
                </span>
              </Tooltip>
            ) : (
              <span className="flex">
                <IconButton
                  label={t('connections.edit', { name: c.name })}
                  icon={<Pencil />}
                  onClick={() => setEditing(c)}
                />
                <IconButton
                  label={t('connections.delete', { name: c.name })}
                  icon={<Trash2 />}
                  onClick={() => setDeleting(c)}
                />
              </span>
            )}
          </li>
        ))}
      </ul>
      <ConnectionDialog
        open={editing !== null}
        onOpenChange={(o) => !o && setEditing(null)}
        entry={editing === 'new' || editing === null ? undefined : editing}
      />
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
        level="danger"
        title={t('connections.deleteTitle', { name: deleting?.name ?? '' })}
        description={t('connections.deleteDescription')}
        confirmLabel={t('connections.deleteConfirm')}
        busy={action.isPending}
        onConfirm={() => deleting && remove(deleting)}
      />
    </section>
  )
}
