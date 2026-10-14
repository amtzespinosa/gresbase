import { Link, useNavigate } from '@tanstack/react-router'
import { CheckboxField } from '@/components/ui/Checkbox'
import {
  ChevronRight,
  Copy,
  CopyPlus,
  FileCode2,
  Folder,
  FolderPlus,
  HardDrive,
  History as HistoryIcon,
  Pencil,
  Play,
  Plus,
  Save,
  Search,
  SquareArrowRight,
  Trash2,
} from 'lucide-react'
import { useDataLossText } from '@/components/DataLoss'
import { ContextMenu, MenuItem, MenuSeparator } from '@/components/ui/ContextMenu'
import { EmptyState } from '@/components/EmptyState'
import { type FormEvent, type ReactNode, useEffect, useId, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { Dialog } from '@/components/ui/Dialog'
import { IconButton } from '@/components/ui/IconButton'
import { Input } from '@/components/ui/Input'
import { ApiError } from '@/lib/api/client'
import { useConnectionEntry, useConnectionId } from '@/lib/api/connections'
import { errorMessage } from '@/lib/api/errors'
import { useConfig } from '@/lib/api/queries'
import {
  connectionFolder,
  getSnippet,
  snippetName,
  toSnippetPath,
  useSnippetAction,
  useSnippets,
  visibleOn,
} from '@/lib/api/snippets'
import type { Entry } from '@/lib/api/types.gen'
import { cn } from '@/lib/cn'
import { useFormat } from '@/lib/i18n/format'
import { toast } from '@/lib/toast'
import { type HistoryEntry, searchHistory, useHistory } from './history'
import { useSqlEditor } from './store'

/** The "Queries" card of the SQL screen: saved queries (files and folders) and the history. */
export function QueriesPanel() {
  const { t } = useTranslation()
  const config = useConfig()
  const navigate = useNavigate()
  const connectionId = useConnectionId()
  const newTab = useSqlEditor((s) => s.newTab)

  const newQuery = () => {
    newTab()
    void navigate({ to: '/c/$connectionId/sql', params: { connectionId } })
  }

  const dataLoss = useDataLossText(config.data?.data_loss)
  return (
    <Card className="hidden w-60 shrink-0 flex-col md:flex" aria-label={t('sql.queries')}>
      <div className="flex items-center justify-between px-4 pt-3 pb-1">
        <span className="section-label">{t('sql.queries')}</span>
        <IconButton label={t('sql.newQuery')} icon={<Plus />} onClick={newQuery} />
      </div>
      {config.data?.data_persistent === false && (
        <p className="mx-3 mb-2 flex gap-2 rounded-[8px] bg-accent-tint p-2 text-[12px] text-accent-ink">
          <HardDrive className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          {dataLoss}
        </p>
      )}
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto pb-2">
        <SavedQueries />
        <History />
      </div>
    </Card>
  )
}

function SectionHeader({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="flex items-center justify-between px-4 pt-3 pb-1">
      <h2 className="section-label">{title}</h2>
      <div className="flex">{children}</div>
    </div>
  )
}

function SavedQueries() {
  const { t } = useTranslation()
  const snippets = useSnippets()
  const action = useSnippetAction()
  const navigate = useNavigate()
  const connectionId = useConnectionId()
  const { snippet, doc, moveSnippet } = useSqlEditor()
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [renaming, setRenaming] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<Entry | null>(null)
  const [newFolder, setNewFolder] = useState(false)

  // This connection's own queries (folder @<id>) first, then the ones for all connections; other
  // connections' folders stay hidden.
  const own = connectionFolder(connectionId)
  const connName = useConnectionEntry(connectionId)?.name ?? connectionId
  const entries = (snippets.data ?? []).filter(
    (e) => e.path !== own && visibleOn(e.path, connectionId),
  )
  const notCollapsed = (e: Entry) => !ancestors(e.path).some((a) => collapsed.has(a))
  const ownEntries = entries.filter((e) => e.path.startsWith(`${own}/`) && notCollapsed(e))
  const shared = entries.filter((e) => !e.path.startsWith(`${own}/`) && notCollapsed(e))
  const prefixOf = (e: Entry) => (e.path.startsWith(`${own}/`) ? `${own}/` : '')
  const groups = ownEntries.length
    ? [
        { title: connName, items: ownEntries },
        { title: t('sql.snippets.allConnections'), items: shared },
      ]
    : [{ title: null, items: shared }]
  const toggle = (path: string) =>
    setCollapsed((c) => {
      const next = new Set(c)
      if (!next.delete(path)) next.add(path)
      return next
    })

  // The open query moved or vanished with a rename/delete: follow it.
  const inside = (path: string, root: string) => path === root || path.startsWith(`${root}/`)
  const rename = async (e: Entry, to: string) => {
    try {
      await action.mutateAsync({ kind: 'move', from: e.path, to })
      setRenaming(null)
      moveSnippet(e.path, to)
      if (snippet && inside(snippet.path, e.path)) {
        const path = to + snippet.path.slice(e.path.length)
        void navigate({
          to: '/c/$connectionId/sql/$snippetId',
          params: { connectionId, snippetId: path },
          replace: true,
        })
      }
    } catch (err) {
      toast({ tone: 'danger', message: savedError(err, t), duration: 10_000 })
    }
  }
  const duplicate = async (e: Entry) => {
    try {
      const { sql } = await getSnippet(e.path)
      const base = e.path.replace(/\.sql$/, '')
      const taken = new Set((snippets.data ?? []).map((x) => x.path))
      let to = `${base}-copy.sql`
      for (let n = 2; taken.has(to); n++) to = `${base}-copy-${n}.sql`
      await action.mutateAsync({ kind: 'create', path: to, sql })
      toast({ message: t('sql.snippetMenu.duplicated', { name: snippetName(to) }) })
    } catch (err) {
      toast({ tone: 'danger', message: savedError(err, t), duration: 10_000 })
    }
  }
  const copySql = (e: Entry) =>
    getSnippet(e.path)
      .then(({ sql }) => navigator.clipboard.writeText(sql))
      .then(
        () => toast({ message: t('sql.sqlCopied') }),
        (err: unknown) => toast({ tone: 'danger', message: errorMessage(err, t) }),
      )
  const remove = async (e: Entry) => {
    try {
      await action.mutateAsync({ kind: 'delete', path: e.path })
      setDeleting(null)
      toast({ message: t('sql.snippets.deleted') })
      // The text stays in its tabs as an untitled query.
      moveSnippet(e.path, null)
      if (snippet && inside(snippet.path, e.path)) {
        void navigate({ to: '/c/$connectionId/sql', params: { connectionId }, replace: true })
      }
    } catch (err) {
      toast({ tone: 'danger', message: errorMessage(err, t), duration: 10_000 })
    }
  }

  return (
    <section aria-label={t('sql.snippets.title')}>
      <SectionHeader title={t('sql.snippets.title')}>
        <IconButton
          label={t('sql.snippets.newFolder')}
          icon={<FolderPlus />}
          onClick={() => setNewFolder(true)}
        />
      </SectionHeader>
      {snippets.isError ? (
        <p role="alert" className="px-4 text-[12px] text-danger">
          {errorMessage(snippets.error, t)}
        </p>
      ) : snippets.isPending ? (
        <ul aria-busy="true" aria-label={t('common.loading')} className="flex flex-col gap-1 px-3">
          {[0, 1].map((i) => (
            <li key={i} className="h-7 animate-pulse rounded-[9px] bg-surface-2" />
          ))}
        </ul>
      ) : entries.length === 0 ? (
        <EmptyState compact icon={<FileCode2 />} title={t('sql.snippets.empty')} />
      ) : (
        <ul className="flex flex-col gap-0.5 px-2">
          {groups.map((g) => [
            g.title !== null && (
              <li key={`group:${g.title}`} className="section-label truncate px-2 pt-2 pb-0.5">
                {g.title}
              </li>
            ),
            ...g.items.map((e) => (
              <li
                key={e.path}
                style={{ paddingLeft: depth(e.path.slice(prefixOf(e).length)) * 12 }}
              >
                {renaming === e.path ? (
                  <RenameInput
                    entry={e}
                    prefix={prefixOf(e)}
                    onSubmit={(to) => void rename(e, to)}
                    onCancel={() => setRenaming(null)}
                  />
                ) : (
                  <div className="group flex items-center">
                    {e.folder ? (
                      <button
                        type="button"
                        aria-expanded={!collapsed.has(e.path)}
                        onClick={() => toggle(e.path)}
                        className={cn(itemClass, 'cursor-pointer')}
                      >
                        <ChevronRight
                          aria-hidden
                          className={cn(
                            'size-3.5 shrink-0 transition-transform',
                            !collapsed.has(e.path) && 'rotate-90',
                          )}
                        />
                        <Folder aria-hidden className="size-4 shrink-0" />
                        <span className="min-w-0 flex-1 truncate text-left">
                          {snippetName(e.path)}
                        </span>
                      </button>
                    ) : (
                      <ContextMenu
                        label={t('sql.snippetMenu.label', { name: snippetName(e.path) })}
                        items={
                          <>
                            <MenuItem
                              icon={<SquareArrowRight />}
                              onSelect={() =>
                                void navigate({
                                  to: '/c/$connectionId/sql/$snippetId',
                                  params: { connectionId, snippetId: e.path },
                                })
                              }
                            >
                              {t('sql.menu.open')}
                            </MenuItem>
                            <MenuItem icon={<Pencil />} onSelect={() => setRenaming(e.path)}>
                              {t('sql.snippetMenu.rename')}
                            </MenuItem>
                            <MenuItem icon={<CopyPlus />} onSelect={() => void duplicate(e)}>
                              {t('sql.snippetMenu.duplicate')}
                            </MenuItem>
                            <MenuItem icon={<Copy />} onSelect={() => void copySql(e)}>
                              {t('sql.menu.copySql')}
                            </MenuItem>
                            <MenuSeparator />
                            <MenuItem danger icon={<Trash2 />} onSelect={() => setDeleting(e)}>
                              {t('sql.snippetMenu.delete')}
                            </MenuItem>
                          </>
                        }
                      >
                        <Link
                          to="/c/$connectionId/sql/$snippetId"
                          params={{ connectionId, snippetId: e.path }}
                          className={cn(
                            itemClass,
                            snippet?.path === e.path &&
                              'bg-surface-2 !text-text [&_svg]:text-accent-ink',
                          )}
                          aria-current={snippet?.path === e.path ? 'page' : undefined}
                        >
                          <FileCode2 aria-hidden className="size-4 shrink-0" />
                          <span className="min-w-0 flex-1 truncate font-mono text-[12.5px]">
                            {snippetName(e.path)}
                          </span>
                          {snippet?.path === e.path && doc !== snippet.saved && (
                            <span
                              role="img"
                              aria-label={t('sql.unsaved')}
                              className="size-1.5 shrink-0 rounded-full bg-accent"
                            />
                          )}
                        </Link>
                      </ContextMenu>
                    )}
                    <span className="flex opacity-0 group-focus-within:opacity-100 group-hover:opacity-100">
                      <IconButton
                        label={t('sql.snippets.rename', { name: snippetName(e.path) })}
                        icon={<Pencil />}
                        className="size-7 [&_svg]:size-3.5"
                        onClick={() => setRenaming(e.path)}
                      />
                      <IconButton
                        label={t('sql.snippets.delete', { name: snippetName(e.path) })}
                        icon={<Trash2 />}
                        className="size-7 [&_svg]:size-3.5"
                        onClick={() => setDeleting(e)}
                      />
                    </span>
                  </div>
                )}
              </li>
            )),
          ])}
        </ul>
      )}
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(open) => !open && setDeleting(null)}
        level="danger"
        title={t('sql.snippets.deleteTitle', { name: deleting ? snippetName(deleting.path) : '' })}
        description={t(deleting?.folder ? 'sql.snippets.deleteFolder' : 'sql.snippets.deleteFile')}
        confirmLabel={t('sql.snippets.deleteConfirm')}
        busy={action.isPending}
        onConfirm={() => deleting && void remove(deleting)}
      />
      <PromptDialog
        open={newFolder}
        onOpenChange={setNewFolder}
        title={t('sql.snippets.newFolder')}
        label={t('sql.snippets.folderName')}
        hint={t('sql.saveDialog.hint')}
        submitLabel={t('sql.snippets.create')}
        onSubmit={async (name) => {
          await action.mutateAsync({ kind: 'folder', path: name.trim().replace(/^\/+|\/+$/g, '') })
          setNewFolder(false)
        }}
      />
    </section>
  )
}

const itemClass =
  'flex h-8 min-w-0 flex-1 items-center gap-2 rounded-[9px] px-2 text-muted transition-colors hover:bg-surface-2 hover:text-text data-[state=open]:bg-surface-2 data-[state=open]:text-text'

const depth = (path: string) => path.split('/').length - 1
/** "a/b/c.sql" → ["a", "a/b"]. */
const ancestors = (path: string) =>
  path
    .split('/')
    .slice(0, -1)
    .map((_, i, parts) => parts.slice(0, i + 1).join('/'))

/** Inline rename: the whole path is editable, so a query can also move to another folder. */
function RenameInput({
  entry,
  prefix,
  onSubmit,
  onCancel,
}: {
  entry: Entry
  /** The connection folder (`@id/`) the entry lives in: kept, not edited. */
  prefix: string
  onSubmit: (to: string) => void
  onCancel: () => void
}) {
  const { t } = useTranslation()
  const shown = entry.path.slice(prefix.length)
  const [value, setValue] = useState(entry.folder ? shown : shown.replace(/\.sql$/, ''))
  const submit = (e: FormEvent) => {
    e.preventDefault()
    const to =
      prefix + (entry.folder ? value.trim().replace(/^\/+|\/+$/g, '') : toSnippetPath(value))
    if (to === entry.path || !value.trim()) onCancel()
    else onSubmit(to)
  }
  return (
    <form onSubmit={submit} className="px-1">
      <Input
        aria-label={t('sql.snippets.renameLabel', { name: snippetName(entry.path) })}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => e.key === 'Escape' && (e.preventDefault(), onCancel())}
        onBlur={onCancel}
        autoFocus
        spellCheck={false}
        className="h-8 font-mono text-[12.5px]"
      />
    </form>
  )
}

/** A small dialog asking for one name (save as, new folder). Errors stay in the dialog. */
export function PromptDialog({
  open,
  onOpenChange,
  title,
  label,
  hint,
  submitLabel,
  initial = '',
  option,
  onSubmit,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  label: string
  hint?: string
  submitLabel: string
  initial?: string
  /** Label of an optional checkbox; its state goes to onSubmit. */
  option?: string
  onSubmit: (value: string, checked: boolean) => Promise<void>
}) {
  return open ? (
    <PromptBody
      {...{ open, onOpenChange, title, label, hint, submitLabel, initial, option, onSubmit }}
    />
  ) : null
}

function PromptBody({
  open,
  onOpenChange,
  title,
  label,
  hint,
  submitLabel,
  initial = '',
  option,
  onSubmit,
}: Parameters<typeof PromptDialog>[0]) {
  const { t } = useTranslation()
  const id = useId()
  const [value, setValue] = useState(initial)
  const [checked, setChecked] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!value.trim() || busy) return
    setBusy(true)
    setError(null)
    try {
      await onSubmit(value, checked)
    } catch (err) {
      setError(savedError(err, t))
    } finally {
      setBusy(false)
    }
  }
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      footer={
        <>
          <Button onClick={() => onOpenChange(false)}>{t('confirm.cancel')}</Button>
          <Button variant="primary" type="submit" form={id} disabled={!value.trim() || busy}>
            {submitLabel}
          </Button>
        </>
      }
    >
      <form id={id} onSubmit={(e) => void submit(e)} className="flex flex-col gap-1.5">
        <label htmlFor={`${id}-input`} className="text-muted">
          {label}
        </label>
        <Input
          id={`${id}-input`}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          autoFocus
          autoComplete="off"
          spellCheck={false}
          className="font-mono"
          aria-invalid={!!error}
          aria-describedby={`${id}-hint`}
        />
        <p id={`${id}-hint`} className={cn('text-[12px]', error ? 'text-danger' : 'text-muted')}>
          {error ?? hint}
        </p>
        {option && (
          <CheckboxField className="mt-2" label={option} checked={checked} onChange={setChecked} />
        )}
      </form>
    </Dialog>
  )
}

/** Errors of the saved queries API, with a clearer text when the name is taken or invalid. */
function savedError(err: unknown, t: ReturnType<typeof useTranslation>['t']) {
  if (err instanceof ApiError && err.status === 409) return t('sql.snippets.exists')
  if (err instanceof ApiError && err.status === 400) return t('sql.snippets.invalidName')
  if (err instanceof ApiError && err.status === 413) return t('sql.snippets.tooLarge')
  return errorMessage(err, t)
}

function History() {
  const { t } = useTranslation()
  const fmt = useFormat()
  const navigate = useNavigate()
  const connectionId = useConnectionId()
  const free = useConfig().data?.free_mode
  const { entries, load, clear, remove } = useHistory()
  const action = useSnippetAction()
  const [saving, setSaving] = useState<HistoryEntry | null>(null)
  const { replaceDoc, run } = useSqlEditor()
  const [query, setQuery] = useState('')
  const [clearing, setClearing] = useState(false)
  const searchId = useId()

  useEffect(() => {
    void load()
  }, [load])

  const shown = useMemo(() => searchHistory(entries, query), [entries, query])

  // Loading a history entry makes it an untitled query.
  const open = (e: HistoryEntry, thenRun: boolean) => {
    if (!replaceDoc(e.sql, null)) return
    void navigate({ to: '/c/$connectionId/sql', params: { connectionId } })
    if (thenRun) void run(e.sql, 0)
  }

  return (
    <section aria-label={t('sql.history.title')}>
      <SectionHeader title={t('sql.history.title')}>
        {entries.length > 0 && (
          <IconButton
            label={t('sql.history.clear')}
            icon={<Trash2 />}
            onClick={() => setClearing(true)}
          />
        )}
      </SectionHeader>
      {entries.length === 0 ? (
        <EmptyState compact icon={<HistoryIcon />} title={t('sql.history.empty')} />
      ) : (
        <>
          <div className="relative mx-3 mb-1">
            <label htmlFor={searchId} className="sr-only">
              {t('sql.history.search')}
            </label>
            <Search
              aria-hidden
              className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted"
            />
            <Input
              id={searchId}
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('sql.history.search')}
              className="h-8 pl-8"
            />
          </div>
          {shown.length === 0 && (
            <p className="px-4 text-[12px] text-muted">{t('sql.history.noMatch')}</p>
          )}
          <ul className="flex flex-col gap-0.5 px-2">
            {shown.map((e) => (
              <li key={`${e.at}:${e.sql}`} className="group flex items-start">
                <ContextMenu
                  label={t('sql.historyMenu.label')}
                  items={
                    <>
                      <MenuItem icon={<SquareArrowRight />} onSelect={() => open(e, false)}>
                        {t('sql.menu.open')}
                      </MenuItem>
                      <MenuItem icon={<Play />} onSelect={() => open(e, true)}>
                        {t('sql.historyMenu.run')}
                      </MenuItem>
                      <MenuItem
                        icon={<Copy />}
                        onSelect={() =>
                          void navigator.clipboard.writeText(e.sql).then(
                            () => toast({ message: t('sql.sqlCopied') }),
                            (err: unknown) =>
                              toast({ tone: 'danger', message: errorMessage(err, t) }),
                          )
                        }
                      >
                        {t('sql.menu.copySql')}
                      </MenuItem>
                      <MenuItem icon={<Save />} onSelect={() => setSaving(e)}>
                        {t('sql.historyMenu.save')}
                      </MenuItem>
                      <MenuSeparator />
                      <MenuItem danger icon={<Trash2 />} onSelect={() => void remove(e)}>
                        {t('sql.historyMenu.delete')}
                      </MenuItem>
                    </>
                  }
                >
                  <button
                    type="button"
                    onClick={() => open(e, false)}
                    title={e.sql}
                    className="flex min-w-0 flex-1 cursor-pointer flex-col gap-0.5 rounded-[9px] px-2 py-1.5 text-left hover:bg-surface-2 data-[state=open]:bg-surface-2"
                  >
                    <span className="truncate font-mono text-[12px] text-text">
                      {e.sql.trim().split('\n')[0]}
                    </span>
                    <span className="truncate text-[11px] text-muted">
                      {fmt.dateTime(e.at)}
                      {' · '}
                      {e.error ? (
                        <span className="text-danger">{t('sql.history.failed')}</span>
                      ) : (
                        t('sql.duration', { ms: fmt.number(Math.round(e.duration_ms)) }) +
                        (e.rows === undefined
                          ? ''
                          : ` · ${t('sql.history.rows', { count: e.rows, n: fmt.number(e.rows) })}`)
                      )}
                    </span>
                  </button>
                </ContextMenu>
                <IconButton
                  label={t('sql.history.rerun')}
                  icon={<Play />}
                  className="mt-1 size-7 opacity-0 group-focus-within:opacity-100 group-hover:opacity-100 [&_svg]:size-3.5"
                  onClick={() => open(e, true)}
                />
              </li>
            ))}
          </ul>
        </>
      )}
      <ConfirmDialog
        open={clearing}
        onOpenChange={setClearing}
        level="warning"
        title={t('sql.history.clearTitle')}
        description={t('sql.history.clearDescription')}
        confirmLabel={t('sql.history.clear')}
        onConfirm={() => {
          void clear()
          setClearing(false)
        }}
      />
      <PromptDialog
        open={!!saving}
        onOpenChange={(o) => !o && setSaving(null)}
        title={t('sql.saveDialog.title')}
        label={t('sql.saveDialog.label')}
        hint={t('sql.saveDialog.hint')}
        submitLabel={t('sql.save')}
        option={free ? undefined : t('sql.saveDialog.onlyThisConnection')}
        onSubmit={async (name, onlyHere) => {
          if (!saving) return
          await action.mutateAsync({
            kind: 'create',
            path: (onlyHere ? `${connectionFolder(connectionId)}/` : '') + toSnippetPath(name),
            sql: saving.sql,
          })
          setSaving(null)
          toast({ message: t('sql.saved') })
        }}
      />
    </section>
  )
}
