import { cellText } from '@/components/grid/cellValue'
import type { Cell } from '@/lib/api/types.gen'

/**
 * Client-side exports of rows already loaded in the browser (SQL editor results). Table exports
 * stream from the server instead. Values are written as the grid shows them; bytea cells keep
 * their size marker because the full bytes were never loaded.
 */
interface Data {
  columns: { name: string }[]
  rows: Cell[][]
}

/** CSV like Postgres writes it: NULL is an empty unquoted field, an empty string is "". */
export function toCSV({ columns, rows }: Data): string {
  const field = (v: Cell) => {
    if (v === null) return ''
    const s = cellText(v)
    return s === '' || /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  return [columns.map((c) => field(c.name)), ...rows.map((r) => r.map(field))]
    .map((line) => line.join(','))
    .join('\n')
    .concat('\n')
}

/** A JSON array of objects (column → value). Duplicate column names keep the last value. */
export function toJSON({ columns, rows }: Data): string {
  const objects = rows.map((r) => Object.fromEntries(columns.map((c, i) => [c.name, r[i]])))
  return JSON.stringify(objects, null, 2) + '\n'
}

/** A GitHub-flavoured Markdown table. */
export function toMarkdown({ columns, rows }: Data): string {
  const cell = (s: string) =>
    s.replace(/\\/g, '\\\\').replace(/\|/g, '\\|').replace(/\r?\n/g, '<br>')
  const line = (cells: string[]) => `| ${cells.join(' | ')} |`
  return [
    line(columns.map((c) => cell(c.name))),
    line(columns.map(() => '---')),
    ...rows.map((r) => line(r.map((v) => (v === null ? 'NULL' : cell(cellText(v)))))),
  ].join('\n')
}

/** Saves text as a file through a temporary link. */
export function downloadText(filename: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
