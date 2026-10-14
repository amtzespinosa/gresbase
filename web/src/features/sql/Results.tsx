import { AlertTriangle, Loader2, Play, Rows3 } from 'lucide-react'
import { type ReactNode, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { EmptyState } from '@/components/EmptyState'
import { ExportMenu } from '@/components/ExportMenu'
import { DataGrid, type GridColumn } from '@/components/grid/DataGrid'
import { Badge } from '@/components/ui/Badge'
import { ApiError } from '@/lib/api/client'
import type { StatementError, StatementResult } from '@/lib/api/types.gen'
import { cn } from '@/lib/cn'
import { downloadText, toCSV, toJSON, toMarkdown } from '@/lib/export'
import { useFormat } from '@/lib/i18n/format'
import { toast } from '@/lib/toast'
import { useSqlEditor } from './store'

/** The results card: one tab per statement that ran, with its grid, metadata and notices. */
export function Results() {
  const { t } = useTranslation()
  const { results, active, setActive, running, error } = useSqlEditor()
  const current = results[active]

  if (running) {
    return (
      <Message>
        <Loader2 className="size-4 animate-spin" />
        {t('sql.running')}
      </Message>
    )
  }
  if (error) {
    const e = error instanceof ApiError ? error : undefined
    return (
      <ErrorBox
        error={{
          code: e?.code ?? 'network',
          message: e?.message ?? '',
          detail: e?.detail,
          hint: e?.hint,
        }}
      />
    )
  }
  if (!current) return <EmptyState icon={<Play />} title={t('sql.empty')} />

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-3 border-b border-border px-3 py-2">
        {results.length > 1 && (
          <div
            role="tablist"
            aria-label={t('sql.results')}
            className="flex min-w-0 gap-1 overflow-x-auto"
          >
            {results.map((r, i) => (
              <button
                key={r.statement}
                type="button"
                role="tab"
                aria-selected={i === active}
                onClick={() => setActive(i)}
                className={cn(
                  'flex h-7 shrink-0 items-center gap-1.5 rounded-[8px] px-2.5 text-[12px]',
                  i === active ? 'bg-surface-2 text-text' : 'text-muted hover:text-text',
                )}
              >
                {r.error && <AlertTriangle className="size-3.5 text-danger" />}
                {t('sql.statementN', { n: r.statement + 1 })}
              </button>
            ))}
          </div>
        )}
        <Meta result={current} />
        {!current.error && current.columns.length > 0 && <ResultExport result={current} />}
      </div>
      <ResultBody result={current} />
    </div>
  )
}

/** Export of the loaded rows, done in the browser. */
function ResultExport({ result }: { result: StatementResult }) {
  const { t } = useTranslation()
  const name = `result-${result.statement + 1}`
  return (
    <ExportMenu
      items={[
        {
          label: t('export.csv'),
          onSelect: () => downloadText(`${name}.csv`, toCSV(result), 'text/csv'),
        },
        {
          label: t('export.json'),
          onSelect: () => downloadText(`${name}.json`, toJSON(result), 'application/json'),
        },
        {
          label: t('export.markdown'),
          onSelect: () =>
            void navigator.clipboard
              .writeText(toMarkdown(result))
              .then(() => toast({ message: t('export.copied') })),
        },
      ]}
    />
  )
}

function Meta({ result }: { result: StatementResult }) {
  const { t } = useTranslation()
  const fmt = useFormat()
  if (result.error) return null
  return (
    <div className="ml-auto flex shrink-0 items-center gap-2 text-[12px] text-muted">
      {result.truncated && (
        <Badge tone="accent">{t('sql.truncated', { n: fmt.number(result.rows.length) })}</Badge>
      )}
      <span className="font-mono">
        {result.columns.length > 0
          ? t('grid.rowsApprox', { count: result.rows.length, n: fmt.number(result.rows.length) })
          : result.command_tag}
      </span>
      <span aria-hidden>·</span>
      <span className="font-mono">
        {t('sql.duration', { ms: fmt.number(Math.round(result.duration_ms)) })}
      </span>
    </div>
  )
}

function ResultBody({ result }: { result: StatementResult }) {
  const { t } = useTranslation()
  const columns = useMemo<GridColumn[]>(
    () =>
      result.columns.map((c) => ({
        name: c.name,
        type: c.type,
        json: c.type === 'json' || c.type === 'jsonb',
      })),
    [result.columns],
  )
  return (
    <>
      {result.error ? (
        <ErrorBox error={result.error} />
      ) : columns.length > 0 && result.rows.length === 0 ? (
        <EmptyState icon={<Rows3 />} title={t('sql.noRows')} />
      ) : columns.length > 0 ? (
        <DataGrid
          label={t('sql.resultGrid', { n: result.statement + 1 })}
          columns={columns}
          rows={result.rows}
        />
      ) : (
        <Message>{t('sql.done', { tag: result.command_tag })}</Message>
      )}
      {result.notices.length > 0 && (
        <ul
          aria-label={t('sql.notices')}
          className="max-h-28 overflow-auto border-t border-border px-4 py-2 font-mono text-[12px]"
        >
          {result.notices.map((n, i) => (
            <li key={i}>
              <span className="text-accent-ink">{n.severity}</span> {n.message}
            </li>
          ))}
        </ul>
      )}
    </>
  )
}

function ErrorBox({ error }: { error: StatementError }) {
  const { t } = useTranslation()
  return (
    <div
      role="alert"
      className="m-4 rounded-[9px] border border-danger/40 bg-danger/10 p-4 text-[13px]"
    >
      <div className="flex items-center gap-2 font-medium text-danger">
        <AlertTriangle className="size-4" />
        {t(`errors.${error.code}`, { defaultValue: t('errors.internal') })}
        {error.pg_code && <span className="font-mono text-[12px] text-muted">{error.pg_code}</span>}
      </div>
      {error.message && <p className="mt-2 font-mono whitespace-pre-wrap">{error.message}</p>}
      {error.detail && (
        <p className="mt-1 text-muted">
          <span className="font-medium">{t('sql.detail')}</span> {error.detail}
        </p>
      )}
      {error.hint && (
        <p className="mt-1 text-muted">
          <span className="font-medium">{t('sql.hint')}</span> {error.hint}
        </p>
      )}
    </div>
  )
}

function Message({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-1 items-center justify-center gap-2 p-6 text-muted">{children}</div>
  )
}
