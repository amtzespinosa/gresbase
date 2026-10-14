import type { Cell } from '@/lib/api/types.gen'
import { isBytea, isTruncated } from './cellValue'

/** Formats the grid can copy a selection as. TSV is what spreadsheets paste natively. */
export type CopyFormat = 'tsv' | 'csv' | 'json' | 'insert'

/** Text of one value for TSV/CSV: NULL is an empty field, JSON and arrays are JSON. */
export function fieldText(v: Cell): string {
  if (v === null) return ''
  if (isTruncated(v)) return v.$text
  // ponytail: bytea only carries a 32-byte preview, so a longer value copies incomplete (with …).
  if (isBytea(v)) return `\\x${v.$bytea.hex_preview}${v.$bytea.size > 32 ? '…' : ''}`
  if (typeof v === 'object') return JSON.stringify(v)
  return String(v)
}

const quote = (s: string) => `"${s.replace(/"/g, '""')}"`

function delimited(header: string[], rows: Cell[][], sep: string, needsQuote: RegExp): string {
  const line = (fields: string[]) =>
    fields.map((f) => (needsQuote.test(f) ? quote(f) : f)).join(sep)
  return [line(header), ...rows.map((r) => line(r.map(fieldText)))].join('\n')
}

const sqlIdent = (name: string) => `"${name.replace(/"/g, '""')}"`

function sqlLiteral(v: Cell): string {
  if (v === null) return 'NULL'
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE'
  if (typeof v === 'number') return String(v)
  return `'${fieldText(v).replace(/'/g, "''")}'`
}

/**
 * Text of a selection. TSV (spreadsheets) copies only the values, as Excel does; CSV adds the
 * header row; JSON is an array of objects with the wire values; INSERT needs the table.
 */
export function formatSelection(
  format: CopyFormat,
  columns: string[],
  rows: Cell[][],
  table?: { schema: string; name: string },
): string {
  switch (format) {
    case 'tsv':
      return rows
        .map((r) =>
          r
            .map(fieldText)
            .map((f) => (/[\t\n\r"]/.test(f) ? quote(f) : f))
            .join('\t'),
        )
        .join('\n')
    case 'csv':
      return delimited(columns, rows, ',', /[,\n\r"]/)
    case 'json':
      return JSON.stringify(
        rows.map((r) => Object.fromEntries(columns.map((c, i) => [c, r[i] ?? null]))),
        null,
        2,
      )
    case 'insert': {
      const target = table ? `${sqlIdent(table.schema)}.${sqlIdent(table.name)}` : 'my_table'
      const values = rows.map((r) => `  (${r.map(sqlLiteral).join(', ')})`).join(',\n')
      return `INSERT INTO ${target} (${columns.map(sqlIdent).join(', ')}) VALUES\n${values};`
    }
  }
}

/** Fields of delimited text, with "quoted" fields holding separators, newlines and "" quotes. */
function parseWith(text: string, sep: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false
  let i = 0
  const endField = () => {
    row.push(field)
    field = ''
  }
  while (i < text.length) {
    const ch = text[i] ?? ''
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        field += '"'
        i += 2
        continue
      }
      if (ch === '"') quoted = false
      else field += ch
      i++
      continue
    }
    if (ch === '"' && field === '') quoted = true
    else if (ch === sep) endField()
    else if (ch === '\n' || ch === '\r') {
      endField()
      rows.push(row)
      row = []
      if (ch === '\r' && text[i + 1] === '\n') i++
    } else field += ch
    i++
  }
  // The last line has no newline after it (or the text ends in one: no extra empty row).
  if (field !== '' || row.length > 0) {
    endField()
    rows.push(row)
  }
  return rows
}

/**
 * Cells of pasted text. Tabs mean TSV (Excel, Sheets, this grid). Without tabs, several lines with
 * the same number (> 1) of comma-separated fields are CSV; anything else is one column, so a value
 * like "Smith, John" stays one cell.
 */
export function parsePasted(text: string): string[][] {
  if (text.includes('\t')) return parseWith(text, '\t')
  const csv = parseWith(text, ',')
  const width = csv[0]?.length ?? 0
  if (csv.length > 1 && width > 1 && csv.every((r) => r.length === width)) return csv
  return parseWith(text, '\t')
}
