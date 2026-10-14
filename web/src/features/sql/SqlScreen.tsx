import { setDiagnostics } from '@codemirror/lint'
import type { EditorView } from '@codemirror/view'
import { useQueryClient } from '@tanstack/react-query'
import { useNavigate, useParams, useSearch } from '@tanstack/react-router'
import { AlignLeft, Play, Save, Square } from 'lucide-react'
import {
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react'
import { useTranslation } from 'react-i18next'
import { format } from 'sql-formatter'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { IconButton } from '@/components/ui/IconButton'
import { Kbd } from '@/components/ui/Kbd'
import { useConnectionId } from '@/lib/api/connections'
import { useConfig, useReadOnly } from '@/lib/api/queries'
import { usePrefs } from '@/lib/prefs/store'
import { errorMessage } from '@/lib/api/errors'
import {
  connectionFolder,
  snippetName,
  toSnippetPath,
  useSnippet,
  useSnippetAction,
} from '@/lib/api/snippets'
import { useCompletions } from '@/lib/api/sql'
import { shortcutLabel, useShortcut } from '@/lib/shortcuts'
import { toast } from '@/lib/toast'
import { Results } from './Results'
import { errorRange, runTarget } from './editor'
import { PromptDialog, QueriesPanel } from './QueriesPanel'
import { SqlEditor } from './SqlEditor'
import { paramNames } from './params'
import { ParamsDialog, SqlTabs } from './SqlTabs'
import { useSqlEditor } from './store'
import { TimeoutBadge } from './TimeoutBadge'
import { DestructiveDialog, FoundTxBand, TxBand, TxModeSwitch } from './Transaction'

const DDL = /^(CREATE|ALTER|DROP|COMMENT|TRUNCATE)\b/

export function SqlScreen() {
  const { t } = useTranslation()
  const {
    doc,
    setDoc,
    run,
    cancel,
    running,
    results,
    offset,
    snippet,
    setSnippet,
    pendingReplace,
    confirmReplace,
    dismissReplace,
  } = useSqlEditor()
  const completions = useCompletions()
  const config = useConfig()
  const free = config.data?.free_mode
  const readOnly = useReadOnly()
  const queryClient = useQueryClient()
  const [view, setView] = useState<EditorView | null>(null)

  // A run with :name parameters first asks for their values (remembered per tab).
  const [asking, setAsking] = useState<{ sql: string; offset: number; names: string[] } | null>(
    null,
  )
  const runFrom = (all: boolean) => {
    const target = view && runTarget(view, all)
    if (!target) return
    const names = paramNames(target.sql)
    if (names.length) setAsking({ ...target, names })
    else void run(target.sql, target.offset)
  }
  const openTab = useSqlEditor((s) => s.tabs.find((tab) => tab.id === s.tabId))
  useShortcut('runStatement', () => runFrom(false))
  useShortcut('runAll', () => runFrom(true))

  // "Open in SQL editor" from the grid hands the query over in ?sql= (a new untitled query).
  const search: { sql?: string } = useSearch({ strict: false })
  const navigate = useNavigate()
  const connectionId = useConnectionId()
  useEffect(() => {
    if (search.sql === undefined) return
    useSqlEditor.getState().newTab(search.sql)
    void navigate({
      to: '/c/$connectionId/sql',
      params: { connectionId },
      search: {},
      replace: true,
    })
  }, [search.sql, navigate, connectionId])

  // /sql/$snippetId opens a saved query (the id is its path); /sql shows the open one, if any.
  const { snippetId }: { snippetId?: string } = useParams({ strict: false })
  const snippetQuery = useSnippet(snippetId)
  const goTo = useCallback(
    (path: string | undefined) =>
      void navigate(
        path
          ? { to: '/c/$connectionId/sql/$snippetId', params: { connectionId, snippetId: path } }
          : { to: '/c/$connectionId/sql', params: { connectionId } },
      ),
    [navigate, connectionId],
  )
  useEffect(() => {
    const data = snippetQuery.data
    // Wait for fresh content: a cached copy may predate the last save.
    if (!snippetId || data?.path !== snippetId || snippetQuery.isFetching) return
    usePrefs.getState().addRecent({ connection: connectionId, kind: 'snippet', path: snippetId })
    useSqlEditor.getState().openSnippet({ path: data.path, saved: data.sql })
  }, [connectionId, snippetId, snippetQuery.data, snippetQuery.isFetching])
  useEffect(() => {
    if (!snippetId || !snippetQuery.isError) return
    toast({ tone: 'danger', message: t('sql.snippets.notFound'), duration: 10_000 })
    if (useSqlEditor.getState().snippet?.path === snippetId) setSnippet(null)
    void navigate({ to: '/c/$connectionId/sql', params: { connectionId }, replace: true })
  }, [snippetId, snippetQuery.isError, setSnippet, navigate, t, connectionId])
  useEffect(() => {
    if (!snippetId && snippet) goTo(snippet.path)
  }, [snippetId, snippet, goTo])

  // ⌘S saves the open query, or asks for a name the first time.
  const action = useSnippetAction()
  const [saveAs, setSaveAs] = useState(false)
  const save = async () => {
    const { snippet: open, doc: text } = useSqlEditor.getState()
    if (!open) return setSaveAs(true)
    try {
      await action.mutateAsync({ kind: 'update', path: open.path, sql: text })
      setSnippet({ path: open.path, saved: text })
      toast({ message: t('sql.saved') })
    } catch (err) {
      toast({ tone: 'danger', message: errorMessage(err, t), duration: 10_000 })
    }
  }
  useShortcut('save', () => void save())

  // Mark the failed statement; a new run clears the mark.
  useEffect(() => {
    if (!view) return
    const failed = results.find((r) => r.error)
    const text = view.state.doc.toString()
    const diagnostics = failed?.error
      ? [
          {
            ...errorRange(text, offset, failed),
            severity: 'error' as const,
            message: failed.error.message,
          },
        ]
      : []
    view.dispatch(setDiagnostics(view.state, diagnostics))
  }, [view, results, offset])

  // DDL changes what the browser and the autocompletion show.
  useEffect(() => {
    if (results.some((r) => !r.error && DDL.test(r.command_tag))) {
      for (const key of ['completions', 'schemas', 'relations', 'table'])
        void queryClient.invalidateQueries({ queryKey: [key] })
    }
  }, [results, queryClient])

  const formatDoc = () => {
    try {
      setDoc(format(doc, { language: 'postgresql', keywordCase: 'upper' }))
    } catch {
      // sql-formatter can't parse it: leave the text as it is.
    }
  }

  return (
    <>
      <QueriesPanel />
      <Split
        top={
          <Card className="@container flex h-full flex-col" aria-label={t('sql.editor')}>
            <SqlTabs onOpen={(tab) => goTo(tab.snippet?.path)} />
            <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border px-5">
              <h1 className="truncate text-[19px] font-semibold" title={snippet?.path}>
                {snippet ? snippetName(snippet.path) : t('sql.untitled')}
              </h1>
              {snippet && doc !== snippet.saved && (
                <span
                  role="img"
                  aria-label={t('sql.unsaved')}
                  title={t('sql.unsaved')}
                  className="size-2 shrink-0 rounded-full bg-accent"
                />
              )}
              <TimeoutBadge defaultMs={config.data?.statement_timeout_ms} />
              <div className="ml-auto flex items-center gap-1">
                {readOnly === false && <TxModeSwitch />}
                <IconButton label={t('sql.format')} icon={<AlignLeft />} onClick={formatDoc} />
                <Button size="sm" variant="ghost" onClick={() => void save()}>
                  <Save className="size-3.5" />
                  <span className="sr-only @[44rem]:not-sr-only">{t('sql.save')}</span>
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => runFrom(true)}
                  disabled={!!running}
                >
                  {t('sql.runAll')}
                </Button>
                {running ? (
                  <Button size="sm" variant="danger" onClick={() => void cancel()}>
                    <Square className="size-3.5" />
                    {t('sql.cancel')}
                  </Button>
                ) : (
                  <Button size="sm" variant="primary" onClick={() => runFrom(false)}>
                    <Play className="size-3.5" />
                    {t('sql.run')}
                    <span aria-hidden className="hidden @[44rem]:inline-flex">
                      <Kbd className="ml-1 border-on-accent/20 bg-transparent text-on-accent/70">
                        {shortcutLabel('runStatement')}
                      </Kbd>
                    </span>
                  </Button>
                )}
              </div>
            </header>
            <FoundTxBand />
            <TxBand />
            <SqlEditor
              value={doc}
              onChange={setDoc}
              onRun={runFrom}
              completions={completions.data}
              label={t('sql.editor')}
              onView={setView}
            />
          </Card>
        }
        bottom={
          <Card className="flex h-full flex-col" aria-label={t('sql.results')}>
            <Results />
          </Card>
        }
      />
      <DestructiveDialog />
      {asking && (
        <ParamsDialog
          names={asking.names}
          initial={openTab?.params ?? {}}
          onCancel={() => setAsking(null)}
          onRun={(values) => {
            const { setParams } = useSqlEditor.getState()
            setParams({ ...openTab?.params, ...values })
            setAsking(null)
            void run(asking.sql, asking.offset, false, values)
          }}
        />
      )}
      <ConfirmDialog
        open={!!pendingReplace}
        onOpenChange={(open) => {
          if (open) return
          dismissReplace()
          goTo(useSqlEditor.getState().snippet?.path)
        }}
        level="warning"
        title={t('sql.replace.title')}
        description={t('sql.replace.description')}
        confirmLabel={t('sql.replace.confirm')}
        onConfirm={() => {
          confirmReplace()
          goTo(useSqlEditor.getState().snippet?.path)
        }}
      />
      <PromptDialog
        open={saveAs}
        onOpenChange={setSaveAs}
        title={t('sql.saveDialog.title')}
        label={t('sql.saveDialog.label')}
        hint={t('sql.saveDialog.hint')}
        submitLabel={t('sql.save')}
        // Free mode queries are already private to this user and database, and the connection id
        // changes with every session: a connection folder would hide them next time.
        option={free ? undefined : t('sql.saveDialog.onlyThisConnection')}
        onSubmit={async (name, onlyHere) => {
          const text = useSqlEditor.getState().doc
          const created = await action.mutateAsync({
            kind: 'create',
            path: (onlyHere ? `${connectionFolder(connectionId)}/` : '') + toSnippetPath(name),
            sql: text,
          })
          if (!created) return
          setSnippet({ path: created.path, saved: text })
          setSaveAs(false)
          toast({ message: t('sql.saved') })
        }}
      />
    </>
  )
}

/** Editor above, results below, with a draggable (and keyboard-movable) divider. */
function Split({ top, bottom }: { top: ReactNode; bottom: ReactNode }) {
  const { t } = useTranslation()
  const box = useRef<HTMLDivElement>(null)
  const [ratio, setRatio] = useState(0.5)
  const clamp = (r: number) => Math.min(0.8, Math.max(0.2, r))
  const onMove = (e: PointerEvent) => {
    const rect = box.current?.getBoundingClientRect()
    if (rect && e.buttons === 1) setRatio(clamp((e.clientY - rect.top) / rect.height))
  }
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'ArrowUp') setRatio((r) => clamp(r - 0.05))
    else if (e.key === 'ArrowDown') setRatio((r) => clamp(r + 0.05))
    else return
    e.preventDefault()
  }
  return (
    <div ref={box} className="flex min-w-0 flex-1 flex-col">
      <div style={{ flexBasis: `${ratio * 100}%` }} className="min-h-0 shrink-0">
        {top}
      </div>
      <div
        role="separator"
        aria-orientation="horizontal"
        aria-label={t('sql.resize')}
        aria-valuenow={Math.round(ratio * 100)}
        aria-valuemin={20}
        aria-valuemax={80}
        tabIndex={0}
        onPointerDown={(e) => e.currentTarget.setPointerCapture(e.pointerId)}
        onPointerMove={onMove}
        onKeyDown={onKey}
        className="group flex h-3 shrink-0 cursor-row-resize items-center justify-center focus-visible:outline-none"
      >
        <span className="h-1 w-10 rounded-full bg-border group-hover:bg-muted group-focus-visible:bg-accent" />
      </div>
      <div className="min-h-0 flex-1">{bottom}</div>
    </div>
  )
}
