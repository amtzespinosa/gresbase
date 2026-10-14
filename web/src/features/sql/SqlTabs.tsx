import { Plus, X } from 'lucide-react'
import { type FormEvent, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/Button'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { Dialog } from '@/components/ui/Dialog'
import { IconButton } from '@/components/ui/IconButton'
import { Input } from '@/components/ui/Input'
import { cn } from '@/lib/cn'
import { PromptDialog } from './QueriesPanel'
import { hasUnsavedChanges, type SqlTab, tabLabel, useSqlEditor } from './store'

/**
 * Query tabs of the connection, above the editor: switch, new (+), close (× or middle click; asks
 * when the tab has unsaved changes), rename (double click or F2). `onOpen` follows the tab's saved
 * query in the URL.
 */
export function SqlTabs({ onOpen }: { onOpen: (tab: SqlTab) => void }) {
  const { t } = useTranslation()
  const { tabs, tabId, doc, snippet, running, newTab, selectTab, closeTab, renameTab } =
    useSqlEditor()
  const [renaming, setRenaming] = useState<SqlTab | null>(null)
  const [closing, setClosing] = useState<SqlTab | null>(null)
  // The open tab's entry is only brought up to date when another one opens.
  const live = tabs.map((tab) => (tab.id === tabId ? { ...tab, doc, snippet } : tab))
  const label = (tab: SqlTab) => tabLabel(tab) ?? t('sql.untitled')

  const open = (tab: SqlTab) => {
    selectTab(tab.id)
    onOpen(tab)
  }
  const close = (tab: SqlTab, confirmed = false) => {
    if (!confirmed && hasUnsavedChanges(tab)) return setClosing(tab)
    closeTab(tab.id)
    const { tabs: rest, tabId: now } = useSqlEditor.getState()
    const next = rest.find((x) => x.id === now)
    if (next) onOpen(next)
  }

  return (
    <div className="flex shrink-0 items-end gap-0.5 overflow-x-auto border-b border-border px-2 pt-1.5">
      <ul aria-label={t('sql.tabs.label')} className="flex gap-0.5">
        {live.map((tab) => {
          const selected = tab.id === tabId
          return (
            <li
              key={tab.id}
              className={cn(
                'group flex h-8 max-w-56 shrink-0 items-center rounded-t-[9px] border border-b-0',
                selected
                  ? 'border-border bg-surface-2 text-text'
                  : 'border-transparent text-muted hover:text-text',
              )}
            >
              <button
                type="button"
                aria-current={selected ? 'true' : undefined}
                disabled={!!running && !selected}
                onClick={() => open(tab)}
                onDoubleClick={() => setRenaming(tab)}
                onKeyDown={(e) => {
                  if (e.key === 'F2') {
                    e.preventDefault()
                    setRenaming(tab)
                  }
                }}
                onAuxClick={(e) => {
                  if (e.button === 1) close(tab)
                }}
                title={tab.snippet?.path}
                className="flex h-full min-w-0 items-center gap-1.5 pl-3 text-[12.5px] disabled:cursor-default"
              >
                <span className="truncate">{label(tab)}</span>
                {hasUnsavedChanges(tab) && (
                  <span
                    role="img"
                    aria-label={t('sql.unsaved')}
                    className="size-1.5 shrink-0 rounded-full bg-accent"
                  />
                )}
              </button>
              <button
                type="button"
                aria-label={t('sql.tabs.close', { name: label(tab) })}
                disabled={!!running && selected}
                onClick={() => close(tab)}
                className={cn(
                  'mx-1 grid size-5 shrink-0 place-items-center rounded-[6px] text-muted opacity-0 group-hover:opacity-100 hover:bg-surface hover:text-text focus-visible:opacity-100',
                  selected && 'opacity-100',
                )}
              >
                <X className="size-3.5" />
              </button>
            </li>
          )
        })}
      </ul>
      <IconButton
        label={t('sql.tabs.new')}
        icon={<Plus />}
        disabled={!!running}
        onClick={() => {
          newTab()
          const { tabs: all, tabId: now } = useSqlEditor.getState()
          const tab = all.find((x) => x.id === now)
          if (tab) onOpen(tab)
        }}
        className="mb-0.5 size-7"
      />
      <PromptDialog
        open={!!renaming}
        onOpenChange={(o) => !o && setRenaming(null)}
        title={t('sql.tabs.renameTitle')}
        label={t('sql.tabs.name')}
        submitLabel={t('sql.tabs.rename')}
        initial={renaming ? label(renaming) : ''}
        onSubmit={async (name) => {
          if (renaming) renameTab(renaming.id, name.trim() || null)
          setRenaming(null)
        }}
      />
      <ConfirmDialog
        open={!!closing}
        onOpenChange={(o) => !o && setClosing(null)}
        level="warning"
        title={t('sql.tabs.closeTitle')}
        description={t('sql.tabs.closeDescription')}
        confirmLabel={t('sql.tabs.closeConfirm')}
        onConfirm={() => {
          if (closing) close(closing, true)
          setClosing(null)
        }}
      />
    </div>
  )
}

/**
 * Values for the :name parameters of a run, prefilled with the tab's last ones. They are sent as
 * bound parameters; an empty field is an empty string.
 */
export function ParamsDialog({
  names,
  initial,
  onRun,
  onCancel,
}: {
  names: string[]
  initial: Record<string, string>
  onRun: (values: Record<string, string>) => void
  onCancel: () => void
}) {
  const { t } = useTranslation()
  const [values, setValues] = useState(() =>
    Object.fromEntries(names.map((n) => [n, initial[n] ?? ''])),
  )
  const submit = (e: FormEvent) => {
    e.preventDefault()
    onRun(values)
  }
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onCancel()}
      title={t('sql.params.title')}
      description={t('sql.params.description')}
    >
      <form onSubmit={submit} className="flex flex-col gap-3">
        {names.map((name, i) => (
          <label key={name} className="flex flex-col gap-1">
            <span className="font-mono text-[12.5px]">:{name}</span>
            <Input
              autoFocus={i === 0}
              value={values[name] ?? ''}
              onChange={(e) => setValues({ ...values, [name]: e.target.value })}
              className="font-mono"
            />
          </label>
        ))}
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" onClick={onCancel}>
            {t('confirm.cancel')}
          </Button>
          <Button type="submit" variant="primary">
            {t('sql.run')}
          </Button>
        </div>
      </form>
    </Dialog>
  )
}
