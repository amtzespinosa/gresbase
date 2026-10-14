import { fireEvent, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import type { Column, Page, Table } from '@/lib/api/types.gen'
import { emptyTable, server } from '@/test/msw'
import { renderApp } from '@/test/render'
import { useChanges } from './changes/queue'

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
  columns: [col('id', 'bigint', { base_type: 'int8' }), col('email', 'text'), col('age', 'int4')],
  primary_key: ['id'],
  has_primary_key: true,
}

const page: Page = {
  columns: users.columns.map((c) => ({ name: c.name, type: c.type })),
  rows: [
    ['1', 'ada@x.io', 36],
    ['2', 'bob@x.io', null],
  ],
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
afterEach(() => {
  vi.restoreAllMocks()
  useChanges.setState({ queues: {}, history: {} })
})

const qkey = '["public","users"]'
const queue = () => useChanges.getState().queues[qkey]

async function open() {
  const user = userEvent.setup()
  renderApp('/tables/public/users')
  const g = within(await screen.findByRole('grid', { name: 'Rows of users' }))
  await g.findByText('ada@x.io')
  const cell = (row: number, col: number) => {
    const el = g.getAllByRole('gridcell').find((c) => c.dataset.cell === `${row}:${col}`)
    if (!el) throw new Error(`no cell ${row}:${col}`)
    return el
  }
  return { user, cell }
}

test('Shift+arrows select a rectangle that Ctrl+C copies as TSV', async () => {
  const { user, cell } = await open()
  await user.click(cell(0, 1))
  await user.keyboard('{Shift>}{ArrowDown}{ArrowRight}{/Shift}')
  expect(cell(1, 2)).toHaveAttribute('aria-selected', 'true')
  expect(cell(0, 0)).toHaveAttribute('aria-selected', 'false')
  const setData = vi.fn()
  fireEvent.copy(cell(1, 2), { clipboardData: { setData } })
  expect(setData).toHaveBeenCalledWith('text/plain', 'ada@x.io\t36\nbob@x.io\t')
})

test('dragging selects; the context menu copies as CSV, JSON and INSERT', async () => {
  const { user, cell } = await open()
  fireEvent.mouseDown(cell(0, 0), { button: 0 })
  fireEvent.mouseEnter(cell(1, 1), { buttons: 1 })
  fireEvent.mouseUp(window)
  expect(cell(1, 1)).toHaveAttribute('aria-selected', 'true')

  const copyAs = async (item: string) => {
    fireEvent.contextMenu(cell(0, 0))
    await user.click(await screen.findByRole('menuitem', { name: item }))
    await screen.findAllByText('4 cells copied')
    return navigator.clipboard.readText()
  }
  expect(await copyAs('Copy as CSV')).toBe('id,email\n1,ada@x.io\n2,bob@x.io')
  expect(JSON.parse(await copyAs('Copy as JSON'))).toEqual([
    { id: '1', email: 'ada@x.io' },
    { id: '2', email: 'bob@x.io' },
  ])
  expect(await copyAs('Copy as INSERT')).toBe(
    `INSERT INTO "public"."users" ("id", "email") VALUES\n  ('1', 'ada@x.io'),\n  ('2', 'bob@x.io');`,
  )
})

test('pasting updates cells through the change queue, as one undo step', async () => {
  const { user, cell } = await open()
  await user.click(cell(0, 1))
  await user.paste('ann@x.io\t40\nbea@x.io\t41')
  expect(queue()?.updates).toMatchObject({
    '{"id":"1"}': { set: { email: 'ann@x.io', age: '40' } },
    '{"id":"2"}': { set: { email: 'bea@x.io', age: '41' } },
  })
  expect(cell(1, 2)).toHaveAttribute('data-edited', 'true')
  useChanges.getState().undo(qkey)
  expect(queue()?.updates).toEqual({})
})

test('rows past the end are offered as inserts', async () => {
  const { user, cell } = await open()
  await user.click(cell(1, 1))
  await user.paste('x@x.io\t1\ny@x.io\t2\nz@x.io\t3')
  await user.click(await screen.findByRole('button', { name: 'Insert rows' }))
  expect(queue()?.updates['{"id":"2"}']?.set).toEqual({ email: 'x@x.io', age: '1' })
  expect(queue()?.inserts.map((r) => r.values)).toEqual([
    { email: 'y@x.io', age: '2' },
    { email: 'z@x.io', age: '3' },
  ])
})

test('values of the wrong type are marked in the queue and block saving', async () => {
  const { user, cell } = await open()
  await user.click(cell(0, 2))
  await user.paste('abc')
  expect(cell(0, 2)).toHaveAttribute('data-invalid', 'true')
  expect(cell(0, 2)).toHaveAttribute('title', 'Enter a whole number.')
  expect(screen.getByText('· 1 invalid value')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
})
