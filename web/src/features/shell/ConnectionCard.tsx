import { useNavigate } from '@tanstack/react-router'
import {
  AlertTriangle,
  ArrowLeftRight,
  Check,
  ChevronsUpDown,
  MoreHorizontal,
  Unplug,
} from 'lucide-react'
import { DropdownMenu as M } from 'radix-ui'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { LabelDot } from '@/components/LabelDot'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { IconButton } from '@/components/ui/IconButton'
import { Tooltip } from '@/components/ui/Tooltip'
import { ApiError } from '@/lib/api/client'
import { SignOutWarnings } from '@/features/auth/SignOutDialog'
import { useSignOut } from '@/features/auth/useSignOut'
import {
  labelColor,
  useConnectionEntry,
  useConnectionId,
  useConnections,
  useConnectionStatus,
} from '@/lib/api/connections'
import { useConfig, useConnection } from '@/lib/api/queries'
import type { ConnectionEntry } from '@/lib/api/types.gen'
import { cn } from '@/lib/cn'

export function ConnectionCard({ collapsed }: { collapsed: boolean }) {
  const { t } = useTranslation()
  const { data, error, isPending, isError } = useConnection()
  const free = useConfig().data?.free_mode
  const id = useConnectionId()
  const entry = useConnectionEntry(id)
  const connections = useConnections().data?.connections ?? []

  const major = data ? Math.floor(data.server_version_num / 10000) : 0
  const title = isPending
    ? t('connection.loading')
    : isError
      ? error instanceof ApiError && error.code === 'unsupported_version'
        ? t('errors.unsupported_version')
        : t('connection.error')
      : (entry?.name ?? data.database)
  const subtitle = data
    ? t('connection.server', { host: data.host, port: data.port, major })
    : undefined
  // Legacy (12, 13) and pre-release servers get a discreet notice.
  const notice =
    data?.support_level === 'legacy'
      ? t('connection.legacy', { major })
      : data?.support_level === 'prerelease'
        ? t('connection.prerelease', { version: data.server_version })
        : undefined
  const dot = (
    <span
      aria-hidden
      className={cn(
        'size-2 shrink-0 rounded-full',
        isPending ? 'animate-pulse bg-muted' : isError ? 'bg-danger' : 'bg-success',
      )}
    />
  )
  // The label color of the connection, so production is never mistaken for a test database.
  const stripe = entry && (
    <span
      aria-hidden
      className="absolute inset-y-2 left-0 w-1 rounded-r-full"
      style={{ background: labelColor(entry.color) }}
    />
  )

  if (collapsed) {
    const label = [title, subtitle, notice].filter(Boolean).join(' · ')
    return (
      <Tooltip content={label} side="right">
        <div
          tabIndex={0}
          aria-label={label}
          className="relative flex h-9 w-9 items-center justify-center rounded-[9px]"
        >
          {stripe}
          {dot}
        </div>
      </Tooltip>
    )
  }
  return (
    <div
      className="relative rounded-[12px] border border-border bg-surface-2 px-3 py-2.5"
      aria-live="polite"
    >
      {stripe}
      <div className="flex items-center gap-2">
        {dot}
        <span className="min-w-0 flex-1 truncate font-medium">{title}</span>
        {connections.length > 1 && <Switcher current={id} connections={connections} />}
        {free && <SessionMenu />}
      </div>
      {subtitle && (
        <div className="mt-0.5 truncate pl-4 font-mono text-[11px] text-muted">{subtitle}</div>
      )}
      {notice && (
        <div className="mt-1 flex items-start gap-1 pl-4 text-[11px] text-muted">
          <AlertTriangle aria-hidden className="mt-px size-3 shrink-0" />
          <span>{notice}</span>
        </div>
      )}
    </div>
  )
}

const itemClass =
  'flex min-h-9 cursor-pointer items-center gap-2 rounded-[8px] px-2 py-1 text-text outline-none ' +
  'data-[highlighted]:bg-surface-2'

/** Free mode: switch connection or disconnect, each after a confirmation. */
function SessionMenu() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const signOut = useSignOut()
  const [confirm, setConfirm] = useState<'switch' | 'disconnect' | null>(null)
  return (
    <>
      <M.Root>
        <M.Trigger asChild>
          <IconButton
            label={t('connect.menu')}
            icon={<MoreHorizontal />}
            tooltip={false}
            className="-my-1 size-6 shrink-0"
          />
        </M.Trigger>
        <M.Portal>
          <M.Content
            side="top"
            align="end"
            sideOffset={6}
            className="z-50 min-w-52 rounded-[var(--radius-control)] border border-border bg-surface p-1 shadow-card"
          >
            <M.Item className={itemClass} onSelect={() => setConfirm('switch')}>
              <ArrowLeftRight className="size-4" aria-hidden />
              {t('connect.switch')}
            </M.Item>
            <M.Item className={itemClass} onSelect={() => setConfirm('disconnect')}>
              <Unplug className="size-4" aria-hidden />
              {t('connect.disconnect')}
            </M.Item>
          </M.Content>
        </M.Portal>
      </M.Root>
      <ConfirmDialog
        open={confirm === 'switch'}
        onOpenChange={(o) => !o && setConfirm(null)}
        level="info"
        title={t('connect.switchConfirm.title')}
        description={t('connect.switchConfirm.description')}
        confirmLabel={t('connect.switch')}
        onConfirm={() => {
          setConfirm(null)
          void navigate({ to: '/login' })
        }}
      />
      <ConfirmDialog
        open={confirm === 'disconnect'}
        onOpenChange={(o) => !o && setConfirm(null)}
        level="warning"
        title={t('connect.disconnectConfirm.title')}
        description={t('connect.disconnectConfirm.description')}
        confirmLabel={t('connect.disconnect')}
        onConfirm={() => {
          setConfirm(null)
          void signOut()
        }}
      >
        <SignOutWarnings />
      </ConfirmDialog>
    </>
  )
}

/** The connection selector: every connection with its color, status and version. */
function Switcher({ current, connections }: { current: string; connections: ConnectionEntry[] }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  return (
    <M.Root open={open} onOpenChange={setOpen}>
      <M.Trigger asChild>
        <button
          type="button"
          aria-label={t('connections.switch')}
          className="grid size-6 shrink-0 cursor-pointer place-items-center rounded-[6px] text-muted hover:bg-surface hover:text-text"
        >
          <ChevronsUpDown className="size-3.5" aria-hidden />
        </button>
      </M.Trigger>
      <M.Portal>
        <M.Content
          side="top"
          align="start"
          sideOffset={6}
          className="z-50 w-64 rounded-[var(--radius-control)] border border-border bg-surface p-1 shadow-card"
        >
          <M.Label className="section-label px-2 pt-1 pb-1.5">{t('connections.title')}</M.Label>
          {connections.map((c) => (
            <M.Item
              key={c.id}
              className={itemClass}
              onSelect={() =>
                c.id !== current &&
                void navigate({ to: '/c/$connectionId/tables', params: { connectionId: c.id } })
              }
            >
              <LabelDot color={c.color} />
              <span className="min-w-0 flex-1">
                <span className="block truncate">{c.name}</span>
                <Status id={c.id} enabled={open} />
              </span>
              {c.id === current && <Check className="size-4 text-accent-ink" aria-hidden />}
            </M.Item>
          ))}
        </M.Content>
      </M.Portal>
    </M.Root>
  )
}

function Status({ id, enabled }: { id: string; enabled: boolean }) {
  const { t } = useTranslation()
  const s = useConnectionStatus(id, enabled)
  return (
    <span className="flex items-center gap-1 font-mono text-[11px] text-muted">
      <span
        aria-hidden
        className={cn(
          'size-1.5 rounded-full',
          s.isPending ? 'bg-muted' : s.isError ? 'bg-danger' : 'bg-success',
        )}
      />
      {s.isPending
        ? t('connection.loading')
        : s.isError
          ? t('connection.error')
          : `PG ${s.data.server_version}`}
    </span>
  )
}
