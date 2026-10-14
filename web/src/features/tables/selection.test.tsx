import { fireEvent, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import type { Column, Page, Table } from '@/lib/api/types.gen'
import { emptyTable, server } from '@/test/msw'
import { renderApp } from '@/test/render'
import { useChanges } from './changes/queue'

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
  columns: [col('id', 'bigint'), col('email', 'text')],
  primary_key: ['id'],
  has_primary_key: true,
}

const page: Page = {
  columns: users.columns.map((c) => ({ name: c.name, type: c.type })),
  rows: [
    ['1', 'ada@x.io'],
    ['2', 'bob@x.io'],
    ['3', 'cy@x.io'],
    ['4', 'dee@x.io'],
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
  /** Indexes of the selected rows, from the rows' aria-selected. */
  const selected = () =>
    g
      .getAllByRole('row')
      .filter((r) => r.getAttribute('aria-selected') === 'true')
      .map((r) => Number(r.getAttribute('aria-rowindex')) - 2)
  const box = (n: number) => g.getByRole('checkbox', { name: `Select row ${n}` })
  return { user, cell, selected, box }
}

test('a click selects the row; Ctrl/Cmd+click adds, Shift+click selects a range', async () => {
  const { cell, selected, box } = await open()
  fireEvent.mouseDown(cell(1, 1), { button: 0 })
  expect(selected()).toEqual([1])
  expect(box(2)).toBeChecked() // same selection as the checkboxes
  expect(cell(1, 1).closest('[role=row]')).toHaveAttribute('data-row-selected', 'true')

  fireEvent.mouseDown(cell(3, 0), { button: 0, ctrlKey: true })
  expect(selected()).toEqual([1, 3])
  fireEvent.mouseDown(cell(1, 0), { button: 0, metaKey: true })
  expect(selected()).toEqual([3])

  fireEvent.mouseDown(cell(0, 1), { button: 0 })
  fireEvent.mouseDown(cell(2, 1), { button: 0, shiftKey: true })
  expect(selected()).toEqual([0, 1, 2])
  expect(screen.getByRole('button', { name: 'Delete 3 rows' })).toBeInTheDocument()

  // A plain click replaces the selection.
  fireEvent.mouseDown(cell(3, 1), { button: 0 })
  expect(selected()).toEqual([3])
})

test('the checkbox still toggles; double click still edits', async () => {
  const { user, cell, selected, box } = await open()
  await user.click(box(1))
  await user.click(box(3))
  expect(selected()).toEqual([0, 2])
  await user.dblClick(cell(1, 1))
  expect(await screen.findByDisplayValue('bob@x.io')).toBeInTheDocument()
  expect(selected()).toEqual([1])
})

test('an edited cell in a selected row keeps its edited marker', async () => {
  const { user, cell } = await open()
  await user.click(cell(0, 1))
  await user.keyboard('{Enter}')
  const input = await screen.findByDisplayValue('ada@x.io')
  await user.clear(input)
  await user.type(input, 'ann@x.io{Enter}')
  const edited = cell(0, 1)
  expect(edited).toHaveAttribute('data-edited', 'true')
  // The row is selected (the click) and the cell's box still carries the tint class: in a
  // selected row the tint token resolves to the opaque yellow (index.css).
  expect(edited.closest('[role=row]')).toHaveAttribute('data-row-selected', 'true')
  expect(edited.firstElementChild).toHaveClass('bg-accent-tint')
})
