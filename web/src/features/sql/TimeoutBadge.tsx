import { Timer } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useSqlEditor } from './store'

/** "timeout 30 s": the statement_timeout of the next runs. Click to change it (in seconds). */
export function TimeoutBadge({ defaultMs }: { defaultMs?: number }) {
  const { t } = useTranslation()
  const { timeoutMs, setTimeoutMs } = useSqlEditor()
  const [editing, setEditing] = useState(false)
  const ms = timeoutMs ?? defaultMs
  if (ms === undefined) return null
  const seconds = Math.round(ms / 1000)

  if (editing) {
    const commit = (value: string) => {
      const s = Number(value)
      if (Number.isFinite(s) && s > 0) setTimeoutMs(Math.round(s * 1000))
      setEditing(false)
    }
    return (
      <input
        type="number"
        min={1}
        autoFocus
        defaultValue={seconds}
        aria-label={t('sql.timeoutLabel')}
        onBlur={(e) => commit(e.currentTarget.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit(e.currentTarget.value)
          if (e.key === 'Escape') setEditing(false)
        }}
        className="h-6 w-20 rounded-[8px] border border-border bg-surface-2 px-2 font-mono text-[12px]"
      />
    )
  }
  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      title={t('sql.timeoutHint')}
      className="inline-flex h-6 shrink-0 items-center gap-1 rounded-[8px] border border-border bg-surface-2 px-2 font-mono text-[11px] text-muted hover:text-text"
    >
      <Timer className="size-3.5" />
      {t('sql.timeout', { s: seconds })}
    </button>
  )
}
