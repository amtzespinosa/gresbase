import { useNavigate, useRouter } from '@tanstack/react-router'
import {
  Copy,
  Eraser,
  ExternalLink,
  FileDown,
  FileUp,
  SquareArrowRight,
  Star,
  TableProperties,
  Trash2,
} from 'lucide-react'
import { type ReactNode, lazy, Suspense, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ContextMenu, MenuItem, MenuSeparator } from '@/components/ui/ContextMenu'
import { download } from '@/lib/api/client'
import { useConnectionId } from '@/lib/api/connections'
import { errorMessage } from '@/lib/api/errors'
import { useReadOnly } from '@/lib/api/queries'
import { exportUrl, useTable } from '@/lib/api/rows'
import { toast } from '@/lib/toast'
import { ActionDialog } from './TableActions'
import { searchDefaults, toQuery } from './tableSearch'
import { isSameTable, useConnectionTables, useTableTabs } from './tabs'

const ImportSheet = lazy(() => import('./ImportSheet').then((m) => ({ default: m.ImportSheet })))

type Dialog = 'import' | 'truncate' | 'drop'

/**
 * The context menu of a table in the table list. Writing actions only show outside read-only mode,
 * and only for tables.
 */
export function TableContextMenu({
  schema,
  table,
  kind,
  children,
}: {
  schema: string
  table: string
  kind: string
  children: ReactNode
}) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const router = useRouter()
  const connectionId = useConnectionId()
  const { favorites } = useConnectionTables(connectionId)
  const readOnly = useReadOnly() !== false
  const [dialog, setDialog] = useState<Dialog | null>(null)
  const ref = { schema, table }
  const starred = favorites.some((f) => isSameTable(f, ref))
  const writable = !readOnly && (kind === 'table' || kind === 'partitioned_table')
  const to = '/c/$connectionId/tables/$schema/$table' as const
  const params = { connectionId, schema, table }

  const copyName = () =>
    navigator.clipboard.writeText(table).then(
      () => toast({ message: t('tableMenu.nameCopied', { table }) }),
      (err: unknown) => toast({ tone: 'danger', message: errorMessage(err, t) }),
    )

  const exportCsv = () =>
    download(exportUrl(schema, table, toQuery(searchDefaults, false), 'csv')).catch(
      (err: unknown) => toast({ tone: 'danger', message: errorMessage(err, t), duration: 10_000 }),
    )

  return (
    <>
      <ContextMenu
        label={t('tableMenu.label', { table: `${schema}.${table}` })}
        items={
          <>
            <MenuItem icon={<SquareArrowRight />} onSelect={() => void navigate({ to, params })}>
              {t('tableMenu.open')}
            </MenuItem>
            <MenuItem
              icon={<ExternalLink />}
              onSelect={() =>
                window.open(router.buildLocation({ to, params }).href, '_blank', 'noopener')
              }
            >
              {t('tableMenu.openNewTab')}
            </MenuItem>
            <MenuItem
              icon={<Star />}
              onSelect={() => useTableTabs.getState().toggleFavorite(connectionId, ref)}
            >
              {t(starred ? 'tableMenu.unfavorite' : 'tableMenu.favorite')}
            </MenuItem>
            <MenuItem icon={<Copy />} onSelect={() => void copyName()}>
              {t('tableMenu.copyName')}
            </MenuItem>
            <MenuItem
              icon={<TableProperties />}
              onSelect={() => void navigate({ to, params, search: { tab: 'structure' } })}
            >
              {t('tableMenu.structure')}
            </MenuItem>
            <MenuSeparator />
            <MenuItem icon={<FileDown />} onSelect={() => void exportCsv()}>
              {t('tableMenu.exportCsv')}
            </MenuItem>
            {writable && (
              <>
                <MenuItem icon={<FileUp />} onSelect={() => setDialog('import')}>
                  {t('tableMenu.importCsv')}
                </MenuItem>
                <MenuSeparator />
                <MenuItem danger icon={<Eraser />} onSelect={() => setDialog('truncate')}>
                  {t('tableActions.truncate')}
                </MenuItem>
                <MenuItem danger icon={<Trash2 />} onSelect={() => setDialog('drop')}>
                  {t('tableActions.drop')}
                </MenuItem>
              </>
            )}
          </>
        }
      >
        {children}
      </ContextMenu>
      {dialog === 'import' && (
        <ImportFor schema={schema} table={table} onClose={() => setDialog(null)} />
      )}
      {(dialog === 'truncate' || dialog === 'drop') && (
        <ActionDialog
          schema={schema}
          table={table}
          action={dialog}
          onClose={() => setDialog(null)}
        />
      )}
    </>
  )
}

/** The import sheet of a table that may not be open: loads its metadata first. */
function ImportFor({
  schema,
  table,
  onClose,
}: {
  schema: string
  table: string
  onClose: () => void
}) {
  const meta = useTable(schema, table)
  if (!meta.data) return null
  return (
    <Suspense>
      <ImportSheet meta={meta.data} onClose={onClose} />
    </Suspense>
  )
}
