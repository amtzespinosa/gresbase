import { useNavigate } from '@tanstack/react-router'
import { ExternalLink } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { CellView } from '@/components/grid/CellView'
import { Button } from '@/components/ui/Button'
import { Sheet } from '@/components/ui/Sheet'
import { errorMessage } from '@/lib/api/errors'
import { useReferencedBy, useRows, useTable } from '@/lib/api/rows'
import type { Cell, CellMap, ForeignKey, Query, Table } from '@/lib/api/types.gen'
import { useFormat } from '@/lib/i18n/format'
import { Section, TableLink } from './StructureTab'
import { type GridFilter, eqFilters } from './tableSearch'
import { useConnectionId } from '@/lib/api/connections'

/** A clicked foreign key cell: the key and the row's values of its columns, in order. */
export interface FkTarget {
  fk: ForeignKey
  values: Cell[]
}

/** Side panel with the row a foreign key points at, who else references it and "Open table". */
export function FkSheet({ target, onClose }: { target: FkTarget | null; onClose: () => void }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const connectionId = useConnectionId()
  const fk = target?.fk
  const filters = target ? eqFilters(target.fk.ref_columns, target.values) : []
  const open = () => {
    if (!fk) return
    onClose()
    void navigate({
      to: '/c/$connectionId/tables/$schema/$table',
      params: { connectionId, schema: fk.ref_schema, table: fk.ref_table },
      search: { filters },
    })
  }
  return (
    <Sheet
      open={target !== null}
      onOpenChange={(o) => !o && onClose()}
      title={fk ? `${fk.ref_schema}.${fk.ref_table}` : ''}
      description={t('fk.description')}
      footer={
        <Button variant="primary" onClick={open}>
          <ExternalLink className="size-4" />
          {t('fk.openTable')}
        </Button>
      }
    >
      {fk && <ReferencedRow fk={fk} filters={filters} onNavigate={onClose} />}
    </Sheet>
  )
}

function ReferencedRow({
  fk,
  filters,
  onNavigate,
}: {
  fk: ForeignKey
  filters: GridFilter[]
  onNavigate: () => void
}) {
  const { t } = useTranslation()
  const meta = useTable(fk.ref_schema, fk.ref_table)
  const query: Query = {
    filters: filters.map((f) => ({ column: f.column, op: f.op, value: f.value })),
    logic: 'and',
    sort: [],
    limit: 1,
    cursor: null,
    offset: null,
  }
  const page = useRows(fk.ref_schema, fk.ref_table, query)
  if (meta.isError || page.isError) {
    return <p className="text-danger">{errorMessage(meta.error ?? page.error, t)}</p>
  }
  if (!meta.data || !page.data || page.isPlaceholderData) {
    return <p className="text-muted">{t('common.loading')}</p>
  }
  const cells = page.data.rows[0]
  if (!cells) return <p className="text-muted">{t('fk.missing')}</p>
  const row: CellMap = {}
  page.data.columns.forEach((c, i) => (row[c.name] = cells[i] ?? null))
  const types = new Map(meta.data.columns.map((c) => [c.name, c]))
  return (
    <div className="flex flex-col gap-6">
      <dl className="flex flex-col gap-3">
        {page.data.columns.map((c, i) => {
          const m = types.get(c.name)
          return (
            <div key={c.name} className="flex flex-col gap-1">
              <dt className="flex items-baseline gap-2">
                <span className="font-mono text-[12.5px] font-medium">{c.name}</span>
                <span className="truncate font-mono text-[11px] text-muted">{c.type}</span>
              </dt>
              <dd className="flex min-w-0 font-mono text-[12.5px]">
                <CellView
                  value={cells[i] ?? null}
                  json={!!m && !m.is_array && (m.base_type === 'json' || m.base_type === 'jsonb')}
                />
              </dd>
            </div>
          )
        })}
      </dl>
      <ReferencedBy meta={meta.data} row={row} onNavigate={onNavigate} />
    </div>
  )
}

/** Tables that reference `row` of `meta`, with how many rows each and a link to them filtered. */
export function ReferencedBy({
  meta,
  row,
  onNavigate,
}: {
  meta: Table
  row: CellMap
  onNavigate?: () => void
}) {
  const { t } = useTranslation()
  const fmt = useFormat()
  const usable = meta.has_primary_key && meta.primary_key.every((c) => row[c] != null)
  const pk = usable ? Object.fromEntries(meta.primary_key.map((c) => [c, row[c] ?? null])) : null
  const refs = useReferencedBy(meta.schema, meta.name, pk)
  if (!usable || meta.referenced_by.length === 0) return null
  return (
    <Section title={t('fk.referencedBy')}>
      {refs.isError ? (
        <p className="text-danger">{errorMessage(refs.error, t)}</p>
      ) : !refs.data ? (
        <p className="text-muted">{t('common.loading')}</p>
      ) : (
        <ul className="flex flex-col gap-1.5 font-mono text-[12.5px]">
          {refs.data.map((r) => {
            const values = r.ref_columns.map((c) => row[c] ?? null)
            return (
              <li key={`${r.schema}.${r.table}.${r.constraint}`} className="flex gap-3">
                <TableLink
                  schema={r.schema}
                  table={r.table}
                  search={
                    values.every((v) => v !== null)
                      ? { filters: eqFilters(r.columns, values) }
                      : undefined
                  }
                  onClick={onNavigate}
                >
                  {r.columns.join(', ')}
                </TableLink>
                <span className="ml-auto shrink-0 text-muted">
                  {t('fk.rows', { count: r.count, n: fmt.number(r.count) })}
                </span>
              </li>
            )
          })}
        </ul>
      )}
    </Section>
  )
}
