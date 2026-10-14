import { QueryClient } from '@tanstack/react-query'
import { createMemoryHistory } from '@tanstack/react-router'
import { render } from '@testing-library/react'
import { App } from '@/App'
import { makeRouter } from '@/router'

// The router loads these screens lazily; importing them here keeps that load (and its transform)
// out of each test's time budget, as when they were part of the main bundle.
import '@/features/settings/SettingsScreen'
import '@/features/setup/SetupWizard'
import '@/features/sql/SqlScreen'

/** Renders the whole app at `path` with in-memory history and a fresh query cache. */
export function renderApp(path = '/tables') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const router = makeRouter(queryClient, createMemoryHistory({ initialEntries: [path] }))
  return { router, ...render(<App router={router} queryClient={queryClient} />) }
}
