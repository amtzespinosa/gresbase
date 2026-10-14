import { describe, expect, it } from 'vitest'
// The same vectors as the Go splitter (internal/pg/sqlguard). The Dockerfile copies testdata/ too.
import cases from '../../../../testdata/sql-split-cases.json'
import { splitSql, statementAt } from './split'

describe('splitSql', () => {
  it.each(cases)('$name', ({ sql, statements }) => {
    const got = splitSql(sql)
    expect(got.map((s) => s.text)).toEqual(statements)
    for (const s of got) expect(sql.slice(s.from, s.to)).toBe(s.text)
  })
})

describe('statementAt', () => {
  const sql = 'SELECT 1;\n\nSELECT 2; -- two\nSELECT 3'
  const stmts = splitSql(sql)
  it.each([
    [0, 'SELECT 1'],
    [sql.indexOf('1'), 'SELECT 1'],
    [sql.indexOf(';') + 1, 'SELECT 1'],
    [sql.indexOf('SELECT 2') + 3, 'SELECT 2'],
    [sql.indexOf('-- two'), 'SELECT 2'],
    [sql.length, 'SELECT 3'],
  ])('cursor at %i runs %s', (pos, want) => {
    expect(statementAt(stmts, pos)?.text).toBe(want)
  })
  it('is undefined for an empty script', () => {
    expect(statementAt([], 0)).toBeUndefined()
  })
})
