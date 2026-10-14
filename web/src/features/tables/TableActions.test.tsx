import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { config, emptyTable, server } from '@/test/msw'
import { renderApp } from '@/test/render'
import { useTableTabs } from './tabs'

interface Call {
  method: string
  url: string
  body: unknown
}

/** Serves `invoices` (a table with dependents) and records truncate/drop calls. */
function serve() {
  const calls: Call[] = []
  let dropped = false
  const record = async ({ request }: { request: Request }) => {
    calls.push({
      method: request.method,
      url: new URL(request.url).pathname,
      body: await request.json(),
    })
    dropped ||= request.method === 'DELETE'
    return new HttpResponse(null, { status: 204 })
  }
  server.use(
    http.get('*/api/v1/c/:conn/schemas/public/relations', () =>
      HttpResponse.json(
        dropped
          ? []
          : [
              {
                schema: 'public',
                name: 'invoices',
                kind: 'table',
                estimated_rows: 10,
                total_bytes: 0,
                comment: null,
                partitions: [],
              },
            ],
      ),
    ),
    http.get('*/api/v1/c/:conn/tables/public/invoices/dependents', () =>
      HttpResponse.json({
        truncate: ['public.invoice_items', 'billing.payments'],
        drop: ['constraint payments_invoice_id_fkey on table billing.payments'],
      }),
    ),
    http.post('*/api/v1/c/:conn/tables/public/invoices\\:truncate', record),
    http.delete('*/api/v1/c/:conn/tables/public/invoices', record),
  )
  return calls
}

/** Opens the header menu and picks an item. */
async function choose(item: string) {
  await userEvent.click(await screen.findByRole('button', { name: 'Actions for invoices' }))
  await userEvent.click(await screen.findByRole('menuitem', { name: item }))
}

/** The context menu of a table in the list, opened with a right click. */
async function contextMenu(name: RegExp) {
  const list = await screen.findByRole('region', { name: 'Tables' })
  fireEvent.contextMenu(await within(list).findByRole('link', { name }))
  return screen.findByRole('menu')
}

const items = (menu: HTMLElement) =>
  within(menu)
    .getAllByRole('menuitem')
    .map((i) => i.textContent)

test('emptying a table needs its exact name and sends the chosen options', async () => {
  const calls = serve()
  renderApp('/tables/public/invoices')
  await choose('Empty table…')

  const dialog = await screen.findByRole('dialog', { name: 'Empty public.invoices' })
  expect(await within(dialog).findByText('2 tables reference it')).toBeInTheDocument()
  expect(dialog).toHaveTextContent('billing.payments')
  const confirm = within(dialog).getByRole('button', { name: 'Empty table' })
  expect(confirm).toBeDisabled()

  const input = within(dialog).getByLabelText('Type invoices to confirm')
  await userEvent.type(input, 'Invoices')
  expect(confirm).toBeDisabled()
  await userEvent.clear(input)
  await userEvent.type(input, 'invoices')
  expect(confirm).toBeEnabled()

  await userEvent.click(
    within(dialog).getByLabelText('Also empty the tables that reference it (CASCADE)'),
  )
  await userEvent.click(confirm)
  await screen.findByText('invoices is now empty')
  expect(calls).toEqual([
    {
      method: 'POST',
      url: '/api/v1/c/env/tables/public/invoices:truncate',
      body: { restart_identity: false, cascade: true, confirm: 'invoices' },
    },
  ])
})

test('deleting a table leaves its page', async () => {
  const calls = serve()
  const { router } = renderApp('/tables/public/invoices')
  await choose('Delete table…')
  const dialog = await screen.findByRole('dialog', { name: 'Delete public.invoices' })
  expect(await within(dialog).findByText('1 object depends on it')).toBeInTheDocument()
  await userEvent.type(within(dialog).getByLabelText('Type invoices to confirm'), 'invoices{Enter}')

  await screen.findByText('invoices was deleted')
  expect(calls[0]).toMatchObject({
    method: 'DELETE',
    body: { cascade: false, confirm: 'invoices' },
  })
  await waitFor(() =>
    expect(router.state.location.pathname).not.toBe('/c/env/tables/public/invoices'),
  )
})

test('views have no table actions', async () => {
  serve()
  server.use(
    http.get('*/api/v1/c/:conn/tables/public/active_users', () =>
      HttpResponse.json({ ...emptyTable('public', 'active_users'), kind: 'view' }),
    ),
  )
  renderApp('/tables/public/active_users')
  await screen.findByRole('heading', { name: /active_users/ })
  expect(screen.queryByRole('button', { name: 'Actions for active_users' })).toBeNull()
})

test('the table list has a context menu with every action; dangerous ones apart, in red', async () => {
  const calls = serve()
  renderApp('/tables/public/invoices')
  const menu = await contextMenu(/invoices/)
  expect(items(menu)).toEqual([
    'Open',
    'Open in new tab',
    'Add to favorites',
    'Copy name',
    'View structure',
    'Export CSV',
    'Import CSV…',
    'Empty table…',
    'Delete table…',
  ])
  expect(within(menu).getByRole('menuitem', { name: 'Delete table…' })).toHaveClass('text-danger')
  expect(within(menu).getByRole('menuitem', { name: 'Open' })).not.toHaveClass('text-danger')
  // The same confirmation as the header menu.
  await userEvent.click(within(menu).getByRole('menuitem', { name: 'Empty table…' }))
  const dialog = await screen.findByRole('dialog', { name: 'Empty public.invoices' })
  await userEvent.type(within(dialog).getByLabelText('Type invoices to confirm'), 'invoices{Enter}')
  await screen.findByText('invoices is now empty')
  expect(calls[0]).toMatchObject({ method: 'POST', body: { confirm: 'invoices' } })
})

test('the context menu opens from the keyboard (Shift+F10, Menu key) and acts', async () => {
  serve()
  const writeText = vi.fn(() => Promise.resolve())
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
  const { router } = renderApp('/tables/public/invoices')
  const list = await screen.findByRole('region', { name: 'Tables' })
  const link = await within(list).findByRole('link', { name: /invoices/ })
  link.focus()
  await userEvent.keyboard('{Shift>}{F10}{/Shift}')
  await userEvent.click(await screen.findByRole('menuitem', { name: 'Copy name' }))
  expect(writeText).toHaveBeenCalledWith('invoices')
  await screen.findByText('Copied invoices')

  fireEvent.keyDown(link, { key: 'ContextMenu' })
  await userEvent.click(await screen.findByRole('menuitem', { name: 'View structure' }))
  await waitFor(() => expect(router.state.location.search).toMatchObject({ tab: 'structure' }))

  fireEvent.keyDown(link, { key: 'ContextMenu' })
  await userEvent.click(await screen.findByRole('menuitem', { name: 'Add to favorites' }))
  await waitFor(() =>
    expect(useTableTabs.getState().byConnection.env?.favorites).toEqual([
      { schema: 'public', table: 'invoices' },
    ]),
  )
  fireEvent.keyDown(link, { key: 'ContextMenu' })
  expect(await screen.findByRole('menuitem', { name: 'Remove from favorites' })).toBeInTheDocument()
})

test('the context menu of a view has no writing actions', async () => {
  serve()
  server.use(
    http.get('*/api/v1/c/:conn/schemas/public/relations', () =>
      HttpResponse.json([
        {
          schema: 'public',
          name: 'active_users',
          kind: 'view',
          estimated_rows: null,
          total_bytes: 0,
          comment: null,
          partitions: [],
        },
      ]),
    ),
  )
  renderApp('/tables/public/active_users')
  expect(items(await contextMenu(/active_users/))).toEqual([
    'Open',
    'Open in new tab',
    'Add to favorites',
    'Copy name',
    'View structure',
    'Export CSV',
  ])
})

test('read-only mode hides the actions', async () => {
  serve()
  server.use(http.get('*/api/v1/config', () => HttpResponse.json({ ...config, read_only: true })))
  renderApp('/tables/public/invoices')
  await screen.findByRole('link', { name: /invoices/ })
  await screen.findAllByText('Read-only')
  expect(screen.queryByRole('button', { name: 'Actions for invoices' })).toBeNull()
  const menu = await contextMenu(/invoices/)
  expect(items(menu)).not.toContain('Import CSV…')
  expect(items(menu)).not.toContain('Empty table…')
  expect(items(menu)).not.toContain('Delete table…')
  expect(items(menu)).toContain('Export CSV')
})
