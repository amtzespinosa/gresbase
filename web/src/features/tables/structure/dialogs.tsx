import { useNavigate } from '@tanstack/react-router'
import { CheckboxField } from '@/components/ui/Checkbox'
import { Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/Button'
import { IconButton } from '@/components/ui/IconButton'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { useConnectionId } from '@/lib/api/connections'
import { useSchemas } from '@/lib/api/queries'
import type {
  Column,
  ColumnDef,
  Default,
  StructureChange,
  Table,
  TypeSpec,
} from '@/lib/api/types.gen'
import { ColumnFields, DefaultField, Field, StructureDialog, TypeField } from './StructureDialog'

const emptyColumn = (): ColumnDef => ({ name: '', type: { name: '' }, not_null: false })

/** Whether a column definition is complete enough to preview. */
const columnReady = (c: ColumnDef) => c.name.trim() !== '' && c.type.name.trim() !== ''

function useOpenTable() {
  const navigate = useNavigate()
  const connectionId = useConnectionId()
  return (schema: string, table: string) =>
    void navigate({
      to: '/c/$connectionId/tables/$schema/$table',
      params: { connectionId, schema, table },
      search: { tab: 'structure' },
    })
}

interface NewColumn {
  key: number
  def: ColumnDef
  pk: boolean
}

/** A new table: schema, name, columns (with the primary key) and comment. */
export function CreateTableDialog({ schema, onClose }: { schema: string; onClose: () => void }) {
  const { t } = useTranslation()
  const schemas = useSchemas()
  const open = useOpenTable()
  const [target, setTarget] = useState(schema)
  const [name, setName] = useState('')
  const [comment, setComment] = useState('')
  const [next, setNext] = useState(1)
  const [columns, setColumns] = useState<NewColumn[]>([
    {
      key: 0,
      def: { name: 'id', type: { name: 'bigint' }, not_null: false, identity: 'by_default' },
      pk: true,
    },
  ])
  const set = (key: number, patch: Partial<NewColumn>) =>
    setColumns((cs) => cs.map((c) => (c.key === key ? { ...c, ...patch } : c)))

  const change: StructureChange | null =
    name.trim() && columns.length > 0 && columns.every((c) => columnReady(c.def))
      ? {
          kind: 'create_table',
          schema: target,
          table: name,
          columns: columns.map((c) => c.def),
          primary_key: columns.filter((c) => c.pk).map((c) => c.def.name),
          comment: comment || undefined,
        }
      : null

  return (
    <StructureDialog
      title={t('structureEdit.createTitle')}
      change={change}
      confirmLabel={t('structureEdit.createConfirm')}
      size="lg"
      onClose={onClose}
      onDone={() => open(target, name)}
    >
      <div className="flex flex-wrap gap-3">
        <Field label={t('tables.schema')} className="flex w-44 flex-col gap-1.5">
          {(id) => (
            <Select
              id={id}
              value={target}
              onValueChange={setTarget}
              options={(schemas.data ?? [schema]).map((s) => ({ value: s, label: s }))}
              className="font-mono text-[12.5px]"
            />
          )}
        </Field>
        <Field
          label={t('structureEdit.tableName')}
          className="flex min-w-48 flex-1 flex-col gap-1.5"
        >
          {(id) => (
            <Input
              id={id}
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
              autoComplete="off"
              spellCheck={false}
              className="font-mono"
            />
          )}
        </Field>
      </div>
      <Field label={t('structure.comment')}>
        {(id) => <Input id={id} value={comment} onChange={(e) => setComment(e.target.value)} />}
      </Field>
      <div className="flex flex-col gap-3">
        <p className="section-label">{t('structure.columns')}</p>
        {columns.map((c, i) => (
          <fieldset
            key={c.key}
            aria-label={t('structureEdit.columnN', { n: i + 1 })}
            className="flex flex-col gap-3 rounded-[var(--radius-control)] border border-border p-3"
          >
            <ColumnFields value={c.def} onChange={(def) => set(c.key, { def })} />
            <div className="flex items-center justify-between">
              <CheckboxField
                checked={c.pk}
                onChange={(pk) => set(c.key, { pk })}
                label={t('structureEdit.primaryKey')}
              />
              <IconButton
                label={t('structureEdit.removeColumn', { n: i + 1 })}
                icon={<Trash2 />}
                onClick={() => setColumns((cs) => cs.filter((x) => x.key !== c.key))}
                disabled={columns.length === 1}
              />
            </div>
          </fieldset>
        ))}
        <Button
          size="sm"
          className="self-start"
          onClick={() => {
            setColumns((cs) => [...cs, { key: next, def: emptyColumn(), pk: false }])
            setNext(next + 1)
          }}
        >
          <Plus className="size-4" />
          {t('structureEdit.addColumnRow')}
        </Button>
      </div>
    </StructureDialog>
  )
}

/** A new column of an existing table. */
export function AddColumnDialog({ meta, onClose }: { meta: Table; onClose: () => void }) {
  const { t } = useTranslation()
  const [def, setDef] = useState<ColumnDef>(emptyColumn)
  return (
    <StructureDialog
      title={t('structureEdit.addColumnTitle', { table: `${meta.schema}.${meta.name}` })}
      change={
        columnReady(def) ? { kind: 'add_column', schema: meta.schema, table: meta.name, def } : null
      }
      confirmLabel={t('structureEdit.addColumnConfirm')}
      onClose={onClose}
    >
      <ColumnFields value={def} onChange={setDef} />
    </StructureDialog>
  )
}

export type ColumnAction =
  'rename_column' | 'alter_column_type' | 'set_not_null' | 'set_default' | 'drop_column'

/** One change to an existing column. */
export function ColumnDialog({
  meta,
  column,
  action,
  onClose,
}: {
  meta: Table
  column: Column
  action: ColumnAction
  onClose: () => void
}) {
  const { t } = useTranslation()
  const [name, setName] = useState(column.name)
  // The current type, as far as the picker can tell (modifiers are entered apart).
  const [type, setType] = useState<TypeSpec>({
    name: column.type.replace(/\[\]$/, '').replace(/\(.*?\)/, ''),
    array: column.is_array,
  })
  const [using, setUsing] = useState(false)
  const [def, setDef] = useState<Default | undefined>(undefined)
  const base = { schema: meta.schema, table: meta.name, column: column.name }
  const change: StructureChange | null = (() => {
    switch (action) {
      case 'rename_column':
        return name.trim() && name !== column.name ? { ...base, kind: action, name } : null
      case 'alter_column_type':
        return type.name.trim() ? { ...base, kind: action, type, using } : null
      case 'set_not_null':
        return { ...base, kind: action, not_null: !column.not_null }
      case 'set_default':
        return { ...base, kind: action, default: def }
      case 'drop_column':
        return { ...base, kind: action, confirm: column.name }
    }
  })()
  const key =
    action === 'set_not_null' ? (column.not_null ? 'drop_not_null' : 'set_not_null') : action
  return (
    <StructureDialog
      title={t(`structureEdit.${key}Title`, { column: column.name })}
      description={action === 'drop_column' ? t('structureEdit.dropColumnDescription') : undefined}
      change={change}
      confirmLabel={t(`structureEdit.${key}Confirm`)}
      typedName={action === 'drop_column' ? column.name : undefined}
      onClose={onClose}
    >
      {action === 'rename_column' && (
        <Field label={t('structureEdit.newName')}>
          {(id) => (
            <Input
              id={id}
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
              autoComplete="off"
              spellCheck={false}
              className="font-mono"
            />
          )}
        </Field>
      )}
      {action === 'alter_column_type' && (
        <>
          <p className="text-muted">
            {t('structureEdit.currentType')}{' '}
            <span className="font-mono text-text">{column.type}</span>
          </p>
          <TypeField label={t('structureEdit.newType')} value={type} onChange={setType} />
          <CheckboxField checked={using} onChange={setUsing} label={t('structureEdit.using')} />
        </>
      )}
      {action === 'set_default' && (
        <>
          {column.default && (
            <p className="text-muted">
              {t('structureEdit.currentDefault')}{' '}
              <span className="font-mono text-text">{column.default}</span>
            </p>
          )}
          <DefaultField label={t('structureEdit.newDefault')} value={def} onChange={setDef} />
        </>
      )}
    </StructureDialog>
  )
}

export type TableAction = 'rename_table' | 'set_table_comment' | 'set_table_schema'

/** Rename a table, change its comment or move it to another schema. */
export function TableDialog({
  schema: current,
  table,
  comment: currentComment,
  action,
  onClose,
}: {
  schema: string
  table: string
  comment: string | null
  action: TableAction
  onClose: () => void
}) {
  const { t } = useTranslation()
  const schemas = useSchemas()
  const open = useOpenTable()
  const [name, setName] = useState(table)
  const [comment, setComment] = useState(currentComment ?? '')
  const [schema, setSchema] = useState(current)
  const base = { schema: current, table }
  const change: StructureChange | null =
    action === 'rename_table'
      ? name.trim() && name !== table
        ? { ...base, kind: action, name }
        : null
      : action === 'set_table_schema'
        ? schema !== current
          ? { ...base, kind: action, name: schema }
          : null
        : { ...base, kind: action, comment }
  return (
    <StructureDialog
      title={t(`structureEdit.${action}Title`, { table: `${current}.${table}` })}
      change={change}
      confirmLabel={t(`structureEdit.${action}Confirm`)}
      onClose={onClose}
      onDone={() => {
        if (action === 'rename_table') open(current, name)
        if (action === 'set_table_schema') open(schema, table)
      }}
    >
      {action === 'rename_table' && (
        <Field label={t('structureEdit.newName')}>
          {(id) => (
            <Input
              id={id}
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
              autoComplete="off"
              spellCheck={false}
              className="font-mono"
            />
          )}
        </Field>
      )}
      {action === 'set_table_comment' && (
        <Field label={t('structure.comment')}>
          {(id) => (
            <Input id={id} value={comment} onChange={(e) => setComment(e.target.value)} autoFocus />
          )}
        </Field>
      )}
      {action === 'set_table_schema' && (
        <Field label={t('tables.schema')}>
          {(id) => (
            <Select
              id={id}
              value={schema}
              onValueChange={setSchema}
              options={(schemas.data ?? [current]).map((s) => ({ value: s, label: s }))}
              className="font-mono text-[12.5px]"
            />
          )}
        </Field>
      )}
    </StructureDialog>
  )
}
