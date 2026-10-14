import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import type { Column, Page, Query, Table } from '@/lib/api/types.gen'
import { emptyTable, server } from '@/test/msw'
import { renderApp } from '@/test/render'
import { useChanges } from './changes/queue'
import { viewKey } from './view'

const col = (name: string, type: string, extra: Partial<Column> = {}): Column => ({
  position: 0,
  name,
  type,
  base_type: type,
  is_array: false,
  enum_values: [],
  not_null: false,
  default: null,
  identity: '',
  generated: null,
  comment: null,
  ...extra,
})

const users: Table = {
  ...emptyTable('public', 'users'),
  columns: [
    col('id', 'bigint', { base_type: 'int8' }),
    col('email', 'text'),
    col('age', 'integer'),
  ],
  primary_key: ['id'],
  has_primary_key: true,
}

const pageOf = (rows: Page['rows']): Page => ({
  columns: users.columns.map((c) => ({ name: c.name, type: c.type })),
  rows,
  next_cursor: null,
  has_more: false,
})

/** Serves `users`; a query by primary key (a pinned row) answers row 99, which is on no page. */
function serve() {
  const bodies: Query[] = []
  server.use(
    http.get('*/api/v1/c/:conn/tables/public/users', () => HttpResponse.json(users)),
    http.post('*/api/v1/c/:conn/tables/public/users/rows\\:query', async ({ request }) => {
      const body = (await request.json()) as Query
      bodies.push(body)
      const id = body.filters.find((f) => f.column === 'id' && f.op === 'eq')
      if (id) return HttpResponse.json(pageOf(id.value === '99' ? [['99', 'zoe@x.io', 50]] : []))
      return HttpResponse.json(
        pageOf([
          ['1', 'ada@x.io', 36],
          ['2', 'bob@x.io', null],
        ]),
      )
    }),
  )
  return bodies
}

beforeEach(() => {
  vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(4000)
  vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(1000)
})
afterEach(() => {
  vi.restoreAllMocks()
  useChanges.setState({ queues: {}, history: {} })
})

const grid = async () => within(await screen.findByRole('grid', { name: 'Rows of users' }))
const key = viewKey('env', 'public', 'users')
const stored = () => JSON.parse(localStorage.getItem(key) ?? 'null') as unknown

/** Names of the pinned header cells, left to right. */
const pinnedHeaders = (g: { getAllByRole: (role: 'columnheader') => HTMLElement[] }) =>
  g
    .getAllByRole('columnheader')
    .filter((h) => h.classList.contains('sticky') && h.getAttribute('aria-colindex'))
    .map((h) => h.getAttribute('aria-colindex'))

test('pins columns in click order, remembers them and unpins', async () => {
  serve()
  const { unmount } = renderApp('/tables/public/users')
  const g = await grid()
  await g.findByText('ada@x.io')

  await userEvent.click(g.getByRole('button', { name: 'Pin column age' }))
  await userEvent.click(g.getByRole('button', { name: 'Pin column email' }))
  // age (3rd column) first, then email (2nd): pin order, not table order.
  expect(pinnedHeaders(g)).toEqual(['3', '2'])
  expect(g.getByRole('button', { name: 'Unpin column age' })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  expect(stored()).toMatchObject({ columns: ['age', 'email'], rows: [] })

  // Pins survive leaving the table.
  unmount()
  renderApp('/tables/public/users')
  const g2 = await grid()
  await g2.findByText('ada@x.io')
  expect(pinnedHeaders(g2)).toEqual(['3', '2'])

  await userEvent.click(g2.getByRole('button', { name: 'Unpin column age' }))
  expect(pinnedHeaders(g2)).toEqual(['2'])
  await userEvent.click(screen.getByRole('button', { name: 'Unpin all' }))
  expect(pinnedHeaders(g2)).toEqual([])
  expect(localStorage.getItem(key)).toBeNull()
  expect(screen.queryByRole('button', { name: 'Unpin all' })).not.toBeInTheDocument()
})

test('a pinned row on another page is fetched by key and shown on top', async () => {
  localStorage.setItem(key, JSON.stringify({ columns: [], rows: [{ id: '99' }] }))
  const bodies = serve()
  renderApp('/tables/public/users')
  const g = await grid()

  const zoe = (await g.findByText('zoe@x.io')).closest('[role="row"]')
  expect(zoe).toHaveAttribute('data-pinned', 'true')
  expect(g.getAllByRole('row')[1]).toBe(zoe) // right under the header
  expect(bodies).toContainEqual(
    expect.objectContaining({ filters: [{ column: 'id', op: 'eq', value: '99' }], limit: 1 }),
  )
  // It ignores the page's filters and paging: the page itself is still 1–2.
  expect(await screen.findByText(/^1–2/)).toBeInTheDocument()
  expect(g.getAllByRole('row')[1]).toBe(zoe)
})

test('pinning a row of the page moves it to the top without duplicating it', async () => {
  serve()
  renderApp('/tables/public/users')
  const g = await grid()
  await g.findByText('bob@x.io')

  await userEvent.click(g.getByRole('button', { name: 'Pin row 2' }))
  const bob = await waitFor(() => {
    const r = g.getByText('bob@x.io').closest('[role="row"]')
    expect(r).toHaveAttribute('data-pinned', 'true')
    return r
  })
  expect(g.getAllByText('bob@x.io')).toHaveLength(1)
  expect(stored()).toMatchObject({ columns: [], rows: [{ id: '2' }] })

  // A pinned row edits like any other and goes through the change queue.
  const cell = within(bob as HTMLElement)
    .getByText('bob@x.io')
    .closest('[role="gridcell"]')
  if (!cell) throw new Error('no email cell')
  await userEvent.dblClick(cell)
  const input = await screen.findByRole('textbox', { name: 'Edit email' })
  await userEvent.clear(input)
  await userEvent.type(input, 'bobby@x.io{Enter}')
  expect(cell).toHaveAttribute('data-edited', 'true')
  expect(useChanges.getState().queues['["public","users"]']?.updates['{"id":"2"}']?.set).toEqual({
    email: 'bobby@x.io',
  })
})

test('tables without a primary key cannot pin rows', async () => {
  const logs: Table = { ...emptyTable('public', 'audit_log'), columns: [col('msg', 'text')] }
  server.use(
    http.get('*/api/v1/c/:conn/tables/public/audit_log', () => HttpResponse.json(logs)),
    http.post('*/api/v1/c/:conn/tables/public/audit_log/rows\\:query', () =>
      HttpResponse.json({
        columns: [{ name: 'msg', type: 'text' }],
        rows: [['hello']],
        next_cursor: null,
        has_more: false,
      }),
    ),
  )
  renderApp('/tables/public/audit_log')
  const g = within(await screen.findByRole('grid', { name: 'Rows of audit_log' }))
  await g.findByText('hello')
  const lock = g.getByRole('button', {
    name: 'Rows can only be pinned in tables with a primary key.',
  })
  expect(lock).toHaveAttribute('aria-disabled', 'true')
  await userEvent.click(lock)
  expect(localStorage.getItem(viewKey('env', 'public', 'audit_log'))).toBeNull()
  // Columns can still be pinned.
  expect(g.getByRole('button', { name: 'Pin column msg' })).toBeInTheDocument()
})
