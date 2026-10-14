import { Navigate, Outlet, useLocation } from '@tanstack/react-router'
import { useConfig } from '@/lib/api/queries'

/** Root of the app: while Gresbase is not set up, every route leads to the wizard. */
export function SetupGate() {
  const config = useConfig()
  const { pathname } = useLocation()
  if (config.data?.setup_required && !pathname.endsWith('/setup'))
    return <Navigate to="/setup" replace />
  return <Outlet />
}
