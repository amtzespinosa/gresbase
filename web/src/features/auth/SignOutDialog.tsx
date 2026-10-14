import { useTranslation } from 'react-i18next'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { pendingCount, useChanges } from '@/features/tables/changes/queue'
import { useSqlEditor } from '@/features/sql/store'
import { useSignOut, useSignOutDialog } from './useSignOut'

/** What signing out drops: unsaved grid changes and an open SQL transaction, one line each. */
export function SignOutWarnings() {
  const { t } = useTranslation()
  const pending = useChanges((s) =>
    Object.values(s.queues).reduce((n, q) => n + pendingCount(q), 0),
  )
  const tx = useSqlEditor((s) => s.tx !== null)
  if (!pending && !tx) return null
  return (
    <ul className="flex list-disc flex-col gap-1 pl-5">
      {pending > 0 && <li>{t('auth.signOutConfirm.pending', { count: pending })}</li>}
      {tx && <li>{t('auth.signOutConfirm.transaction')}</li>}
    </ul>
  )
}

/** The confirmation behind every "Sign out" (sidebar, Settings, ⌘K); mounted once in the shell. */
export function SignOutDialog() {
  const { t } = useTranslation()
  const { open, setOpen } = useSignOutDialog()
  const signOut = useSignOut()
  const atRisk = useChanges((s) => Object.values(s.queues).some((q) => pendingCount(q) > 0))
  const tx = useSqlEditor((s) => s.tx !== null)
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={setOpen}
      level={atRisk || tx ? 'warning' : 'info'}
      title={t('auth.signOutConfirm.title')}
      description={t('auth.signOutConfirm.description')}
      confirmLabel={t('auth.signOut')}
      onConfirm={() => {
        setOpen(false)
        void signOut()
      }}
    >
      <SignOutWarnings />
    </ConfirmDialog>
  )
}
