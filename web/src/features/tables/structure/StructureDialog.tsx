import { AlertTriangle } from 'lucide-react'
import { CheckboxField } from '@/components/ui/Checkbox'
import { type ReactNode, useEffect, useId, useState } from 'react'
import type { TFunction } from 'i18next'
import { useTranslation } from 'react-i18next'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { ApiError } from '@/lib/api/client'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { errorMessage } from '@/lib/api/errors'
import { useCapability } from '@/lib/api/queries'
import { useApplyStructure, useStructurePreview, useTypes } from '@/lib/api/structure'
import type { ColumnDef, Default, StructureChange, TypeSpec } from '@/lib/api/types.gen'
import { toast } from '@/lib/toast'

interface StructureDialogProps {
  title: ReactNode
  description?: ReactNode
  /** The change the form describes; `null` while it is incomplete. */
  change: StructureChange | null
  confirmLabel: ReactNode
  /** Asks to type this name before applying (dropping a column). */
  typedName?: string
  size?: 'md' | 'lg'
  onClose: () => void
  onDone?: (change: StructureChange) => void
  children?: ReactNode
}

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value)
  useEffect(() => {
    const id = setTimeout(() => setV(value), ms)
    return () => clearTimeout(id)
  }, [value, ms])
  return v
}

/**
 * A structure change: its form, then the exact SQL the server will run and its warnings (rewrite,
 * lock, scan, existing data). Applying is only possible once the preview matches the form.
 */
export function StructureDialog({
  title,
  description,
  change,
  confirmLabel,
  typedName,
  size,
  onClose,
  onDone,
  children,
}: StructureDialogProps) {
  const { t } = useTranslation()
  // Compare by value: the form rebuilds the change object on every render.
  const key = JSON.stringify(change)
  const debounced = useDebounced(key, 250)
  const preview = useStructurePreview(
    debounced === 'null' ? null : (JSON.parse(debounced) as StructureChange),
  )
  const apply = useApplyStructure()
  const ready =
    change !== null && debounced === key && preview.isSuccess && !preview.isPlaceholderData
  // The error of the last apply, for the change it was about.
  const [failed, setFailed] = useState<{ key: string; message: string } | null>(null)

  const confirm = () => {
    if (!ready || !change) return
    apply.mutate(change, {
      onSuccess: () => {
        toast({ message: t('structureEdit.done') })
        onDone?.(change)
        onClose()
      },
      onError: (err) => setFailed({ key, message: structureErrorMessage(err, t) }),
    })
  }

  return (
    <ConfirmDialog
      open
      onOpenChange={(open) => !open && onClose()}
      level={typedName ? 'danger-typed' : 'info'}
      typedName={typedName}
      title={title}
      description={description}
      confirmLabel={confirmLabel}
      onConfirm={confirm}
      busy={!ready || apply.isPending}
      size={size}
    >
      <div className="flex flex-col gap-4">
        {children}
        {failed?.key === key && (
          <p role="alert" className="whitespace-pre-wrap text-danger">
            {failed.message}
          </p>
        )}
        <section aria-label={t('structureEdit.sql')} aria-live="polite">
          <p className="section-label mb-1">{t('structureEdit.sql')}</p>
          {change === null ? (
            <p className="text-muted">{t('structureEdit.incomplete')}</p>
          ) : preview.isError ? (
            <p role="alert" className="text-danger">
              {errorMessage(preview.error, t)}
            </p>
          ) : (
            <pre className="max-h-48 overflow-auto rounded-[var(--radius-control)] border border-border bg-surface-2 p-3 font-mono text-[12.5px] whitespace-pre-wrap">
              {preview.data ? preview.data.sql.join(';\n') + ';' : t('common.loading')}
            </pre>
          )}
          {preview.data && !preview.isError && preview.data.warnings.length > 0 && (
            <ul className="mt-2 flex flex-col gap-1">
              {preview.data.warnings.map((w) => (
                <li key={w} className="flex items-start gap-2 text-danger">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
                  <span className="text-text">{t(`structureEdit.warning.${w}`)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </ConfirmDialog>
  )
}

/** Postgres errors a structure change typically hits because of the rows already in the table. */
const dataErrors = ['23503', '23505', '23514', '23502']

/**
 * What went wrong applying a structure change. A Postgres error says why in its own words (and
 * which row, in its detail); for the usual data errors a translated line says what to do first.
 */
function structureErrorMessage(err: unknown, t: TFunction): string {
  if (!(err instanceof ApiError) || err.code !== 'pg_error') return errorMessage(err, t)
  const lines = [err.message, err.detail]
  if (err.pgCode && dataErrors.includes(err.pgCode))
    lines.unshift(t(`structureEdit.pgError.${err.pgCode}`))
  return lines.filter(Boolean).join('\n')
}

/** A labelled field; `label` names the control for screen readers too. */
export function Field({
  label,
  children,
  className,
}: {
  label: string
  children: (id: string) => ReactNode
  className?: string
}) {
  const id = useId()
  return (
    <div className={className ?? 'flex flex-col gap-1.5'}>
      <label htmlFor={id} className="text-muted">
        {label}
      </label>
      {children(id)}
    </div>
  )
}

/** Splits "10, 2" into ["10", "2"]. */
const parseModifiers = (s: string) =>
  s
    .split(',')
    .map((m) => m.trim())
    .filter(Boolean)

/** Type name with suggestions (datalist), its modifiers when the type takes them, and "array". */
export function TypeField({
  value,
  onChange,
  label,
}: {
  value: TypeSpec
  onChange: (v: TypeSpec) => void
  label: string
}) {
  const { t } = useTranslation()
  const types = useTypes()
  const listId = useId()
  const known = types.data?.find((ti) => ti.name === value.name)
  const [mods, setMods] = useState((value.modifiers ?? []).join(', '))
  return (
    <div className="flex flex-wrap items-end gap-2">
      <Field label={label} className="flex min-w-40 flex-1 flex-col gap-1.5">
        {(id) => (
          <>
            <Input
              id={id}
              list={listId}
              value={value.name}
              onChange={(e) => onChange({ ...value, name: e.target.value })}
              autoComplete="off"
              spellCheck={false}
              className="font-mono"
            />
            <datalist id={listId}>
              {types.data?.map((ti) => (
                <option key={ti.name} value={ti.name} />
              ))}
            </datalist>
          </>
        )}
      </Field>
      {known?.modifiers && (
        <Field label={t('structureEdit.modifiers')} className="flex w-24 flex-col gap-1.5">
          {(id) => (
            <Input
              id={id}
              value={mods}
              placeholder="50"
              onChange={(e) => {
                setMods(e.target.value)
                onChange({ ...value, modifiers: parseModifiers(e.target.value) })
              }}
              className="font-mono"
            />
          )}
        </Field>
      )}
      <div className="flex h-9 items-center">
        <CheckboxField
          checked={!!value.array}
          onChange={(array) => onChange({ ...value, array })}
          label={t('structureEdit.array')}
        />
      </div>
    </div>
  )
}

type DefaultChoice =
  'none' | 'value' | 'now' | 'current_timestamp' | 'current_date' | 'gen_random_uuid'

/** No default, a value (cast to the column type) or one of the server's default functions. */
export function DefaultField({
  value,
  onChange,
  label,
}: {
  value: Default | undefined
  onChange: (v: Default | undefined) => void
  label: string
}) {
  const { t } = useTranslation()
  const uuid = useCapability('gen_random_uuid_core')
  const choice: DefaultChoice = !value
    ? 'none'
    : value.kind === 'value'
      ? 'value'
      : (value.value as DefaultChoice)
  const functions: DefaultChoice[] = ['now', 'current_timestamp', 'current_date']
  if (uuid.available) functions.push('gen_random_uuid')
  return (
    <div className="flex flex-wrap items-end gap-2">
      <Field label={label} className="flex w-48 flex-col gap-1.5">
        {(id) => (
          <Select
            id={id}
            value={choice}
            onValueChange={(c) =>
              onChange(
                c === 'none'
                  ? undefined
                  : c === 'value'
                    ? { kind: 'value', value: '' }
                    : { kind: 'function', value: c },
              )
            }
            options={[
              { value: 'none', label: t('structureEdit.defaultNone') },
              { value: 'value', label: t('structureEdit.defaultValue') },
              ...functions.map((f) => ({
                value: f,
                label: <span className="font-mono">{f}()</span>,
              })),
            ]}
          />
        )}
      </Field>
      {value?.kind === 'value' && (
        <Field label={t('structureEdit.value')} className="flex min-w-32 flex-1 flex-col gap-1.5">
          {(id) => (
            <Input
              id={id}
              value={value.value}
              onChange={(e) => onChange({ kind: 'value', value: e.target.value })}
              className="font-mono"
            />
          )}
        </Field>
      )}
    </div>
  )
}

/** Every field of a new column. */
export function ColumnFields({
  value,
  onChange,
}: {
  value: ColumnDef
  onChange: (v: ColumnDef) => void
}) {
  const { t } = useTranslation()
  return (
    <div className="flex flex-col gap-3">
      <Field label={t('structureEdit.columnName')}>
        {(id) => (
          <Input
            id={id}
            value={value.name}
            onChange={(e) => onChange({ ...value, name: e.target.value })}
            autoComplete="off"
            spellCheck={false}
            className="font-mono"
          />
        )}
      </Field>
      <TypeField
        label={t('structureEdit.type')}
        value={value.type}
        onChange={(type) => onChange({ ...value, type })}
      />
      <div className="flex flex-wrap items-end gap-4">
        <Field label={t('structureEdit.identity')} className="flex w-48 flex-col gap-1.5">
          {(id) => (
            <Select
              id={id}
              value={value.identity || 'none'}
              onValueChange={(v) =>
                onChange({
                  ...value,
                  identity: v === 'none' ? undefined : (v as 'always' | 'by_default'),
                  default: v === 'none' ? value.default : undefined,
                })
              }
              options={(['none', 'always', 'by_default'] as const).map((v) => ({
                value: v,
                label: t(`structureEdit.identity_${v}`),
              }))}
            />
          )}
        </Field>
        <div className="flex h-9 items-center">
          <CheckboxField
            checked={value.not_null}
            onChange={(not_null) => onChange({ ...value, not_null })}
            label={t('structureEdit.notNull')}
          />
        </div>
      </div>
      {!value.identity && (
        <DefaultField
          label={t('structureEdit.default')}
          value={value.default}
          onChange={(d) => onChange({ ...value, default: d })}
        />
      )}
    </div>
  )
}
