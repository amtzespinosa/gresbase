import { describe, expect, it } from 'vitest'
import type { Column } from '@/lib/api/types.gen'
import { autoMapping, detectHeader, importable, parsePreview, toMapping } from './importCsv'

const col = (name: string, extra: Partial<Column> = {}): Column =>
  ({
    position: 1,
    name,
    type: 'text',
    base_type: 'text',
    is_array: false,
    enum_values: [],
    not_null: false,
    default: null,
    identity: '',
    generated: null,
    comment: null,
    ...extra,
  }) as Column

describe('parsePreview', () => {
  it('detects semicolons, tabs and strips the BOM', () => {
    const semi = parsePreview(String.fromCharCode(0xfeff) + 'name;plan\nA;pro\n', 'auto', false)
    expect(semi.detected).toBe(';')
    expect(semi.rows).toEqual([
      ['name', 'plan'],
      ['A', 'pro'],
    ])
    expect(parsePreview('a\tb\n1\t2\n', 'auto', false).detected).toBe('\t')
    expect(parsePreview('a;b\n', 'comma', false).rows).toEqual([['a;b']])
  })

  it('drops the last row of a truncated read', () => {
    expect(parsePreview('a\nb\nc', 'auto', true).rows).toEqual([['a'], ['b']])
  })
})

describe('mapping', () => {
  const columns = [
    col('id', { identity: 'always' }),
    col('email'),
    col('Full_Name'),
    col('total', { generated: 'x' }),
  ]

  it('leaves out generated and identity always columns', () => {
    expect(importable(columns).map((c) => c.name)).toEqual(['email', 'Full_Name'])
  })

  it('maps by name ignoring case and leaves the rest ignored', () => {
    const m = autoMapping(importable(columns), [' full_name', 'other', 'EMAIL'])
    expect(m).toEqual({ email: 2, Full_Name: 0 })
    expect(autoMapping(importable(columns), null)).toEqual({ email: -1, Full_Name: -1 })
    expect(toMapping({ email: 2, Full_Name: -1 })).toEqual([{ column: 'email', source: 2 }])
  })

  it('detects a header row', () => {
    expect(detectHeader(['email', '1'], columns)).toBe(true)
    expect(detectHeader(['Name', 'Plan'], columns)).toBe(true)
    expect(detectHeader(['ada@x.test', '12'], columns)).toBe(false)
    expect(detectHeader(undefined, columns)).toBe(false)
  })
})
