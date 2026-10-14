import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import type {
  ConnectionEntry,
  ConnectionList,
  Entry,
  SavedConnectionInput,
} from '@/lib/api/types.gen'
import { connection, connections, server } from '@/test/msw'
import { renderApp } from '@/test/render'

const staging: ConnectionEntry = {
  id: 'c2',
  source: 'saved',
  name: 'staging',
  color: 'red',
  host: 'stage-db',
  port: 5432,
  database: 'stage',
  user: 'u',
  sslmode: 'prefer',
  read_only: false,
  locked: false,
}

/** The env connection plus `staging`; each connection has its own schemas and database name. */
function twoConnections(extra: ConnectionEntry[] = []) {
  const list: ConnectionList = {
    ...connections,
    connections: [...connections.connections, staging, ...extra],
  }
  const seen: string[] = []
  server.use(
    http.get('*/api/v1/connections', () => HttpResponse.json(list)),
    http.get('*/api/v1/c/:conn/schemas', ({ params }) => {
      seen.push(String(params.conn))
      return HttpResponse.json(params.conn === 'c2' ? ['public', 'stage_only'] : ['public'])
    }),
    http.get('*/api/v1/c/:conn/connection', ({ params }) =>
      HttpResponse.json(
        params.conn === 'c2'
          ? { ...connection, database: 'stage', server_version: '16.4', server_version_num: 160004 }
          : connection,
      ),
    ),
  )
  return { list, seen }
}

test('routes carry the connection and its API calls go to it', async () => {
  const { seen } = twoConnections()
  const { router } = renderApp('/c/c2/tables')
  expect(await screen.findByRole('heading', { name: 'Tables' })).toBeInTheDocument()
  await waitFor(() => expect(seen).toContain('c2'))
  expect(seen).not.toContain('env')
  // The card shows the saved name and its label color.
  expect(screen.getByText('staging')).toBeInTheDocument()
  expect(screen.getByTestId('connection-stripe')).toHaveStyle({ background: 'var(--label-red)' })
  expect(router.state.location.pathname).toBe('/c/c2/tables')
})

test('the selector lists connections with status and version, and switching forgets the cache', async () => {
  const { seen } = twoConnections()
  const { router } = renderApp('/c/env/tables')
  await screen.findByRole('heading', { name: 'Tables' })
  await waitFor(() => expect(seen).toEqual(['env']))

  await userEvent.click(screen.getByRole('button', { name: 'Switch connection' }))
  const menu = await screen.findByRole('menu')
  const item = within(menu).getByRole('menuitem', { name: /staging/ })
  expect(await within(item).findByText('PG 16.4')).toBeInTheDocument()
  await userEvent.click(item)

  await waitFor(() => expect(router.state.location.pathname).toBe('/c/c2/tables'))
  await waitFor(() => expect(seen).toContain('c2'))
  expect(await screen.findByText('staging')).toBeInTheDocument()
})

test('the palette switches to another connection', async () => {
  twoConnections()
  const { router } = renderApp('/c/env/tables')
  await screen.findByRole('heading', { name: 'Tables' })
  await userEvent.keyboard('{Control>}k{/Control}')
  await userEvent.click(await screen.findByRole('option', { name: 'Switch to staging' }))
  await waitFor(() => expect(router.state.location.pathname).toBe('/c/c2/tables'))
})

test('settings: add, edit (keeping the password) and delete saved connections; env is locked', async () => {
  const { list } = twoConnections()
  const bodies: { method: string; url: string; body?: SavedConnectionInput }[] = []
  server.use(
    http.post('*/api/v1/connections', async ({ request }) => {
      const body = (await request.json()) as SavedConnectionInput
      bodies.push({ method: 'POST', url: request.url, body })
      const created = { ...staging, id: 'c3', name: body.name, color: body.color }
      list.connections.push(created)
      return HttpResponse.json(created, { status: 201 })
    }),
    http.put('*/api/v1/connections/:id', async ({ request }) => {
      bodies.push({
        method: 'PUT',
        url: request.url,
        body: (await request.json()) as SavedConnectionInput,
      })
      return HttpResponse.json(staging)
    }),
    http.delete('*/api/v1/connections/:id', ({ request }) => {
      bodies.push({ method: 'DELETE', url: request.url })
      return new HttpResponse(null, { status: 204 })
    }),
  )
  renderApp('/c/env/settings')
  const section = await screen.findByRole('region', { name: 'Connections' })
  // DATABASE_URL's connection: locked, no edit or delete.
  expect(within(section).getByLabelText(/Defined by DATABASE_URL/)).toBeInTheDocument()
  expect(within(section).queryByRole('button', { name: 'Edit app' })).not.toBeInTheDocument()

  await userEvent.click(within(section).getByRole('button', { name: 'Add connection' }))
  let dialog = await screen.findByRole('dialog', { name: 'New connection' })
  await userEvent.type(within(dialog).getByRole('textbox', { name: 'Name' }), 'prod')
  await userEvent.click(within(dialog).getByRole('radio', { name: 'Green' }))
  await userEvent.type(within(dialog).getByRole('textbox', { name: 'Host' }), 'prod-db')
  await userEvent.type(within(dialog).getByRole('textbox', { name: 'User' }), 'app')
  await userEvent.click(within(dialog).getByRole('button', { name: 'Save connection' }))
  await waitFor(() => expect(bodies).toHaveLength(1))
  expect(bodies[0]?.body).toMatchObject({
    name: 'prod',
    color: 'green',
    connection: { host: 'prod-db', user: 'app', port: 5432 },
  })

  await userEvent.click(within(section).getByRole('button', { name: 'Edit staging' }))
  dialog = await screen.findByRole('dialog', { name: 'Edit staging' })
  expect(within(dialog).getByPlaceholderText('Leave empty to keep the current one')).toHaveValue('')
  await userEvent.click(within(dialog).getByRole('button', { name: 'Save connection' }))
  await waitFor(() => expect(bodies).toHaveLength(2))
  expect(bodies[1]).toMatchObject({ method: 'PUT', body: { connection: { password: '' } } })
  expect(bodies[1]?.url).toMatch(/\/api\/v1\/connections\/c2$/)

  await userEvent.click(within(section).getByRole('button', { name: 'Delete staging' }))
  await userEvent.click(
    within(await screen.findByRole('dialog')).getByRole('button', { name: 'Delete connection' }),
  )
  await waitFor(() => expect(bodies.at(-1)?.method).toBe('DELETE'))
})

test("saved queries: this connection's own first, others' hidden, shared under All connections", async () => {
  twoConnections()
  const at = '2026-10-09T10:00:00Z'
  const entries: Entry[] = ['@c2', '@c2/mine.sql', '@env', '@env/theirs.sql', 'shared.sql'].map(
    (path) => ({ path, folder: !path.endsWith('.sql'), size: 1, modified_at: at }),
  )
  server.use(http.get('*/api/v1/snippets', () => HttpResponse.json(entries)))
  renderApp('/c/c2/sql')
  const saved = await screen.findByRole('region', { name: 'Saved' })
  expect(await within(saved).findByRole('link', { name: 'mine' })).toBeInTheDocument()
  expect(within(saved).getByText('All connections')).toBeInTheDocument()
  expect(within(saved).getByRole('link', { name: 'shared' })).toBeInTheDocument()
  expect(within(saved).queryByText('theirs')).not.toBeInTheDocument()
  expect(within(saved).queryByText('@c2')).not.toBeInTheDocument()
})
