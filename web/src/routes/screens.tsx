import { Table2 } from 'lucide-react'
import { Navigate, Outlet } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { EmptyState } from '@/components/EmptyState'
import { ErrorPanel } from '@/components/ErrorPanel'
import { Card } from '@/components/ui/Card'
import { TableBrowser } from '@/features/tables/TableBrowser'
import { TableTabs } from '@/features/tables/TableTabs'
import { useTableTabs } from '@/features/tables/tabs'
import { useSelectedSchema } from '@/features/tables/useSelectedSchema'
import { useRelations } from '@/lib/api/queries'
import { useConnectionId } from '@/lib/api/connections'

// ponytail: placeholder screens; later tasks replace each body with its feature.

function CardHeader({ children }: { children: ReactNode }) {
  return (
    <header className="flex h-14 shrink-0 items-center border-b border-border px-5">
      {children}
    </header>
  )
}

export function TablesScreen() {
  return (
    <>
      <TableBrowser />
      <Card className="flex min-w-0 flex-1 flex-col">
        <TableTabs />
        <Outlet />
      </Card>
    </>
  )
}

export function TablesIndex() {
  const connectionId = useConnectionId()
  const { t } = useTranslation()
  const { schema } = useSelectedSchema()
  const relations = useRelations(schema)
  // Open tabs first; with none, the first table, unless the user closed every tab here.
  const tabs = useTableTabs((s) => s.byConnection[connectionId]?.tabs)
  const first = tabs
    ? tabs[0]
    : relations.data?.[0] && { schema: relations.data[0].schema, table: relations.data[0].name }
  if (first) {
    return (
      <Navigate
        to="/c/$connectionId/tables/$schema/$table"
        params={{ connectionId, schema: first.schema, table: first.table }}
        replace
      />
    )
  }
  return (
    <>
      <CardHeader>
        <h1 className="text-[19px] font-semibold">{t('tables.title')}</h1>
      </CardHeader>
      {relations.isError ? (
        <ErrorPanel error={relations.error} onRetry={() => void relations.refetch()} />
      ) : relations.data?.length === 0 ? (
        <EmptyState
          icon={<Table2 />}
          title={t('tables.noRelations')}
          hint={t('tables.noRelationsHint')}
        />
      ) : (
        <EmptyState icon={<Table2 />} title={t('tables.empty')} />
      )}
    </>
  )
}
