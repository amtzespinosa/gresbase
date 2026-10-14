import { FileUp, Upload } from 'lucide-react'
import { CheckboxField } from '@/components/ui/Checkbox'
import { type DragEvent, useEffect, useId, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/Button'
import { Select } from '@/components/ui/Select'
import { Sheet } from '@/components/ui/Sheet'
import { errorMessage } from '@/lib/api/errors'
import { useImport } from '@/lib/api/tables'
import type { ImportResult, Table } from '@/lib/api/types.gen'
import { useFormat } from '@/lib/i18n/format'
import { toast } from '@/lib/toast'
import {
  DELIMITERS,
  type DelimiterChoice,
  MAX_IMPORT_BYTES,
  type Preview,
  autoMapping,
  detectHeader,
  importable,
  readPreview,
  required,
  toMapping,
} from './importCsv'

const selectClass = 'h-8 px-2 font-mono text-[12.5px]'

export function ImportSheet({ meta, onClose }: { meta: Table; onClose: () => void }) {
  const { t } = useTranslation()
  const fmt = useFormat()
  const ids = useId()
  const run = useImport(meta.schema, meta.name)
  const [file, setFile] = useState<File | null>(null)
  const [tooLarge, setTooLarge] = useState(false)
  const [choice, setChoice] = useState<DelimiterChoice>('auto')
  const [preview, setPreview] = useState<Preview | null>(null)
  const [header, setHeader] = useState<boolean | null>(null)
  const [emptyAsNull, setEmptyAsNull] = useState(true)
  const [overrides, setOverrides] = useState<Record<string, number>>({})
  const [result, setResult] = useState<ImportResult | null>(null)
  const columns = useMemo(() => importable(meta.columns), [meta.columns])

  useEffect(() => {
    if (!file) return
    let live = true
    void readPreview(file, choice).then((p) => live && setPreview(p))
    return () => {
      live = false
    }
  }, [file, choice])

  const hasHeader = header ?? detectHeader(preview?.rows[0], columns)
  const width = preview ? Math.max(0, ...preview.rows.map((r) => r.length)) : 0
  const sources = Array.from({ length: width }, (_, i) =>
    hasHeader && preview?.rows[0]?.[i]?.trim()
      ? preview.rows[0][i]
      : t('import.source', { n: i + 1 }),
  )
  const mapping = {
    ...autoMapping(columns, hasHeader ? (preview?.rows[0] ?? null) : null),
    ...overrides,
  }
  const mapped = toMapping(mapping)
  const body = preview ? preview.rows.slice(hasHeader ? 1 : 0) : []

  const choose = (f: File | undefined) => {
    if (!f) return
    setTooLarge(f.size > MAX_IMPORT_BYTES)
    setResult(null)
    setOverrides({})
    setHeader(null)
    setPreview(null)
    setFile(f.size > MAX_IMPORT_BYTES ? null : f)
  }
  const drop = (e: DragEvent) => {
    e.preventDefault()
    choose(e.dataTransfer.files[0])
  }
  const submit = () => {
    if (!file || !preview) return
    setResult(null)
    run.mutate(
      {
        file,
        options: {
          delimiter: choice === 'auto' ? preview.detected : DELIMITERS[choice],
          header: hasHeader,
          empty_as_null: emptyAsNull,
          mapping: mapped,
        },
      },
      {
        onSuccess: (res) => {
          if (res.errors.length) return setResult(res)
          toast({ message: t('import.done', { count: res.inserted, n: fmt.number(res.inserted) }) })
          onClose()
        },
      },
    )
  }

  return (
    <Sheet
      wide
      open
      onOpenChange={(o) => !o && !run.isPending && onClose()}
      title={t('import.title', { table: meta.name })}
      description={t('import.notUndoable')}
      footer={
        <>
          <Button onClick={onClose} disabled={run.isPending}>
            {t('common.cancel')}
          </Button>
          <Button
            variant="primary"
            onClick={submit}
            disabled={!preview || mapped.length === 0 || run.isPending}
          >
            <Upload className="size-4" />
            {t(run.isPending ? 'import.importing' : 'import.submit')}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <label
          onDragOver={(e) => e.preventDefault()}
          onDrop={drop}
          className="flex cursor-pointer flex-col items-center gap-1 rounded-[var(--radius-control)] border border-dashed border-border bg-surface-2 p-4 text-center focus-within:outline-2 focus-within:outline-accent"
        >
          <FileUp className="size-5 text-muted" />
          <span>{file ? file.name : t('import.choose')}</span>
          <span className="text-[12px] text-muted">
            {file ? fmt.bytes(file.size) : t('import.limit')}
          </span>
          <input
            type="file"
            accept=".csv,.tsv,.txt,text/csv,text/plain"
            className="sr-only"
            aria-label={t('import.file')}
            onChange={(e) => choose(e.target.files?.[0])}
          />
        </label>
        {tooLarge && <p className="text-danger">{t('import.tooLarge')}</p>}

        {preview && (
          <>
            <div className="flex flex-wrap items-center gap-4">
              <label className="flex items-center gap-2" htmlFor={`${ids}-delim`}>
                <span className="section-label">{t('import.delimiter')}</span>
                <Select
                  id={`${ids}-delim`}
                  className={`${selectClass} w-auto`}
                  value={choice}
                  onValueChange={(v) => setChoice(v as DelimiterChoice)}
                  options={(['auto', ...Object.keys(DELIMITERS)] as DelimiterChoice[]).map((d) => ({
                    value: d,
                    label: t(`import.delimiters.${d}`),
                  }))}
                />
              </label>
              <CheckboxField
                label={t('import.header')}
                checked={hasHeader}
                onChange={(v) => {
                  setHeader(v)
                  setOverrides({})
                }}
              />
              <CheckboxField
                label={t('import.emptyAsNull')}
                checked={emptyAsNull}
                onChange={setEmptyAsNull}
              />
            </div>

            <section>
              <h3 className="section-label mb-2">{t('import.mapping')}</h3>
              <ul className="flex flex-col gap-1.5">
                {columns.map((c) => (
                  <li key={c.name} className="flex items-center gap-3">
                    <label
                      htmlFor={`${ids}-map-${c.name}`}
                      className="w-48 shrink-0 truncate font-mono text-[12.5px]"
                    >
                      {c.name}
                      {required(c) && <span className="text-danger"> *</span>}
                      <span className="ml-2 text-muted">{c.type}</span>
                    </label>
                    <Select
                      id={`${ids}-map-${c.name}`}
                      className={`${selectClass} flex-1`}
                      value={String(mapping[c.name] ?? -1)}
                      onValueChange={(v) => setOverrides({ ...overrides, [c.name]: Number(v) })}
                      options={[
                        {
                          value: '-1',
                          label: t(
                            c.default != null || c.identity ? 'import.useDefault' : 'import.ignore',
                          ),
                        },
                        ...sources.map((s, i) => ({ value: String(i), label: s })),
                      ]}
                    />
                  </li>
                ))}
              </ul>
            </section>

            <section>
              <h3 className="section-label mb-2">{t('import.preview', { count: body.length })}</h3>
              <div className="max-h-64 overflow-auto rounded-[var(--radius-control)] border border-border">
                <table className="w-full font-mono text-[12.5px]">
                  <thead className="sticky top-0 bg-surface-2">
                    <tr>
                      {sources.map((s, i) => (
                        <th key={i} className="px-2 py-1.5 text-left font-medium whitespace-nowrap">
                          {s}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {body.map((r, i) => (
                      <tr key={i} className="border-t border-border">
                        {sources.map((_, j) => (
                          <td key={j} className="max-w-60 truncate px-2 py-1 whitespace-nowrap">
                            {r[j] ?? ''}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )}

        {run.isError && <p className="text-danger">{errorMessage(run.error, t)}</p>}
        {result && (
          <section
            role="alert"
            className="rounded-[var(--radius-control)] border border-danger p-3"
          >
            <p className="font-medium text-danger">
              {t('import.failed', { count: result.errors.length })}
            </p>
            <ul className="mt-2 flex max-h-56 flex-col gap-1 overflow-auto font-mono text-[12.5px]">
              {result.errors.map((e, i) => (
                <li key={i}>
                  {t('import.errorAt', { row: e.row })}
                  {e.column && <span className="text-accent-ink"> · {e.column}</span>}
                  <span className="text-muted"> — {e.message}</span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </Sheet>
  )
}
