import { Link, useNavigate, useParams } from '@tanstack/react-router'
import { ArrowLeft, ArrowRight, X } from 'lucide-react'
import { ContextMenu as CM } from 'radix-ui'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useConnectionId } from '@/lib/api/connections'
import { cn } from '@/lib/cn'
import { useShortcut } from '@/lib/shortcuts'
import { isSameTable, type TableRef, useConnectionTables, useTableTabs } from './tabs'

const menuItem =
  'flex h-8 cursor-pointer items-center gap-2 rounded-[8px] px-2 text-text outline-none ' +
  'data-[highlighted]:bg-surface-2 data-[disabled]:cursor-default data-[disabled]:text-muted ' +
  '[&_svg]:size-4 [&_svg]:text-muted'

/**
 * Open tables of the connection, as tabs above the table card: close (× or Alt+W), close others,
 * reorder (drag, or "Move left/right" in the right-click menu for the keyboard).
 */
export function TableTabs() {
  const { t } = useTranslation()
  const connectionId = useConnectionId()
  const navigate = useNavigate()
  const params = useParams({ strict: false })
  const { tabs } = useConnectionTables(connectionId)
  const { closeTabs, moveTab } = useTableTabs.getState()
  const [dragging, setDragging] = useState<number | null>(null)

  const active = tabs.findIndex((r) => r.schema === params.schema && r.table === params.table)

  /** Closes tabs; if the open table was among them, opens its neighbor (or the table list). */
  const close = (keep: (r: TableRef) => boolean) => {
    const current = tabs[active]
    closeTabs(connectionId, keep)
    if (!current || keep(current)) return
    const rest = tabs.filter(keep)
    const next = rest[Math.min(active, rest.length - 1)]
    void navigate(
      next
        ? {
            to: '/c/$connectionId/tables/$schema/$table',
            params: { connectionId, schema: next.schema, table: next.table },
          }
        : { to: '/c/$connectionId/tables', params: { connectionId } },
    )
  }
  const closeOne = (ref: TableRef) => close((r) => !isSameTable(r, ref))

  useShortcut('closeTab', () => {
    const current = tabs[active]
    if (!current) return false
    closeOne(current)
  })

  if (tabs.length === 0) return null
  return (
    <nav aria-label={t('tabs.label')} className="shrink-0 border-b border-border">
      <ul className="flex gap-0.5 overflow-x-auto px-2 pt-1.5">
        {tabs.map((ref, i) => (
          <li
            key={`${ref.schema}.${ref.table}`}
            draggable
            onDragStart={() => setDragging(i)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => {
              if (dragging !== null) moveTab(connectionId, dragging, i)
              setDragging(null)
            }}
            onDragEnd={() => setDragging(null)}
            className={cn(
              'group flex h-8 max-w-56 shrink-0 items-center rounded-t-[9px] border border-b-0',
              i === active
                ? 'border-border bg-surface-2 text-text'
                : 'border-transparent text-muted hover:text-text',
              dragging === i && 'opacity-50',
            )}
          >
            <CM.Root>
              <CM.Trigger asChild>
                <Link
                  to="/c/$connectionId/tables/$schema/$table"
                  params={{ connectionId, schema: ref.schema, table: ref.table }}
                  aria-current={i === active ? 'page' : undefined}
                  title={`${ref.schema}.${ref.table}`}
                  onAuxClick={(e) => {
                    if (e.button !== 1) return // middle click closes, as in browsers
                    e.preventDefault()
                    closeOne(ref)
                  }}
                  className="flex h-full min-w-0 items-center pl-3 font-mono text-[12.5px]"
                >
                  {ref.schema !== 'public' && (
                    <span className="shrink-0 text-muted">{ref.schema}.</span>
                  )}
                  <span className="truncate">{ref.table}</span>
                </Link>
              </CM.Trigger>
              <CM.Portal>
                <CM.Content className="z-50 min-w-48 rounded-[var(--radius-control)] border border-border bg-surface p-1 text-[13px] shadow-card">
                  <CM.Item className={menuItem} onSelect={() => closeOne(ref)}>
                    <X />
                    {t('tabs.close')}
                  </CM.Item>
                  <CM.Item
                    className={menuItem}
                    disabled={tabs.length < 2}
                    onSelect={() => close((r) => isSameTable(r, ref))}
                  >
                    {t('tabs.closeOthers')}
                  </CM.Item>
                  <CM.Item
                    className={menuItem}
                    disabled={i === 0}
                    onSelect={() => moveTab(connectionId, i, i - 1)}
                  >
                    <ArrowLeft />
                    {t('tabs.moveLeft')}
                  </CM.Item>
                  <CM.Item
                    className={menuItem}
                    disabled={i === tabs.length - 1}
                    onSelect={() => moveTab(connectionId, i, i + 1)}
                  >
                    <ArrowRight />
                    {t('tabs.moveRight')}
                  </CM.Item>
                </CM.Content>
              </CM.Portal>
            </CM.Root>
            <button
              type="button"
              aria-label={t('tabs.closeTable', { table: `${ref.schema}.${ref.table}` })}
              onClick={() => closeOne(ref)}
              className={cn(
                'mx-1 grid size-5 shrink-0 place-items-center rounded-[6px] text-muted opacity-0 group-hover:opacity-100 hover:bg-surface hover:text-text focus-visible:opacity-100',
                i === active && 'opacity-100',
              )}
            >
              <X className="size-3.5" />
            </button>
          </li>
        ))}
      </ul>
    </nav>
  )
}
