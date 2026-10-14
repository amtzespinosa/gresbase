import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import type { Relation } from '@/lib/api/types.gen'
import { usePrefs } from '@/lib/prefs/store'
import { server } from '@/test/msw'
import { renderApp } from '@/test/render'
import { pick } from '@/test/select'
import { filterRelations } from './filterRelations'

const rel = (
  name: string,
  kind: string,
  rows: number | null = 10,
  schema = 'public',
): Relation => ({
  schema,
  name,
  kind,
  estimated_rows: rows,
  total_bytes: 8192,
  comment: null,
  partitions: [],
})

const publicRels: Relation[] = [
  rel('active_users', 'view', null),
  {
    ...rel('events', 'partitioned_table', null),
    partitions: [rel('events_2026_01', 'table', 500), rel('events_2026_02', 'table', 700)],
  },
  rel('remote_logs', 'foreign_table', null),
  rel('user_stats', 'materialized_view', 3),
  rel('users', 'table', 12_400),
]

function useSeed() {
  server.use(
    http.get('*/api/v1/c/:conn/schemas', () => HttpResponse.json(['billing', 'public'])),
    http.get('*/api/v1/c/:conn/schemas/:schema/relations', ({ params }) =>
      HttpResponse.json(
        params.schema === 'billing' ? [rel('payments', 'table', 42, 'billing')] : publicRels,
      ),
    ),
  )
}

const browser = async () => within(await screen.findByRole('region', { name: 'Tables' }))

test('lists every relation kind with its icon and approximate count, and opens the first', async () => {
  useSeed()
  const { router } = renderApp('/tables')
  await waitFor(() =>
    expect(router.state.location.pathname).toBe('/c/env/tables/public/active_users'),
  )

  const list = await browser()
  for (const kind of ['View', 'Partitioned table', 'Foreign table', 'Materialized view', 'Table']) {
    expect(list.getAllByLabelText(kind).length).toBeGreaterThan(0)
  }
  expect(list.getByRole('link', { name: /users≈12.4k/ })).toBeInTheDocument()
  expect(list.getByRole('link', { name: /active_users/ })).toHaveClass('bg-surface-2')
})

test('partitions are folded under their parent', async () => {
  useSeed()
  renderApp('/tables/public/users')
  const toggle = await screen.findByRole('button', { name: 'Show 2 partitions' })
  expect(screen.queryByText('events_2026_01')).not.toBeInTheDocument()
  await userEvent.click(toggle)
  expect(toggle).toHaveAttribute('aria-expanded', 'true')
  expect(screen.getByText('events_2026_01')).toBeInTheDocument()
})

test('search filters instantly, including partitions, and says when nothing matches', async () => {
  useSeed()
  renderApp('/tables/public/users')
  const search = await screen.findByRole('searchbox', { name: 'Search tables' })
  await (await browser()).findByText('users')

  await userEvent.type(search, '2026_02')
  expect(screen.getByText('events')).toBeInTheDocument()
  expect(screen.getByText('events_2026_02')).toBeInTheDocument()
  expect(screen.queryByText('events_2026_01')).not.toBeInTheDocument()
  expect((await browser()).queryByText('users')).not.toBeInTheDocument()

  await userEvent.clear(search)
  await userEvent.type(search, 'nope')
  expect(screen.getByText('No tables match your search.')).toBeInTheDocument()
})

test('changing the schema reloads the list and is remembered', async () => {
  useSeed()
  renderApp('/tables/public/users')
  await (await browser()).findByText('users')
  await pick(screen.getByLabelText('Schema'), 'billing')
  expect(await screen.findByText('payments')).toBeInTheDocument()
  expect((await browser()).queryByText('users')).not.toBeInTheDocument()
  expect(usePrefs.getState().schema).toBe('billing')
})

test('clicking a relation navigates to it', async () => {
  useSeed()
  const { router } = renderApp('/tables/public/users')
  await userEvent.click(await screen.findByRole('link', { name: /user_stats/ }))
  expect(router.state.location.pathname).toBe('/c/env/tables/public/user_stats')
  await waitFor(() => expect(screen.getByRole('heading')).toHaveTextContent('public / user_stats'))
})

test('/ focuses the search box unless typing elsewhere', async () => {
  useSeed()
  renderApp('/tables/public/users')
  const search = await screen.findByRole('searchbox', { name: 'Search tables' })
  fireEvent.keyDown(document.body, { key: '/' })
  expect(search).toHaveFocus()
})

test('empty schema state', async () => {
  renderApp('/tables')
  await waitFor(() => expect(screen.getAllByText('This schema has no tables yet.')).toHaveLength(2))
})

test('error state with retry', async () => {
  let fail = true
  server.use(
    http.get('*/api/v1/c/:conn/schemas/:schema/relations', () =>
      fail
        ? HttpResponse.json({ error: { code: 'timeout', message: 'x' } }, { status: 504 })
        : HttpResponse.json(publicRels),
    ),
  )
  renderApp('/tables/public/users')
  expect(await screen.findByRole('alert')).toHaveTextContent('The query took too long')
  fail = false
  await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
  expect(await (await browser()).findByText('users')).toBeInTheDocument()
})

test('filterRelations keeps parents of matching partitions', () => {
  expect(filterRelations(publicRels, 'EVENTS_2026_01').map((r) => r.partitions.length)).toEqual([1])
  expect(filterRelations(publicRels, '  ')).toBe(publicRels)
})

test('the open partition starts unfolded', async () => {
  useSeed()
  renderApp('/tables/public/events_2026_02')
  const list = await browser()
  expect(await list.findByRole('link', { name: /events_2026_02/ })).toHaveClass('bg-surface-2')
})

test('the list card resizes from its right edge, within limits, and double-click resets it', async () => {
  useSeed()
  renderApp('/tables/public/users')
  const handle = await screen.findByRole('separator', { name: /Resize the table list/ })
  expect(handle).toHaveAttribute('aria-valuenow', '240')
  handle.focus()
  await userEvent.keyboard('{ArrowRight}{ArrowRight}')
  expect(handle).toHaveAttribute('aria-valuenow', '272')
  expect(usePrefs.getState().tableListWidth).toBe(272)
  await userEvent.keyboard('{End}{ArrowRight}')
  expect(handle).toHaveAttribute('aria-valuenow', '560')
  await userEvent.keyboard('{Home}{ArrowLeft}')
  expect(handle).toHaveAttribute('aria-valuenow', '200')
  await userEvent.dblClick(handle)
  expect(handle).toHaveAttribute('aria-valuenow', '240')
  expect(usePrefs.getState().tableListWidth).toBeNull()
})

test('a truncated name floats in full on hover and focus; a name that fits does not', async () => {
  useSeed()
  renderApp('/tables/public/users')
  const list = await browser()
  const link = await list.findByRole('link', { name: /user_stats/ })
  const name = link.querySelector('[data-name]') as HTMLElement

  await userEvent.hover(link)
  expect(screen.queryByTestId('name-reveal')).not.toBeInTheDocument()
  await userEvent.unhover(link)

  // jsdom does no layout: fake an overflowing name.
  Object.defineProperty(name, 'scrollWidth', { configurable: true, value: 300 })
  Object.defineProperty(name, 'clientWidth', { configurable: true, value: 100 })
  await userEvent.hover(link)
  expect(screen.getByTestId('name-reveal')).toHaveTextContent('user_stats')
  await userEvent.unhover(link)
  expect(screen.queryByTestId('name-reveal')).not.toBeInTheDocument()

  fireEvent.focus(link)
  expect(screen.getByTestId('name-reveal')).toHaveClass('outline-accent')
  fireEvent.blur(link)
  expect(screen.queryByTestId('name-reveal')).not.toBeInTheDocument()
})
