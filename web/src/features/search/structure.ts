import type { CompletionTable } from '@/lib/api/types.gen'

export interface StructureHit {
  schema: string
  table: string
  kind: string
  /** Set when the hit is a column of the table; otherwise the table's own name matched. */
  column?: string
}

/** Most structure hits shown: past this, the term is too vague for names to help. */
export const MAX_STRUCTURE_HITS = 50

/**
 * Tables, views and columns whose name contains the term (case-insensitive), from the names the
 * app already has in memory (the SQL completions): no request to the database. Partitions are left
 * out, like in the table list. Table hits come first.
 */
export function structureHits(
  tables: CompletionTable[],
  term: string,
  schemas: string[],
): StructureHit[] {
  const q = term.trim().toLowerCase()
  if (q.length < 2) return []
  const inScope = (t: CompletionTable) =>
    !t.partition && (schemas.length === 0 || schemas.includes(t.schema))
  const scoped = tables.filter(inScope)
  const named: StructureHit[] = scoped
    .filter((t) => t.name.toLowerCase().includes(q))
    .map((t) => ({ schema: t.schema, table: t.name, kind: t.kind }))
  const columns: StructureHit[] = scoped.flatMap((t) =>
    t.columns
      .filter((c) => c.toLowerCase().includes(q))
      .map((c) => ({ schema: t.schema, table: t.name, kind: t.kind, column: c })),
  )
  return [...named, ...columns].slice(0, MAX_STRUCTURE_HITS)
}

/** Splits `text` around the case-insensitive matches of `term`, for <mark>. */
export function highlight(text: string, term: string): { text: string; match: boolean }[] {
  const q = term.trim().toLowerCase()
  if (!q) return [{ text, match: false }]
  const parts: { text: string; match: boolean }[] = []
  const lower = text.toLowerCase()
  let at = 0
  for (let i = lower.indexOf(q); i >= 0; i = lower.indexOf(q, at)) {
    if (i > at) parts.push({ text: text.slice(at, i), match: false })
    parts.push({ text: text.slice(i, i + q.length), match: true })
    at = i + q.length
  }
  if (at < text.length) parts.push({ text: text.slice(at), match: false })
  return parts
}
