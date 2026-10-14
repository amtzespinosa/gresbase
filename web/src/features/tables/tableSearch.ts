import { z } from 'zod'
import type { Column, FilterOp, Query } from '@/lib/api/types.gen'

const ops = [
  'eq',
  'neq',
  'lt',
  'lte',
  'gt',
  'gte',
  'contains',
  'starts_with',
  'is_null',
  'not_null',
  'in',
  'between',
  'json_contains',
] as const satisfies readonly FilterOp[]

export const pageSizes = [50, 100, 200] as const

/**
 * State of the table view in the URL (docs/spec.md → URLs con estado). Every key is optional and
 * falls back to its default, so a hand-edited or stale link never breaks the screen.
 */
export const tableSearch = z.object({
  tab: z.enum(['data', 'structure', 'relations']).default('data').catch('data'),
  filters: z
    .array(z.object({ column: z.string(), op: z.enum(ops), value: z.unknown().optional() }))
    .default([])
    .catch([]),
  logic: z.enum(['and', 'or']).default('and').catch('and'),
  sort: z
    .array(z.object({ column: z.string(), dir: z.enum(['asc', 'desc']) }))
    .default([])
    .catch([]),
  size: z
    .union(pageSizes.map((n) => z.literal(n)))
    .default(50)
    .catch(50),
  /** Keyset: the cursors of the pages before this one (empty on the first page). */
  cursors: z.array(z.string()).default([]).catch([]),
  /** Offset pagination, used only for tables without a primary key. */
  offset: z.number().int().min(0).default(0).catch(0),
  /** A column to bring into view and highlight (from the global search). */
  col: z.string().optional().catch(undefined),
})

export type TableSearch = z.output<typeof tableSearch>
export type TableTab = TableSearch['tab']
export type GridFilter = TableSearch['filters'][number]

/** The rows:query body for the current URL state. */
export function toQuery(s: TableSearch, keyset: boolean): Query {
  return {
    filters: s.filters.map((f) => ({ column: f.column, op: f.op, value: f.value })),
    logic: s.logic,
    sort: s.sort,
    limit: s.size,
    cursor: keyset ? (s.cursors.at(-1) ?? null) : null,
    offset: keyset ? null : s.offset,
  }
}

const textTypes = new Set(['text', 'varchar', 'bpchar', 'name', 'citext'])

/** Filter operators the API accepts for a column (mirrors internal/pg/rows). */
export function opsFor(c: Column): FilterOp[] {
  const isJson = !c.is_array && (c.base_type === 'json' || c.base_type === 'jsonb')
  const unordered = isJson || c.base_type === 'bool' || c.is_array
  if (c.is_array) return ['eq', 'neq', 'is_null', 'not_null']
  if (isJson) {
    return c.base_type === 'json'
      ? ['json_contains', 'is_null', 'not_null']
      : ['eq', 'neq', 'json_contains', 'is_null', 'not_null']
  }
  if (unordered) return ['eq', 'neq', 'in', 'is_null', 'not_null']
  const base: FilterOp[] = ['eq', 'neq', 'lt', 'lte', 'gt', 'gte', 'in', 'between']
  if (textTypes.has(c.base_type)) base.push('contains', 'starts_with')
  return [...base, 'is_null', 'not_null']
}

/** How many values an operator takes: none, one, a comma-separated list, two, or JSON. */
export function valueKind(op: FilterOp): 'none' | 'one' | 'list' | 'two' | 'json' {
  switch (op) {
    case 'is_null':
    case 'not_null':
      return 'none'
    case 'in':
      return 'list'
    case 'between':
      return 'two'
    case 'json_contains':
      return 'json'
    default:
      return 'one'
  }
}

/** Shift+click adds or flips a sort key; a plain click makes it the only key (asc → desc → none). */
export function nextSort(
  sort: TableSearch['sort'],
  column: string,
  multi: boolean,
): TableSearch['sort'] {
  const current = sort.find((s) => s.column === column)
  const flipped = !current
    ? { column, dir: 'asc' as const }
    : current.dir === 'asc'
      ? { column, dir: 'desc' as const }
      : null
  if (!multi) return flipped ? [flipped] : []
  if (!flipped) return sort.filter((s) => s.column !== column)
  return current ? sort.map((s) => (s.column === column ? flipped : s)) : [...sort, flipped]
}

/**
 * The order the rows come in: the one in the URL or, without one, the newest rows first (primary key
 * descending). Tables without a primary key keep the server order.
 */
export function effectiveSort(
  sort: TableSearch['sort'],
  primaryKey: string[],
): TableSearch['sort'] {
  return sort.length > 0 ? sort : primaryKey.map((column) => ({ column, dir: 'desc' as const }))
}

/** Default state; stripped from the URL so links stay short. */
export const searchDefaults: TableSearch = tableSearch.parse({})

/** Filters that select the rows whose `columns` equal `values` (one filter per column). */
export function eqFilters(columns: string[], values: unknown[]): GridFilter[] {
  return columns.map((column, i) => ({ column, op: 'eq', value: values[i] }))
}
