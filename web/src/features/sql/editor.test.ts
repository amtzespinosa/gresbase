import { type CompletionSource, CompletionContext } from '@codemirror/autocomplete'
import { EditorState } from '@codemirror/state'
import type { Completions, StatementResult } from '@/lib/api/types.gen'
import { completionConfig, errorRange } from './editor'

const completions: Completions = {
  tables: [
    {
      schema: 'public',
      name: 'users',
      kind: 'table',
      columns: ['id', 'email', 'org_id'],
      partition: false,
    },
    {
      schema: 'billing',
      name: 'plans',
      kind: 'table',
      columns: ['code', 'price'],
      partition: false,
    },
    {
      schema: 'app',
      name: 'orgs',
      kind: 'table',
      columns: ['org_name', 'Display Name'],
      partition: false,
    },
  ],
  functions: ['now', 'jsonb_build_object'],
  search_path: ['public', 'app'],
}

/** Completion labels with the cursor at `|` (default: end of the document). */
async function labelsAt(text: string) {
  const pos = text.includes('|') ? text.indexOf('|') : text.length
  const doc = text.replace('|', '')
  const state = EditorState.create({ doc, extensions: completionConfig(completions) })
  const ctx = new CompletionContext(state, pos, true)
  const sources = state.languageDataAt<CompletionSource>('autocomplete', pos)
  const results = await Promise.all(sources.map((s) => s(ctx)))
  return results.flatMap((r) => r?.options.map((o) => o.label) ?? [])
}

describe('autocompletion', () => {
  it('suggests the columns of a table', async () => {
    const labels = await labelsAt('SELECT users.')
    expect(labels).toEqual(expect.arrayContaining(['id', 'email', 'org_id']))
    // After a dot only columns: no keywords nor functions.
    expect(labels).not.toContain('now')
    expect(labels).not.toContain('select')
  })
  it('suggests tables of other schemas', async () => {
    expect(await labelsAt('SELECT * FROM billing.')).toContain('plans')
  })
  it('suggests tables, functions and keywords', async () => {
    const labels = await labelsAt('SELECT ')
    expect(labels).toEqual(expect.arrayContaining(['users', 'now', 'jsonb_build_object']))
    expect(labels.some((l) => l.toLowerCase() === 'select')).toBe(true)
  })
})

describe('columns without a table prefix', () => {
  it('suggests the columns of the table in FROM, even when FROM comes after the cursor', async () => {
    expect(await labelsAt('SELECT | FROM users')).toEqual(
      expect.arrayContaining(['id', 'email', 'org_id']),
    )
    expect(await labelsAt('SELECT * FROM users WHERE em')).toContain('email')
  })
  it('resolves JOINs with aliases, schema-qualified names and the search_path', async () => {
    const labels = await labelsAt('SELECT | FROM users AS u, orgs o JOIN billing.plans p ON true')
    expect(labels).toEqual(expect.arrayContaining(['email', 'code', 'price', 'org_name']))
    // Aliases still complete after a dot.
    expect(await labelsAt('SELECT p.| FROM users u JOIN billing.plans p ON true')).toContain('code')
  })
  it('quotes columns that need it', async () => {
    const state = EditorState.create({
      doc: 'SELECT  FROM orgs',
      extensions: completionConfig(completions),
    })
    const ctx = new CompletionContext(state, 7, true)
    const sources = state.languageDataAt<CompletionSource>('autocomplete', 7)
    const options = (await Promise.all(sources.map((s) => s(ctx)))).flatMap((r) => r?.options ?? [])
    expect(options.find((o) => o.label === 'Display Name')?.apply).toBe('"Display Name"')
  })
  it('only looks at the statement under the cursor', async () => {
    const labels = await labelsAt('SELECT * FROM billing.plans;\nSELECT | FROM users;\nSELECT 1')
    expect(labels).toContain('email')
    expect(labels).not.toContain('price')
    // After the `;` the next statement is empty: no columns from the previous one.
    expect(await labelsAt('SELECT * FROM users; ')).not.toContain('email')
  })
  it('suggests no columns for unknown tables', async () => {
    const labels = await labelsAt('SELECT | FROM nope JOIN billing.users ON true')
    expect(labels).not.toContain('email')
    expect(labels).not.toContain('org_id')
  })
})

describe('errorRange', () => {
  const result = (position?: number): StatementResult => ({
    statement: 1,
    from: 10,
    to: 29,
    columns: [],
    rows: [],
    truncated: false,
    rows_affected: 0,
    command_tag: '',
    duration_ms: 0,
    notices: [],
    error: { code: 'pg_error', message: 'boom', position },
  })
  const doc = 'SELECT 1;\nSELECT * FORM users'
  it('marks the word at the error position, shifted by the run offset', () => {
    // Ran the whole document (offset 0); position is 1-based.
    const r = errorRange(doc, 0, result(doc.indexOf('FORM') + 1))
    expect(doc.slice(r.from, r.to)).toBe('FORM')
  })
  it('adds the offset of a partial run', () => {
    const r = errorRange(doc, 10, result('SELECT * FORM'.indexOf('FORM') + 1))
    expect(doc.slice(r.from, r.to)).toBe('FORM')
  })
  it('marks the statement without a position', () => {
    const r = errorRange(doc, 0, result())
    expect(doc.slice(r.from, r.to)).toBe('SELECT * FORM users')
  })
})
