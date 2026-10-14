import { Plus, Trash2 } from 'lucide-react'
import { CheckboxField } from '@/components/ui/Checkbox'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/Button'
import { IconButton } from '@/components/ui/IconButton'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { useRelations, useSchemas } from '@/lib/api/queries'
import { useTable } from '@/lib/api/rows'
import type { ConstraintDef, IndexColumn, StructureChange, Table } from '@/lib/api/types.gen'
import { Field, StructureDialog } from './StructureDialog'

/** Index access methods offered; the server checks the choice against pg_am. */
const methods = ['btree', 'hash', 'gin', 'gist', 'brin', 'spgist']
const fkActions = ['no_action', 'restrict', 'cascade', 'set_null', 'set_default'] as const
/** SQL words of foreign key actions: shown as they are written in DDL, not translated. */
const fkActionSql: Record<string, string> = {
  no_action: 'NO ACTION',
  restrict: 'RESTRICT',
  cascade: 'CASCADE',
  set_null: 'SET NULL',
  set_default: 'SET DEFAULT',
}

/** Optional name of a new index or constraint (Postgres picks one when empty). */
function NameField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { t } = useTranslation()
  return (
    <Field label={t('structureEdit.keyName')}>
      {(id) => (
        <Input
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={t('structureEdit.keyNamePlaceholder')}
          autoComplete="off"
          spellCheck={false}
          className="font-mono"
        />
      )}
    </Field>
  )
}

/** An SQL condition (check, partial index), shown in the preview exactly as written. */
function ExpressionField({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (v: string) => void
}) {
  const { t } = useTranslation()
  return (
    <Field label={label}>
      {(id) => (
        <>
          <Input
            id={id}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={t('structureEdit.expressionPlaceholder')}
            autoComplete="off"
            spellCheck={false}
            className="font-mono"
          />
          <p className="text-[12px] text-muted">{t('structureEdit.expressionHint')}</p>
        </>
      )}
    </Field>
  )
}

/** Columns of the table as checkboxes, in the order they are ticked. */
function ColumnPicker({
  label,
  columns,
  value,
  onChange,
}: {
  label: string
  columns: string[]
  value: string[]
  onChange: (v: string[]) => void
}) {
  return (
    <fieldset className="flex flex-col gap-1.5">
      <legend className="mb-1.5 text-muted">{label}</legend>
      <div className="flex flex-wrap gap-x-4 gap-y-1.5 font-mono text-[12.5px]">
        {columns.map((c) => (
          <CheckboxField
            key={c}
            label={c}
            checked={value.includes(c)}
            onChange={(on) => onChange(on ? [...value, c] : value.filter((x) => x !== c))}
          />
        ))}
      </div>
    </fieldset>
  )
}

/** A new index: columns and their order, unique, method, partial WHERE, CONCURRENTLY. */
export function IndexDialog({ meta, onClose }: { meta: Table; onClose: () => void }) {
  const { t } = useTranslation()
  const names = meta.columns.map((c) => c.name)
  const [name, setName] = useState('')
  const [columns, setColumns] = useState<IndexColumn[]>([{ name: names[0] ?? '' }])
  const [unique, setUnique] = useState(false)
  const [method, setMethod] = useState('btree')
  const [where, setWhere] = useState('')
  const [concurrently, setConcurrently] = useState(false)
  const set = (i: number, c: IndexColumn) => setColumns((cs) => cs.map((x, j) => (j === i ? c : x)))
  const change: StructureChange | null =
    columns.length > 0
      ? {
          kind: 'create_index',
          schema: meta.schema,
          table: meta.name,
          index: {
            name: name || undefined,
            columns,
            unique: unique || undefined,
            method,
            where: where.trim() || undefined,
            concurrently: concurrently || undefined,
          },
        }
      : null
  return (
    <StructureDialog
      title={t('structureEdit.indexTitle', { table: `${meta.schema}.${meta.name}` })}
      change={change}
      confirmLabel={t('structureEdit.indexConfirm')}
      size="lg"
      onClose={onClose}
    >
      <NameField value={name} onChange={setName} />
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1.5 text-muted">{t('structure.columns')}</legend>
        {columns.map((c, i) => (
          <div key={i} className="flex items-center gap-3">
            <Select
              aria-label={t('structureEdit.indexColumnN', { n: i + 1 })}
              value={c.name}
              onValueChange={(v) => set(i, { ...c, name: v })}
              options={names.map((n) => ({ value: n, label: n }))}
              className="max-w-64 font-mono text-[12.5px]"
            />
            <CheckboxField
              checked={!!c.descending}
              onChange={(d) => set(i, { ...c, descending: d || undefined })}
              label={t('structureEdit.descending')}
            />
            <IconButton
              label={t('structureEdit.removeIndexColumn', { n: i + 1 })}
              icon={<Trash2 />}
              onClick={() => setColumns((cs) => cs.filter((_, j) => j !== i))}
              disabled={columns.length === 1}
            />
          </div>
        ))}
        <Button
          size="sm"
          className="self-start"
          onClick={() => setColumns((cs) => [...cs, { name: names[0] ?? '' }])}
        >
          <Plus className="size-4" />
          {t('structureEdit.addIndexColumn')}
        </Button>
      </fieldset>
      <div className="flex flex-wrap items-end gap-4">
        <Field label={t('structureEdit.method')} className="flex w-40 flex-col gap-1.5">
          {(id) => (
            <Select
              id={id}
              value={method}
              onValueChange={setMethod}
              options={methods.map((m) => ({ value: m, label: m }))}
              className="font-mono text-[12.5px]"
            />
          )}
        </Field>
        <div className="flex h-9 items-center gap-4">
          <CheckboxField checked={unique} onChange={setUnique} label={t('structureEdit.unique')} />
          <CheckboxField
            checked={concurrently}
            onChange={setConcurrently}
            label={t('structureEdit.concurrently')}
          />
        </div>
      </div>
      <ExpressionField label={t('structureEdit.where')} value={where} onChange={setWhere} />
    </StructureDialog>
  )
}

/** A new unique or check constraint. */
export function ConstraintDialog({ meta, onClose }: { meta: Table; onClose: () => void }) {
  const { t } = useTranslation()
  const [kind, setKind] = useState<'add_unique' | 'add_check'>('add_unique')
  const [name, setName] = useState('')
  const [columns, setColumns] = useState<string[]>([])
  const [expression, setExpression] = useState('')
  const [notValid, setNotValid] = useState(false)
  const def: ConstraintDef | null =
    kind === 'add_unique'
      ? columns.length > 0
        ? { name: name || undefined, columns }
        : null
      : expression.trim()
        ? { name: name || undefined, expression, not_valid: notValid || undefined }
        : null
  return (
    <StructureDialog
      title={t('structureEdit.constraintTitle', { table: `${meta.schema}.${meta.name}` })}
      change={def && { kind, schema: meta.schema, table: meta.name, constraint: def }}
      confirmLabel={t('structureEdit.constraintConfirm')}
      size="lg"
      onClose={onClose}
    >
      <Field label={t('structure.kind')} className="flex w-48 flex-col gap-1.5">
        {(id) => (
          <Select
            id={id}
            value={kind}
            onValueChange={(k) => setKind(k as typeof kind)}
            options={[
              { value: 'add_unique', label: t('structure.constraint.unique') },
              { value: 'add_check', label: t('structure.constraint.check') },
            ]}
          />
        )}
      </Field>
      <NameField value={name} onChange={setName} />
      {kind === 'add_unique' ? (
        <ColumnPicker
          label={t('structure.columns')}
          columns={meta.columns.map((c) => c.name)}
          value={columns}
          onChange={setColumns}
        />
      ) : (
        <>
          <ExpressionField
            label={t('structureEdit.condition')}
            value={expression}
            onChange={setExpression}
          />
          <CheckboxField
            checked={notValid}
            onChange={setNotValid}
            label={t('structureEdit.notValid')}
          />
        </>
      )}
    </StructureDialog>
  )
}

/** A new foreign key: columns, referenced table and columns, actions, NOT VALID. */
export function ForeignKeyDialog({ meta, onClose }: { meta: Table; onClose: () => void }) {
  const { t } = useTranslation()
  const schemas = useSchemas()
  const [name, setName] = useState('')
  const [refSchema, setRefSchema] = useState(meta.schema)
  const [refTable, setRefTable] = useState('')
  const [pairs, setPairs] = useState<{ column: string; ref: string }[]>([])
  const [onDelete, setOnDelete] = useState<string>('no_action')
  const [onUpdate, setOnUpdate] = useState<string>('no_action')
  const [notValid, setNotValid] = useState(false)
  const relations = useRelations(refSchema)
  const tables = (relations.data ?? []).filter(
    (r) => r.kind === 'table' || r.kind === 'partitioned_table',
  )
  const ready = refTable !== '' && pairs.length > 0 && pairs.every((p) => p.column && p.ref)
  const change: StructureChange | null = ready
    ? {
        kind: 'add_foreign_key',
        schema: meta.schema,
        table: meta.name,
        constraint: {
          name: name || undefined,
          columns: pairs.map((p) => p.column),
          ref_schema: refSchema,
          ref_table: refTable,
          ref_columns: pairs.map((p) => p.ref),
          on_delete: onDelete as ConstraintDef['on_delete'],
          on_update: onUpdate as ConstraintDef['on_update'],
          not_valid: notValid || undefined,
        },
      }
    : null
  const action = (label: string, value: string, onChange: (v: string) => void) => (
    <Field label={label} className="flex w-44 flex-col gap-1.5">
      {(id) => (
        <Select
          id={id}
          value={value}
          onValueChange={onChange}
          options={fkActions.map((a) => ({
            value: a,
            label: <span className="font-mono">{fkActionSql[a]}</span>,
          }))}
        />
      )}
    </Field>
  )
  return (
    <StructureDialog
      title={t('structureEdit.foreignKeyTitle', { table: `${meta.schema}.${meta.name}` })}
      change={change}
      confirmLabel={t('structureEdit.foreignKeyConfirm')}
      size="lg"
      onClose={onClose}
    >
      <NameField value={name} onChange={setName} />
      <div className="flex flex-wrap gap-3">
        <Field label={t('structureEdit.refSchema')} className="flex w-44 flex-col gap-1.5">
          {(id) => (
            <Select
              id={id}
              value={refSchema}
              onValueChange={(s) => {
                setRefSchema(s)
                setRefTable('')
                setPairs([])
              }}
              options={(schemas.data ?? [meta.schema]).map((s) => ({ value: s, label: s }))}
              className="font-mono text-[12.5px]"
            />
          )}
        </Field>
        <Field
          label={t('structureEdit.refTable')}
          className="flex min-w-48 flex-1 flex-col gap-1.5"
        >
          {(id) => (
            <Select
              id={id}
              value={refTable}
              onValueChange={(v) => {
                setRefTable(v)
                setPairs([])
              }}
              placeholder={t('structureEdit.chooseTable')}
              options={tables.map((r) => ({ value: r.name, label: r.name }))}
              className="font-mono text-[12.5px]"
            />
          )}
        </Field>
      </div>
      {refTable && (
        <KeyColumns
          meta={meta}
          refSchema={refSchema}
          refTable={refTable}
          pairs={pairs}
          onChange={setPairs}
        />
      )}
      <div className="flex flex-wrap gap-3">
        {action(t('structure.onDelete'), onDelete, setOnDelete)}
        {action(t('structure.onUpdate'), onUpdate, setOnUpdate)}
      </div>
      <CheckboxField
        checked={notValid}
        onChange={setNotValid}
        label={t('structureEdit.notValid')}
      />
    </StructureDialog>
  )
}

/** Column pairs of a foreign key; starts with one pair per primary key column of the target. */
function KeyColumns({
  meta,
  refSchema,
  refTable,
  pairs,
  onChange,
}: {
  meta: Table
  refSchema: string
  refTable: string
  pairs: { column: string; ref: string }[]
  onChange: (p: { column: string; ref: string }[]) => void
}) {
  const { t } = useTranslation()
  const ref = useTable(refSchema, refTable)
  const empty = pairs.length === 0
  useEffect(() => {
    if (!ref.data || !empty) return
    const keys = ref.data.primary_key.length
      ? ref.data.primary_key
      : [ref.data.columns[0]?.name ?? '']
    onChange(keys.map((k) => ({ column: '', ref: k })))
  }, [ref.data, empty, onChange])
  if (!ref.data) return <p className="text-muted">{t('common.loading')}</p>
  const set = (i: number, p: { column: string; ref: string }) =>
    onChange(pairs.map((x, j) => (j === i ? p : x)))
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1.5 text-muted">{t('structure.columns')}</legend>
      {pairs.map((p, i) => (
        <div key={i} className="flex flex-wrap items-center gap-2">
          <Select
            aria-label={t('structureEdit.fkColumnN', { n: i + 1 })}
            value={p.column}
            onValueChange={(v) => set(i, { ...p, column: v })}
            placeholder={t('structureEdit.chooseColumn')}
            options={meta.columns.map((c) => ({ value: c.name, label: c.name }))}
            className="max-w-56 font-mono text-[12.5px]"
          />
          <span aria-hidden className="text-muted">
            →
          </span>
          <Select
            aria-label={t('structureEdit.fkRefColumnN', { n: i + 1 })}
            value={p.ref}
            onValueChange={(v) => set(i, { ...p, ref: v })}
            options={ref.data.columns.map((c) => ({ value: c.name, label: c.name }))}
            className="max-w-56 font-mono text-[12.5px]"
          />
          <IconButton
            label={t('structureEdit.removeFkColumn', { n: i + 1 })}
            icon={<Trash2 />}
            onClick={() => onChange(pairs.filter((_, j) => j !== i))}
            disabled={pairs.length === 1}
          />
        </div>
      ))}
      <Button
        size="sm"
        className="self-start"
        onClick={() => onChange([...pairs, { column: '', ref: ref.data.columns[0]?.name ?? '' }])}
      >
        <Plus className="size-4" />
        {t('structureEdit.addFkColumn')}
      </Button>
    </fieldset>
  )
}

export type KeyAction =
  | { kind: 'drop_index'; name: string }
  | { kind: 'drop_constraint'; name: string }
  | { kind: 'validate_constraint'; name: string }

/** Drop an index or a constraint (typing its name), or validate a NOT VALID constraint. */
export function KeyActionDialog({
  meta,
  action,
  onClose,
}: {
  meta: Table
  action: KeyAction
  onClose: () => void
}) {
  const { t } = useTranslation()
  const drop = action.kind !== 'validate_constraint'
  return (
    <StructureDialog
      title={t(`structureEdit.${action.kind}Title`, { name: action.name })}
      description={drop ? t(`structureEdit.${action.kind}Description`) : undefined}
      change={{
        kind: action.kind,
        schema: meta.schema,
        table: meta.name,
        name: action.name,
        confirm: drop ? action.name : undefined,
      }}
      confirmLabel={t(`structureEdit.${action.kind}Confirm`)}
      typedName={drop ? action.name : undefined}
      onClose={onClose}
    />
  )
}
