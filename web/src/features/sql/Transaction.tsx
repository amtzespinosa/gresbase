import { useQueryClient } from '@tanstack/react-query'
import { useBlocker } from '@tanstack/react-router'
import { AlertTriangle, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { Dialog } from '@/components/ui/Dialog'
import { IconButton } from '@/components/ui/IconButton'
import { ApiError } from '@/lib/api/client'
import { errorMessage } from '@/lib/api/errors'
import { rollbackTx, useOpenTxs } from '@/lib/api/sql'
import { cn } from '@/lib/cn'
import { useFormat } from '@/lib/i18n/format'
import { toast } from '@/lib/toast'
import { type TxOutcome, useSqlEditor } from './store'

/** The "Transaction mode" switch of the toolbar. Locked on while a transaction is open. */
export function TxModeSwitch() {
  const { t } = useTranslation()
  const { txMode, tx, setTxMode } = useSqlEditor()
  return (
    <button
      type="button"
      role="switch"
      aria-checked={txMode}
      disabled={!!tx}
      title={t('sql.txModeHint')}
      onClick={() => setTxMode(!txMode)}
      className="flex h-8 cursor-pointer items-center gap-2 rounded-[8px] px-2 text-[12px] text-muted hover:text-text disabled:cursor-not-allowed"
    >
      <span
        aria-hidden
        className={cn(
          'relative h-4 w-7 rounded-full border border-border transition-colors',
          txMode ? 'bg-accent' : 'bg-surface-2',
        )}
      >
        <span
          className={cn(
            'absolute top-0.5 size-2.5 rounded-full transition-all',
            txMode ? 'left-3.5 bg-on-accent' : 'left-0.5 bg-muted',
          )}
        />
      </span>
      <span className="sr-only whitespace-nowrap @[44rem]:not-sr-only">{t('sql.txMode')}</span>
    </button>
  )
}

/**
 * The band under the toolbar while a transaction is open (rows affected, countdown to the
 * automatic rollback, Commit / Roll back), or after it expired. Also guards leaving the page.
 */
export function TxBand() {
  const { t } = useTranslation()
  const fmt = useFormat()
  const queryClient = useQueryClient()
  const { tx, txDeadline, txExpired, running, commit, rollback, refreshTx, dismissExpired } =
    useSqlEditor()
  const [ending, setEnding] = useState(false)
  // The server refuses to end a transaction while a statement runs in it.
  const busy = ending || !!running
  const [confirming, setConfirming] = useState(false)
  const left = useRemaining(tx ? txDeadline : 0)

  // At the deadline the server should have rolled back: ask it, so the UI says so.
  useEffect(() => {
    if (tx && left === 0) void refreshTx()
  }, [tx, left, refreshTx])

  const end = async (fn: () => Promise<TxOutcome>) => {
    setEnding(true)
    try {
      const outcome = await fn()
      setConfirming(false)
      if (outcome !== 'expired') toast({ message: t(`sql.tx.${outcome}`) })
      // Committed DDL changes what the browser and the autocompletion show.
      for (const key of ['completions', 'schemas', 'relations', 'table', 'rows', 'sqlTxs'])
        void queryClient.invalidateQueries({ queryKey: [key] })
    } catch (err) {
      toast({ tone: 'danger', message: errorMessage(err, t), duration: 10_000 })
    } finally {
      setEnding(false)
    }
  }

  const destructive = tx?.statements.filter((s) => s.kind) ?? []
  const onCommit = () => (destructive.length > 0 ? setConfirming(true) : void end(commit))

  if (txExpired) {
    return (
      <div
        role="alert"
        className="flex items-center gap-2 border-b border-border bg-danger/10 px-5 py-2 text-[12.5px]"
      >
        <AlertTriangle className="size-4 shrink-0 text-danger" />
        <span>{t('sql.tx.expired')}</span>
        <IconButton
          label={t('common.close')}
          icon={<X />}
          className="ml-auto"
          onClick={dismissExpired}
        />
      </div>
    )
  }
  if (!tx) return null

  const failed = tx.status === 'failed'
  return (
    <>
      <div
        role="status"
        aria-label={t('sql.tx.open')}
        className={cn(
          'flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-border px-5 py-2 text-[12.5px]',
          failed ? 'bg-danger/10' : 'bg-accent-tint',
        )}
      >
        <span className="size-2 shrink-0 rounded-full bg-accent" aria-hidden />
        <span className="font-medium">{t('sql.tx.open')}</span>
        <span aria-hidden>·</span>
        <span className="font-mono">
          {t('sql.tx.rows', { count: tx.rows_affected, n: fmt.number(tx.rows_affected) })}
        </span>
        <span aria-hidden>·</span>
        <span className="text-muted">
          {failed ? t('sql.tx.failed') : t('sql.tx.expiresIn', { time: clock(left) })}
        </span>
        <div className="ml-auto flex gap-1">
          <Button size="sm" onClick={() => void end(rollback)} disabled={busy}>
            {t('sql.tx.rollback')}
          </Button>
          <Button size="sm" variant="primary" onClick={onCommit} disabled={busy || failed}>
            {t('sql.tx.commit')}
          </Button>
        </div>
      </div>
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        level="danger"
        title={t('sql.tx.commitTitle')}
        description={t('sql.tx.commitDescription')}
        confirmLabel={t('sql.tx.commit')}
        busy={busy}
        onConfirm={() => void end(commit)}
      >
        <ul className="flex max-h-64 flex-col gap-2 overflow-auto">
          {destructive.map((s, i) => (
            <li key={i} className="flex flex-col gap-1">
              <div className="flex items-center gap-2">
                <Badge tone={s.level === 'danger' ? 'danger' : 'accent'}>
                  {t(`sql.kind.${s.kind}`, { defaultValue: s.kind })}
                </Badge>
                <span className="font-mono text-[12px]">
                  {t('sql.tx.rows', { count: s.rows_affected, n: fmt.number(s.rows_affected) })}
                </span>
              </div>
              <code className="line-clamp-2 font-mono text-[12px] text-muted">{s.sql}</code>
            </li>
          ))}
        </ul>
      </ConfirmDialog>
      <LeaveGuard />
    </>
  )
}

/** Asks before leaving the editor (or the page) with the transaction open. */
function LeaveGuard() {
  const { t } = useTranslation()
  const rollback = useSqlEditor((s) => s.rollback)
  const open = () => useSqlEditor.getState().tx !== null
  const blocker = useBlocker({
    shouldBlockFn: ({ current, next }) => open() && current.pathname !== next.pathname,
    enableBeforeUnload: open,
    withResolver: true,
  })
  // The page is really going away (reload or close accepted): roll back with a request that
  // outlives it. If it is lost, the editor offers the transaction again on the next visit.
  useEffect(() => {
    const onHide = () => {
      const tx = useSqlEditor.getState().tx
      if (tx) void rollbackTx(tx.id, true).catch(() => undefined)
    }
    window.addEventListener('pagehide', onHide)
    return () => window.removeEventListener('pagehide', onHide)
  }, [])
  return (
    <Dialog
      open={blocker.status === 'blocked'}
      onOpenChange={(o) => !o && blocker.reset?.()}
      title={t('sql.tx.leaveTitle')}
      description={t('sql.tx.leaveDescription')}
      footer={
        <>
          <Button onClick={() => blocker.reset?.()}>{t('changes.stay')}</Button>
          <Button
            variant="danger"
            onClick={() => {
              void rollback().catch(() => undefined)
              blocker.proceed?.()
            }}
          >
            {t('sql.tx.leave')}
          </Button>
        </>
      }
    />
  )
}

/**
 * A transaction of this session still open on the server that this page does not own (the exit
 * rollback was lost: browser closed, network down…): resume it or roll it back.
 */
export function FoundTxBand() {
  const { t } = useTranslation()
  const fmt = useFormat()
  const queryClient = useQueryClient()
  const { tx, resumeTx } = useSqlEditor()
  const txs = useOpenTxs()
  const [busy, setBusy] = useState(false)
  // Refetch when this page's own transaction ends: the list may still show it.
  const ownId = tx?.id
  useEffect(() => {
    if (!ownId) void queryClient.invalidateQueries({ queryKey: ['sqlTxs'] })
  }, [ownId, queryClient])

  const found = tx ? undefined : txs.data?.[0]
  if (!found) return null

  const rollback = async () => {
    setBusy(true)
    try {
      await rollbackTx(found.id)
      toast({ message: t('sql.tx.rolledBack') })
    } catch (err) {
      // 404: it expired meanwhile, which is what the user wanted anyway.
      if (!(err instanceof ApiError && err.status === 404))
        toast({ tone: 'danger', message: errorMessage(err, t), duration: 10_000 })
    } finally {
      setBusy(false)
      void queryClient.invalidateQueries({ queryKey: ['sqlTxs'] })
    }
  }

  return (
    <div
      role="status"
      aria-label={t('sql.tx.found')}
      className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-border bg-accent-tint px-5 py-2 text-[12.5px]"
    >
      <AlertTriangle className="size-4 shrink-0 text-accent" aria-hidden />
      <span className="font-medium">{t('sql.tx.found')}</span>
      <span aria-hidden>·</span>
      <span className="font-mono">
        {t('sql.tx.rows', { count: found.rows_affected, n: fmt.number(found.rows_affected) })}
      </span>
      <span className="text-muted">{t('sql.tx.foundHint')}</span>
      <div className="ml-auto flex gap-1">
        <Button size="sm" onClick={() => void rollback()} disabled={busy}>
          {t('sql.tx.rollback')}
        </Button>
        <Button size="sm" variant="primary" onClick={() => resumeTx(found)} disabled={busy}>
          {t('sql.tx.resume')}
        </Button>
      </div>
    </div>
  )
}

/** The 409 confirmation_required modal: the destructive statements, run anyway or switch modes. */
export function DestructiveDialog() {
  const { t } = useTranslation()
  const { pending, run, dismissPending, setTxMode } = useSqlEditor()
  if (!pending) return null
  const { sql, offset, analysis, params } = pending
  const again = (confirm: boolean) => void run(sql, offset, confirm, params)
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && dismissPending()}
      tone="danger"
      title={t('sql.destructive.title')}
      description={t('sql.destructive.description')}
      footer={
        <>
          <Button onClick={dismissPending}>{t('confirm.cancel')}</Button>
          <Button
            onClick={() => {
              setTxMode(true)
              again(false)
            }}
          >
            {t('sql.destructive.useTx')}
          </Button>
          <Button variant="danger" onClick={() => again(true)}>
            {t('sql.destructive.runAnyway')}
          </Button>
        </>
      }
    >
      <ul className="flex max-h-64 flex-col gap-2 overflow-auto">
        {analysis.findings.map((f) => (
          <li
            key={`${f.statement}-${f.kind}`}
            className={cn(
              'flex flex-col gap-1 border-l-2 pl-3',
              f.level === 'danger' ? 'border-danger' : 'border-accent',
            )}
          >
            <Badge tone={f.level === 'danger' ? 'danger' : 'accent'} className="self-start">
              {t(`sql.kind.${f.kind}`)}
            </Badge>
            <code className="line-clamp-3 font-mono text-[12px] whitespace-pre-wrap">
              {sql.slice(f.from, f.to)}
            </code>
          </li>
        ))}
      </ul>
    </Dialog>
  )
}

/** ms left until `deadline` (0 when there is none), ticking every second. */
function useRemaining(deadline: number) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    // Ticks even without a deadline so `now` is fresh the moment a transaction opens.
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])
  return deadline ? Math.max(0, deadline - now) : 0
}

const clock = (ms: number) => {
  const s = Math.ceil(ms / 1000)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}
