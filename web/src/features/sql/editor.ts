import { type CompletionSource, completeFromList } from '@codemirror/autocomplete'
import {
  keywordCompletionSource,
  PostgreSQL,
  schemaCompletionSource,
  type SQLNamespace,
} from '@codemirror/lang-sql'
import { LanguageSupport } from '@codemirror/language'
import type { EditorView } from '@codemirror/view'
import type { Completions, StatementResult } from '@/lib/api/types.gen'
import { scan, splitSql, statementAt, type Token } from './split'

/** What to run: the selection, the statement under the cursor, or everything. */
export function runTarget(view: EditorView, all: boolean): { sql: string; offset: number } | null {
  const doc = view.state.doc.toString()
  const sel = view.state.selection.main
  if (all) return doc.trim() ? { sql: doc, offset: 0 } : null
  if (!sel.empty) return { sql: doc.slice(sel.from, sel.to), offset: sel.from }
  const s = statementAt(splitSql(doc), sel.head)
  return s ? { sql: s.text, offset: s.from } : null
}

/** Range to mark in the editor for a failed statement: the error position's word, else the statement. */
export function errorRange(
  doc: string,
  offset: number,
  r: StatementResult,
): { from: number; to: number } {
  const pos = r.error?.position
  if (!pos) return { from: offset + r.from, to: offset + r.to }
  let from = Math.min(offset + pos - 1, doc.length)
  let to = from
  while (to < doc.length && /[\w$"]/.test(doc.charAt(to))) to++
  if (to === from) {
    if (to < doc.length) to++
    else from = Math.max(0, from - 1)
  }
  return { from, to }
}

/** After `name.` only the schema completion (tables, columns) makes sense. */
const notAfterDot =
  (source: CompletionSource): CompletionSource =>
  (ctx) =>
    ctx.matchBefore(/\.[\w$]*$/) ? null : source(ctx)

// Words that end a FROM item: what follows the table (and its alias) is no longer a table list.
const notAlias = new Set([
  'where',
  'join',
  'on',
  'using',
  'left',
  'right',
  'inner',
  'outer',
  'full',
  'cross',
  'natural',
  'group',
  'order',
  'limit',
  'offset',
  'having',
  'window',
  'union',
  'intersect',
  'except',
  'returning',
  'set',
  'values',
  'for',
  'fetch',
  'tablesample',
  'select',
  'default',
])

/** Tables named after FROM (comma lists included), JOIN, UPDATE and INTO, as [schema, name]. */
export function referencedTables(sql: string): [string | undefined, string][] {
  const toks = scan(sql)
  const text = (t: Token) => sql.slice(t.start, t.end)
  // Unquoted names fold to lower case, like Postgres does.
  const name = (t: Token | undefined) =>
    t?.kind === 'word'
      ? text(t).toLowerCase()
      : t?.kind === 'ident' && text(t).startsWith('"')
        ? text(t).slice(1, -1).replaceAll('""', '"')
        : undefined
  const keyword = (t: Token | undefined) => (t?.kind === 'word' ? text(t).toLowerCase() : '')
  const punct = (t: Token | undefined, c: string) => t?.kind === 'punct' && text(t) === c
  const out: [string | undefined, string][] = []
  toks.forEach((t, i) => {
    const kw = keyword(t)
    if (!['from', 'join', 'update', 'into'].includes(kw)) return
    let j = i + 1
    for (;;) {
      if (keyword(toks[j]) === 'only') j++
      let n = name(toks[j])
      if (n === undefined || notAlias.has(keyword(toks[j]))) return
      let schema: string | undefined
      const qualified = name(toks[j + 2])
      if (punct(toks[j + 1], '.') && qualified !== undefined) {
        schema = n
        n = qualified
        j += 2
      }
      out.push([schema, n])
      j++
      if (keyword(toks[j]) === 'as') j++
      if (name(toks[j]) !== undefined && !notAlias.has(keyword(toks[j]))) j++
      if (kw !== 'from' || !punct(toks[j], ',')) return
      j++
    }
  })
  return out
}

/** Column names of the known tables in `refs`; unqualified names resolve through the search_path. */
export function columnsOf(c: Completions, refs: [string | undefined, string][]): string[] {
  const path = c.search_path?.length ? c.search_path : ['public']
  const find = (schema: string, name: string) =>
    c.tables.find((t) => t.schema === schema && t.name === name)
  const cols = new Set<string>()
  for (const [schema, name] of refs) {
    const t = schema ? find(schema, name) : path.map((s) => find(s, name)).find(Boolean)
    t?.columns.forEach((col) => cols.add(col))
  }
  return [...cols]
}

/** Columns without a table prefix, from the tables of the statement under the cursor. */
function columnSource(c: Completions | undefined): CompletionSource {
  return (ctx) => {
    const word = ctx.matchBefore(/[\w$]*$/)
    if (!c || !word || (word.from === word.to && !ctx.explicit)) return null
    const doc = ctx.state.doc.toString()
    const s = statementAt(splitSql(doc), ctx.pos)
    // A cursor after the statement's `;` is already in the next (empty) one.
    if (!s || (ctx.pos > s.to && doc.slice(s.to, ctx.pos).includes(';'))) return null
    const options = columnsOf(c, referencedTables(s.text)).map((col) => ({
      label: col,
      type: 'property',
      apply: /^[a-z_][a-z0-9_$]*$/.test(col) ? col : `"${col.replaceAll('"', '""')}"`,
    }))
    return options.length ? { from: word.from, options, validFor: /^[\w$]*$/ } : null
  }
}

/** PostgreSQL with completion of schemas, tables and columns, keywords and functions. */
export function completionConfig(c: Completions | undefined) {
  const schema: SQLNamespace = {}
  for (const t of c?.tables ?? []) {
    const ns = (schema[t.schema] ??= {}) as Record<string, SQLNamespace>
    ns[t.name] = t.columns
  }
  const functions = (c?.functions ?? []).map((f) => ({ label: f, type: 'function' }))
  const data = PostgreSQL.language.data
  return new LanguageSupport(PostgreSQL.language, [
    data.of({
      autocomplete: schemaCompletionSource({
        dialect: PostgreSQL,
        schema,
        defaultSchema: c?.search_path?.[0] ?? 'public',
      }),
    }),
    data.of({ autocomplete: notAfterDot(keywordCompletionSource(PostgreSQL)) }),
    data.of({ autocomplete: notAfterDot(completeFromList(functions)) }),
    data.of({ autocomplete: notAfterDot(columnSource(c)) }),
  ])
}
