import type { TFunction } from 'i18next'
import { CheckboxField } from '@/components/ui/Checkbox'
import { Copy } from 'lucide-react'
import { type FormEvent, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { cellText } from '@/components/grid/cellValue'
import { Button } from '@/components/ui/Button'
import { Sheet } from '@/components/ui/Sheet'
import type { Cell, CellMap, Column, Table } from '@/lib/api/types.gen'
import { type ParseError, editorKind, isRequired, parseEdit, toEditText } from './editors'
import { type ExistingRow, newInsertId, omit, tableKey, useChanges } from './queue'
import { ValueInput } from './ValueInput'
import { ReferencedBy } from '../FkSheet'

/** What the row panel shows: an existing row, a pending new row, or a new row to create. */
export type RowSheetTarget =
  | { kind: 'edit'; row: ExistingRow; current: CellMap }
  | { kind: 'insert'; id?: string; initial: CellMap }

interface RowSheetProps {
  meta: Table
  target: RowSheetTarget | null
  onClose: () => void
  /** Opens the panel on another target (duplicate). */
  onOpen: (target: RowSheetTarget) => void
}

interface Field {
  text: string
  isNull: boolean
}

/** Side panel to see and edit a whole row, or to fill in a new one. Changes go to the queue. */
export function RowSheet({ meta, target, onClose, onOpen }: RowSheetProps) {
  const { t } = useTranslation()
  return (
    <Sheet
      open={target !== null}
      onOpenChange={(open) => !open && onClose()}
      title={t(target?.kind === 'insert' ? 'rowSheet.insertTitle' : 'rowSheet.editTitle')}
      description={t('rowSheet.description')}
      flush
    >
      {target && (
        <RowForm
          // A new target starts a fresh form.
          key={JSON.stringify(target)}
          meta={meta}
          target={target}
          onDone={onClose}
          onDuplicate={(initial) => onOpen({ kind: 'insert', initial })}
        />
      )}
    </Sheet>
  )
}

function initialFields(meta: Table, values: CellMap): Record<string, Field> {
  const fields: Record<string, Field> = {}
  for (const c of meta.columns) {
    const kind = editorKind(c)
    const v = values[c.name]
    fields[c.name] = { text: kind && v != null ? toEditText(kind, v) : '', isNull: v === null }
  }
  return fields
}

function RowForm({
  meta,
  target,
  onDone,
  onDuplicate,
}: {
  meta: Table
  target: RowSheetTarget
  onDone: () => void
  onDuplicate: (initial: CellMap) => void
}) {
  const { t } = useTranslation()
  const dispatch = useChanges((s) => s.dispatch)
  const insert = target.kind === 'insert'
  const values = insert ? target.initial : target.current
  const [fields, setFields] = useState(() => initialFields(meta, values))
  const [errors, setErrors] = useState<Record<string, ParseError>>({})
  const set = (name: string, f: Partial<Field>) => {
    setFields((s) => ({ ...s, [name]: { ...s[name], ...f } as Field }))
    setErrors((e) => omit(e, name))
  }

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const out: CellMap = {}
    const errs: Record<string, ParseError> = {}
    for (const c of meta.columns) {
      const kind = editorKind(c)
      const f = fields[c.name]
      if (!kind || !f) continue
      if (f.isNull) {
        out[c.name] = null
        continue
      }
      // In a new row an empty field means "use the default".
      if (insert && f.text === '') continue
      const r = parseEdit(kind, f.text)
      if (r.ok) out[c.name] = r.value
      else errs[c.name] = r.error
    }
    setErrors(errs)
    if (Object.keys(errs).length > 0) return
    const key = tableKey(meta.schema, meta.name)
    if (target.kind === 'edit') {
      dispatch(key, { type: 'set', row: target.row, values: out })
    } else if (target.id) {
      for (const c of meta.columns)
        dispatch(key, { type: 'setInsert', id: target.id, column: c.name, value: out[c.name] })
    } else {
      dispatch(key, { type: 'insert', id: newInsertId(), values: out })
    }
    onDone()
  }

  // Duplicating copies what the user can set, except the primary key.
  const duplicate = () => {
    const pk = new Set(meta.primary_key)
    const initial: CellMap = {}
    for (const c of meta.columns) {
      const v = values[c.name]
      if (!pk.has(c.name) && editorKind(c) && v !== undefined) initial[c.name] = v
    }
    onDuplicate(initial)
  }

  return (
    // The fields scroll; the footer stays at the bottom edge of the panel.
    <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-auto p-4">
        {meta.columns.map((c) => (
          <FieldRow
            key={c.name}
            column={c}
            field={fields[c.name] ?? { text: '', isNull: false }}
            value={values[c.name]}
            insert={insert}
            error={errors[c.name]}
            onChange={(f) => set(c.name, f)}
          />
        ))}
        {target.kind === 'edit' && (
          <ReferencedBy meta={meta} row={target.current} onNavigate={onDone} />
        )}
      </div>
      <div
        data-testid="row-sheet-footer"
        className="flex shrink-0 justify-end gap-2 border-t border-border p-4"
      >
        {!insert && (
          <Button onClick={duplicate} className="mr-auto">
            <Copy className="size-4" />
            {t('rowSheet.duplicate')}
          </Button>
        )}
        <Button onClick={onDone}>{t('rowSheet.cancel')}</Button>
        <Button type="submit" variant="primary">
          {t(
            insert && !(target.kind === 'insert' && target.id) ? 'rowSheet.add' : 'rowSheet.apply',
          )}
        </Button>
      </div>
    </form>
  )
}

/** What an empty field becomes in a new row. */
function insertHint(c: Column, t: TFunction): string {
  if (c.identity !== '') return t('rowSheet.automatic')
  if (c.default !== null) return t('rowSheet.defaultValue', { value: c.default })
  return t(isRequired(c) ? 'rowSheet.requiredHint' : 'rowSheet.nullHint')
}

function FieldRow({
  column: c,
  field,
  value,
  insert,
  error,
  onChange,
}: {
  column: Column
  field: Field
  value: Cell | undefined
  insert: boolean
  error?: ParseError
  onChange: (f: Partial<Field>) => void
}) {
  const { t } = useTranslation()
  const kind = editorKind(c)
  const id = `field-${c.name}`
  const required = insert && isRequired(c)
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-baseline gap-2">
        <label htmlFor={id} className="font-mono text-[12.5px] font-medium">
          {c.name}
          {required && (
            <span className="text-danger" aria-label={t('rowSheet.required')}>
              {' *'}
            </span>
          )}
        </label>
        <span className="min-w-0 truncate font-mono text-[11px] text-muted">{c.type}</span>
        {kind && !c.not_null && (
          <CheckboxField
            className="ml-auto gap-1 text-[12px] text-muted"
            label={t('grid.null')}
            checked={field.isNull}
            onChange={(isNull) => onChange({ isNull })}
          />
        )}
      </div>
      {!kind ? (
        <p id={id} className="font-mono text-[12.5px] text-muted">
          {insert ? t('rowSheet.automatic') : value == null ? t('grid.null') : cellText(value)}
        </p>
      ) : field.isNull ? (
        <p id={id} className="font-mono text-[12.5px] text-muted italic">
          {t('grid.null')}
        </p>
      ) : (
        <ValueInput
          id={id}
          kind={kind}
          column={c}
          value={field.text}
          onChange={(text) => onChange({ text })}
          label={c.name}
          multiline={kind === 'text' && field.text.length > 40}
          invalid={!!error}
          placeholder={insert ? insertHint(c, t) : undefined}
        />
      )}
      {error && <p className="text-[12px] text-danger">{t(`edit.invalid.${error}`)}</p>}
    </div>
  )
}
