import {
  type FocusEvent,
  type KeyboardEvent,
  type ReactNode,
  lazy,
  Suspense,
  useState,
} from 'react'
import { useTranslation } from 'react-i18next'
import { Select } from '@/components/ui/Select'
import type { Cell, Column } from '@/lib/api/types.gen'
import { cn } from '@/lib/cn'
import { isMac, modKey } from '@/lib/platform'
import { matchesShortcut } from '@/lib/shortcuts'
import { type EditorKind, type ParseError, isMultiline, parseEdit, toEditText } from './editors'

export const fieldClass =
  'w-full rounded-[var(--radius-control)] border border-border bg-surface-2 px-2 font-mono text-[12.5px] text-text ' +
  'placeholder:text-muted focus-visible:outline-2 focus-visible:outline-accent aria-[invalid=true]:border-danger'

/** The field inside the grid's cell editor: no box of its own, the editor around it is the cell. */
export const bareFieldClass =
  'w-full flex-1 border-0 bg-transparent px-[14px] font-mono text-[12.5px] text-text outline-none placeholder:text-muted'

// CodeMirror loads with the first json/array editor, outside the initial bundle.
const JsonEditor = lazy(() => import('./JsonEditor').then((m) => ({ default: m.JsonEditor })))

interface ValueInputProps {
  kind: EditorKind
  column: Column
  value: string
  onChange: (text: string) => void
  label: string
  placeholder?: string
  invalid?: boolean
  autoFocus?: boolean
  /** Forces the multi-line editor (row panel); otherwise long text picks it on its own. */
  multiline?: boolean
  onKeyDown?: (e: KeyboardEvent) => void
  id?: string
  /** Inside the grid's cell editor: no border, background or radius of its own. */
  bare?: boolean
}

/** The input for one value, by editor kind. Shared by the in-grid editor and the row panel. */
export function ValueInput({
  kind,
  column,
  value,
  onChange,
  label,
  placeholder,
  invalid,
  autoFocus,
  multiline,
  onKeyDown,
  id,
  bare,
}: ValueInputProps) {
  const field = bare ? bareFieldClass : fieldClass
  const common = {
    id,
    'aria-label': label,
    'aria-invalid': invalid || undefined,
    autoFocus,
    onKeyDown,
  }
  if (kind === 'bool' || kind === 'enum') {
    const options = kind === 'bool' ? ['true', 'false'] : column.enum_values
    return (
      <Select
        {...common}
        className={
          bare
            ? 'h-auto! flex-1 rounded-none! border-0! bg-transparent! px-[14px]! font-mono text-[12.5px]'
            : 'h-8 bg-surface-2 px-2 font-mono text-[12.5px]'
        }
        value={value}
        onValueChange={onChange}
        placeholder={placeholder}
        options={options.map((o) => ({ value: o, label: o }))}
      />
    )
  }
  if (kind === 'json' || kind === 'array') {
    return (
      <Suspense fallback={<div className={cn(field, 'min-h-24')} />}>
        <JsonEditor
          {...common}
          bare={bare}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
        />
      </Suspense>
    )
  }
  if (kind === 'text' && (multiline || isMultiline(kind, value))) {
    return (
      <textarea
        {...common}
        className={cn(field, 'min-h-24 py-1.5')}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    )
  }
  return (
    <input
      {...common}
      // A native date picker is enough; timestamps keep their time zone, so they stay text.
      type={kind === 'date' ? 'date' : 'text'}
      inputMode={kind === 'integer' ? 'numeric' : kind === 'number' ? 'decimal' : undefined}
      className={cn(field, bare ? 'min-h-0' : 'h-8')}
      value={value}
      placeholder={placeholder ?? (kind === 'datetime' ? 'YYYY-MM-DD HH:MM:SS+00' : undefined)}
      onChange={(e) => onChange(e.target.value)}
    />
  )
}

interface CellEditorProps {
  column: Column
  kind: EditorKind
  initial: Cell
  /** `move` is 1 or -1 when the user left with Tab / Shift+Tab. */
  onCommit: (value: Cell, move?: 1 | -1) => void
  onCancel: () => void
}

/** The editor that opens over a grid cell: Enter saves to the queue, Esc cancels, Tab moves on. */
export function CellEditor({ column, kind, initial, onCommit, onCancel }: CellEditorProps) {
  const { t } = useTranslation()
  const [text, setText] = useState(() => toEditText(kind, initial))
  const [error, setError] = useState<ParseError | null>(null)
  const [multi] = useState(() => isMultiline(kind, text))

  const commit = (move?: 1 | -1) => {
    const r = parseEdit(kind, text)
    if (!r.ok) {
      setError(r.error)
      return false
    }
    onCommit(r.value, move)
    return true
  }
  const onKeyDown = (e: KeyboardEvent) => {
    const mod = isMac ? e.metaKey : e.ctrlKey
    if (matchesShortcut(e, 'save')) {
      // Keep what was typed: put it in the queue and let Mod+S go on to save. An invalid value
      // stays in the editor and nothing is saved.
      if (!commit()) {
        e.preventDefault()
        e.stopPropagation()
      }
    } else if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      onCancel()
    } else if (e.key === 'Enter' && (!multi || mod)) {
      e.preventDefault()
      e.stopPropagation()
      commit()
    } else if (e.key === 'Tab') {
      e.preventDefault()
      e.stopPropagation()
      commit(e.shiftKey ? -1 : 1)
    }
  }
  // Clicking outside saves a valid value and drops an invalid one. The list of a Select opens in
  // a portal, so focus moving into it is not "outside".
  const onBlur = (e: FocusEvent<HTMLDivElement>) => {
    const to = e.relatedTarget as Element | null
    if (e.currentTarget.contains(to) || to?.closest('[role="listbox"]')) return
    if (!commit()) onCancel()
  }

  let hint: ReactNode = null
  if (error) hint = <p className="text-danger">{t(`edit.invalid.${error}`)}</p>
  else if (multi) hint = <p className="text-muted">{t('edit.multilineHint', { mod: modKey })}</p>
  return (
    <div
      data-testid="cell-editor"
      onBlur={onBlur}
      // The editor is the cell itself, grown over its neighbours: the accent border is the focus mark,
      // with rounded corners, right on the light background, with no field box inside.
      className="flex flex-1 flex-col overflow-hidden rounded-[6px] border-2 border-accent [&_:focus-visible]:outline-none"
    >
      <ValueInput
        kind={kind}
        column={column}
        value={text}
        onChange={(v) => {
          setText(v)
          setError(null)
        }}
        label={t('edit.cellLabel', { column: column.name })}
        invalid={error !== null}
        autoFocus
        onKeyDown={onKeyDown}
        bare
      />
      {hint && <div className="px-[14px] pb-1 font-sans text-[11px]">{hint}</div>}
    </div>
  )
}
