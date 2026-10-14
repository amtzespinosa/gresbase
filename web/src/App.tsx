import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider } from '@tanstack/react-router'
import { useState } from 'react'
import '@/lib/i18n'
import { useApplyLang } from '@/lib/i18n/useApplyLang'
import { Toaster } from '@/components/ui/Toast'
import { TooltipProvider } from '@/components/ui/Tooltip'
import { setUnauthorizedHandler } from '@/lib/api/client'
import { useApplyTheme } from '@/lib/prefs/useApplyTheme'
import { type AppRouter, makeRouter } from '@/router'

interface AppProps {
  router?: AppRouter
  queryClient?: QueryClient
}

// Needs the query client (it reads GRESBASE_LANG from /api/v1/config).
function ApplyLang() {
  useApplyLang()
  return null
}

export function App({ router: given, queryClient: givenQc }: AppProps) {
  const [queryClient] = useState(
    () =>
      givenQc ??
      new QueryClient({ defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } } }),
  )
  const [router] = useState(() => {
    const r = given ?? makeRouter(queryClient)
    setUnauthorizedHandler(() => {
      const { pathname, href } = r.state.location
      if (!pathname.endsWith('/login'))
        void r.navigate({ to: '/login', search: { redirect: href } })
    })
    return r
  })
  useApplyTheme()

  return (
    <QueryClientProvider client={queryClient}>
      <ApplyLang />
      <TooltipProvider delayDuration={300}>
        <RouterProvider router={router} context={{ queryClient }} />
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  )
}
