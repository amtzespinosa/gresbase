import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import type { StructureChange, Table } from '@/lib/api/types.gen'
import { config, emptyTable, server } from '@/test/msw'
import { renderApp } from '@/test/render'

const users: Table = {
  ...emptyTable('public', 'users'),
  columns: [
    {
      position: 1,
      name: 'full_name',
      type: 'character varying(80)',
      base_type: 'varchar',
      is_array: false,
      enum_values: [],
      not_null: false,
      default: null,
      identity: '',
      generated: null,
      comment: null,
    },
  ],
}

/** Serves `users` and the structure endpoints; records previews and applied changes. */
function serve(previewError = false) {
  const previews: StructureChange[] = []
  const applied: StructureChange[] = []
  const sqlOf = (c: StructureChange) => [`-- ${c.kind} ${c.def?.name ?? c.column ?? c.table}`]
  server.use(
    http.get('*/api/v1/c/:conn/tables/public/users', () => HttpResponse.json(users)),
    http.get('*/api/v1/c/:conn/types', () =>
      HttpResponse.json([
        { name: 'text', category: 'S', modifiers: false, user: false },
        { name: 'character varying', category: 'S', modifiers: true, user: false },
      ]),
    ),
    http.post('*/api/v1/c/:conn/structure\\:preview', async ({ request }) => {
      const c = (await request.json()) as StructureChange
      previews.push(c)
      if (previewError)
        return HttpResponse.json(
          { error: { code: 'bad_request', message: 'unknown type "nope"' } },
          { status: 400 },
        )
      return HttpResponse.json({ sql: sqlOf(c), warnings: ['lock'] })
    }),
    http.post('*/api/v1/c/:conn/structure', async ({ request }) => {
      const c = (await request.json()) as StructureChange
      applied.push(c)
      return HttpResponse.json({ sql: sqlOf(c), warnings: ['lock'] })
    }),
  )
  return { previews, applied }
}

// These two type a whole column with userEvent: on a loaded machine they need more than 5 s.
test('adding a column shows the exact SQL and warnings before applying it', async () => {
  const { applied } = serve()
  renderApp('/tables/public/users?tab=structure')
  await userEvent.click(await screen.findByRole('button', { name: 'Add column' }))
  const dialog = await screen.findByRole('dialog', { name: 'Add a column to public.users' })
  const confirm = within(dialog).getByRole('button', { name: 'Add column' })
  expect(confirm).toBeDisabled()
  expect(dialog).toHaveTextContent('Fill in the form to see the SQL.')

  await userEvent.type(within(dialog).getByLabelText('Column name'), 'nick')
  await userEvent.type(within(dialog).getByLabelText('Type'), 'character varying')
  await userEvent.type(await within(dialog).findByLabelText('Size'), '20')
  await userEvent.click(within(dialog).getByLabelText('Required (NOT NULL)'))

  expect(await within(dialog).findByText('-- add_column nick;')).toBeInTheDocument()
  expect(dialog).toHaveTextContent('Locks the table (ACCESS EXCLUSIVE)')
  await waitFor(() => expect(confirm).toBeEnabled())
  await userEvent.click(confirm)
  await waitFor(() => expect(dialog).not.toBeInTheDocument())
  expect(applied).toEqual([
    {
      kind: 'add_column',
      schema: 'public',
      table: 'users',
      def: {
        name: 'nick',
        type: { name: 'character varying', modifiers: ['20'] },
        not_null: true,
      },
    },
  ])
}, 15_000)

test('deleting a column needs its exact name', async () => {
  const { applied } = serve()
  renderApp('/tables/public/users?tab=structure')
  await userEvent.click(await screen.findByRole('button', { name: 'Change column full_name' }))
  await userEvent.click(await screen.findByRole('menuitem', { name: 'Delete column…' }))
  const dialog = await screen.findByRole('dialog', { name: 'Delete column full_name' })
  expect(await within(dialog).findByText('-- drop_column full_name;')).toBeInTheDocument()
  const confirm = within(dialog).getByRole('button', { name: 'Delete column' })
  expect(confirm).toBeDisabled()
  await userEvent.type(within(dialog).getByLabelText('Type full_name to confirm'), 'full_name')
  await waitFor(() => expect(confirm).toBeEnabled())
  await userEvent.click(confirm)
  await waitFor(() => expect(applied).toHaveLength(1))
  expect(applied[0]).toEqual({
    kind: 'drop_column',
    schema: 'public',
    table: 'users',
    column: 'full_name',
    confirm: 'full_name',
  })
}, 15_000)

test('a change the server refuses shows why and cannot be applied', async () => {
  serve(true)
  renderApp('/tables/public/users?tab=structure')
  await userEvent.click(await screen.findByRole('button', { name: 'Change column full_name' }))
  await userEvent.click(await screen.findByRole('menuitem', { name: 'Change type…' }))
  const dialog = await screen.findByRole('dialog', { name: 'Change the type of full_name' })
  expect(await within(dialog).findByRole('alert')).toBeInTheDocument()
  expect(within(dialog).getByRole('button', { name: 'Change type' })).toBeDisabled()
})

test('a new table starts with an identity primary key and opens once created', async () => {
  const { applied } = serve()
  const { router } = renderApp('/tables/public/users')
  await userEvent.click(await screen.findByRole('button', { name: 'New table' }))
  const dialog = await screen.findByRole('dialog', { name: 'New table' })
  await userEvent.type(within(dialog).getByLabelText('Table name'), 'notes')
  const confirm = within(dialog).getByRole('button', { name: 'Create table' })
  expect(await within(dialog).findByText('-- create_table notes;')).toBeInTheDocument()
  await waitFor(() => expect(confirm).toBeEnabled())
  await userEvent.click(confirm)
  await waitFor(() => expect(router.state.location.pathname).toBe('/c/env/tables/public/notes'))
  expect(applied[0]).toEqual({
    kind: 'create_table',
    schema: 'public',
    table: 'notes',
    columns: [{ name: 'id', type: { name: 'bigint' }, not_null: false, identity: 'by_default' }],
    primary_key: ['id'],
  })
})

test('read-only connections offer no structure changes', async () => {
  serve()
  server.use(http.get('*/api/v1/config', () => HttpResponse.json({ ...config, read_only: true })))
  renderApp('/tables/public/users?tab=structure')
  expect(await screen.findByText('full_name')).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Add column' })).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Change column full_name' })).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'New table' })).not.toBeInTheDocument()
})
