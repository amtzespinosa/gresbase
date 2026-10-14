import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import type { Changeset, Column, Page, Table } from '@/lib/api/types.gen'
import { emptyTable, server } from '@/test/msw'
import { renderApp } from '@/test/render'
import { useSaved } from './history'
import { useChanges } from './queue'

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
    col('id', 'bigint', { base_type: 'int8', identity: 'by_default', not_null: true }),
    col('email', 'text', { not_null: true }),
    col('age', 'integer', { base_type: 'int4' }),
    col('plan', 'plan_t', { enum_values: ['free', 'pro', 'team'], default: "'free'::plan_t" }),
  ],
  primary_key: ['id'],
  has_primary_key: true,
}

const page: Page = {
  columns: users.columns.map((c) => ({ name: c.name, type: c.type })),
  rows: [
    ['1', 'ada@example.com', 36, 'pro'],
    ['2', 'bob@example.com', null, 'free'],
  ],
  next_cursor: null,
  has_more: false,
}

/** Serves `users` and records every changeset body. */
function serve(apply: () => Response = () => HttpResponse.json(saved)) {
  const bodies: Changeset[] = []
  server.use(
    http.get('*/api/v1/c/:conn/tables/public/users', () => HttpResponse.json(users)),
    http.post('*/api/v1/c/:conn/tables/public/users/rows\\:query', () => HttpResponse.json(page)),
    http.post('*/api/v1/c/:conn/tables/public/users/changesets\\:preview', () =>
      HttpResponse.json({
        sql: ['UPDATE public.users SET email = ...'],
        undoable: true,
        reasons: [],
      }),
    ),
    http.post('*/api/v1/c/:conn/tables/public/users/changesets', async ({ request }) => {
      bodies.push((await request.json()) as Changeset)
      return apply()
    }),
  )
  return bodies
}
const saved = { id: 'cs1', applied: 1, undoable: true, reasons: [], undone: false }

beforeEach(() => {
  vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(4000)
  vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(1000)
})
afterEach(() => {
  vi.restoreAllMocks()
  useChanges.setState({ queues: {}, history: {} })
  useSaved.setState({ stacks: {} })
})

/** The floating pill (toasts are status regions too). */
const pill = () => screen.getByText(/pending changes?$/).closest('[role="status"]')

const grid = async () => within(await screen.findByRole('grid', { name: 'Rows of users' }))

async function editEmail(value: string) {
  const g = await grid()
  const cell = (await g.findByText('ada@example.com')).closest('[role="gridcell"]')
  if (!cell) throw new Error('no email cell')
  await userEvent.dblClick(cell)
  const input = await screen.findByRole('textbox', { name: 'Edit email' })
  await userEvent.clear(input)
  await userEvent.type(input, `${value}{Enter}`)
  return cell
}

test('edit a cell, review the diff and save', async () => {
  const bodies = serve()
  renderApp('/tables/public/users')
  const cell = await editEmail('new@example.com')

  expect(cell).toHaveAttribute('data-edited', 'true')
  expect(cell).toHaveTextContent('new@example.com')
  const bar = pill()
  expect(bar).toHaveTextContent('1 pending change')

  await userEvent.click(within(bar as HTMLElement).getByRole('button', { name: 'View diff' }))
  const dialog = await screen.findByRole('dialog', { name: '1 pending change' })
  expect(dialog).toHaveTextContent('ada@example.com → new@example.com')
  expect(await within(dialog).findByText(/UPDATE public\.users/)).toBeInTheDocument()

  await userEvent.click(within(dialog).getByRole('button', { name: /^Save/ }))
  expect(await screen.findByText('Saved 1 change')).toBeInTheDocument()
  expect(bodies).toEqual([
    {
      ops: [
        {
          kind: 'update',
          pk: { id: '1' },
          set: { email: 'new@example.com' },
          expected: { email: 'ada@example.com' },
        },
      ],
    },
  ])
  await waitFor(() => expect(screen.queryByText('1 pending change')).not.toBeInTheDocument())
})

test('a failed save says why and keeps the queue', async () => {
  serve(() =>
    HttpResponse.json(
      { error: { code: 'pg_error', message: 'value too long for type character varying(5)' } },
      { status: 422 },
    ),
  )
  renderApp('/tables/public/users')
  await editEmail('x')
  await userEvent.click(screen.getByRole('button', { name: 'Save' }))
  expect(await screen.findByText(/value too long/)).toBeInTheDocument()
  expect(pill()).toHaveTextContent('1 pending change')
})

test('a conflict names the operation and keeps the queue', async () => {
  serve(() =>
    HttpResponse.json(
      {
        error: {
          code: 'conflict',
          message: 'conflict',
          conflict: {
            op: 0,
            kind: 'update',
            pk: { id: '1' },
            missing: false,
            exists: false,
            columns: ['email'],
            expected: { email: 'ada@example.com' },
            current: { email: 'other@example.com' },
          },
        },
      },
      { status: 409 },
    ),
  )
  renderApp('/tables/public/users')
  await editEmail('x@example.com')
  await userEvent.keyboard('{Control>}s{/Control}')
  expect(
    await screen.findByText(
      'Nothing was saved. Change 1 (Update id = 1): someone else changed email. Reload to see the current values.',
    ),
  ).toBeInTheDocument()
  expect(pill()).toHaveTextContent('1 pending change')
})

test('keyboard: arrows move, Enter edits, Tab commits and moves, Ctrl+Backspace sets NULL', async () => {
  serve()
  renderApp('/tables/public/users')
  const g = await grid()
  await userEvent.click(await g.findByText('ada@example.com'))
  await userEvent.keyboard('{ArrowRight}{Enter}')
  const age = await screen.findByRole('textbox', { name: 'Edit age' })
  await userEvent.clear(age)
  await userEvent.type(age, '1.5{Enter}')
  expect(screen.getByText('Enter a whole number.')).toBeInTheDocument()
  await userEvent.clear(age)
  await userEvent.type(age, '40{Tab}')
  expect(screen.queryByRole('textbox', { name: 'Edit age' })).not.toBeInTheDocument()
  // Tab moved to `plan`: set the previous cell to NULL instead.
  await userEvent.keyboard('{ArrowLeft}{Control>}{Backspace}{/Control}')
  const ageCell = g.getAllByRole('gridcell').filter((c) => c.dataset.cell)[2]
  expect(ageCell).toHaveTextContent('NULL')
  expect(ageCell).toHaveAttribute('data-edited', 'true')
  // NOT NULL columns refuse it.
  await userEvent.keyboard('{ArrowLeft}{Control>}{Backspace}{/Control}')
  expect(await screen.findByText("email can't be NULL.")).toBeInTheDocument()
  await userEvent.keyboard('{Escape}')
})

test('enum editor: the list opens and picks without closing the editor, Enter commits', async () => {
  serve()
  renderApp('/tables/public/users')
  const g = await grid()
  await userEvent.click(await g.findByText('pro'))
  await userEvent.keyboard('{Enter}')
  const plan = await screen.findByRole('combobox', { name: 'Edit plan' })
  expect(plan).toHaveFocus()
  await userEvent.keyboard('{ArrowDown}')
  await screen.findByRole('listbox')
  await userEvent.keyboard('{ArrowDown}{Enter}')
  expect(plan).toHaveFocus()
  expect(plan).toHaveTextContent('team')
  await userEvent.keyboard('{Enter}')
  expect(screen.queryByRole('combobox', { name: 'Edit plan' })).not.toBeInTheDocument()
  const planCell = g.getAllByRole('gridcell').filter((c) => c.dataset.cell)[3]
  expect(planCell).toHaveTextContent('team')
  expect(planCell).toHaveAttribute('data-edited', 'true')
})

test('insert from the row panel and delete selected rows', async () => {
  const bodies = serve()
  renderApp('/tables/public/users')
  const g = await grid()
  await g.findByText('ada@example.com')

  await userEvent.click(screen.getByRole('button', { name: 'Insert row' }))
  const sheet = await screen.findByRole('dialog', { name: 'Insert row' })
  expect(within(sheet).getByLabelText('required')).toBeInTheDocument() // email
  expect(within(sheet).getByRole('textbox', { name: 'email' })).toHaveAttribute(
    'placeholder',
    'Required',
  )
  await userEvent.type(within(sheet).getByRole('textbox', { name: 'email' }), 'new@example.com')
  await userEvent.type(within(sheet).getByRole('textbox', { name: 'age' }), 'x')
  await userEvent.click(within(sheet).getByRole('button', { name: 'Add to queue' }))
  expect(within(sheet).getByText('Enter a whole number.')).toBeInTheDocument()
  await userEvent.clear(within(sheet).getByRole('textbox', { name: 'age' }))
  await userEvent.click(within(sheet).getByRole('button', { name: 'Add to queue' }))

  await userEvent.click(g.getByRole('checkbox', { name: 'Select row 3' })) // bob, after the new row
  await userEvent.click(screen.getByRole('button', { name: 'Delete 1 row' }))
  expect(g.getByText('bob@example.com').closest('[role="row"]')).toHaveAttribute(
    'data-state',
    'deleted',
  )
  expect(pill()).toHaveTextContent('2 pending changes')

  await userEvent.click(screen.getByRole('button', { name: 'Save' }))
  await screen.findByText('Saved 2 changes')
  expect(bodies[0]?.ops).toEqual([
    {
      kind: 'delete',
      pk: { id: '2' },
      expected: { id: '2', email: 'bob@example.com', age: null, plan: 'free' },
    },
    { kind: 'insert', values: { email: 'new@example.com' } },
  ])
})

test('leaving the table with pending changes asks first', async () => {
  serve()
  const { router } = renderApp('/tables/public/users')
  await editEmail('new@example.com')

  void router.navigate({ to: '/sql' })
  const dialog = await screen.findByRole('dialog', { name: 'Leave without saving?' })
  await userEvent.click(within(dialog).getByRole('button', { name: 'Stay' }))
  expect(router.state.location.pathname).toBe('/c/env/tables/public/users')

  void router.navigate({ to: '/sql' })
  await userEvent.click(
    within(await screen.findByRole('dialog', { name: 'Leave without saving?' })).getByRole(
      'button',
      { name: 'Discard and leave' },
    ),
  )
  await waitFor(() => expect(router.state.location.pathname).toBe('/c/env/sql'))
  expect(useChanges.getState().queues['["public","users"]']?.updates).toEqual({})
})

/** Serves undo/redo of saved changesets and records the calls ("undo cs1"). */
function serveToggle(reply: () => Response = () => HttpResponse.json(saved)) {
  const calls: string[] = []
  server.use(
    http.post('*/api/v1/c/:conn/changesets/:id/:dir', ({ params }) => {
      calls.push(`${String(params.dir)} ${String(params.id)}`)
      return reply()
    }),
  )
  return calls
}

test('Ctrl+Z and Ctrl+Shift+Z step through the queue before saving', async () => {
  serve()
  renderApp('/tables/public/users')
  const cell = await editEmail('new@example.com')
  await userEvent.keyboard('{Control>}z{/Control}')
  expect(cell).toHaveTextContent('ada@example.com')
  expect(screen.queryByText(/pending change/)).not.toBeInTheDocument()
  await userEvent.keyboard('{Control>}{Shift>}z{/Shift}{/Control}')
  expect(cell).toHaveTextContent('new@example.com')
  expect(pill()).toHaveTextContent('1 pending change')
})

test('shortcuts leave text inputs alone', async () => {
  serve()
  renderApp('/tables/public/users')
  await editEmail('new@example.com')
  const search = screen.getByRole('searchbox')
  await userEvent.click(search)
  await userEvent.keyboard('{Control>}z{/Control}')
  expect(pill()).toHaveTextContent('1 pending change')
})

test('after saving: toast with Undo, then Ctrl+Z / Ctrl+Shift+Z go to the server', async () => {
  serve()
  const calls = serveToggle()
  renderApp('/tables/public/users')
  await editEmail('new@example.com')
  await userEvent.keyboard('{Control>}s{/Control}')
  expect(await screen.findByText('Saved 1 change')).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Undo' }))
  await waitFor(() => expect(calls).toEqual(['undo cs1']))
  expect(await screen.findByText('Change undone')).toBeInTheDocument()

  await userEvent.keyboard('{Control>}{Shift>}z{/Shift}{/Control}')
  await waitFor(() => expect(calls).toEqual(['undo cs1', 'redo cs1']))
  await userEvent.keyboard('{Control>}z{/Control}')
  await waitFor(() => expect(calls).toEqual(['undo cs1', 'redo cs1', 'undo cs1']))
})

test('a change that cannot be undone says so before saving and offers no Undo', async () => {
  serve(() => HttpResponse.json({ ...saved, undoable: false, reasons: ['user_triggers'] }))
  server.use(
    http.post('*/api/v1/c/:conn/tables/public/users/changesets\\:preview', () =>
      HttpResponse.json({ sql: ['UPDATE …'], undoable: false, reasons: ['user_triggers'] }),
    ),
  )
  const calls = serveToggle()
  renderApp('/tables/public/users')
  await editEmail('new@example.com')
  await userEvent.click(within(pill() as HTMLElement).getByRole('button', { name: 'View diff' }))
  const dialog = await screen.findByRole('dialog', { name: '1 pending change' })
  expect(
    await within(dialog).findByText(
      "This change can't be undone after saving: the table has triggers that may change other data.",
    ),
  ).toBeInTheDocument()
  await userEvent.click(within(dialog).getByRole('button', { name: /^Save/ }))
  expect(await screen.findByText("Saved 1 change It can't be undone.")).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Undo' })).not.toBeInTheDocument()
  await userEvent.keyboard('{Control>}z{/Control}')
  expect(calls).toEqual([])
})

test('a conflict while undoing shows expected against current values', async () => {
  serve()
  serveToggle(() =>
    HttpResponse.json(
      {
        error: {
          code: 'conflict',
          message: 'conflict',
          conflict: {
            op: 0,
            kind: 'update',
            pk: { id: '1' },
            missing: false,
            exists: false,
            columns: ['email'],
            expected: { email: 'new@example.com' },
            current: { email: 'other@example.com' },
          },
        },
      },
      { status: 409 },
    ),
  )
  renderApp('/tables/public/users')
  await editEmail('new@example.com')
  await userEvent.keyboard('{Control>}s{/Control}')
  await screen.findByText('Saved 1 change')
  await userEvent.keyboard('{Control>}z{/Control}')
  const dialog = await screen.findByRole('dialog', { name: "Can't undo: the data changed" })
  expect(within(dialog).getByText('new@example.com')).toBeInTheDocument()
  expect(within(dialog).getByText('other@example.com')).toBeInTheDocument()
  await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
})

test('Mod+S inside a cell editor saves the value being typed', async () => {
  const bodies = serve()
  renderApp('/tables/public/users')
  const g = await grid()
  const cell = (await g.findByText('ada@example.com')).closest('[role="gridcell"]')
  if (!cell) throw new Error('no email cell')
  await userEvent.dblClick(cell)
  const input = await screen.findByRole('textbox', { name: 'Edit email' })
  await userEvent.clear(input)
  await userEvent.type(input, 'typed@example.com{Control>}s{/Control}')

  expect(await screen.findByText('Saved 1 change')).toBeInTheDocument()
  expect(bodies[0]?.ops).toEqual([
    {
      kind: 'update',
      pk: { id: '1' },
      set: { email: 'typed@example.com' },
      expected: { email: 'ada@example.com' },
    },
  ])
})

test('deletes that cascade ask first with the impact per table', async () => {
  const bodies = serve()
  server.use(
    http.post('*/api/v1/c/:conn/tables/public/users/changesets\\:impact', () =>
      HttpResponse.json({
        tables: [
          { schema: 'public', table: 'sessions', action: 'set_null', rows: 3 },
          { schema: 'billing', table: 'items', action: 'cascade', rows: 1234 },
        ],
      }),
    ),
  )
  renderApp('/tables/public/users')
  const g = await grid()
  await g.findByText('bob@example.com')
  await userEvent.click(g.getByRole('checkbox', { name: 'Select row 2' }))
  await userEvent.click(screen.getByRole('button', { name: 'Delete 1 row' }))
  await userEvent.click(screen.getByRole('button', { name: 'Save' }))

  const dialog = await screen.findByRole('dialog', { name: 'This delete reaches other tables' })
  expect(dialog).toHaveTextContent('Sets the reference to NULL in 3 rows of sessions')
  expect(dialog).toHaveTextContent('Also deletes 1,234 rows from billing.items')

  await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))
  expect(bodies).toEqual([])
  expect(pill()).toHaveTextContent('1 pending change')

  await userEvent.click(screen.getByRole('button', { name: 'Save' }))
  await userEvent.click(
    within(
      await screen.findByRole('dialog', { name: 'This delete reaches other tables' }),
    ).getByRole('button', { name: 'Delete anyway' }),
  )
  await screen.findByText(/^Saved 1 change/)
  expect(bodies[0]?.ops[0]?.kind).toBe('delete')
})
