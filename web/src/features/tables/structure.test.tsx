import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import type { Column, ForeignKey, Query, Table } from '@/lib/api/types.gen'
import { emptyTable, server } from '@/test/msw'
import { renderApp } from '@/test/render'

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

const fk = (
  table: string,
  columns: string[],
  refTable: string,
  onDelete = 'no_action',
): ForeignKey => ({
  name: `${table}_${columns.join('_')}_fkey`,
  schema: 'public',
  table,
  columns,
  ref_schema: 'public',
  ref_table: refTable,
  ref_columns: ['id'],
  on_delete: onDelete,
  on_update: 'no_action',
})

const invoices: Table = {
  ...emptyTable('public', 'invoices'),
  columns: [
    col('id', 'bigint', { base_type: 'int8', not_null: true, identity: 'always' }),
    col('org_id', 'bigint', { base_type: 'int8', not_null: true }),
    col('total', 'numeric(12,2)', { not_null: true, default: '0' }),
  ],
  primary_key: ['id'],
  has_primary_key: true,
  constraints: [
    {
      name: 'invoices_pkey',
      type: 'primary_key',
      columns: ['id'],
      definition: 'PRIMARY KEY (id)',
      validated: true,
    },
  ],
  foreign_keys: [fk('invoices', ['org_id'], 'orgs')],
  referenced_by: [fk('invoice_items', ['invoice_id'], 'invoices', 'cascade')],
  indexes: [
    {
      name: 'invoices_pkey',
      definition: 'CREATE UNIQUE INDEX invoices_pkey ON public.invoices USING btree (id)',
      is_unique: true,
      is_primary: true,
      size_bytes: 16384,
      scans: 42,
    },
  ],
  sizes: { total: 65536, table: 49152, indexes: 16384 },
}

const orgs: Table = {
  ...emptyTable('public', 'orgs'),
  columns: [col('id', 'bigint', { base_type: 'int8' }), col('name', 'text')],
  primary_key: ['id'],
  has_primary_key: true,
  referenced_by: [fk('invoices', ['org_id'], 'orgs')],
}

beforeEach(() => {
  vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(4000)
  vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(1000)
})
afterEach(() => vi.restoreAllMocks())

function serve() {
  const orgQueries: Query[] = []
  const refQueries: string[] = []
  server.use(
    http.get('*/api/v1/c/:conn/tables/public/invoices', () => HttpResponse.json(invoices)),
    http.get('*/api/v1/c/:conn/tables/public/orgs', () => HttpResponse.json(orgs)),
    http.get('*/api/v1/c/:conn/tables/public/invoices/ddl', () =>
      HttpResponse.json({ ddl: 'CREATE TABLE public.invoices (\n    id bigint\n);\n' }),
    ),
    http.post('*/api/v1/c/:conn/tables/public/invoices/rows\\:query', () =>
      HttpResponse.json({
        columns: invoices.columns.map((c) => ({ name: c.name, type: c.type })),
        rows: [['1', '7', '10.00']],
        next_cursor: null,
        has_more: false,
      }),
    ),
    http.post('*/api/v1/c/:conn/tables/public/orgs/rows\\:query', async ({ request }) => {
      orgQueries.push((await request.json()) as Query)
      return HttpResponse.json({
        columns: [
          { name: 'id', type: 'bigint' },
          { name: 'name', type: 'text' },
        ],
        rows: [['7', 'Acme']],
        next_cursor: null,
        has_more: false,
      })
    }),
    http.get('*/api/v1/c/:conn/tables/public/orgs/rows/referenced-by', ({ request }) => {
      refQueries.push(new URL(request.url).searchParams.get('pk') ?? '')
      return HttpResponse.json([
        {
          constraint: 'invoices_org_id_fkey',
          schema: 'public',
          table: 'invoices',
          columns: ['org_id'],
          ref_columns: ['id'],
          count: 12,
        },
      ])
    }),
  )
  return { orgQueries, refQueries }
}

test('structure tab shows columns, indexes, constraints, keys, sizes and copyable DDL', async () => {
  serve()
  const writeText = vi.fn().mockResolvedValue(undefined)
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
  renderApp('/tables/public/invoices?tab=structure')

  const columns = within(await screen.findByRole('region', { name: 'Columns' }))
  expect(columns.getByText('Identity (always)')).toBeInTheDocument()
  expect(columns.getByText('numeric(12,2)')).toBeInTheDocument()
  expect(columns.getByLabelText('Primary key')).toBeInTheDocument()
  const indexes = within(screen.getByRole('region', { name: 'Indexes' }))
  expect(indexes.getByText(/CREATE UNIQUE INDEX invoices_pkey/)).toBeInTheDocument()
  expect(indexes.getByText('42')).toBeInTheDocument()
  expect(
    within(screen.getByRole('region', { name: 'Constraints' })).getByText('Primary key'),
  ).toBeInTheDocument()
  const keys = within(screen.getByRole('region', { name: 'Foreign keys' }))
  expect(keys.getByRole('link', { name: 'public.orgs (id)' })).toHaveAttribute(
    'href',
    '/c/env/tables/public/orgs',
  )
  expect(within(screen.getByRole('region', { name: 'Triggers' })).getByText('None.')).toBeVisible()
  expect(within(screen.getByRole('region', { name: 'Sizes' })).getByText('64 kB')).toBeVisible()

  const ddl = within(screen.getByRole('region', { name: 'DDL' }))
  expect(await ddl.findByText(/CREATE TABLE public.invoices/)).toBeInTheDocument()
  await userEvent.click(ddl.getByRole('button', { name: 'Copy' }))
  expect(writeText).toHaveBeenCalledWith('CREATE TABLE public.invoices (\n    id bigint\n);\n')
  expect(ddl.getByRole('button', { name: 'Copied' })).toBeInTheDocument()
})

test('relations tab lists outgoing and incoming keys with links', async () => {
  serve()
  renderApp('/tables/public/invoices?tab=relations')
  const out = within(await screen.findByRole('region', { name: 'Points to' }))
  expect(out.getByRole('link', { name: 'public.orgs (id)' })).toBeInTheDocument()
  const inc = within(screen.getByRole('region', { name: 'Referenced by' }))
  expect(inc.getByRole('link', { name: 'public.invoice_items (invoice_id)' })).toHaveAttribute(
    'href',
    '/c/env/tables/public/invoice_items',
  )
  expect(inc.getByText('CASCADE')).toBeInTheDocument()
})

test('clicking a foreign key opens the referenced row, who references it, and the table', async () => {
  const { orgQueries, refQueries } = serve()
  const { router } = renderApp('/tables/public/invoices')
  const grid = within(await screen.findByRole('grid', { name: 'Rows of invoices' }))
  await userEvent.click(await grid.findByRole('button', { name: 'Open referenced row 7' }))

  const sheet = within(await screen.findByRole('dialog', { name: 'public.orgs' }))
  expect(await sheet.findByText('Acme')).toBeInTheDocument()
  expect(orgQueries.at(-1)).toMatchObject({
    filters: [{ column: 'id', op: 'eq', value: '7' }],
    limit: 1,
  })
  // Referenced by: 12 invoices point at this org; the link filters them by org_id.
  expect(await sheet.findByText('12 rows')).toBeInTheDocument()
  expect(JSON.parse(refQueries.at(-1) ?? '')).toEqual({ id: '7' })
  const link = sheet.getByRole('link', { name: 'public.invoices (org_id)' })
  expect(decodeURIComponent(link.getAttribute('href') ?? '')).toContain('"column":"org_id"')

  await userEvent.click(sheet.getByRole('button', { name: 'Open table' }))
  await waitFor(() => expect(router.state.location.pathname).toBe('/c/env/tables/public/orgs'))
  expect(router.state.location.search).toMatchObject({
    filters: [{ column: 'id', op: 'eq', value: '7' }],
  })
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
})
