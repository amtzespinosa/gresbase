import { Lock, MonitorSmartphone } from 'lucide-react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Tooltip } from '@/components/ui/Tooltip'
import { useConfig, useReadOnly } from '@/lib/api/queries'
import { cn } from '@/lib/cn'

/** Sidebar notices about how this instance is exposed: read-only mode and no login. */
export function AccessNotices({ collapsed }: { collapsed: boolean }) {
  const { t } = useTranslation()
  const config = useConfig().data
  const readOnly = useReadOnly()
  if (!config) return null
  return (
    <div className={cn('flex flex-col gap-1', collapsed ? 'items-center' : 'items-start px-1')}>
      {readOnly && (
        <Notice
          collapsed={collapsed}
          icon={<Lock />}
          label={t('access.readOnly')}
          hint={t('access.readOnlyHint')}
          className="bg-accent-tint text-accent-ink"
        />
      )}
      {!config.auth_enabled && (
        <Notice
          collapsed={collapsed}
          icon={<MonitorSmartphone />}
          label={t('access.localOnly')}
          hint={t('access.localOnlyHint')}
          className="text-muted"
        />
      )}
    </div>
  )
}

interface NoticeProps {
  collapsed: boolean
  icon: ReactNode
  label: string
  hint: string
  className: string
}

function Notice({ collapsed, icon, label, hint, className }: NoticeProps) {
  return (
    <Tooltip content={hint} side={collapsed ? 'right' : 'top'}>
      <span
        tabIndex={0}
        aria-label={collapsed ? `${label}. ${hint}` : undefined}
        aria-description={collapsed ? undefined : hint}
        className={cn(
          'inline-flex items-center gap-1.5 rounded-[8px] text-[11px] font-medium outline-none',
          'focus-visible:outline-2 focus-visible:outline-accent [&_svg]:size-3.5 [&_svg]:shrink-0',
          collapsed ? 'size-9 justify-center' : 'h-6 px-2',
          className,
        )}
      >
        {icon}
        {!collapsed && label}
      </span>
    </Tooltip>
  )
}
