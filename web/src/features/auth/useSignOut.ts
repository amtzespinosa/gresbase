import { useNavigate } from '@tanstack/react-router'
import { create } from 'zustand'
import { useLogout } from '@/lib/api/auth'
import { useChanges } from '@/features/tables/changes/queue'
import { useSqlEditor } from '@/features/sql/store'

/**
 * Ends the session and goes to the login screen, even if the request fails. Whatever is still open
 * goes with it, as the confirmation said: the SQL transaction is rolled back (the server would only
 * drop it when idle) and the grid's pending changes are discarded. The screens' "leave with unsaved
 * work?" guards don't ask again.
 */
export function useSignOut() {
  const logout = useLogout()
  const navigate = useNavigate()
  return async () => {
    if (useSqlEditor.getState().tx)
      await useSqlEditor
        .getState()
        .rollback()
        .catch(() => undefined)
    useChanges.setState({ queues: {}, history: {} })
    logout.mutate(undefined, {
      onSettled: () => void navigate({ to: '/login', ignoreBlocker: true }),
    })
  }
}

/** Whether the sign-out confirmation is open; every "Sign out" in the app opens the same one. */
export const useSignOutDialog = create<{ open: boolean; setOpen: (open: boolean) => void }>()(
  (set) => ({ open: false, setOpen: (open) => set({ open }) }),
)
