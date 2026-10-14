import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { TooltipProvider } from '@/components/ui/Tooltip'
import type { SQLRequest, TxInfo, TxStatement } from '@/lib/api/types.gen'
import { server } from '@/test/msw'
import { renderApp } from '@/test/render'
import { useSqlEditor } from './store'
import { TxBand } from './Transaction'

const tx = (over: Partial<TxInfo> = {}): TxInfo => ({
  id: 'tx1',
  status: 'active',
  created_at: '2026-10-09T10:00:00Z',
  expires_at: '2026-10-09T10:05:00Z',
  rows_affected: 0,
  statements: [],
  ...over,
})

const DELETE: TxStatement = {
  sql: 'DELETE FROM sessions',
  command_tag: 'DELETE 40',
  rows_affected: 40,
  kind: 'delete_all',
  level: 'danger',
}

const notFound = () =>
  HttpResponse.json({ error: { code: 'not_found', message: 'gone' } }, { status: 404 })

/** Serves execute (409 for DELETE without confirmation) and the transaction endpoints. */
function serve(opts: { statements?: TxStatement[]; txGone?: boolean } = {}) {
  const calls: string[] = []
  const requests: SQLRequest[] = []
  server.use(
    http.post('*/api/v1/c/:conn/sql/execute', async ({ request }) => {
      const body = (await request.json()) as SQLRequest
      requests.push(body)
      if (body.tx_id && opts.txGone) return notFound()
      if (body.sql.startsWith('DELETE') && !body.tx_id && !body.confirm_destructive) {
        return HttpResponse.json(
          {
            error: {
              code: 'confirmation_required',
              message: 'destructive',
              analysis: {
                requires_confirmation: true,
                findings: [{ statement: 0, kind: 'delete_all', level: 'danger', from: 0, to: 20 }],
              },
            },
          },
          { status: 409 },
        )
      }
      return HttpResponse.json({
        execution_id: body.execution_id,
        results: [
          {
            statement: 0,
            from: 0,
            to: body.sql.length,
            columns: [],
            rows: [],
            truncated: false,
            rows_affected: 40,
            command_tag: 'DELETE 40',
            duration_ms: 1,
            notices: [],
          },
        ],
        tx: body.tx_id
          ? tx({ rows_affected: 40, statements: opts.statements ?? [DELETE] })
          : undefined,
      })
    }),
    http.post('*/api/v1/c/:conn/sql/transactions', () => {
      calls.push('begin')
      return HttpResponse.json(tx(), { status: 201 })
    }),
    http.get('*/api/v1/c/:conn/sql/transactions/:id', () =>
      opts.txGone ? notFound() : HttpResponse.json(tx()),
    ),
    http.post('*/api/v1/c/:conn/sql/transactions/:id/:action', ({ params }) => {
      calls.push(String(params.action))
      return opts.txGone ? notFound() : HttpResponse.json({ committed: params.action === 'commit' })
    }),
  )
  return { calls, requests }
}

/**
 * Only the band (it needs a router for its leave guard): the expiry checks must not wait for the
 * whole SQL screen to mount, which takes seconds when the suite runs in parallel.
 */
function renderBand() {
  const router = createRouter({
    routeTree: createRootRoute({ component: TxBand }),
    history: createMemoryHistory(),
  })
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <TooltipProvider>
        <RouterProvider router={router} />
      </TooltipProvider>
    </QueryClientProvider>,
  )
}

const run = async () => userEvent.click(await screen.findByRole('button', { name: 'Run' }))
const band = () => screen.findByRole('status', { name: 'Transaction open' })

beforeEach(() => useSqlEditor.setState({ doc: 'DELETE FROM sessions' }))

describe('destructive SQL outside a transaction', () => {
  it('asks first and runs it with confirmation', async () => {
    const { requests } = serve()
    renderApp('/sql')
    await run()

    const dialog = await screen.findByRole('dialog', { name: 'This SQL can destroy data' })
    expect(within(dialog).getByText('DELETE without WHERE')).toBeInTheDocument()
    expect(within(dialog).getByText('DELETE FROM sessions')).toBeInTheDocument()
    await userEvent.click(within(dialog).getByRole('button', { name: 'Run anyway' }))

    expect(await screen.findByText('Done · DELETE 40')).toBeInTheDocument()
    expect(requests.map((r) => r.confirm_destructive)).toEqual([undefined, true])
  })

  it('can switch to transaction mode instead', async () => {
    const { calls, requests } = serve()
    renderApp('/sql')
    await run()
    await userEvent.click(
      within(await screen.findByRole('dialog')).getByRole('button', {
        name: 'Use transaction mode',
      }),
    )

    expect(await band()).toHaveTextContent('40 rows affected')
    expect(calls).toEqual(['begin'])
    expect(requests[1]).toMatchObject({ tx_id: 'tx1' })
    expect(requests[1]?.confirm_destructive).toBeUndefined()
    expect(screen.getByRole('switch', { name: 'Transaction mode' })).toBeChecked()
  })
})

describe('transaction mode', () => {
  it('opens a transaction, then commits after showing the destructive statements', async () => {
    const { calls, requests } = serve()
    renderApp('/sql')
    await userEvent.click(await screen.findByRole('switch', { name: 'Transaction mode' }))
    await run()
    expect(await band()).toHaveTextContent('Rolls back in')
    expect(requests).toHaveLength(1)

    await userEvent.click(within(await band()).getByRole('button', { name: 'Commit' }))
    const dialog = await screen.findByRole('dialog', { name: 'Commit these changes?' })
    expect(within(dialog).getByText('40 rows affected')).toBeInTheDocument()
    await userEvent.click(within(dialog).getByRole('button', { name: 'Commit' }))

    expect(await screen.findByText('Transaction committed.')).toBeInTheDocument()
    expect(calls).toEqual(['begin', 'commit'])
    expect(screen.queryByRole('status', { name: 'Transaction open' })).not.toBeInTheDocument()
  })

  it('commits harmless statements without asking', async () => {
    const { calls } = serve({
      statements: [{ sql: 'SELECT 1', command_tag: 'SELECT 1', rows_affected: 1 }],
    })
    renderApp('/sql')
    await userEvent.click(await screen.findByRole('switch', { name: 'Transaction mode' }))
    await run()
    await userEvent.click(within(await band()).getByRole('button', { name: 'Commit' }))
    await waitFor(() => expect(calls).toEqual(['begin', 'commit']))
  })

  it('rolls back', async () => {
    const { calls } = serve()
    renderApp('/sql')
    await userEvent.click(await screen.findByRole('switch', { name: 'Transaction mode' }))
    await run()
    await userEvent.click(within(await band()).getByRole('button', { name: 'Roll back' }))
    expect(
      await screen.findByText('Transaction rolled back. Nothing was saved.'),
    ).toBeInTheDocument()
    expect(calls).toEqual(['begin', 'rollback'])
  })

  it('explains an expired transaction found when running', async () => {
    serve({ txGone: true })
    useSqlEditor.setState({ txMode: true, tx: tx(), txDeadline: Date.now() + 60_000 })
    renderApp('/sql')
    await run()
    expect(await screen.findByRole('alert')).toHaveTextContent('was rolled back')
    expect(useSqlEditor.getState().tx).toBeNull()
  })

  it('detects expiry when the countdown runs out', async () => {
    serve({ txGone: true })
    useSqlEditor.setState({ txMode: true, tx: tx(), txDeadline: Date.now() - 1 })
    renderBand()
    expect(await screen.findByRole('alert')).toHaveTextContent('sat idle too long')
  })

  it('keeps checking after a failed expiry check instead of stalling at zero', async () => {
    let checks = 0
    server.use(
      http.get('*/api/v1/c/:conn/sql/transactions/:id', () =>
        ++checks === 1
          ? HttpResponse.json({ error: { code: 'internal', message: 'x' } }, { status: 503 })
          : HttpResponse.json({ error: { code: 'not_found', message: 'gone' } }, { status: 404 }),
      ),
    )
    useSqlEditor.setState({ txMode: true, tx: tx(), txDeadline: Date.now() - 1 })
    await useSqlEditor.getState().refreshTx()
    // The failed check pushed the deadline forward, so the band asks again when it runs out.
    expect(useSqlEditor.getState().txDeadline).toBeGreaterThan(Date.now())
    useSqlEditor.setState({ txDeadline: Date.now() - 1 })
    renderBand()
    expect(await screen.findByRole('alert')).toHaveTextContent('sat idle too long')
    expect(checks).toBe(2)
  })

  it('asks before leaving with the transaction open', async () => {
    const { calls } = serve()
    useSqlEditor.setState({ txMode: true, tx: tx(), txDeadline: Date.now() + 60_000 })
    const { router } = renderApp('/sql')
    await band()

    void router.navigate({ to: '/tables' })
    const dialog = await screen.findByRole('dialog', { name: 'Transaction still open' })
    await userEvent.click(within(dialog).getByRole('button', { name: 'Stay' }))
    expect(router.state.location.pathname).toBe('/c/env/sql')

    void router.navigate({ to: '/tables' })
    await userEvent.click(
      within(await screen.findByRole('dialog', { name: 'Transaction still open' })).getByRole(
        'button',
        { name: 'Roll back and leave' },
      ),
    )
    await waitFor(() => expect(router.state.location.pathname).toBe('/c/env/tables'))
    expect(calls).toEqual(['rollback'])
  })
})

describe('leaving and coming back', () => {
  it('rolls back on pagehide with a keepalive request that carries the anti-CSRF header', async () => {
    const { calls } = serve()
    const spy = vi.spyOn(globalThis, 'fetch')
    useSqlEditor.setState({ txMode: true, tx: tx(), txDeadline: Date.now() + 60_000 })
    renderApp('/sql')
    await band()

    window.dispatchEvent(new Event('pagehide'))
    await waitFor(() => expect(calls).toEqual(['rollback']))
    const [url, init] = spy.mock.calls.find(([u]) => String(u).endsWith('/rollback')) ?? []
    expect(String(url)).toMatch(/\/api\/v1\/c\/env\/sql\/transactions\/tx1\/rollback$/)
    expect(init).toMatchObject({ method: 'POST', keepalive: true })
    expect(init?.headers).toMatchObject({ 'X-Gresbase': '1' })
    spy.mockRestore()
  })

  /** Serves one transaction left open by an earlier visit. */
  const leftOpen = () => {
    let open = [
      tx({ id: 'old', rows_affected: 3, expires_at: new Date(Date.now() + 60_000).toISOString() }),
    ]
    server.use(http.get('*/api/v1/c/:conn/sql/transactions', () => HttpResponse.json(open)))
    return {
      close: () => {
        open = []
      },
    }
  }
  const found = () => screen.findByRole('status', { name: 'Open transaction found' })

  it('offers a transaction left open and rolls it back', async () => {
    const { calls } = serve()
    const { close } = leftOpen()
    server.use(
      http.post('*/api/v1/c/:conn/sql/transactions/:id/rollback', ({ params }) => {
        calls.push(`rollback ${String(params.id)}`)
        close()
        return HttpResponse.json({ committed: false })
      }),
    )
    renderApp('/sql')
    expect(await found()).toHaveTextContent('3 rows affected')
    await userEvent.click(within(await found()).getByRole('button', { name: 'Roll back' }))
    await waitFor(() =>
      expect(
        screen.queryByRole('status', { name: 'Open transaction found' }),
      ).not.toBeInTheDocument(),
    )
    expect(calls).toEqual(['rollback old'])
    expect(useSqlEditor.getState().tx).toBeNull()
  })

  it('resumes a transaction left open: the normal band takes over', async () => {
    serve()
    leftOpen()
    renderApp('/sql')
    await userEvent.click(within(await found()).getByRole('button', { name: 'Resume' }))
    expect(await band()).toHaveTextContent('3 rows affected')
    expect(useSqlEditor.getState()).toMatchObject({ txMode: true, tx: { id: 'old' } })
    expect(screen.queryByRole('status', { name: 'Open transaction found' })).not.toBeInTheDocument()
  })
})
