import { useNavigate } from '@tanstack/react-router'
import { Command } from 'cmdk'
import {
  Clock,
  FileCode,
  Keyboard,
  Languages,
  LogOut,
  Monitor,
  Moon,
  PanelLeft,
  Plus,
  Search,
  Settings,
  Star,
  Sun,
  Table2,
} from 'lucide-react'
import { Dialog as D } from 'radix-ui'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Dialog } from '@/components/ui/Dialog'
import { Kbd } from '@/components/ui/Kbd'
import { Flag } from '@/components/Flag'
import { LabelDot } from '@/components/LabelDot'
import { useSignOut } from '@/features/auth/useSignOut'
import { useSqlEditor } from '@/features/sql/store'
import { useConfig } from '@/lib/api/queries'
import { useConnectionId, useConnections } from '@/lib/api/connections'
import { connectionFolder, snippetName, useSnippets, visibleOn } from '@/lib/api/snippets'
import { useCompletions } from '@/lib/api/sql'
import { cn } from '@/lib/cn'
import { LANGS } from '@/lib/i18n'
import {
  isSidebarCollapsed,
  type RecentItem,
  recentConnection,
  type Theme,
  usePrefs,
} from '@/lib/prefs/store'
import { useConnectionTables } from '@/features/tables/tabs'
import { shortcutLabel, shortcuts, type ShortcutId, useShortcut } from '@/lib/shortcuts'
import { usePalette } from './store'

const themeIcons: Record<Theme, ReactNode> = { light: <Sun />, dark: <Moon />, system: <Monitor /> }

const groupClass =
  'px-1 pb-1 [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:pt-2 [&_[cmdk-group-heading]]:pb-1 ' +
  '[&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-medium ' +
  '[&_[cmdk-group-heading]]:tracking-[.05em] [&_[cmdk-group-heading]]:text-muted ' +
  '[&_[cmdk-group-heading]]:uppercase'

/** Opens with ⌘K / Ctrl+K or the sidebar search button: jump to tables and saved queries, run actions. */
export function CommandPalette() {
  const { t } = useTranslation()
  const open = usePalette((s) => s.open === 'palette')
  const setOpen = usePalette((s) => s.setOpen)
  const close = () => setOpen(null)

  useShortcut('palette', () => setOpen(open ? null : 'palette'))

  return (
    <D.Root open={open} onOpenChange={(o) => setOpen(o ? 'palette' : null)}>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-40 bg-black/40" />
        <D.Content
          className={cn(
            'fixed top-[15vh] left-1/2 z-50 w-[calc(100vw-24px)] max-w-[560px] -translate-x-1/2',
            'overflow-hidden rounded-[var(--radius-card)] border border-border bg-surface shadow-card',
          )}
        >
          <D.Title className="sr-only">{t('palette.title')}</D.Title>
          <D.Description className="sr-only">{t('palette.description')}</D.Description>
          {open && <PaletteBody onDone={close} />}
        </D.Content>
      </D.Portal>
    </D.Root>
  )
}

function PaletteBody({ onDone }: { onDone: () => void }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const prefs = usePrefs()
  const authEnabled = useConfig().data?.auth_enabled === true
  const all = useCompletions().data?.tables ?? []
  // Partitions stay reachable from their parent in the table browser.
  const tables = all.filter((x) => !x.partition)
  const connectionId = useConnectionId()
  const snippets = (useSnippets().data ?? []).filter(
    (e) => !e.folder && visibleOn(e.path, connectionId),
  )
  // Other connections to switch to (the administrator's saved ones).
  const others = (useConnections().data?.connections ?? []).filter((c) => c.id !== connectionId)
  const signOut = useSignOut()
  const setOpen = usePalette((s) => s.setOpen)

  const run = (action: () => void) => () => {
    onDone()
    action()
  }
  const openTable = (schema: string, table: string) =>
    void navigate({
      to: '/c/$connectionId/tables/$schema/$table',
      params: { connectionId, schema, table },
    })
  const openSnippet = (path: string) =>
    void navigate({
      to: '/c/$connectionId/sql/$snippetId',
      params: { connectionId, snippetId: path },
    })

  const exists = (schema: string, table: string) =>
    all.some((x) => x.schema === schema && x.name === table)
  const favorites = useConnectionTables(connectionId).favorites.filter((f) =>
    exists(f.schema, f.table),
  )
  // Recent items of this connection that still exist (a table may have been dropped, a query renamed).
  const recent = prefs.recent.filter(
    (r) =>
      recentConnection(r) === connectionId &&
      (r.kind === 'table' ? exists(r.schema, r.table) : snippets.some((s) => s.path === r.path)),
  )
  const recentLabel = (r: RecentItem) =>
    r.kind === 'table' ? `${r.schema}.${r.table}` : snippetName(r.path)

  return (
    <Command label={t('palette.title')} loop>
      <div className="flex items-center gap-2 border-b border-border px-4">
        <Search className="size-4 shrink-0 text-muted" aria-hidden />
        <Command.Input
          placeholder={t('palette.placeholder')}
          className="h-12 flex-1 bg-transparent text-[14px] outline-none placeholder:text-muted"
        />
        <Kbd>{t('palette.esc')}</Kbd>
      </div>
      <Command.List className="max-h-[min(420px,60vh)] overflow-y-auto py-1">
        <Command.Empty className="px-4 py-6 text-center text-muted">
          {t('palette.empty')}
        </Command.Empty>

        {recent.length > 0 && (
          <Command.Group heading={t('palette.recent')} className={groupClass}>
            {recent.map((r) => (
              <Item
                key={`recent:${recentLabel(r)}:${r.kind}`}
                value={`recent ${r.kind} ${recentLabel(r)}`}
                icon={<Clock />}
                onSelect={run(() =>
                  r.kind === 'table' ? openTable(r.schema, r.table) : openSnippet(r.path),
                )}
              >
                <span className="font-mono">{recentLabel(r)}</span>
              </Item>
            ))}
          </Command.Group>
        )}

        {favorites.length > 0 && (
          <Command.Group heading={t('palette.favorites')} className={groupClass}>
            {favorites.map((f) => (
              <Item
                key={`fav:${f.schema}.${f.table}`}
                value={`favorite ${f.schema}.${f.table}`}
                icon={<Star />}
                onSelect={run(() => openTable(f.schema, f.table))}
              >
                <span className="font-mono">
                  <span className="text-muted">{f.schema}.</span>
                  {f.table}
                </span>
              </Item>
            ))}
          </Command.Group>
        )}

        {tables.length > 0 && (
          <Command.Group heading={t('palette.tables')} className={groupClass}>
            {tables.map((x) => (
              <Item
                key={`${x.schema}.${x.name}`}
                value={`table ${x.schema}.${x.name}`}
                icon={<Table2 />}
                onSelect={run(() => openTable(x.schema, x.name))}
              >
                <span className="font-mono">
                  <span className="text-muted">{x.schema}.</span>
                  {x.name}
                </span>
              </Item>
            ))}
          </Command.Group>
        )}

        {snippets.length > 0 && (
          <Command.Group heading={t('palette.snippets')} className={groupClass}>
            {snippets.map((s) => (
              <Item
                key={s.path}
                value={`query ${s.path}`}
                icon={<FileCode />}
                onSelect={run(() => openSnippet(s.path))}
              >
                <span className="font-mono">
                  {s.path.replace(`${connectionFolder(connectionId)}/`, '').replace(/\.sql$/, '')}
                </span>
              </Item>
            ))}
          </Command.Group>
        )}

        {others.length > 0 && (
          <Command.Group heading={t('palette.connections')} className={groupClass}>
            {others.map((c) => (
              <Item
                key={c.id}
                value={`connection ${c.name} ${c.database} ${c.id}`}
                icon={<LabelDot color={c.color} />}
                onSelect={run(
                  () =>
                    void navigate({
                      to: '/c/$connectionId/tables',
                      params: { connectionId: c.id },
                    }),
                )}
              >
                {t('palette.switchTo', { name: c.name })}
              </Item>
            ))}
          </Command.Group>
        )}

        <Command.Group heading={t('palette.actions')} className={groupClass}>
          <Item
            value={t('palette.newQuery')}
            icon={<Plus />}
            onSelect={run(() => {
              useSqlEditor.getState().newTab()
              void navigate({ to: '/c/$connectionId/sql', params: { connectionId } })
            })}
          >
            {t('palette.newQuery')}
          </Item>
          {(['light', 'dark', 'system'] as const).map((theme) => (
            <Item
              key={theme}
              value={t('palette.theme', { theme: t(`theme.${theme}`) })}
              icon={themeIcons[theme]}
              onSelect={run(() => prefs.setTheme(theme))}
            >
              {t('palette.theme', { theme: t(`theme.${theme}`) })}
            </Item>
          ))}
          {LANGS.map((lang) => (
            <Item
              key={lang}
              value={`${t('palette.language', { language: t(`language.${lang}`) })} ${lang}`}
              icon={<Languages />}
              onSelect={run(() => prefs.setLang(lang))}
            >
              {t('palette.language', { language: t(`language.${lang}`) })}
              <Flag lang={lang} className="ml-1" />
            </Item>
          ))}
          <Item
            value={t('palette.toggleSidebar')}
            icon={<PanelLeft />}
            shortcut="toggleSidebar"
            onSelect={run(() =>
              prefs.setSidebarCollapsed(!isSidebarCollapsed(prefs.sidebarCollapsed)),
            )}
          >
            {t('palette.toggleSidebar')}
          </Item>
          <Item
            value={t('nav.settings')}
            icon={<Settings />}
            onSelect={run(
              () => void navigate({ to: '/c/$connectionId/settings', params: { connectionId } }),
            )}
          >
            {t('nav.settings')}
          </Item>
          <Item
            value={t('palette.shortcuts')}
            icon={<Keyboard />}
            shortcut="help"
            onSelect={() => setOpen('help')}
          >
            {t('palette.shortcuts')}
          </Item>
          {authEnabled && (
            <Item value={t('auth.signOut')} icon={<LogOut />} onSelect={run(signOut)}>
              {t('auth.signOut')}
            </Item>
          )}
        </Command.Group>
      </Command.List>
    </Command>
  )
}

function Item({
  value,
  icon,
  shortcut,
  onSelect,
  children,
}: {
  value: string
  icon: ReactNode
  shortcut?: ShortcutId
  onSelect: () => void
  children: ReactNode
}) {
  return (
    <Command.Item
      value={value}
      onSelect={onSelect}
      className={cn(
        'flex h-9 cursor-pointer items-center gap-2.5 rounded-[9px] px-2.5 text-muted',
        'data-[selected=true]:bg-surface-2 data-[selected=true]:text-text',
        '[&_svg]:size-4 [&_svg]:shrink-0 data-[selected=true]:[&_svg]:text-accent-ink',
      )}
    >
      {icon}
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {shortcut && <Keys id={shortcut} />}
    </Command.Item>
  )
}

function Keys({ id }: { id: ShortcutId }) {
  return (
    <span className="flex gap-1">
      {shortcutLabel(id)
        .split(' ')
        .map((k) => (
          <Kbd key={k}>{k}</Kbd>
        ))}
    </span>
  )
}

/** `?` (or the palette action): every shortcut, generated from the central registry. */
export function ShortcutHelp() {
  const { t } = useTranslation()
  const open = usePalette((s) => s.open === 'help')
  const setOpen = usePalette((s) => s.setOpen)

  useShortcut('help', () => setOpen(open ? null : 'help'))

  return (
    <Dialog open={open} onOpenChange={(o) => setOpen(o ? 'help' : null)} title={t('help.title')}>
      <ul className="flex flex-col divide-y divide-border">
        {(Object.keys(shortcuts) as ShortcutId[]).map((id) => (
          <li key={id} className="flex items-center justify-between gap-4 py-2">
            <span>{t(shortcuts[id].label)}</span>
            <Keys id={id} />
          </li>
        ))}
      </ul>
    </Dialog>
  )
}
