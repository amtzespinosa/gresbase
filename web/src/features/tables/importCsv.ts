import Papa from 'papaparse'
import type { Column, ImportMapping } from '@/lib/api/types.gen'

/** Largest file the server accepts. */
export const MAX_IMPORT_BYTES = 100 * 1024 * 1024
/** Rows shown in the preview. */
export const PREVIEW_ROWS = 100
/** How much of the file the preview reads. */
const PREVIEW_BYTES = 1024 * 1024
const BOM = String.fromCharCode(0xfeff)

export const DELIMITERS = { comma: ',', semicolon: ';', tab: '\t', pipe: '|' } as const
export type DelimiterChoice = 'auto' | keyof typeof DELIMITERS

export interface Preview {
  rows: string[][]
  /** The delimiter Papa Parse detected. */
  detected: string
}

/** Parses the start of a CSV text for the preview (the first PREVIEW_ROWS rows after the header). */
export function parsePreview(text: string, choice: DelimiterChoice, truncated: boolean): Preview {
  const res = Papa.parse<string[]>(text.startsWith(BOM) ? text.slice(1) : text, {
    delimiter: choice === 'auto' ? '' : DELIMITERS[choice],
    preview: PREVIEW_ROWS + 1,
    skipEmptyLines: true,
  })
  let rows = res.data
  // The last row may be cut in half when only the start of the file was read.
  if (truncated && rows.length > PREVIEW_ROWS + 1) rows = rows.slice(0, PREVIEW_ROWS + 1)
  else if (truncated) rows = rows.slice(0, -1)
  return { rows, detected: res.meta.delimiter }
}

/** Reads the start of a file and parses it for the preview. */
export async function readPreview(file: File, choice: DelimiterChoice): Promise<Preview> {
  const text = await file.slice(0, PREVIEW_BYTES).text()
  return parsePreview(text, choice, file.size > PREVIEW_BYTES)
}

/** Columns an import can fill: not generated and not GENERATED ALWAYS AS IDENTITY. */
export const importable = (columns: Column[]) =>
  columns.filter((c) => c.generated == null && c.identity !== 'always')

/** Whether a column must get a value: NOT NULL without a default. */
export const required = (c: Column) => c.not_null && c.default == null && c.identity === ''

const norm = (s: string) => s.trim().toLowerCase()

/** The first row is a header when one of its cells names a column, or none of them is a number. */
export function detectHeader(first: string[] | undefined, columns: Column[]): boolean {
  if (!first?.length) return false
  const names = new Set(columns.map((c) => norm(c.name)))
  if (first.some((v) => names.has(norm(v)))) return true
  return first.every((v) => v.trim() !== '' && Number.isNaN(Number(v)))
}

/** Maps each column to the CSV column with the same name (case-insensitive), or -1. */
export function autoMapping(columns: Column[], sources: string[] | null): Record<string, number> {
  const out: Record<string, number> = {}
  for (const c of columns) {
    out[c.name] = sources ? sources.findIndex((s) => norm(s) === norm(c.name)) : -1
  }
  return out
}

/** The mapping the server expects: only the columns that take a CSV column. */
export const toMapping = (m: Record<string, number>): ImportMapping[] =>
  Object.entries(m)
    .filter(([, source]) => source >= 0)
    .map(([column, source]) => ({ column, source }))
