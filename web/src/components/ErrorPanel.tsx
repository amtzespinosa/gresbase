import { AlertTriangle, RotateCcw } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/Button'
import { ApiError } from '@/lib/api/client'
import { errorMessage } from '@/lib/api/errors'

interface ErrorPanelProps {
  error: unknown
  /** Shows a "Try again" button. */
  onRetry?: () => void
}

/** A failed load: the translated message, with the full Postgres error behind "Details". */
export function ErrorPanel({ error, onRetry }: ErrorPanelProps) {
  const { t } = useTranslation()
  const api = error instanceof ApiError ? error : undefined
  const raw = api?.message || (error instanceof Error ? error.message : undefined)
  return (
    <div role="alert" className="m-5 rounded-[var(--radius-control)] border border-danger/40 p-4">
      <p className="flex items-center gap-2 text-danger">
        <AlertTriangle className="size-4 shrink-0" />
        {errorMessage(error, t)}
      </p>
      {raw && (
        <details className="mt-2 font-mono text-[12px] text-muted">
          <summary className="cursor-pointer">{t('common.details')}</summary>
          <p className="mt-1 whitespace-pre-wrap text-text">{raw}</p>
          {api?.detail && <p className="whitespace-pre-wrap">{api.detail}</p>}
          {api?.hint && <p className="whitespace-pre-wrap">{api.hint}</p>}
          {api?.pgCode && <p>SQLSTATE {api.pgCode}</p>}
        </details>
      )}
      {onRetry && (
        <Button size="sm" className="mt-3" onClick={onRetry}>
          <RotateCcw className="size-4" />
          {t('common.retry')}
        </Button>
      )}
    </div>
  )
}

/** Router error boundary: a route that throws keeps the shell and shows the error in place. */
export function RouteError({ error, reset }: { error: unknown; reset: () => void }) {
  return <ErrorPanel error={error} onRetry={reset} />
}
