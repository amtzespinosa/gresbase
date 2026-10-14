import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import type { Column, StructureChange, Table } from '@/lib/api/types.gen'
import { emptyTable, server } from '@/test/msw'
import { renderApp } from '@/test/render'
import { pick } from '@/test/select'

const column = (position: number, name: string, type = 'integer'): Column => ({
  position,
  name,
  type,
  base_type: 'int4',
  is_array: false,
  enum_values: [],
  not_null: false,
  default: null,
  identity: '',
  generated: null,
  comment: null,
})

const orders: Table = {
  ...emptyTable('public', 'orders'),
  columns: [column(1, 'id'), column(2, 'org_id'), column(3, 'qty')],
  primary_key: ['id'],
  constraints: [
    {
      name: 'orders_pkey',
      type: 'primary_key',
      columns: ['id'],
      definition: 'PRIMARY KEY (id)',
      validated: true,
    },
    {
      name: 'qty_pos',
      type: 'check',
      columns: ['qty'],
      definition: 'CHECK ((qty > 0)) NOT VALID',
      validated: false,
    },
  ],
  indexes: [
    {
      name: 'orders_pkey',
      definition: 'CREATE UNIQUE INDEX orders_pkey …',
      is_unique: true,
      is_primary: true,
      size_bytes: 0,
      scans: 0,
    },
    {
      name: 'orders_qty',
      definition: 'CREATE INDEX orders_qty …',
      is_unique: false,
      is_primary: false,
      size_bytes: 0,
      scans: 0,
    },
  ],
}
const orgs: Table = {
  ...emptyTable('public', 'orgs'),
  columns: [column(1, 'id')],
  primary_key: ['id'],
}

/** Serves the tables and the structure endpoints; `applyError` is the body of a failed apply. */
function serve(applyError?: object) {
  const applied: StructureChange[] = []
  server.use(
    http.get('*/api/v1/c/:conn/tables/public/orders', () => HttpResponse.json(orders)),
    http.get('*/api/v1/c/:conn/tables/public/orgs', () => HttpResponse.json(orgs)),
    http.get('*/api/v1/c/:conn/schemas/public/relations', () =>
      HttpResponse.json(
        ['orders', 'orgs'].map((name) => ({
          schema: 'public',
          name,
          kind: 'table',
          estimated_rows: 0,
          total_bytes: 0,
          comment: null,
          partitions: [],
        })),
      ),
    ),
    http.post('*/api/v1/c/:conn/structure\\:preview', async ({ request }) => {
      const c = (await request.json()) as StructureChange
      const concurrently = c.index?.concurrently
      return HttpResponse.json({
        sql: [`-- ${c.kind} ${c.name ?? ''}`.trim()],
        warnings: concurrently ? ['no_transaction', 'scan'] : ['lock'],
      })
    }),
    http.post('*/api/v1/c/:conn/structure', async ({ request }) => {
      applied.push((await request.json()) as StructureChange)
      if (applyError) return HttpResponse.json({ error: applyError }, { status: 400 })
      return HttpResponse.json({ sql: ['--'], warnings: [] })
    }),
  )
  return applied
}

test('a partial index built concurrently shows its warnings and sends its definition', async () => {
  const applied = serve()
  renderApp('/tables/public/orders?tab=structure')
  await userEvent.click(await screen.findByRole('button', { name: 'Add index' }))
  const dialog = await screen.findByRole('dialog', { name: 'New index on public.orders' })
  await pick(within(dialog).getByLabelText('Index column 1'), 'qty')
  await userEvent.click(within(dialog).getByLabelText('Descending'))
  await userEvent.click(within(dialog).getByLabelText('Without blocking writes (CONCURRENTLY)'))
  await userEvent.type(within(dialog).getByLabelText(/Only rows where/), 'qty > 0')
  expect(await within(dialog).findByText(/leaves an invalid index/)).toBeInTheDocument()
  const confirm = within(dialog).getByRole('button', { name: 'Create index' })
  await waitFor(() => expect(confirm).toBeEnabled())
  await userEvent.click(confirm)
  await waitFor(() => expect(applied).toHaveLength(1))
  expect(applied[0]).toEqual({
    kind: 'create_index',
    schema: 'public',
    table: 'orders',
    index: {
      columns: [{ name: 'qty', descending: true }],
      method: 'btree',
      where: 'qty > 0',
      concurrently: true,
    },
  })
})

test('a foreign key the existing rows break says why and stays open', async () => {
  const applied = serve({
    code: 'pg_error',
    message:
      'insert or update on table "orders" violates foreign key constraint "orders_org_id_fkey"',
    detail: 'Key (org_id)=(7) is not present in table "orgs".',
    pg_code: '23503',
  })
  renderApp('/tables/public/orders?tab=structure')
  await userEvent.click(await screen.findByRole('button', { name: 'Add foreign key' }))
  const dialog = await screen.findByRole('dialog', { name: 'New foreign key on public.orders' })
  await pick(within(dialog).getByLabelText('Referenced table'), 'orgs')
  await pick(await within(dialog).findByLabelText('Column 1'), 'org_id')
  await pick(within(dialog).getByLabelText('On delete'), 'CASCADE')
  const confirm = within(dialog).getByRole('button', { name: 'Add foreign key' })
  await waitFor(() => expect(confirm).toBeEnabled())
  await userEvent.click(confirm)
  const alert = await within(dialog).findByRole('alert')
  expect(alert).toHaveTextContent("Some existing rows don't match the foreign key")
  expect(alert).toHaveTextContent('Key (org_id)=(7) is not present in table "orgs".')
  expect(applied[0]?.constraint).toEqual({
    columns: ['org_id'],
    ref_schema: 'public',
    ref_table: 'orgs',
    ref_columns: ['id'],
    on_delete: 'cascade',
    on_update: 'no_action',
  })
})

test('constraints offer validate and delete; indexes behind a constraint cannot be deleted', async () => {
  const applied = serve()
  renderApp('/tables/public/orders?tab=structure')
  await userEvent.click(await screen.findByRole('button', { name: 'Validate' }))
  let dialog = await screen.findByRole('dialog', { name: 'Validate constraint qty_pos' })
  await userEvent.click(within(dialog).getByRole('button', { name: 'Validate' }))
  await waitFor(() => expect(applied).toHaveLength(1))
  expect(applied[0]).toEqual({
    kind: 'validate_constraint',
    schema: 'public',
    table: 'orders',
    name: 'qty_pos',
  })

  expect(screen.queryByRole('button', { name: 'Delete index orders_pkey' })).not.toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Delete index orders_qty' }))
  dialog = await screen.findByRole('dialog', { name: 'Delete index orders_qty' })
  const confirm = within(dialog).getByRole('button', { name: 'Delete index' })
  await userEvent.type(within(dialog).getByLabelText('Type orders_qty to confirm'), 'orders_qty')
  await waitFor(() => expect(confirm).toBeEnabled())
  await userEvent.click(confirm)
  await waitFor(() => expect(applied).toHaveLength(2))
  expect(applied[1]).toEqual({
    kind: 'drop_index',
    schema: 'public',
    table: 'orders',
    name: 'orders_qty',
    confirm: 'orders_qty',
  })
})
