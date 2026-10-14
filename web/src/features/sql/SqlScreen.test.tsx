import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import type { SQLRequest, SQLResponse, StatementResult } from '@/lib/api/types.gen'
import { server } from '@/test/msw'
import { renderApp } from '@/test/render'
import { useSqlEditor } from './store'

const stmt = (over: Partial<StatementResult>): StatementResult => ({
  statement: 0,
  from: 0,
  to: 0,
  columns: [],
  rows: [],
  truncated: false,
  rows_affected: 0,
  command_tag: 'SELECT 1',
  duration_ms: 1.2,
  notices: [],
  ...over,
})

/** Answers execute with `respond` and records the requests. */
function mockExecute(respond: (req: SQLRequest) => SQLResponse | Promise<SQLResponse>) {
  const requests: SQLRequest[] = []
  server.use(
    http.post('*/api/v1/c/:conn/sql/execute', async ({ request }) => {
      const body = (await request.json()) as SQLRequest
      requests.push(body)
      return HttpResponse.json(await respond(body))
    }),
  )
  return requests
}

const RUN = 'Run'
const runButton = () => screen.findByRole('button', { name: RUN })

beforeEach(() => {
  // jsdom has no layout: give the virtualized result grid a size.
  vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(4000)
  vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(1000)
})
afterEach(() => vi.restoreAllMocks())

describe('SQL editor', () => {
  it('runs the statement under the cursor and shows its rows', async () => {
    useSqlEditor.setState({ doc: 'SELECT id, email FROM users;\nSELECT 2' })
    const requests = mockExecute((req) => ({
      execution_id: req.execution_id ?? '',
      results: [
        stmt({
          to: 27,
          columns: [
            { name: 'id', type: 'bigint' },
            { name: 'email', type: 'text' },
          ],
          rows: [['9007199254740993', 'ada@example.com']],
          command_tag: 'SELECT 1',
        }),
      ],
    }))
    renderApp('/sql')
    await userEvent.click(await runButton())

    expect(await screen.findByText('ada@example.com')).toBeInTheDocument()
    expect(screen.getByText('9007199254740993')).toBeInTheDocument()
    expect(requests[0]?.sql).toBe('SELECT id, email FROM users')
    expect(requests[0]?.timeout_ms).toBeUndefined()
    expect(requests[0]?.execution_id).toMatch(/^[\w-]+$/)
    expect(screen.getByText('1 row')).toBeInTheDocument()
  })

  it('runs everything with "Run all" and shows a tab per statement', async () => {
    const doc = 'SELECT 1;\nUPDATE t SET a = 1'
    useSqlEditor.setState({ doc })
    const requests = mockExecute((req) => ({
      execution_id: req.execution_id ?? '',
      results: [
        stmt({ to: 8, columns: [{ name: '?column?', type: 'integer' }], rows: [[1]] }),
        stmt({ statement: 1, from: 10, to: 28, command_tag: 'UPDATE 3', rows_affected: 3 }),
      ],
    }))
    renderApp('/sql')
    await userEvent.click(await screen.findByRole('button', { name: 'Run all' }))

    expect(await screen.findByText('Done · UPDATE 3')).toBeInTheDocument()
    expect(requests[0]?.sql).toBe(doc)
    const tabs = screen.getByRole('tablist', { name: 'Results' })
    await userEvent.click(within(tabs).getByRole('tab', { name: 'Statement 1' }))
    expect(screen.getByRole('grid', { name: 'Results of statement 1' })).toBeInTheDocument()
  })

  it('shows the Postgres error and marks its position in the editor', async () => {
    const doc = 'SELECT * FORM users'
    useSqlEditor.setState({ doc })
    mockExecute((req) => ({
      execution_id: req.execution_id ?? '',
      results: [
        stmt({
          to: doc.length,
          command_tag: '',
          error: {
            code: 'pg_error',
            message: 'syntax error at or near "FORM"',
            hint: 'Check the spelling.',
            position: 10,
            pg_code: '42601',
          },
        }),
      ],
    }))
    const { container } = renderApp('/sql')
    await userEvent.click(await runButton())

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('syntax error at or near "FORM"')
    expect(alert).toHaveTextContent('42601')
    expect(alert).toHaveTextContent('Check the spelling.')
    await waitFor(() =>
      expect(container.querySelector('.cm-lintRange-error')).toHaveTextContent('FORM'),
    )
  })

  it('cancels a running query', async () => {
    useSqlEditor.setState({ doc: 'SELECT pg_sleep(30)' })
    let release: () => void = () => undefined
    const canceled = new Promise<void>((r) => (release = r))
    let cancelId = ''
    mockExecute(async (req) => {
      await canceled
      return {
        execution_id: req.execution_id ?? '',
        results: [
          stmt({ error: { code: 'canceled', message: 'canceling statement due to user request' } }),
        ],
      }
    })
    server.use(
      http.post('*/api/v1/c/:conn/sql/executions/:id/cancel', ({ params }) => {
        cancelId = String(params.id)
        release()
        return new HttpResponse(null, { status: 204 })
      }),
    )
    renderApp('/sql')
    await userEvent.click(await runButton())
    expect(await screen.findByText('Running…')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('The query was canceled.')
    expect(cancelId).toMatch(/^[\w-]+$/)
    expect(screen.getByRole('button', { name: RUN })).toBeEnabled()
  })

  it('explains request errors such as a missing confirmation', async () => {
    useSqlEditor.setState({ doc: 'DROP TABLE users' })
    server.use(
      http.post('*/api/v1/c/:conn/sql/execute', () =>
        HttpResponse.json(
          { error: { code: 'confirmation_required', message: 'destructive statements' } },
          { status: 409 },
        ),
      ),
    )
    renderApp('/sql')
    await userEvent.click(await runButton())
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'This statement can destroy data. Confirm before running it.',
    )
  })

  it('sends the timeout set in the badge', async () => {
    useSqlEditor.setState({ doc: 'SELECT 1' })
    const requests = mockExecute((req) => ({ execution_id: req.execution_id ?? '', results: [] }))
    renderApp('/sql')
    await userEvent.click(await screen.findByRole('button', { name: 'timeout 30 s' }))
    const input = screen.getByRole('spinbutton', { name: 'Statement timeout in seconds' })
    await userEvent.clear(input)
    await userEvent.type(input, '5{Enter}')
    expect(screen.getByRole('button', { name: 'timeout 5 s' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: RUN }))
    await waitFor(() => expect(requests[0]?.timeout_ms).toBe(5000))
  })

  it('loads a query handed over in ?sql=', async () => {
    const { router } = renderApp('/sql?sql=SELECT%2042')
    await waitFor(() => expect(useSqlEditor.getState().doc).toBe('SELECT 42'))
    await waitFor(() => expect(router.state.location.search).toEqual({}))
  })

  it('exports the loaded results and copies them as Markdown', async () => {
    useSqlEditor.setState({ doc: 'SELECT 1' })
    mockExecute((req) => ({
      execution_id: req.execution_id ?? '',
      results: [
        stmt({
          columns: [{ name: 'a|b', type: 'text' }],
          rows: [['x'], [null]],
        }),
      ],
    }))
    const writeText = vi.fn(() => Promise.resolve())
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    renderApp('/sql')
    await userEvent.click(await runButton())
    await userEvent.click(await screen.findByRole('button', { name: 'Export' }))
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Copy as Markdown' }))
    expect(writeText).toHaveBeenCalledWith('| a\\|b |\n| --- |\n| x |\n| NULL |')
    expect(await screen.findByText('Copied as a Markdown table')).toBeInTheDocument()
  })
})
