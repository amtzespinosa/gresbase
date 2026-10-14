import type { Relation } from '@/lib/api/types.gen'

/** Keeps relations whose name (or one of whose partitions' names) contains the query. */
export function filterRelations(rels: Relation[], query: string): Relation[] {
  const q = query.trim().toLowerCase()
  if (!q) return rels
  const hit = (r: Relation) => r.name.toLowerCase().includes(q)
  return rels.flatMap((r) => {
    if (hit(r)) return [r]
    const parts = r.partitions.filter(hit)
    return parts.length ? [{ ...r, partitions: parts }] : []
  })
}
