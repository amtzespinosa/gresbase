import type { ByteaCell, Cell, TruncatedCell } from '@/lib/api/types.gen'

const isObject = (v: Cell): v is { [key: string]: unknown } =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

export const isBytea = (v: Cell): v is ByteaCell => isObject(v) && '$bytea' in v
export const isTruncated = (v: Cell): v is TruncatedCell =>
  isObject(v) && '$text' in v && 'truncated' in v && v.truncated === true

/** One-line text of a value as the grid shows it; JSON columns always show JSON. */
export function cellText(v: Cell, json = false): string {
  if (v === null) return ''
  if (isTruncated(v)) return v.$text
  if (json || typeof v === 'object') return JSON.stringify(v)
  return String(v)
}
