import { Link } from '@tanstack/react-router'
import {
  Code2,
  LogOut,
  Monitor,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  Settings,
  Sun,
  Table2,
} from 'lucide-react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { AppIcon } from '@/components/Logo'
import { IconButton } from '@/components/ui/IconButton'
import { Kbd } from '@/components/ui/Kbd'
import { Tooltip } from '@/components/ui/Tooltip'
import { useSignOut } from '@/features/auth/useSignOut'
import { usePalette } from '@/features/palette/store'
import { labelColor, useConnectionEntry, useConnectionId } from '@/lib/api/connections'
import { useConfig } from '@/lib/api/queries'
import { cn } from '@/lib/cn'
import { isMac } from '@/lib/platform'
import { shortcutLabel } from '@/lib/shortcuts'
import { type Theme, usePrefs } from '@/lib/prefs/store'
import { AccessNotices } from './AccessNotices'
import { ConnectionCard } from './ConnectionCard'

const nextTheme: Record<Theme, Theme> = { light: 'dark', dark: 'system', system: 'light' }
const themeIcon: Record<Theme, ReactNode> = { light: <Sun />, dark: <Moon />, system: <Monitor /> }

const itemClass =
  'flex h-9 items-center gap-2.5 rounded-[9px] px-2.5 text-muted transition-colors hover:bg-surface-2 ' +
  'hover:text-text [&_svg]:size-[18px] [&_svg]:shrink-0'
const activeItem = { className: 'bg-surface-2 !text-text [&_svg]:text-accent-ink' }

interface SidebarProps {
  collapsed: boolean
  onToggle: () => void
}

export function Sidebar({ collapsed, onToggle }: SidebarProps) {
  const { t } = useTranslation()
  const { theme, setTheme } = usePrefs()
  const authEnabled = useConfig().data?.auth_enabled
  const signOut = useSignOut()
  const openPalette = usePalette((s) => s.setOpen)
  const side = collapsed ? 'right' : 'top'
  const connectionId = useConnectionId()
  const entry = useConnectionEntry(connectionId)

  const nav = [
    { to: '/c/$connectionId/tables', label: t('nav.tables'), icon: <Table2 /> },
    { to: '/c/$connectionId/sql', label: t('nav.sql'), icon: <Code2 /> },
  ] as const

  return (
    <aside
      aria-label={t('app.name')}
      data-collapsed={collapsed}
      className={cn(
        'relative flex shrink-0 flex-col gap-1 rounded-[var(--radius-card)] border border-border bg-surface p-3 shadow-card',
        'transition-[width] duration-200',
        collapsed ? 'w-16 items-center px-2' : 'w-[236px]',
      )}
    >
      {entry && (
        <span
          aria-hidden
          data-testid="connection-stripe"
          className="absolute inset-x-5 top-0 h-[3px] rounded-b-full"
          style={{ background: labelColor(entry.color) }}
        />
      )}
      <div className={cn('mb-2 flex h-9 items-center gap-2.5', !collapsed && 'px-1')}>
        <AppIcon size={30} glow />
        {!collapsed && (
          <span className="text-[17px] font-semibold tracking-[-0.04em]">{t('app.name')}</span>
        )}
      </div>

      <Tooltip content={t('nav.search')} side="right" enabled={collapsed}>
        <button
          type="button"
          aria-label={t('nav.search')}
          aria-keyshortcuts={isMac ? 'Meta+K' : 'Control+K'}
          onClick={() => openPalette('palette')}
          className={cn(
            itemClass,
            'mb-2 cursor-pointer border border-border bg-surface-2',
            collapsed ? 'w-9 justify-center px-0' : 'w-full',
          )}
        >
          <Search />
          {!collapsed && (
            <>
              <span className="flex-1 text-left">{t('nav.search')}</span>
              <Kbd>{shortcutLabel('palette')}</Kbd>
            </>
          )}
        </button>
      </Tooltip>

      <nav className={cn('flex flex-col gap-0.5', collapsed ? 'items-center' : 'w-full')}>
        {nav.map((item) => (
          <Tooltip key={item.to} content={item.label} side="right" enabled={collapsed}>
            <Link
              to={item.to}
              params={{ connectionId }}
              aria-label={collapsed ? item.label : undefined}
              className={cn(itemClass, collapsed ? 'w-9 justify-center px-0' : 'w-full')}
              activeProps={activeItem}
            >
              {item.icon}
              {!collapsed && <span>{item.label}</span>}
            </Link>
          </Tooltip>
        ))}
      </nav>

      <div className={cn('mt-auto flex flex-col gap-2', collapsed ? 'items-center' : 'w-full')}>
        <AccessNotices collapsed={collapsed} />
        <ConnectionCard collapsed={collapsed} />
        <div className={cn('flex gap-1', collapsed ? 'flex-col items-center' : 'items-center')}>
          <IconButton
            label={t('theme.toggle', { theme: t(`theme.${theme}`) })}
            icon={themeIcon[theme]}
            tooltipSide={side}
            onClick={() => setTheme(nextTheme[theme])}
          />
          <Tooltip content={t('nav.settings')} side={side}>
            <Link
              to="/c/$connectionId/settings"
              params={{ connectionId }}
              aria-label={t('nav.settings')}
              className={cn(itemClass, 'size-8 justify-center px-0')}
              activeProps={activeItem}
            >
              <Settings />
            </Link>
          </Tooltip>
          {authEnabled && (
            <IconButton
              label={t('auth.signOut')}
              icon={<LogOut />}
              tooltipSide={side}
              onClick={signOut}
            />
          )}
          <IconButton
            label={collapsed ? t('nav.expand') : t('nav.collapse')}
            icon={collapsed ? <PanelLeftOpen /> : <PanelLeftClose />}
            tooltipSide={side}
            className={collapsed ? undefined : 'ml-auto'}
            aria-keyshortcuts={isMac ? 'Meta+B' : 'Control+B'}
            onClick={onToggle}
          />
        </div>
      </div>
    </aside>
  )
}
