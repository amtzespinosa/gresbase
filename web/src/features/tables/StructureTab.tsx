import { Link } from '@tanstack/react-router'
import { Check, Copy, KeyRound, MoreHorizontal, Plus, Trash2 } from 'lucide-react'
import { DropdownMenu as M } from 'radix-ui'
import { type ReactNode, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/Button'
import { IconButton } from '@/components/ui/IconButton'
import { useReadOnly } from '@/lib/api/queries'
import { errorMessage } from '@/lib/api/errors'
import { useTableDdl } from '@/lib/api/rows'
import type { Column, ForeignKey, Table } from '@/lib/api/types.gen'
import { useFormat } from '@/lib/i18n/format'
import type { GridFilter } from './tableSearch'
import { useConnectionId } from '@/lib/api/connections'
import { AddColumnDialog, type ColumnAction, ColumnDialog } from './structure/dialogs'
import {
  ConstraintDialog,
  ForeignKeyDialog,
  IndexDialog,
  type KeyAction,
  KeyActionDialog,
} from './structure/keys'

/** SQL words of foreign key actions: shown as they are written in DDL, not translated. */
const fkAction: Record<string, string> = {
  no_action: 'NO ACTION',
  restrict: 'RESTRICT',
  cascade: 'CASCADE',
  set_null: 'SET NULL',
  set_default: 'SET DEFAULT',
}

/**
 * Description of the table: columns, indexes, constraints, keys, triggers, sizes, DDL. Tables (not
 * views) can add and change columns here, unless the connection is read-only.
 */
export function StructureTab({ meta }: { meta: Table }) {
  const { t } = useTranslation()
  const fmt = useFormat()
  const pk = new Set(meta.primary_key)
  const readOnly = useReadOnly() !== false
  const editable = !readOnly && (meta.kind === 'table' || meta.kind === 'partitioned_table')
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<{ column: Column; action: ColumnAction } | null>(null)
  const [dialog, setDialog] = useState<'index' | 'constraint' | 'foreign_key' | null>(null)
  const [keyAction, setKeyAction] = useState<KeyAction | null>(null)
  const constraintNames = new Set(meta.constraints.map((c) => c.name))
  return (
    <div className="min-h-0 flex-1 space-y-6 overflow-auto p-5">
      <Section
        title={t('structure.columns')}
        count={meta.columns.length}
        action={
          editable && (
            <Button size="sm" onClick={() => setAdding(true)}>
              <Plus className="size-4" />
              {t('structureEdit.addColumn')}
            </Button>
          )
        }
      >
        <InfoTable
          head={[
            t('structure.name'),
            t('structure.type'),
            t('structure.nullable'),
            t('structure.default'),
            t('structure.comment'),
            ...(editable ? [t('structureEdit.actions')] : []),
          ]}
          rows={meta.columns.map((c) => [
            <span key="n" className="inline-flex items-center gap-1.5">
              {pk.has(c.name) && (
                <KeyRound
                  className="size-3.5 text-accent-ink"
                  role="img"
                  aria-label={t('grid.pk')}
                />
              )}
              {c.name}
            </span>,
            <span key="t" className="text-muted">
              {c.type}
            </span>,
            c.not_null ? t('structure.no') : t('structure.yes'),
            <ColumnDefault key="d" column={c} />,
            <span key="c" className="font-sans text-muted">
              {c.comment}
            </span>,
            ...(editable
              ? [
                  <ColumnMenu
                    key="m"
                    column={c}
                    onSelect={(action) => setEditing({ column: c, action })}
                  />,
                ]
              : []),
          ])}
        />
      </Section>

      <Section
        title={t('structure.indexes')}
        count={meta.indexes.length}
        action={
          editable && (
            <Button size="sm" onClick={() => setDialog('index')}>
              <Plus className="size-4" />
              {t('structureEdit.addIndex')}
            </Button>
          )
        }
      >
        <InfoTable
          head={[
            t('structure.name'),
            t('structure.definition'),
            t('structure.size'),
            t('structure.scans'),
            ...(editable ? [t('structureEdit.actions')] : []),
          ]}
          rows={meta.indexes.map((ix) => [
            ix.name,
            <Wrap key="d">{ix.definition}</Wrap>,
            fmt.bytes(ix.size_bytes),
            fmt.number(ix.scans),
            ...(editable
              ? [
                  // An index behind a constraint goes away with the constraint.
                  constraintNames.has(ix.name) ? null : (
                    <IconButton
                      key="x"
                      label={t('structureEdit.dropIndexLabel', { name: ix.name })}
                      icon={<Trash2 />}
                      className="-my-1 size-7"
                      onClick={() => setKeyAction({ kind: 'drop_index', name: ix.name })}
                    />
                  ),
                ]
              : []),
          ])}
        />
      </Section>

      <Section
        title={t('structure.constraints')}
        count={meta.constraints.length}
        action={
          editable && (
            <Button size="sm" onClick={() => setDialog('constraint')}>
              <Plus className="size-4" />
              {t('structureEdit.addConstraint')}
            </Button>
          )
        }
      >
        <InfoTable
          head={[
            t('structure.name'),
            t('structure.kind'),
            t('structure.definition'),
            ...(editable ? [t('structureEdit.actions')] : []),
          ]}
          rows={meta.constraints.map((c) => [
            c.name,
            t(`structure.constraint.${c.type}`),
            <Wrap key="d">{c.definition}</Wrap>,
            ...(editable
              ? [
                  <span key="a" className="-my-1 inline-flex items-center gap-1">
                    {!c.validated && (
                      <Button
                        size="sm"
                        onClick={() => setKeyAction({ kind: 'validate_constraint', name: c.name })}
                      >
                        {t('structureEdit.validate')}
                      </Button>
                    )}
                    <IconButton
                      label={t('structureEdit.dropConstraintLabel', { name: c.name })}
                      icon={<Trash2 />}
                      className="size-7"
                      onClick={() => setKeyAction({ kind: 'drop_constraint', name: c.name })}
                    />
                  </span>,
                ]
              : []),
          ])}
        />
      </Section>

      <Section
        title={t('structure.foreignKeys')}
        count={meta.foreign_keys.length}
        action={
          editable && (
            <Button size="sm" onClick={() => setDialog('foreign_key')}>
              <Plus className="size-4" />
              {t('structureEdit.addForeignKey')}
            </Button>
          )
        }
      >
        <ForeignKeyTable keys={meta.foreign_keys} outgoing />
      </Section>

      <Section title={t('structure.triggers')} count={meta.triggers.length}>
        <InfoTable
          head={[t('structure.name'), t('structure.definition'), t('structure.enabled')]}
          rows={meta.triggers.map((tr) => [
            tr.name,
            <Wrap key="d">{tr.definition}</Wrap>,
            tr.enabled ? t('structure.yes') : t('structure.no'),
          ])}
        />
      </Section>

      <Section title={t('structure.sizes')}>
        <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1 font-mono text-[12.5px]">
          {(['total', 'table', 'indexes'] as const).map((k) => (
            <div key={k} className="contents">
              <dt className="font-sans text-muted">{t(`structure.size_${k}`)}</dt>
              <dd>{fmt.bytes(meta.sizes[k])}</dd>
            </div>
          ))}
        </dl>
      </Section>

      <DdlSection schema={meta.schema} table={meta.name} />
      {adding && <AddColumnDialog meta={meta} onClose={() => setAdding(false)} />}
      {editing && (
        <ColumnDialog
          key={editing.column.name + editing.action}
          meta={meta}
          column={editing.column}
          action={editing.action}
          onClose={() => setEditing(null)}
        />
      )}
      {dialog === 'index' && <IndexDialog meta={meta} onClose={() => setDialog(null)} />}
      {dialog === 'constraint' && <ConstraintDialog meta={meta} onClose={() => setDialog(null)} />}
      {dialog === 'foreign_key' && <ForeignKeyDialog meta={meta} onClose={() => setDialog(null)} />}
      {keyAction && (
        <KeyActionDialog
          key={keyAction.kind + keyAction.name}
          meta={meta}
          action={keyAction}
          onClose={() => setKeyAction(null)}
        />
      )}
    </div>
  )
}

/** Tables this one points at and tables pointing at it. */
export function RelationsTab({ meta }: { meta: Table }) {
  const { t } = useTranslation()
  return (
    <div className="min-h-0 flex-1 space-y-6 overflow-auto p-5">
      <Section title={t('structure.outgoing')} count={meta.foreign_keys.length}>
        <ForeignKeyTable keys={meta.foreign_keys} outgoing />
      </Section>
      <Section title={t('structure.incoming')} count={meta.referenced_by.length}>
        <ForeignKeyTable keys={meta.referenced_by} outgoing={false} />
      </Section>
    </div>
  )
}

function ColumnDefault({ column: c }: { column: Column }) {
  const { t } = useTranslation()
  if (c.identity) return <span>{t(`structure.identity_${c.identity}`)}</span>
  if (c.generated)
    return (
      <span>
        {t('structure.generated')} <Wrap>{c.generated}</Wrap>
      </span>
    )
  return c.default ? <Wrap>{c.default}</Wrap> : null
}

/** Foreign keys as a table; `outgoing` shows the target table, otherwise the referencing one. */
export function ForeignKeyTable({ keys, outgoing }: { keys: ForeignKey[]; outgoing: boolean }) {
  const { t } = useTranslation()
  return (
    <InfoTable
      head={[
        t('structure.name'),
        t('structure.columns'),
        t(outgoing ? 'structure.references' : 'structure.from'),
        t('structure.onDelete'),
        t('structure.onUpdate'),
      ]}
      rows={keys.map((fk) =>
        outgoing
          ? [
              fk.name,
              fk.columns.join(', '),
              <TableLink key="l" schema={fk.ref_schema} table={fk.ref_table}>
                {fk.ref_columns.join(', ')}
              </TableLink>,
              fkAction[fk.on_delete],
              fkAction[fk.on_update],
            ]
          : [
              fk.name,
              fk.ref_columns.join(', '),
              <TableLink key="l" schema={fk.schema} table={fk.table}>
                {fk.columns.join(', ')}
              </TableLink>,
              fkAction[fk.on_delete],
              fkAction[fk.on_update],
            ],
      )}
    />
  )
}

function DdlSection({ schema, table }: { schema: string; table: string }) {
  const { t } = useTranslation()
  const ddl = useTableDdl(schema, table)
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    if (!ddl.data) return
    await navigator.clipboard.writeText(ddl.data.ddl)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }
  return (
    <Section
      title={t('structure.ddl')}
      action={
        <Button size="sm" onClick={copy} disabled={!ddl.data}>
          {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
          {t(copied ? 'structure.copied' : 'structure.copy')}
        </Button>
      }
    >
      <pre className="overflow-auto rounded-[var(--radius-control)] border border-border bg-surface-2 p-3 font-mono text-[12.5px]">
        {ddl.isError ? errorMessage(ddl.error, t) : (ddl.data?.ddl ?? t('common.loading'))}
      </pre>
    </Section>
  )
}

export function Section({
  title,
  count,
  action,
  children,
}: {
  title: string
  count?: number
  action?: ReactNode
  children: ReactNode
}) {
  const { t } = useTranslation()
  return (
    <section aria-label={title}>
      <div className="mb-2 flex items-center gap-2">
        <h2 className="text-[11px] font-medium tracking-[.05em] text-muted uppercase">{title}</h2>
        {count !== undefined && <span className="font-mono text-[11px] text-muted">{count}</span>}
        <div className="ml-auto">{action}</div>
      </div>
      {count === 0 ? <p className="text-muted">{t('structure.none')}</p> : children}
    </section>
  )
}

function InfoTable({ head, rows }: { head: string[]; rows: ReactNode[][] }) {
  return (
    <div className="overflow-x-auto rounded-[var(--radius-control)] border border-border">
      <table className="w-full border-collapse text-left">
        <thead className="bg-surface-2">
          <tr>
            {head.map((h) => (
              <th key={h} scope="col" className="h-9 px-3 font-medium whitespace-nowrap">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="font-mono text-[12.5px]">
          {rows.map((cells, i) => (
            <tr key={i} className="border-t border-border">
              {cells.map((c, j) => (
                <td key={j} className="h-9 px-3 py-1.5 align-top whitespace-nowrap">
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Wrap({ children }: { children: ReactNode }) {
  return <span className="whitespace-pre-wrap">{children}</span>
}

/** `schema.table` linking to the table's view; `children` (columns) follow in parentheses. */
export function TableLink({
  schema,
  table,
  search,
  onClick,
  children,
}: {
  schema: string
  table: string
  search?: { filters: GridFilter[] }
  onClick?: () => void
  children?: ReactNode
}) {
  const connectionId = useConnectionId()
  return (
    <Link
      to="/c/$connectionId/tables/$schema/$table"
      params={{ connectionId, schema, table }}
      search={search}
      onClick={onClick}
      className="text-accent-ink hover:underline"
    >
      {schema}.{table}
      {children != null && (
        <>
          {' '}
          <span className="text-muted">({children})</span>
        </>
      )}
    </Link>
  )
}

const columnActions: ColumnAction[] = [
  'rename_column',
  'alter_column_type',
  'set_not_null',
  'set_default',
  'drop_column',
]

/** The changes a column offers; the label of NOT NULL depends on its current state. */
function ColumnMenu({ column, onSelect }: { column: Column; onSelect: (a: ColumnAction) => void }) {
  const { t } = useTranslation()
  return (
    <M.Root>
      <M.Trigger asChild>
        <IconButton
          label={t('structureEdit.columnMenu', { column: column.name })}
          icon={<MoreHorizontal />}
          tooltip={false}
          className="-my-1 size-7"
        />
      </M.Trigger>
      <M.Portal>
        <M.Content
          align="end"
          sideOffset={4}
          className="z-50 min-w-48 rounded-[var(--radius-control)] border border-border bg-surface p-1 font-sans shadow-card"
        >
          {columnActions.map((a) => (
            <M.Item
              key={a}
              onSelect={() => onSelect(a)}
              className={
                'flex h-8 cursor-pointer items-center rounded-[8px] px-2 outline-none data-[highlighted]:bg-surface-2' +
                (a === 'drop_column' ? ' text-danger' : '')
              }
            >
              {t(
                `structureEdit.menu.${a === 'set_not_null' && column.not_null ? 'drop_not_null' : a}`,
              )}
            </M.Item>
          ))}
        </M.Content>
      </M.Portal>
    </M.Root>
  )
}
