import { ArrowDown, ArrowUp, ArrowUpDown, Filter, Plus, X } from 'lucide-react'
import { Popover } from 'radix-ui'
import { type FormEvent, type ReactNode, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ExportMenu } from '@/components/ExportMenu'
import { Button } from '@/components/ui/Button'
import { IconButton } from '@/components/ui/IconButton'
import { Input } from '@/components/ui/Input'
import { SegmentedControl } from '@/components/ui/SegmentedControl'
import { Select } from '@/components/ui/Select'
import type { Column, FilterOp } from '@/lib/api/types.gen'
import { cn } from '@/lib/cn'
import { type GridFilter, type TableSearch, opsFor, valueKind } from './tableSearch'

interface ToolbarProps {
  columns: Column[]
  search: TableSearch
  update: (patch: Partial<TableSearch>) => void
  /** Extra buttons on the right (View SQL…). */
  actions?: ReactNode
  /** Download link of the filtered table in each format. */
  exportHref: (format: 'csv' | 'json') => string
}

export function TableToolbar({ columns, search, update, actions, exportHref }: ToolbarProps) {
  const { t } = useTranslation()
  const { filters, logic, sort } = search
  return (
    <div className="flex min-h-12 shrink-0 flex-wrap items-center gap-2 border-b border-border px-4 py-2">
      <FilterPopover columns={columns} onAdd={(f) => update({ filters: [...filters, f] })} />
      <SortPopover columns={columns} sort={sort} onChange={(s) => update({ sort: s })} />
      {filters.map((f, i) => (
        <span
          key={i}
          className="inline-flex h-7 items-center gap-1 rounded-[8px] bg-accent-tint pr-1 pl-2 font-mono text-[12px] text-accent-ink"
        >
          {filterLabel(f, t)}
          <button
            type="button"
            aria-label={t('filter.remove')}
            onClick={() => update({ filters: filters.filter((_, j) => j !== i) })}
            className="cursor-pointer rounded p-0.5 hover:bg-accent-tint"
          >
            <X className="size-3.5" />
          </button>
        </span>
      ))}
      {filters.length > 1 && (
        <SegmentedControl<'and' | 'or'>
          label={t('filter.logic')}
          value={logic}
          onChange={(v) => update({ logic: v })}
          options={[
            { value: 'and', label: t('filter.and') },
            { value: 'or', label: t('filter.or') },
          ]}
        />
      )}
      <div className="ml-auto flex items-center gap-2">
        {actions}
        <ExportMenu
          items={[
            { label: t('export.csv'), href: exportHref('csv') },
            { label: t('export.json'), href: exportHref('json') },
          ]}
        />
      </div>
    </div>
  )
}

type T = ReturnType<typeof useTranslation>['t']

function filterLabel(f: GridFilter, t: T): string {
  const op = t(`filter.ops.${f.op}`)
  if (f.op === 'is_null' || f.op === 'not_null') return `${f.column} ${op}`
  const v = Array.isArray(f.value)
    ? f.value.join(f.op === 'between' ? ` ${t('filter.and').toLowerCase()} ` : ', ')
    : typeof f.value === 'string'
      ? f.value
      : JSON.stringify(f.value)
  return `${f.column} ${op} ${v}`
}

const popoverClass =
  'z-50 w-[300px] rounded-[var(--radius-control)] border border-border bg-surface p-3 shadow-card'
const selectClass = 'px-2 font-mono text-[12.5px]'

function FilterPopover({ columns, onAdd }: { columns: Column[]; onAdd: (f: GridFilter) => void }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [column, setColumn] = useState(columns[0]?.name ?? '')
  const col = columns.find((c) => c.name === column) ?? columns[0]
  const ops = col ? opsFor(col) : []
  const [opChoice, setOp] = useState<FilterOp>('eq')
  const op = ops.includes(opChoice) ? opChoice : ops[0]
  const [a, setA] = useState('')
  const [b, setB] = useState('')
  const [error, setError] = useState(false)
  const kind = op ? valueKind(op) : 'none'

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!col || !op) return
    let value: unknown
    if (kind === 'one') value = a
    if (kind === 'two') value = [a, b]
    if (kind === 'list')
      value = a
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
    if (kind === 'json') {
      try {
        value = JSON.parse(a)
      } catch {
        setError(true)
        return
      }
    }
    onAdd({ column: col.name, op, value })
    setA('')
    setB('')
    setError(false)
    setOpen(false)
  }

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <Button size="sm" disabled={columns.length === 0}>
          <Filter className="size-4" />
          {t('filter.button')}
        </Button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content align="start" sideOffset={6} className={popoverClass}>
          <form onSubmit={submit} className="flex flex-col gap-2">
            <label className="section-label" htmlFor="filter-column">
              {t('filter.column')}
            </label>
            <Select
              id="filter-column"
              className={selectClass}
              value={col?.name ?? ''}
              onValueChange={setColumn}
              options={columns.map((c) => ({ value: c.name, label: c.name }))}
            />
            <label className="section-label" htmlFor="filter-op">
              {t('filter.operator')}
            </label>
            <Select
              id="filter-op"
              className={selectClass}
              value={op ?? ''}
              onValueChange={(v) => setOp(v as FilterOp)}
              options={ops.map((o) => ({ value: o, label: t(`filter.ops.${o}`) }))}
            />
            {kind !== 'none' && (
              <Input
                aria-label={t('filter.value')}
                placeholder={t(
                  kind === 'list'
                    ? 'filter.listHint'
                    : kind === 'json'
                      ? 'filter.jsonHint'
                      : 'filter.value',
                )}
                className="font-mono text-[12.5px]"
                value={a}
                onChange={(e) => setA(e.target.value)}
                aria-invalid={error}
              />
            )}
            {kind === 'two' && (
              <Input
                aria-label={t('filter.value2')}
                placeholder={t('filter.value2')}
                className="font-mono text-[12.5px]"
                value={b}
                onChange={(e) => setB(e.target.value)}
              />
            )}
            {error && <p className="text-[12px] text-danger">{t('filter.invalidJson')}</p>}
            <Button type="submit" variant="primary" size="sm" className="mt-1">
              <Plus className="size-4" />
              {t('filter.add')}
            </Button>
          </form>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}

function SortPopover({
  columns,
  sort,
  onChange,
}: {
  columns: Column[]
  sort: TableSearch['sort']
  onChange: (s: TableSearch['sort']) => void
}) {
  const { t } = useTranslation()
  const free = columns.filter((c) => !sort.some((s) => s.column === c.name))
  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <Button
          size="sm"
          disabled={columns.length === 0}
          className={cn(sort.length > 0 && 'text-accent-ink')}
        >
          <ArrowUpDown className="size-4" />
          {sort.length > 0 ? t('sort.buttonCount', { count: sort.length }) : t('sort.button')}
        </Button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content align="start" sideOffset={6} className={popoverClass}>
          <div className="flex flex-col gap-2">
            {sort.length === 0 && <p className="text-muted">{t('sort.empty')}</p>}
            {sort.map((s) => (
              <div key={s.column} className="flex items-center gap-1 font-mono text-[12.5px]">
                <span className="flex-1 truncate">{s.column}</span>
                <IconButton
                  label={t(s.dir === 'asc' ? 'sort.asc' : 'sort.desc')}
                  icon={s.dir === 'asc' ? <ArrowUp /> : <ArrowDown />}
                  onClick={() =>
                    onChange(
                      sort.map((x) =>
                        x.column === s.column ? { ...x, dir: x.dir === 'asc' ? 'desc' : 'asc' } : x,
                      ),
                    )
                  }
                />
                <IconButton
                  label={t('sort.remove')}
                  icon={<X />}
                  onClick={() => onChange(sort.filter((x) => x.column !== s.column))}
                />
              </div>
            ))}
            {free.length > 0 && (
              <Select
                aria-label={t('sort.add')}
                className={selectClass}
                value=""
                placeholder={t('sort.add')}
                onValueChange={(v) => onChange([...sort, { column: v, dir: 'asc' }])}
                options={free.map((c) => ({ value: c.name, label: c.name }))}
              />
            )}
            <p className="text-[11px] text-muted">{t('sort.hint')}</p>
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}
