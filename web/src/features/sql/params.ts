import { scan } from './split'

const identChar = /[A-Za-z0-9_$\u0080-￿]/

/**
 * Names of the :name parameters of `sql`, in order of first use. Same rule as the server
 * (internal/pg/sqlguard Placeholders): never inside strings, quoted identifiers or comments, and a
 * colon right after an identifier, number, `)`, `]` or another colon is not one (`x::int`, `a[lo:hi]`).
 */
export function paramNames(sql: string): string[] {
  const toks = scan(sql)
  const names: string[] = []
  toks.forEach((t, i) => {
    const next = toks[i + 1]
    if (t.kind !== 'punct' || sql.charAt(t.start) !== ':' || !next) return
    if (next.kind !== 'word' || next.start !== t.end) return
    const before = sql.charAt(t.start - 1)
    if (before && (identChar.test(before) || ':)]'.includes(before))) return
    const name = sql.slice(next.start, next.end)
    if (!names.includes(name)) names.push(name)
  })
  return names
}
