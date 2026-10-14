import { useNavigate } from '@tanstack/react-router'
import { useLogout } from '@/lib/api/auth'

/** Ends the session and goes to the login screen, even if the request fails. */
export function useSignOut() {
  const logout = useLogout()
  const navigate = useNavigate()
  return () => logout.mutate(undefined, { onSettled: () => void navigate({ to: '/login' }) })
}
