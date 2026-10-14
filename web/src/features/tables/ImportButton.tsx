import { FileUp } from 'lucide-react'
import { lazy, Suspense, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/Button'
import { useReadOnly } from '@/lib/api/queries'
import type { Table } from '@/lib/api/types.gen'

// The CSV parser loads with the sheet, outside the initial bundle.
const ImportSheet = lazy(() => import('./ImportSheet').then((m) => ({ default: m.ImportSheet })))

/** "Import CSV" in the table toolbar; hidden in read-only mode and for relations that are not tables. */
export function ImportButton({ meta }: { meta: Table }) {
  const { t } = useTranslation()
  const readOnly = useReadOnly() !== false
  const [open, setOpen] = useState(false)
  if (readOnly || (meta.kind !== 'table' && meta.kind !== 'partitioned_table')) return null
  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        <FileUp className="size-4" />
        {t('import.button')}
      </Button>
      {open && (
        <Suspense>
          <ImportSheet meta={meta} onClose={() => setOpen(false)} />
        </Suspense>
      )}
    </>
  )
}
