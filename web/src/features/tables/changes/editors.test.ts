import type { Column } from '@/lib/api/types.gen'
import { editorKind, parseEdit, pastedValue, toEditText, valueError } from './editors'

const col = (base_type: string, extra: Partial<Column> = {}): Column => ({
  position: 1,
  name: 'c',
  type: base_type,
  base_type,
  is_array: false,
  enum_values: [],
  not_null: false,
  default: null,
  identity: '',
  generated: null,
  comment: null,
  ...extra,
})

test.each([
  [col('int8'), 'integer'],
  [col('numeric'), 'number'],
  [col('bool'), 'bool'],
  [col('plan_t', { enum_values: ['free', 'pro'] }), 'enum'],
  [col('jsonb'), 'json'],
  [col('text', { is_array: true }), 'array'],
  [col('date'), 'date'],
  [col('timestamptz'), 'datetime'],
  [col('inet'), 'text'],
  [col('bytea'), null],
  [col('int8', { identity: 'always' }), null],
  [col('int8', { identity: 'by_default' }), 'integer'],
  [col('text', { generated: 'lower(email)' }), null],
])('editor of %j is %s', (c, kind) => {
  expect(editorKind(c)).toBe(kind)
})

test.each([
  ['integer', '9007199254740993', { ok: true, value: '9007199254740993' }],
  ['integer', '1.5', { ok: false, error: 'integer' }],
  ['integer', '1; DROP TABLE users', { ok: false, error: 'integer' }],
  ['number', '-12.50', { ok: true, value: '-12.50' }],
  ['number', '1e3', { ok: true, value: '1e3' }],
  ['number', 'NaN', { ok: true, value: 'NaN' }],
  ['number', 'abc', { ok: false, error: 'number' }],
  ['bool', 'false', { ok: true, value: false }],
  ['json', '{"a": [1, 2]}', { ok: true, value: { a: [1, 2] } }],
  ['json', '{a: 1}', { ok: false, error: 'json' }],
  ['array', '["x", "y"]', { ok: true, value: ['x', 'y'] }],
  ['array', '{"x": 1}', { ok: false, error: 'array' }],
  ['date', '2026-10-09', { ok: true, value: '2026-10-09' }],
  ['date', '09/10/2026', { ok: false, error: 'date' }],
  ['datetime', '2026-10-09 12:30:00+02', { ok: true, value: '2026-10-09 12:30:00+02' }],
  ['datetime', '2026-10-09T12:30Z', { ok: true, value: '2026-10-09T12:30Z' }],
  ['datetime', 'yesterday', { ok: false, error: 'datetime' }],
  ['text', '  keeps spaces ', { ok: true, value: '  keeps spaces ' }],
] as const)('parse %s %j', (kind, text, result) => {
  expect(parseEdit(kind, text)).toEqual(result)
})

test('editor text of values', () => {
  expect(toEditText('json', { a: 1 })).toBe('{\n  "a": 1\n}')
  expect(toEditText('array', ['a', 'b'])).toBe('["a","b"]')
  expect(toEditText('integer', 7)).toBe('7')
  expect(toEditText('text', null)).toBe('')
})

test('pasted text becomes wire values; what does not parse stays and is marked', () => {
  const plan = col('plan_t', { enum_values: ['free', 'pro'] })
  const cases: [Column, string, unknown, string | null][] = [
    [col('int4'), '42', '42', null],
    [col('int4'), 'abc', 'abc', 'integer'],
    [col('numeric'), '1.5', '1.5', null],
    [col('bool'), 'Yes', true, null],
    [col('bool'), '0', false, null],
    [col('bool'), 'maybe', 'maybe', 'bool'],
    [plan, 'pro', 'pro', null],
    [plan, 'gold', 'gold', 'enum'],
    [col('jsonb'), '{"a":1}', { a: 1 }, null],
    [col('jsonb'), 'hello', 'hello', null], // a JSON string
    [col('text', { is_array: true }), '["a"]', ['a'], null],
    [col('text', { is_array: true }), '{a}', '{a}', 'array'],
    [col('date'), '2024-02-30x', '2024-02-30x', 'date'],
    [col('int4'), '', null, null],
    [col('text', { not_null: true }), '', '', null],
  ]
  for (const [c, text, value, error] of cases) {
    const v = pastedValue(c, text)
    expect(v).toEqual(value)
    expect(valueError(c, v)).toBe(error)
  }
})
