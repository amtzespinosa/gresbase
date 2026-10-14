import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import type { ReactNode } from 'react'
import { connection, server } from '@/test/msw'
import { useCapability } from './queries'

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

function serve(num: number, capabilities: typeof connection.capabilities) {
  server.use(
    http.get('*/api/v1/c/:conn/connection', () =>
      HttpResponse.json({ ...connection, server_version_num: num, capabilities }),
    ),
  )
}

test.each([
  [
    'available',
    170002,
    { merge: { available: true, min_version: 150000 } },
    'merge',
    true,
    undefined,
  ],
  [
    'too old',
    140015,
    { merge: { available: false, min_version: 150000 } },
    'merge',
    false,
    'Needs PostgreSQL 15 or newer.',
  ],
  [
    'version ok, extension missing',
    170002,
    { x: { available: false, min_version: 130000, extension: 'pg_stat_statements' } },
    'x',
    false,
    'Needs the pg_stat_statements extension.',
  ],
  ['unknown name', 170002, {}, 'nope', false, undefined],
] as const)('useCapability: %s', async (_, num, caps, name, available, requires) => {
  serve(num, caps)
  const { result } = renderHook(() => useCapability(name), { wrapper })
  expect(result.current).toEqual({ available: false })
  await waitFor(() => expect(result.current.available).toBe(available))
  await waitFor(() => expect(result.current.requires).toBe(requires))
})
