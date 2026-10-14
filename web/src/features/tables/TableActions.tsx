import { useNavigate } from '@tanstack/react-router'
import { CheckboxField } from '@/components/ui/Checkbox'
import { Eraser, FolderInput, MessageSquare, MoreHorizontal, PenLine, Trash2 } from 'lucide-react'
import { DropdownMenu as M } from 'radix-ui'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { IconButton } from '@/components/ui/IconButton'
import { errorMessage } from '@/lib/api/errors'
import { useReadOnly } from '@/lib/api/queries'
import { useDependents, useTableAction } from '@/lib/api/tables'
import { cn } from '@/lib/cn'
import { toast } from '@/lib/toast'
import { tableKey, useChanges } from './changes/queue'
import { useConnectionId } from '@/lib/api/connections'
import { TableDialog, type TableAction } from './structure/dialogs'
import { isSameTable, useTableTabs } from './tabs'

interface TableActionsProps {
  schema: string
  table: string
  kind: string
  /** The table comment, for "Edit comment…". */
  comment?: string | null
  className?: string
}

type Action = 'truncate' | 'drop'

const neutralItemClass =
  'flex h-8 cursor-pointer items-center gap-2 rounded-[8px] px-2 outline-none ' +
  'data-[highlighted]:bg-surface-2'

const itemClass =
  'flex h-8 cursor-pointer items-center gap-2 rounded-[8px] px-2 text-danger outline-none ' +
  'data-[highlighted]:bg-surface-2'

/**
 * The menu with the dangerous table actions (empty, drop), each behind a typed-name confirmation.
 * Nothing shows in read-only mode or for relations that are not tables.
 */
export function TableActions({
  schema,
  table,
  kind,
  comment = null,
  className,
}: TableActionsProps) {
  const { t } = useTranslation()
  const readOnly = useReadOnly() !== false
  const [action, setAction] = useState<Action | null>(null)
  const [edit, setEdit] = useState<TableAction | null>(null)
  if (readOnly) return null
  if (kind !== 'table' && kind !== 'partitioned_table') return null
  return (
    <>
      <M.Root>
        <M.Trigger asChild>
          <IconButton
            label={t('tableActions.menu', { table })}
            icon={<MoreHorizontal />}
            tooltip={false}
            className={className}
          />
        </M.Trigger>
        <M.Portal>
          <M.Content
            align="end"
            sideOffset={4}
            className="z-50 min-w-44 rounded-[var(--radius-control)] border border-border bg-surface p-1 shadow-card"
          >
            <M.Item className={neutralItemClass} onSelect={() => setEdit('rename_table')}>
              <PenLine className="size-4" />
              {t('tableActions.rename')}
            </M.Item>
            <M.Item className={neutralItemClass} onSelect={() => setEdit('set_table_comment')}>
              <MessageSquare className="size-4" />
              {t('tableActions.comment')}
            </M.Item>
            <M.Item className={neutralItemClass} onSelect={() => setEdit('set_table_schema')}>
              <FolderInput className="size-4" />
              {t('tableActions.move')}
            </M.Item>
            <M.Separator className="my-1 h-px bg-border" />
            <M.Item className={itemClass} onSelect={() => setAction('truncate')}>
              <Eraser className="size-4" />
              {t('tableActions.truncate')}
            </M.Item>
            <M.Item className={itemClass} onSelect={() => setAction('drop')}>
              <Trash2 className="size-4" />
              {t('tableActions.drop')}
            </M.Item>
          </M.Content>
        </M.Portal>
      </M.Root>
      {edit && (
        <TableDialog
          schema={schema}
          table={table}
          comment={comment}
          action={edit}
          onClose={() => setEdit(null)}
        />
      )}
      {action && (
        <ActionDialog
          schema={schema}
          table={table}
          action={action}
          onClose={() => setAction(null)}
        />
      )}
    </>
  )
}

export function ActionDialog({
  schema,
  table,
  action,
  onClose,
}: {
  schema: string
  table: string
  action: Action
  onClose: () => void
}) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const connectionId = useConnectionId()
  const [cascade, setCascade] = useState(false)
  const [restart, setRestart] = useState(false)
  const deps = useDependents(schema, table, true)
  const run = useTableAction(schema, table)
  const affected = action === 'truncate' ? deps.data?.truncate : deps.data?.drop

  const confirm = () =>
    run.mutate(
      action === 'truncate'
        ? { kind: 'truncate', restart_identity: restart, cascade, confirm: table }
        : { kind: 'drop', cascade, confirm: table },
      {
        onSuccess: () => {
          onClose()
          // Pending edits of an emptied or dropped table can only fail now.
          useChanges.getState().clear(tableKey(schema, table))
          toast({ message: t(`tableActions.${action}Done`, { table }) })
          if (action === 'drop') {
            useTableTabs
              .getState()
              .closeTabs(connectionId, (r) => !isSameTable(r, { schema, table }))
            void navigate({ to: '/c/$connectionId/tables', params: { connectionId } })
          }
        },
        onError: (err) =>
          toast({ tone: 'danger', message: errorMessage(err, t), duration: 10_000 }),
      },
    )

  return (
    <ConfirmDialog
      open
      onOpenChange={(open) => !open && onClose()}
      level="danger-typed"
      typedName={table}
      title={t(`tableActions.${action}Title`, { table: `${schema}.${table}` })}
      description={t(`tableActions.${action}Description`)}
      confirmLabel={t(`tableActions.${action}Confirm`)}
      onConfirm={confirm}
      busy={run.isPending}
    >
      <div className="flex flex-col gap-2">
        {action === 'truncate' && (
          <CheckboxField
            checked={restart}
            onChange={setRestart}
            label={t('tableActions.restartIdentity')}
          />
        )}
        <CheckboxField
          checked={cascade}
          onChange={setCascade}
          label={t(`tableActions.${action}Cascade`)}
        />
        {affected && affected.length > 0 && (
          <div
            className={cn(
              'rounded-[var(--radius-control)] border border-border p-3',
              !cascade && 'opacity-60',
            )}
          >
            <p className="section-label mb-1">
              {t(`tableActions.${action}Affected`, { count: affected.length })}
            </p>
            <ul className="max-h-32 overflow-auto font-mono text-[12px]">
              {affected.map((a) => (
                <li key={a}>{a}</li>
              ))}
            </ul>
          </div>
        )}
        {affected && affected.length > 0 && !cascade && (
          <p className="text-muted">{t(`tableActions.${action}NeedsCascade`)}</p>
        )}
      </div>
    </ConfirmDialog>
  )
}
