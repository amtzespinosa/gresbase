import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import type { Relation } from '@/lib/api/types.gen'
import { usePrefs } from '@/lib/prefs/store'
import { server } from '@/test/msw'
import { renderApp } from '@/test/render'
import { useTableTabs } from './tabs'
import { legacyPinsKey, loadView, viewKey } from './view'

const rel = (name: string): Relation => ({
  schema: 'public',
  name,
  kind: 'table',
  comment: null,
  estimated_rows: 1,
  total_bytes: 8192,
  partitions: [],
})

beforeEach(() => {
  server.use(
    http.get('*/api/v1/c/:conn/schemas/:schema/relations', () =>
      HttpResponse.json([rel('orders'), rel('users')]),
    ),
    http.get('*/api/v1/c/:conn/sql/completions', () =>
      HttpResponse.json({
        tables: ['orders', 'users'].map((name) => ({
          schema: 'public',
          name,
          partition: false,
          columns: [],
        })),
        functions: [],
        search_path: ['public'],
      }),
    ),
  )
})

const tabs = () => within(screen.getByRole('navigation', { name: 'Open tables' }))
const tabNames = () =>
  tabs()
    .getAllByRole('link')
    .map((a) => a.textContent)

test('opening tables adds tabs; closing the open one goes to its neighbor', async () => {
  const user = userEvent.setup()
  const { router } = renderApp('/c/env/tables/public/users')
  await waitFor(() => expect(tabNames()).toEqual(['users']))
  await user.click(await screen.findByRole('link', { name: /orders/ }))
  await waitFor(() => expect(tabNames()).toEqual(['users', 'orders']))
  expect(tabs().getByRole('link', { name: 'orders' })).toHaveAttribute('aria-current', 'page')

  await user.click(tabs().getByRole('button', { name: 'Close public.orders' }))
  await waitFor(() => expect(router.state.location.pathname).toBe('/c/env/tables/public/users'))
  expect(tabNames()).toEqual(['users'])

  // Alt+W closes the open tab; with none left the table list stays empty (no table reopens).
  await user.keyboard('{Alt>}w{/Alt}')
  await waitFor(() => expect(router.state.location.pathname).toBe('/c/env/tables'))
  expect(screen.queryByRole('navigation', { name: 'Open tables' })).not.toBeInTheDocument()
  expect(useTableTabs.getState().byConnection.env?.tabs).toEqual([])
})

test('reorder from the menu, close others; tabs are per connection and persisted', async () => {
  const user = userEvent.setup()
  useTableTabs.setState({
    byConnection: {
      env: {
        tabs: [
          { schema: 'public', table: 'users' },
          { schema: 'public', table: 'orders' },
        ],
        favorites: [],
      },
      other: { tabs: [{ schema: 'public', table: 'items' }], favorites: [] },
    },
  })
  renderApp('/c/env/tables/public/users')
  await waitFor(() => expect(tabNames()).toEqual(['users', 'orders']))

  await user.pointer({ keys: '[MouseRight]', target: tabs().getByRole('link', { name: 'orders' }) })
  await user.click(await screen.findByRole('menuitem', { name: 'Move left' }))
  expect(tabNames()).toEqual(['orders', 'users'])

  await user.pointer({ keys: '[MouseRight]', target: tabs().getByRole('link', { name: 'users' }) })
  await user.click(await screen.findByRole('menuitem', { name: 'Close others' }))
  expect(tabNames()).toEqual(['users'])

  const stored = JSON.parse(localStorage.getItem('gresbase:tables:/') ?? '{}') as {
    state: ReturnType<typeof useTableTabs.getState>
  }
  expect(stored.state.byConnection.env?.tabs).toEqual([{ schema: 'public', table: 'users' }])
  expect(stored.state.byConnection.other?.tabs).toEqual([{ schema: 'public', table: 'items' }])
})

test('a tab of a table that no longer exists is dropped when opened', async () => {
  useTableTabs.setState({
    byConnection: { env: { tabs: [{ schema: 'public', table: 'gone' }], favorites: [] } },
  })
  server.use(
    http.get('*/api/v1/c/:conn/tables/public/gone', () =>
      HttpResponse.json({ error: { code: 'not_found', message: 'no' } }, { status: 404 }),
    ),
  )
  renderApp('/c/env/tables/public/gone')
  await waitFor(() => expect(useTableTabs.getState().byConnection.env?.tabs).toEqual([]))
})

test('favorites: added from the list, shown on top and in the palette, per connection', async () => {
  const user = userEvent.setup()
  renderApp('/c/env/tables/public/users')
  const list = await screen.findByRole('region', { name: 'Tables' })
  fireEvent.contextMenu(await within(list).findByRole('link', { name: /orders/ }))
  await user.click(await screen.findByRole('menuitem', { name: 'Add to favorites' }))
  const favorites = await screen.findByRole('region', { name: 'Favorites' })
  expect(within(favorites).getByRole('link', { name: /orders/ })).toBeInTheDocument()
  expect(useTableTabs.getState().byConnection.env?.favorites).toEqual([
    { schema: 'public', table: 'orders' },
  ])
  expect(useTableTabs.getState().byConnection.other).toBeUndefined()

  await user.keyboard('{Control>}k{/Control}')
  const palette = await screen.findByRole('dialog')
  const group = await within(palette).findByText('Favorites')
  expect(group).toBeInTheDocument()
  expect(within(palette).getAllByText('orders').length).toBeGreaterThan(0)

  await user.keyboard('{Escape}')
  fireEvent.contextMenu(within(favorites).getByRole('link', { name: /orders/ }))
  await user.click(await screen.findByRole('menuitem', { name: 'Remove from favorites' }))
  expect(screen.queryByRole('region', { name: 'Favorites' })).not.toBeInTheDocument()
})

test('recents are kept per connection; old items without one belong to env', () => {
  const { addRecent } = usePrefs.getState()
  usePrefs.setState({ recent: [{ kind: 'table', schema: 'public', table: 'legacy' }] })
  for (let i = 0; i < 8; i++)
    addRecent({ connection: 'a', kind: 'table', schema: 's', table: `t${i}` })
  addRecent({ connection: 'env', kind: 'table', schema: 'public', table: 'users' })
  const recent = usePrefs.getState().recent
  expect(recent.filter((r) => r.connection === 'a')).toHaveLength(6)
  expect(
    recent
      .filter((r) => (r.connection ?? 'env') === 'env')
      .map((r) => r.kind === 'table' && r.table),
  ).toEqual(['users', 'legacy'])
})

test('pins saved by v0.1.1 move into the env view once', () => {
  localStorage.setItem(
    legacyPinsKey('public', 'users'),
    JSON.stringify({ columns: ['email'], rows: [{ id: '1' }] }),
  )
  expect(loadView('other', 'public', 'users').columns).toEqual([])
  const view = loadView('env', 'public', 'users')
  expect(view.columns).toEqual(['email'])
  expect(view.rows).toEqual([{ id: '1' }])
  expect(localStorage.getItem(legacyPinsKey('public', 'users'))).toBeNull()
  expect(JSON.parse(localStorage.getItem(viewKey('env', 'public', 'users')) ?? '{}')).toMatchObject(
    {
      columns: ['email'],
    },
  )
})
