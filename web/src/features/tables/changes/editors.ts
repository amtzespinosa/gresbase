import type { Cell, Column } from '@/lib/api/types.gen'

/** How a column is edited. The server casts every value to the catalog type, so this is only UX. */
export type EditorKind =
  'text' | 'integer' | 'number' | 'bool' | 'enum' | 'json' | 'array' | 'date' | 'datetime'

const INTEGER = new Set(['int2', 'int4', 'int8', 'smallint', 'integer', 'bigint'])
const NUMBER = new Set(['float4', 'float8', 'numeric', 'real', 'double precision'])

/** The editor of a column, or null when the user can't set it (generated, identity ALWAYS, bytea). */
export function editorKind(c: Column): EditorKind | null {
  if (c.generated !== null || c.identity === 'always') return null
  if (c.is_array) return 'array'
  if (c.enum_values.length > 0) return 'enum'
  const t = c.base_type
  if (t === 'bytea') return null
  if (t === 'bool' || t === 'boolean') return 'bool'
  if (INTEGER.has(t)) return 'integer'
  if (NUMBER.has(t)) return 'number'
  if (t === 'json' || t === 'jsonb') return 'json'
  if (t === 'date') return 'date'
  if (t === 'timestamp' || t === 'timestamptz') return 'datetime'
  return 'text'
}

/** Text shown in the editor for a value (wire encoding → editable text). */
export function toEditText(kind: EditorKind, v: Cell | undefined): string {
  if (v == null) return ''
  if (kind === 'json') return JSON.stringify(v, null, 2)
  if (typeof v === 'object') return JSON.stringify(v)
  return String(v)
}

export type ParseError = 'integer' | 'number' | 'json' | 'array' | 'date' | 'datetime'
export type ParseResult = { ok: true; value: Cell } | { ok: false; error: ParseError }

const INT_RE = /^[-+]?\d+$/
const NUM_RE = /^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/
const SPECIAL_FLOAT = /^([-+]?infinity|nan)$/i
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const DATETIME_RE =
  /^\d{4}-\d{2}-\d{2}([ T]\d{2}:\d{2}(:\d{2}(\.\d+)?)?)?\s*(Z|[+-]\d{2}(:?\d{2})?)?$/i

/** Editor text → wire value (numbers stay text so int8 and numeric keep their precision). */
export function parseEdit(kind: EditorKind, text: string): ParseResult {
  const s = text.trim()
  switch (kind) {
    case 'integer':
      return INT_RE.test(s) ? { ok: true, value: s } : { ok: false, error: 'integer' }
    case 'number':
      return NUM_RE.test(s) || SPECIAL_FLOAT.test(s)
        ? { ok: true, value: s }
        : { ok: false, error: 'number' }
    case 'bool':
      return { ok: true, value: s === 'true' }
    case 'json':
    case 'array': {
      let value: unknown
      try {
        value = JSON.parse(s)
      } catch {
        return { ok: false, error: kind }
      }
      if (kind === 'array' && !Array.isArray(value)) return { ok: false, error: 'array' }
      return { ok: true, value: value as Cell }
    }
    case 'date':
      return DATE_RE.test(s) || /^-?infinity$/i.test(s)
        ? { ok: true, value: s }
        : { ok: false, error: 'date' }
    case 'datetime':
      return DATETIME_RE.test(s) || /^-?infinity$/i.test(s)
        ? { ok: true, value: s }
        : { ok: false, error: 'datetime' }
    case 'enum':
    case 'text':
      return { ok: true, value: text }
  }
}

/** Multi-line editors: Enter adds a line, Mod+Enter commits. */
export const isMultiline = (kind: EditorKind, text: string) =>
  kind === 'json' ||
  kind === 'array' ||
  (kind === 'text' && (text.length > 60 || text.includes('\n')))

/** A required column for inserts: NOT NULL without default, identity or generation. */
export const isRequired = (c: Column) =>
  c.not_null && c.default === null && c.identity === '' && c.generated === null

export type ValueError = ParseError | 'bool' | 'enum'

/**
 * Why a pending value doesn't fit its column, checked in the browser before saving (pasted values
 * go into the queue as they come, so they are marked instead of rejected). The server still casts.
 */
export function valueError(c: Column, v: Cell | undefined): ValueError | null {
  const kind = editorKind(c)
  if (v == null || kind === null) return null
  if (kind === 'array') return Array.isArray(v) ? null : 'array'
  if (kind === 'json') return null
  if (kind === 'bool') return typeof v === 'boolean' ? null : 'bool'
  if (kind === 'enum') return typeof v === 'string' && c.enum_values.includes(v) ? null : 'enum'
  if (typeof v === 'number') return kind === 'integer' && !Number.isInteger(v) ? 'integer' : null
  if (typeof v !== 'string') return kind === 'text' ? null : kind
  const r = parseEdit(kind, v)
  return r.ok ? null : r.error
}

const TRUE_RE = /^(true|t|yes|y|on|1)$/i
const FALSE_RE = /^(false|f|no|n|off|0)$/i

/**
 * Pasted spreadsheet text → wire value. An empty field is NULL (empty text in NOT NULL text
 * columns); text that doesn't parse stays as typed, so `valueError` marks it.
 */
export function pastedValue(c: Column, text: string): Cell {
  const kind = editorKind(c) ?? 'text'
  if (text === '') return c.not_null && (kind === 'text' || kind === 'enum') ? '' : null
  if (kind === 'bool')
    return TRUE_RE.test(text.trim()) ? true : FALSE_RE.test(text.trim()) ? false : text
  if (kind === 'json') {
    try {
      return JSON.parse(text) as Cell
    } catch {
      return text // a JSON string
    }
  }
  const r = parseEdit(kind, text)
  return r.ok ? r.value : text
}
