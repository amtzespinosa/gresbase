import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import type { Column, Page, Query, Table } from '@/lib/api/types.gen'
import { emptyTable, server } from '@/test/msw'
import { renderApp } from '@/test/render'
import { pick } from '@/test/select'
import { nextSort, opsFor, tableSearch } from './tableSearch'

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
  estimated_rows: 12_400,
  columns: [
    col('id', 'bigint', { base_type: 'int8' }),
    col('email', 'text'),
    col('org_id', 'bigint', { base_type: 'int8' }),
    col('settings', 'jsonb'),
    col('tags', 'text[]', { base_type: 'text', is_array: true }),
    col('avatar', 'bytea'),
    col('bio', 'text'),
    col('active', 'boolean', { base_type: 'bool' }),
  ],
  primary_key: ['id'],
  has_primary_key: true,
  foreign_keys: [
    {
      name: 'users_org_id_fkey',
      schema: 'public',
      table: 'users',
      columns: ['org_id'],
      ref_schema: 'public',
      ref_table: 'orgs',
      ref_columns: ['id'],
      on_delete: 'no_action',
      on_update: 'no_action',
    },
  ],
}

const page = (cursor: string | null, hasMore: boolean): Page => ({
  columns: users.columns.map((c) => ({ name: c.name, type: c.type })),
  rows: [
    [
      '9007199254740993',
      'ada@example.com',
      '7',
      { plan: 'pro' },
      ['a', 'b'],
      { $bytea: { size: 2048, hex_preview: 'dead' } },
      { $text: 'very long bio', truncated: true, size: 20_480 },
      true,
    ],
    ['2', null, null, null, null, null, 'short', false],
  ],
  next_cursor: cursor,
  has_more: hasMore,
})

/** Serves `users` and records every rows:query body. */
function serveUsers() {
  const bodies: Query[] = []
  server.use(
    http.get('*/api/v1/c/:conn/tables/public/users', () => HttpResponse.json(users)),
    http.post('*/api/v1/c/:conn/tables/public/users/rows\\:query', async ({ request }) => {
      const body = (await request.json()) as Query
      bodies.push(body)
      return HttpResponse.json(page(body.cursor ? null : 'c1', !body.cursor))
    }),
    http.get('*/api/v1/c/:conn/tables/public/users/rows/value', ({ request }) => {
      const u = new URL(request.url)
      return HttpResponse.json({
        value: `full of ${u.searchParams.get('column')} ${u.searchParams.get('pk')}`,
      })
    }),
  )
  return bodies
}

beforeEach(() => {
  // jsdom has no layout: give the grid a size so the virtualizers render every cell.
  vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(4000)
  vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(1000)
})
afterEach(() => vi.restoreAllMocks())

const grid = () => screen.findByRole('grid', { name: 'Rows of users' })

test('renders each value type', async () => {
  serveUsers()
  renderApp('/tables/public/users')
  const g = within(await grid())
  expect(await g.findByText('9007199254740993')).toBeInTheDocument()
  expect(g.getByText('{"plan":"pro"}')).toBeInTheDocument()
  expect(g.getByText('["a","b"]')).toBeInTheDocument()
  expect(g.getByText('bytea · 2 kB')).toBeInTheDocument()
  expect(g.getByText('true')).toBeInTheDocument()
  expect(g.getAllByText('NULL')).toHaveLength(5)
  expect(g.getByText('7').parentElement).toHaveClass('text-accent-ink') // FK link style
  expect(g.getByRole('columnheader', { name: /^Primary key\s*id bigint/ })).toContainElement(
    g.getByLabelText('Primary key'),
  )
  expect(screen.getByText('≈12.4k rows')).toBeInTheDocument()
  expect(screen.getByText('1–2 of ≈12.4k')).toBeInTheDocument()

  // Truncated text loads the full value by primary key.
  const [, bio] = g.getAllByRole('button', { name: 'View full value' })
  if (!bio) throw new Error('no view-full button on the truncated cell')
  await userEvent.click(bio)
  expect(await screen.findByText('full of bio {"id":"9007199254740993"}')).toBeInTheDocument()
})

test('URL state drives the query, and bad params fall back to defaults', async () => {
  const bodies = serveUsers()
  const sort = encodeURIComponent(JSON.stringify([{ column: 'email', dir: 'desc' }]))
  const filters = encodeURIComponent(
    JSON.stringify([{ column: 'email', op: 'contains', value: 'ada' }]),
  )
  renderApp(
    `/tables/public/users?size=100&sort=${sort}&filters=${filters}&logic=%22or%22&tab=%22nope%22`,
  )
  await grid()
  await waitFor(() => expect(bodies.at(-1)).toBeDefined())
  expect(bodies.at(-1)).toEqual({
    filters: [{ column: 'email', op: 'contains', value: 'ada' }],
    logic: 'or',
    sort: [{ column: 'email', dir: 'desc' }],
    limit: 100,
    cursor: null,
    offset: null,
  })
  expect(screen.getByRole('radio', { name: 'Data' })).toHaveAttribute('data-state', 'on')
  expect(screen.getByText('email contains ada')).toBeInTheDocument()

  expect(tableSearch.parse({ size: 7, offset: -1, filters: 'x' })).toMatchObject({
    size: 50,
    offset: 0,
    filters: [],
  })
})

test('build and remove filters', async () => {
  const bodies = serveUsers()
  const { router } = renderApp('/tables/public/users')
  await grid()
  await userEvent.click(screen.getByRole('button', { name: 'Filter' }))
  await pick(screen.getByLabelText('Column'), 'email')
  await pick(screen.getByLabelText('Operator'), 'starts with')
  await userEvent.type(screen.getByLabelText('Value'), 'ad')
  await userEvent.click(screen.getByRole('button', { name: 'Add filter' }))

  expect(await screen.findByText('email starts with ad')).toBeInTheDocument()
  expect(router.state.location.search).toMatchObject({
    filters: [{ column: 'email', op: 'starts_with', value: 'ad' }],
  })
  await waitFor(() => expect(bodies.at(-1)?.filters).toHaveLength(1))

  await userEvent.click(screen.getByRole('button', { name: 'Remove filter' }))
  await waitFor(() => expect(screen.queryByText('email starts with ad')).not.toBeInTheDocument())
  // Defaults are stripped from the URL.
  expect(router.state.location.href).not.toContain('filters')
})

test('click sorts, shift+click adds keys', async () => {
  serveUsers()
  const { router } = renderApp('/tables/public/users')
  const g = within(await grid())
  const user = userEvent.setup()
  await user.click(await g.findByRole('button', { name: /^email text/ }))
  expect(router.state.location.search.sort).toEqual([{ column: 'email', dir: 'asc' }])
  await user.keyboard('{Shift>}')
  await user.click(g.getByRole('button', { name: /^Primary key\s*id bigint/ }))
  await user.keyboard('{/Shift}')
  expect(router.state.location.search.sort).toEqual([
    { column: 'email', dir: 'asc' },
    { column: 'id', dir: 'asc' },
  ])
  expect(g.getByRole('columnheader', { name: /email/ })).toHaveAttribute('aria-sort', 'ascending')
})

test('a table opens with the newest rows first (primary key descending) and the user can change it', async () => {
  const bodies = serveUsers()
  const { router } = renderApp('/tables/public/users')
  const g = within(await grid())
  await waitFor(() => expect(bodies.at(-1)?.sort).toEqual([{ column: 'id', dir: 'desc' }]))
  // The default stays out of the URL, but the header shows it.
  expect(router.state.location.href).not.toContain('sort')
  expect(g.getByRole('columnheader', { name: /^Primary key\s*id/ })).toHaveAttribute(
    'aria-sort',
    'descending',
  )

  const user = userEvent.setup()
  // Clicking the primary key under the default goes ascending, then back to descending.
  await user.click(g.getByRole('button', { name: /^Primary key\s*id bigint/ }))
  expect(router.state.location.search.sort).toEqual([{ column: 'id', dir: 'asc' }])
  await waitFor(() => expect(bodies.at(-1)?.sort).toEqual([{ column: 'id', dir: 'asc' }]))
  await user.click(g.getByRole('button', { name: /^Primary key\s*id bigint/ }))
  expect(router.state.location.search.sort).toEqual([{ column: 'id', dir: 'desc' }])

  // Another column replaces it; clearing it brings the default back.
  await user.click(g.getByRole('button', { name: /^email text/ }))
  await waitFor(() => expect(bodies.at(-1)?.sort).toEqual([{ column: 'email', dir: 'asc' }]))
  await user.click(g.getByRole('button', { name: /^email text/ }))
  await user.click(g.getByRole('button', { name: /^email text/ }))
  expect(router.state.location.href).not.toContain('sort')
  // Back to the cached default page: its refetch can take a while under load.
  await waitFor(() => expect(bodies.at(-1)?.sort).toEqual([{ column: 'id', dir: 'desc' }]), {
    timeout: 5000,
  })
})

test('keyset pagination pushes and pops cursors', async () => {
  const bodies = serveUsers()
  const { router } = renderApp('/tables/public/users')
  await grid()
  const next = await screen.findByRole('button', { name: 'Next page' })
  await waitFor(() => expect(next).toBeEnabled())
  await userEvent.click(next)
  expect(router.state.location.search.cursors).toEqual(['c1'])
  await waitFor(() => expect(bodies.at(-1)?.cursor).toBe('c1'))
  expect(await screen.findByText('51–52 of ≈12.4k')).toBeInTheDocument()

  await userEvent.click(screen.getByRole('button', { name: 'Previous page' }))
  expect(router.state.location.href).not.toContain('cursors')
})

test('tables without a primary key are flagged read-only and use offset', async () => {
  const bodies: Query[] = []
  server.use(
    http.get('*/api/v1/c/:conn/tables/public/audit_log', () =>
      HttpResponse.json({ ...emptyTable('public', 'audit_log'), columns: [col('msg', 'text')] }),
    ),
    http.post('*/api/v1/c/:conn/tables/public/audit_log/rows\\:query', async ({ request }) => {
      bodies.push((await request.json()) as Query)
      return HttpResponse.json({
        ...page(null, false),
        columns: [{ name: 'msg', type: 'text' }],
        rows: [['hi']],
      })
    }),
  )
  renderApp('/tables/public/audit_log')
  expect(await screen.findByText('Read-only')).toBeInTheDocument()
  await waitFor(() => expect(bodies.at(-1)).toMatchObject({ cursor: null, offset: 0 }))
  // Without a primary key there is no "newest first": the server order stays.
  expect(bodies.at(-1)?.sort).toEqual([])
})

test('sort and operator helpers', () => {
  expect(nextSort([], 'a', false)).toEqual([{ column: 'a', dir: 'asc' }])
  expect(nextSort([{ column: 'a', dir: 'asc' }], 'a', false)).toEqual([
    { column: 'a', dir: 'desc' },
  ])
  expect(nextSort([{ column: 'a', dir: 'desc' }], 'a', false)).toEqual([])
  expect(
    nextSort(
      [
        { column: 'a', dir: 'desc' },
        { column: 'b', dir: 'asc' },
      ],
      'a',
      true,
    ),
  ).toEqual([{ column: 'b', dir: 'asc' }])
  expect(opsFor(col('t', 'text'))).toContain('contains')
  expect(opsFor(col('n', 'integer', { base_type: 'int4' }))).not.toContain('contains')
  expect(opsFor(col('j', 'json'))).toEqual(['json_contains', 'is_null', 'not_null'])
  expect(opsFor(col('b', 'boolean', { base_type: 'bool' }))).not.toContain('between')
})

test('export downloads the filtered table from the server', async () => {
  serveUsers()
  const requested: string[] = []
  server.use(
    http.get('*/api/v1/c/:conn/tables/public/users/export', ({ request }) => {
      requested.push(request.url)
      return new HttpResponse('id,1', { headers: { 'Content-Type': 'text/csv' } })
    }),
  )
  const clicked = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
  const filters = encodeURIComponent(JSON.stringify([{ column: 'email', op: 'eq', value: 'ñ' }]))
  renderApp(`/tables/public/users?filters=${filters}`)
  await grid()
  await userEvent.click(screen.getByRole('button', { name: 'Export' }))
  await userEvent.click(await screen.findByRole('menuitem', { name: 'CSV' }))
  await waitFor(() => expect(clicked).toHaveBeenCalled())
  const url = new URL(requested[0] ?? '')
  expect(url.pathname).toBe('/api/v1/c/env/tables/public/users/export')
  expect(url.searchParams.get('format')).toBe('csv')
  const q = url.searchParams.get('q') ?? ''
  const json = new TextDecoder().decode(
    Uint8Array.from(atob(q.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0)),
  )
  expect(JSON.parse(json)).toMatchObject({ filters: [{ column: 'email', op: 'eq', value: 'ñ' }] })
  clicked.mockRestore()
})

test('a refused export shows the error instead of saving it as the file', async () => {
  serveUsers()
  server.use(
    http.get('*/api/v1/c/:conn/tables/public/users/export', () =>
      HttpResponse.json({ error: { code: 'bad_request', message: 'x' } }, { status: 400 }),
    ),
  )
  const clicked = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
  renderApp('/tables/public/users')
  await grid()
  await userEvent.click(screen.getByRole('button', { name: 'Export' }))
  await userEvent.click(await screen.findByRole('menuitem', { name: 'JSON' }))
  expect(await screen.findByText(/The request isn.t valid/)).toBeInTheDocument()
  expect(clicked).not.toHaveBeenCalled()
  clicked.mockRestore()
})
