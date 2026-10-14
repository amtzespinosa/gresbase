import { useBlocker } from '@tanstack/react-router'
import type { TFunction } from 'i18next'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/Button'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { Dialog } from '@/components/ui/Dialog'
import { Kbd } from '@/components/ui/Kbd'
import { useApplyChangeset, useChangesetPreview } from '@/lib/api/changesets'
import { ApiError } from '@/lib/api/client'
import { errorMessage } from '@/lib/api/errors'
import type { CellMap, ImpactEntry, Op, Table } from '@/lib/api/types.gen'
import { fetchImpact } from '@/lib/api/tables'
import { useFormat } from '@/lib/i18n/format'
import { shortcutLabel, useShortcut } from '@/lib/shortcuts'
import { toast } from '@/lib/toast'
import { show, useTableHistory } from './history'
import { valueError } from './editors'
import { type Queue, emptyQueue, tableKey, toOps, useChanges, useQueue } from './queue'

/**
 * Everything about the pending changes of one table: the floating pill, the diff dialog, saving
 * (button or Mod+S) and the guard against leaving the table with unsaved changes.
 */
export function PendingChanges({ meta }: { meta: Table }) {
  const { t } = useTranslation()
  const fmt = useFormat()
  const key = tableKey(meta.schema, meta.name)
  const queue = useQueue(key)
  const dispatch = useChanges((s) => s.dispatch)
  const clear = useChanges((s) => s.clear)
  const ops = useMemo(() => toOps(queue), [queue])
  const invalid = useMemo(() => invalidCount(queue, meta), [queue, meta])
  const [diffOpen, setDiffOpen] = useState(false)
  const apply = useApplyChangeset(meta.schema, meta.name)
  const history = useTableHistory(meta)

  const [impact, setImpact] = useState<{ ops: Op[]; tables: ImpactEntry[] } | null>(null)
  const [checking, setChecking] = useState(false)

  const applyOps = (ops: Op[]) =>
    apply.mutate(ops, {
      onSuccess: (result) => {
        clear(key)
        setDiffOpen(false)
        setImpact(null)
        history.onSaved(result, ops.length)
      },
      // The queue stays as it was, so the user can fix the cause and save again.
      onError: (err) => toast({ tone: 'danger', message: saveError(err, t), duration: 10_000 }),
    })

  /** Saves the queue as it is now (read from the store: Mod+S may follow an edit in this tick). */
  const save = () => {
    const ops = toOps(useChanges.getState().queues[key] ?? emptyQueue)
    if (ops.length === 0 || apply.isPending || checking) return
    if (invalidCount(useChanges.getState().queues[key] ?? emptyQueue, meta) > 0)
      return toast({ tone: 'danger', message: t('clipboard.invalidHint') })
    if (!ops.some((op) => op.kind === 'delete')) return applyOps(ops)
    // Deletes that cascade or set NULL elsewhere ask first, with the real numbers.
    setChecking(true)
    fetchImpact(meta.schema, meta.name, ops)
      .then(
        (im) => (im.tables.length > 0 ? setImpact({ ops, tables: im.tables }) : applyOps(ops)),
        (err: unknown) => toast({ tone: 'danger', message: saveError(err, t), duration: 10_000 }),
      )
      .finally(() => setChecking(false))
  }
  const discard = () => {
    dispatch(key, { type: 'discard' })
    setDiffOpen(false)
  }

  const pending = useRef(0)
  useEffect(() => {
    pending.current = ops.length
  })
  useShortcut('save', () => {
    if (toOps(useChanges.getState().queues[key] ?? emptyQueue).length === 0) return false
    save()
  })

  // Moving within the table (filters, pages) keeps the queue; leaving it asks first.
  const blocker = useBlocker({
    shouldBlockFn: ({ current, next }) => pending.current > 0 && current.pathname !== next.pathname,
    enableBeforeUnload: () => pending.current > 0,
    withResolver: true,
  })

  return (
    <>
      {ops.length > 0 && (
        <div
          role="status"
          className="absolute bottom-4 left-1/2 z-30 flex -translate-x-1/2 items-center gap-3 rounded-full bg-pill py-1.5 pr-1.5 pl-4 text-on-pill shadow-card"
        >
          <span className="size-2 shrink-0 rounded-full bg-accent" aria-hidden />
          <span className="whitespace-nowrap">{t('changes.pending', { count: ops.length })}</span>
          {invalid > 0 && (
            <span className="font-medium whitespace-nowrap" title={t('clipboard.invalidHint')}>
              · {t('clipboard.invalid', { count: invalid })}
            </span>
          )}
          <button
            type="button"
            onClick={() => setDiffOpen(true)}
            className="cursor-pointer whitespace-nowrap underline underline-offset-2 hover:opacity-80"
          >
            {t('changes.viewDiff')}
          </button>
          <button
            type="button"
            onClick={discard}
            className="h-7 cursor-pointer rounded-full px-3 whitespace-nowrap hover:bg-white/10"
          >
            {t('changes.discard')}
          </button>
          <Button
            size="sm"
            variant="primary"
            className="rounded-full"
            onClick={save}
            disabled={apply.isPending || checking || invalid > 0}
          >
            {apply.isPending || checking ? t('changes.saving') : t('changes.save')}
          </Button>
        </div>
      )}
      <DiffDialog
        open={diffOpen && ops.length > 0}
        onOpenChange={setDiffOpen}
        meta={meta}
        ops={ops}
        onSave={save}
        saving={apply.isPending}
      />
      {history.dialog}
      <ConfirmDialog
        open={impact !== null}
        onOpenChange={(open) => !open && setImpact(null)}
        level="warning"
        title={t('impact.title')}
        description={t('impact.description')}
        confirmLabel={t('impact.confirm')}
        busy={apply.isPending}
        onConfirm={() => impact && applyOps(impact.ops)}
      >
        <ul className="flex flex-col gap-1">
          {impact?.tables.map((e) => (
            <li key={`${e.schema}.${e.table}.${e.action}`}>
              {t(`impact.${e.action}`, {
                count: e.rows,
                n: fmt.number(e.rows),
                table: e.schema === 'public' ? e.table : `${e.schema}.${e.table}`,
              })}
            </li>
          ))}
        </ul>
        <p className="mt-3 text-muted">{t('impact.noUndo')}</p>
      </ConfirmDialog>
      <Dialog
        open={blocker.status === 'blocked'}
        onOpenChange={(open) => !open && blocker.reset?.()}
        title={t('changes.leaveTitle')}
        description={t('changes.leaveDescription', { count: ops.length })}
        footer={
          <>
            <Button onClick={() => blocker.reset?.()}>{t('changes.stay')}</Button>
            <Button
              variant="danger"
              onClick={() => {
                clear(key)
                blocker.proceed?.()
              }}
            >
              {t('changes.leave')}
            </Button>
          </>
        }
      />
    </>
  )
}

/** Why saving failed, naming the operation when the server says which one. */
function saveError(err: unknown, t: TFunction): string {
  if (!(err instanceof ApiError)) return errorMessage(err, t)
  const c = err.conflict
  if (c) {
    const why = c.missing
      ? t('changes.conflictMissing')
      : c.exists
        ? t('changes.conflictExists')
        : t('changes.conflictColumns', { columns: c.columns.join(', ') })
    return t('changes.conflict', {
      n: c.op + 1,
      kind: t(`changes.kind.${c.kind}`),
      pk: pkText(c.pk),
      why,
    })
  }
  return err.code === 'pg_error' || err.code === 'bad_request'
    ? `${errorMessage(err, t)} ${err.message}`
    : errorMessage(err, t)
}

const pkText = (pk: CellMap | undefined) =>
  Object.entries(pk ?? {})
    .map(([k, v]) => `${k} = ${show(v)}`)
    .join(', ')

interface DiffDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  meta: Table
  ops: Op[]
  onSave: () => void
  saving: boolean
}

function DiffDialog({ open, onOpenChange, meta, ops, onSave, saving }: DiffDialogProps) {
  const { t } = useTranslation()
  const preview = useChangesetPreview(meta.schema, meta.name, ops, open)
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={t('changes.diffTitle', { count: ops.length })}
      description={t('changes.diffDescription')}
      footer={
        <>
          <Button onClick={() => onOpenChange(false)}>{t('common.close')}</Button>
          <Button variant="primary" onClick={onSave} disabled={saving}>
            {saving ? t('changes.saving') : t('changes.save')}
            <Kbd className="ml-1">{shortcutLabel('save')}</Kbd>
          </Button>
        </>
      }
    >
      <ol className="flex max-h-[40vh] flex-col gap-3 overflow-auto">
        {ops.map((op, i) => (
          <li key={i} className="rounded-[var(--radius-control)] border border-border p-3">
            <p className="mb-1 text-[12px] font-medium">
              <span
                className={op.kind === 'delete' ? 'text-danger' : 'text-accent-ink'}
              >{`${t(`changes.kind.${op.kind}`)}`}</span>
              {op.pk && <span className="ml-2 font-mono text-muted">{pkText(op.pk)}</span>}
            </p>
            {op.kind === 'update' && (
              <dl className="grid grid-cols-[auto_1fr] gap-x-3 font-mono text-[12px]">
                {Object.entries(op.set ?? {}).map(([col, after]) => (
                  <div key={col} className="contents">
                    <dt className="text-muted">{col}</dt>
                    <dd className="min-w-0 break-all">
                      <span className="text-muted line-through">{show(op.expected?.[col])}</span>
                      {' → '}
                      <span>{show(after)}</span>
                    </dd>
                  </div>
                ))}
              </dl>
            )}
            {op.kind === 'insert' && (
              <dl className="grid grid-cols-[auto_1fr] gap-x-3 font-mono text-[12px]">
                {Object.keys(op.values ?? {}).length === 0 && (
                  <dd className="col-span-2 text-muted">{t('changes.allDefaults')}</dd>
                )}
                {Object.entries(op.values ?? {}).map(([col, v]) => (
                  <div key={col} className="contents">
                    <dt className="text-muted">{col}</dt>
                    <dd className="min-w-0 break-all">{show(v)}</dd>
                  </div>
                ))}
              </dl>
            )}
          </li>
        ))}
      </ol>
      {preview.data && !preview.data.undoable && (
        <p
          role="note"
          className="mt-4 rounded-[var(--radius-control)] bg-accent-tint px-3 py-2 text-accent-ink"
        >
          {t('history.notUndoable', {
            reasons: preview.data.reasons.map((r) => t(`history.reason.${r}`)).join(' · '),
          })}
        </p>
      )}
      <p className="section-label mt-4 mb-1">{t('changes.sql')}</p>
      {preview.isError ? (
        <p className="text-danger">{saveError(preview.error, t)}</p>
      ) : (
        <pre className="max-h-40 overflow-auto rounded-[var(--radius-control)] bg-surface-2 p-3 font-mono text-[12px] whitespace-pre-wrap">
          {preview.data ? preview.data.sql.join(';\n') + ';' : t('common.loading')}
        </pre>
      )}
    </Dialog>
  )
}

/** Pending values that don't fit their column (pasted text that didn't parse). */
function invalidCount(q: Queue, meta: Table): number {
  const byName = new Map(meta.columns.map((c) => [c.name, c]))
  const bad = (values: CellMap) =>
    Object.entries(values).filter(([name, v]) => {
      const c = byName.get(name)
      return c !== undefined && valueError(c, v) !== null
    }).length
  let n = 0
  for (const [key, u] of Object.entries(q.updates)) if (!(key in q.deletes)) n += bad(u.set)
  for (const r of q.inserts) n += bad(r.values)
  return n
}
