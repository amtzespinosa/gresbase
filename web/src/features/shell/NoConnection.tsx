import { useNavigate } from '@tanstack/react-router'
import { Database, Plus } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { EmptyState } from '@/components/EmptyState'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { ConnectionDialog } from '@/features/connections/ConnectionDialog'

/** No connection left (the administrator deleted the last saved one): add one to go on. */
export function NoConnection() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [adding, setAdding] = useState(false)
  return (
    <div className="flex h-full p-3">
      <Card className="flex flex-1 flex-col">
        <EmptyState
          icon={<Database />}
          title={t('connections.none')}
          hint={t('connections.noneHint')}
        >
          <Button variant="primary" onClick={() => setAdding(true)}>
            <Plus className="size-4" aria-hidden />
            {t('connections.add')}
          </Button>
        </EmptyState>
      </Card>
      <ConnectionDialog
        open={adding}
        onOpenChange={setAdding}
        onSaved={(c) =>
          void navigate({ to: '/c/$connectionId/tables', params: { connectionId: c.id } })
        }
      />
    </div>
  )
}
