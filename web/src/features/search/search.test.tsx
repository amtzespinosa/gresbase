import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import type { CompletionTable, SearchEvent, SearchRequest } from '@/lib/api/types.gen'
import { server } from '@/test/msw'
import { renderApp } from '@/test/render'
import { highlight, structureHits } from './structure'

const tables: CompletionTable[] = [
  {
    schema: 'public',
    name: 'invoices',
    kind: 'table',
    columns: ['id', 'invoice_no'],
    partition: false,
  },
  {
    schema: 'public',
    name: 'active_users',
    kind: 'view',
    columns: ['id', 'email'],
    partition: false,
  },
  { schema: 'billing', name: 'invoice_2025', kind: 'table', columns: ['id'], partition: true },
  { schema: 'billing', name: 'plans', kind: 'table', columns: ['invoice_note'], partition: false },
]

test('structure hits: tables and views first, then columns, partitions left out', () => {
  expect(structureHits(tables, 'INVOICE', [])).toEqual([
    { schema: 'public', table: 'invoices', kind: 'table' },
    { schema: 'public', table: 'invoices', kind: 'table', column: 'invoice_no' },
    { schema: 'billing', table: 'plans', kind: 'table', column: 'invoice_note' },
  ])
  expect(structureHits(tables, 'invoice', ['billing'])).toEqual([
    { schema: 'billing', table: 'plans', kind: 'table', column: 'invoice_note' },
  ])
  expect(structureHits(tables, 'i', [])).toEqual([])
})

test('highlight splits around every case-insensitive match', () => {
  expect(highlight('Ada and ADA', 'ada')).toEqual([
    { text: 'Ada', match: true },
    { text: ' and ', match: false },
    { text: 'ADA', match: true },
  ])
})

/** An NDJSON body from events, one per line. */
const ndjson = (events: SearchEvent[]) =>
  new HttpResponse(events.map((e) => JSON.stringify(e)).join('\n') + '\n', {
    headers: { 'Content-Type': 'application/x-ndjson' },
  })

test('the search screen shows structure and data hits, and a hit opens the filtered table', async () => {
  let sent: SearchRequest | undefined
  server.use(
    http.get('*/api/v1/c/:conn/sql/completions', () =>
      HttpResponse.json({ tables, functions: [], search_path: ['public'] }),
    ),
    http.get('*/api/v1/c/:conn/schemas', () => HttpResponse.json(['billing', 'public'])),
    http.post('*/api/v1/c/:conn/search', async ({ request }) => {
      sent = (await request.json()) as SearchRequest
      return ndjson([
        { type: 'start', tables: 3, skipped_large: 1 },
        {
          type: 'table',
          schema: 'public',
          table: 'invoices',
          primary_key: ['id'],
          rows: [{ key: { id: '7' }, column: 'invoice_no', snippet: 'INV-invoice-7' }],
        },
        {
          type: 'skipped',
          schema: 'public',
          table: 'slow',
          reason: 'timeout',
          message: 'canceled',
        },
        { type: 'table', schema: 'public', table: 'orgs', primary_key: ['id'] },
        { type: 'done', found: 1 },
      ])
    }),
  )
  const { router } = renderApp('/c/env/search?q=invoice&schemas=%5B%22public%22%5D')
  expect(await screen.findByText('1 row in 1 table')).toBeInTheDocument()
  expect(sent).toMatchObject({ q: 'invoice', schemas: ['public'] })
  expect(screen.getByText('1 large table left out.')).toBeInTheDocument()

  // Structure first: the table and its column, both matching.
  const structure = screen.getByRole('region', { name: 'Structure' })
  expect(within(structure).getAllByRole('button')).toHaveLength(2)
  // The skipped table can be retried.
  await userEvent.click(screen.getByText('1 table could not be searched'))
  expect(screen.getByRole('button', { name: 'Retry with more time' })).toBeInTheDocument()

  // A data hit opens its row: filtered by the primary key, the matching column highlighted.
  const data = screen.getByRole('region', { name: 'Data' })
  await userEvent.click(within(data).getByRole('button', { name: /invoice_no/ }))
  await waitFor(() => expect(router.state.location.pathname).toBe('/c/env/tables/public/invoices'))
  expect(router.state.location.search).toMatchObject({
    filters: [{ column: 'id', op: 'eq', value: '7' }],
    col: 'invoice_no',
  })
})

test('a structure hit on a column opens the table with that column highlighted', async () => {
  server.use(
    http.get('*/api/v1/c/:conn/sql/completions', () =>
      HttpResponse.json({ tables, functions: [], search_path: ['public'] }),
    ),
    http.post('*/api/v1/c/:conn/search', () =>
      ndjson([{ type: 'start', tables: 0 }, { type: 'done' }]),
    ),
  )
  const { router } = renderApp('/c/env/search?q=email')
  const structure = await screen.findByRole('region', { name: 'Structure' })
  await userEvent.click(within(structure).getByRole('button', { name: /active_users/ }))
  await waitFor(() =>
    expect(router.state.location.pathname).toBe('/c/env/tables/public/active_users'),
  )
  expect(router.state.location.search).toMatchObject({ col: 'email' })
})

test('cancel stops a search in flight', async () => {
  server.use(
    http.post('*/api/v1/c/:conn/search', () => {
      const stream = new ReadableStream({
        start(c) {
          c.enqueue(new TextEncoder().encode(JSON.stringify({ type: 'start', tables: 5 }) + '\n'))
        },
      })
      return new HttpResponse(stream, { headers: { 'Content-Type': 'application/x-ndjson' } })
    }),
  )
  renderApp('/c/env/search?q=walrus')
  expect(await screen.findByText('0 of 5 tables')).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
  expect(await screen.findByText('Canceled.')).toBeInTheDocument()
})
