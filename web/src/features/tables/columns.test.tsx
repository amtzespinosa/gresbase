import { fireEvent, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import type { Column, Page, Table } from '@/lib/api/types.gen'
import { emptyTable, server } from '@/test/msw'
import { renderApp } from '@/test/render'
import { viewKey } from './view'

const col = (name: string, type: string): Column => ({
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
})

const users: Table = {
  ...emptyTable('public', 'users'),
  columns: [col('id', 'bigint'), col('email', 'text'), col('age', 'integer')],
  primary_key: ['id'],
  has_primary_key: true,
}

const page: Page = {
  columns: users.columns.map((c) => ({ name: c.name, type: c.type })),
  rows: [['1', 'ada@x.io', 36]],
  next_cursor: null,
  has_more: false,
}

beforeEach(() => {
  vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(4000)
  vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(1000)
  server.use(
    http.get('*/api/v1/c/:conn/tables/public/users', () => HttpResponse.json(users)),
    http.post('*/api/v1/c/:conn/tables/public/users/rows\\:query', () => HttpResponse.json(page)),
  )
})
afterEach(() => vi.restoreAllMocks())

const key = viewKey('env', 'public', 'users')
const stored = () => JSON.parse(localStorage.getItem(key) ?? 'null') as unknown

async function open() {
  const { unmount } = renderApp('/tables/public/users')
  const g = within(await screen.findByRole('grid', { name: 'Rows of users' }))
  await g.findByText('ada@x.io')
  return Object.assign(g, { unmount })
}

/** Header names left to right (the sort button's first text). */
const headers = (g: ReturnType<typeof within>) =>
  g
    .getAllByRole('columnheader')
    .filter((h: HTMLElement) => h.getAttribute('aria-colindex'))
    .map((h: HTMLElement) => h.querySelector('span.font-medium')?.textContent)

test('hides a column from its menu and shows it again from the Columns panel', async () => {
  const g = await open()
  await userEvent.click(g.getByRole('button', { name: 'Column options for email' }))
  await userEvent.click(await screen.findByRole('menuitem', { name: 'Hide column' }))
  expect(headers(g)).toEqual(['id', 'age'])
  expect(stored()).toMatchObject({ hidden: ['email'] })

  await userEvent.click(screen.getByRole('button', { name: 'Columns (1 hidden)' }))
  const box = await screen.findByRole('checkbox', { name: 'email' })
  expect(box).not.toBeChecked()
  await userEvent.click(box)
  expect(headers(g)).toEqual(['id', 'email', 'age'])
  expect(localStorage.getItem(key)).toBeNull()
})

test('the column menu sorts', async () => {
  const g = await open()
  await userEvent.click(g.getByRole('button', { name: 'Column options for age' }))
  await userEvent.click(await screen.findByRole('menuitem', { name: 'Sort descending' }))
  expect(await g.findByRole('columnheader', { name: /age/ })).toHaveAttribute(
    'aria-sort',
    'descending',
  )
})

test('reorders columns, remembers the order, keeps pinned columns first and resets', async () => {
  const g = await open()
  await userEvent.click(screen.getByRole('button', { name: 'Columns' }))
  await userEvent.click(await screen.findByRole('button', { name: 'Move age up' }))
  await userEvent.click(screen.getByRole('button', { name: 'Move age up' }))
  expect(headers(g)).toEqual(['age', 'id', 'email'])
  expect(stored()).toMatchObject({ order: ['age', 'id', 'email'] })
  await userEvent.keyboard('{Escape}')

  // A pinned column goes first whatever the order.
  await userEvent.click(g.getByRole('button', { name: 'Pin column email' }))
  expect(headers(g)).toEqual(['email', 'age', 'id'])

  // Remembered after leaving the table.
  g.unmount()
  const g2 = await open()
  expect(headers(g2)).toEqual(['email', 'age', 'id'])

  await userEvent.click(screen.getByRole('button', { name: 'Columns' }))
  await userEvent.click(await screen.findByRole('button', { name: 'Reset view' }))
  const g3 = within(await screen.findByRole('grid', { name: 'Rows of users' }))
  expect(headers(g3)).toEqual(['id', 'email', 'age'])
  expect(localStorage.getItem(key)).toBeNull()
})

test('saved widths apply and a double click on the handle resets one', async () => {
  localStorage.setItem(key, JSON.stringify({ widths: { email: 420 } }))
  const g = await open()
  const email = g.getByRole('columnheader', { name: /email/ })
  expect(email).toHaveStyle({ width: '420px' })
  const handle = email.querySelector('.cursor-col-resize')
  if (!handle) throw new Error('no resize handle')
  fireEvent.doubleClick(handle)
  expect(email).toHaveStyle({ width: '240px' })
  expect(localStorage.getItem(key)).toBeNull()
})
