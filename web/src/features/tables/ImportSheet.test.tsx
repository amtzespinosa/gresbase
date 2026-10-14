import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import type { Column, ImportResult } from '@/lib/api/types.gen'
import { config, emptyTable, server } from '@/test/msw'
import { renderApp } from '@/test/render'

const col = (name: string, extra: Partial<Column> = {}): Column => ({
  position: 1,
  name,
  type: 'text',
  base_type: 'text',
  is_array: false,
  enum_values: [],
  not_null: false,
  default: null,
  identity: '',
  generated: null,
  comment: null,
  ...extra,
})

const orgs = {
  ...emptyTable('public', 'orgs'),
  columns: [
    col('id', { type: 'bigint', identity: 'always', not_null: true }),
    col('name', { not_null: true }),
    col('plan', { type: 'plan_t', default: "'free'::plan_t" }),
  ],
  primary_key: ['id'],
  has_primary_key: true,
}

/** Serves orgs and answers imports with result, recording the parts of each request. */
function serve(result: ImportResult) {
  const calls: { names: string[]; options: unknown; file: string }[] = []
  server.use(
    http.get('*/api/v1/c/:conn/tables/public/orgs', () => HttpResponse.json(orgs)),
    http.post('*/api/v1/c/:conn/tables/public/orgs/import', async ({ request }) => {
      const form = await request.formData()
      calls.push({
        names: [...form.keys()],
        options: JSON.parse(String(form.get('options'))),
        file: await (form.get('file') as File).text(),
      })
      return HttpResponse.json(result)
    }),
  )
  return calls
}

async function open(csv: string) {
  await userEvent.click(await screen.findByRole('button', { name: 'Import CSV' }))
  const sheet = await screen.findByRole('dialog', { name: 'Import CSV into orgs' })
  await userEvent.upload(
    within(sheet).getByLabelText('CSV file'),
    new File([csv], 'orgs.csv', { type: 'text/csv' }),
  )
  return sheet
}

test('imports with the detected delimiter, header and name mapping', async () => {
  const calls = serve({ inserted: 2, errors: [] })
  renderApp('/tables/public/orgs')
  const csv = 'Name;Extra\nAcme;x\nGlobex;y\n'
  const sheet = await open(csv)

  expect(await within(sheet).findByText('Preview · first 2 rows')).toBeInTheDocument()
  expect(within(sheet).getByRole('checkbox', { name: 'First row is a header' })).toBeChecked()
  // id is set by the database: no mapping for it.
  expect(within(sheet).queryByLabelText(/^id/)).toBeNull()
  expect(within(sheet).getByLabelText(/^name/)).toHaveTextContent('Name')
  expect(within(sheet).getByLabelText(/^plan/)).toHaveTextContent('Use the default')

  await userEvent.click(within(sheet).getByRole('button', { name: 'Import' }))
  expect(await screen.findByText('2 rows imported')).toBeInTheDocument()
  expect(calls).toEqual([
    {
      names: ['options', 'file'],
      options: {
        delimiter: ';',
        header: true,
        empty_as_null: true,
        mapping: [{ column: 'name', source: 0 }],
      },
      file: csv,
    },
  ])
})

test('shows the rejected rows and keeps the sheet open', async () => {
  serve({
    inserted: 0,
    errors: [
      { row: 3, column: 'plan', message: 'invalid input value for enum plan_t: "gold"' },
      { row: 5, message: 'duplicate key value violates unique constraint "orgs_name_key"' },
    ],
  })
  renderApp('/tables/public/orgs')
  const sheet = await open('name,plan\nA,free\nB,gold\nC,pro\nA,pro\n')
  await within(sheet).findByText('Preview · first 4 rows')
  expect(within(sheet).getByLabelText(/^plan/)).toHaveTextContent('plan')
  await userEvent.click(within(sheet).getByRole('button', { name: 'Import' }))

  const alert = await within(sheet).findByRole('alert')
  expect(alert).toHaveTextContent('Nothing was imported: 2 rows have errors.')
  expect(alert).toHaveTextContent('Line 3 · plan — invalid input value for enum plan_t: "gold"')
  expect(alert).toHaveTextContent('Line 5 — duplicate key value')
})

test('no import in read-only mode', async () => {
  serve({ inserted: 0, errors: [] })
  server.use(http.get('*/api/v1/config', () => HttpResponse.json({ ...config, read_only: true })))
  renderApp('/tables/public/orgs')
  await screen.findAllByText('Read-only')
  expect(screen.queryByRole('button', { name: 'Import CSV' })).toBeNull()
})

test('no import for views', async () => {
  serve({ inserted: 0, errors: [] })
  server.use(
    http.get('*/api/v1/c/:conn/tables/public/orgs', () =>
      HttpResponse.json({ ...orgs, kind: 'view' }),
    ),
  )
  renderApp('/tables/public/orgs')
  await screen.findByRole('button', { name: 'View SQL' })
  expect(screen.queryByRole('button', { name: 'Import CSV' })).toBeNull()
})
