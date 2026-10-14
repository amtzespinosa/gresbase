import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { config, server } from '@/test/msw'
import { renderApp } from '@/test/render'

const freeConfig = (over = {}) =>
  http.get('*/api/v1/config', () =>
    HttpResponse.json({ ...config, auth_enabled: true, free_mode: true, ...over }),
  )

beforeEach(() => localStorage.removeItem('gresbase:recent-connections'))

test('free mode: Postgres credentials sign in and the connection is remembered without its password', async () => {
  let body: unknown
  server.use(
    freeConfig(),
    http.post('*/api/v1/auth/connect', async ({ request }) => {
      body = await request.json()
      return HttpResponse.json({ auth_enabled: true, username: 'app@db/sales', role: 'user' })
    }),
  )
  const { router } = renderApp('/login')
  expect(await screen.findByRole('heading', { name: 'Connect to PostgreSQL' })).toBeInTheDocument()
  expect(screen.queryByLabelText('Read-only')).not.toBeInTheDocument()
  await userEvent.type(screen.getByLabelText('Host'), 'db')
  await userEvent.type(screen.getByLabelText('Database'), 'sales')
  await userEvent.type(screen.getByLabelText('User'), 'app')
  await userEvent.type(screen.getByLabelText('Password'), 'pw-123')
  await userEvent.click(screen.getByRole('button', { name: 'Connect' }))

  await waitFor(() => expect(router.state.location.pathname).toMatch(/^\/c\/env\/tables/))
  expect(body).toMatchObject({
    host: 'db',
    port: 5432,
    database: 'sales',
    user: 'app',
    password: 'pw-123',
  })
  const stored = localStorage.getItem('gresbase:recent-connections') ?? ''
  expect(JSON.parse(stored)).toEqual([
    { host: 'db', port: 5432, database: 'sales', user: 'app', sslmode: 'prefer' },
  ])
  expect(stored).not.toContain('pw-123')
})

test('recent connections fill the form and a failure says why', async () => {
  localStorage.setItem(
    'gresbase:recent-connections',
    JSON.stringify([{ host: 'db1', port: 6432, database: 'crm', user: 'ana', sslmode: 'require' }]),
  )
  server.use(
    freeConfig(),
    http.post('*/api/v1/auth/connect', () =>
      HttpResponse.json(
        { error: { code: 'connection_failed', message: 'x', reason: 'authentication' } },
        { status: 422 },
      ),
    ),
  )
  renderApp('/login')
  expect(await screen.findByRole('button', { name: 'ana@db1:6432/crm' })).toBeInTheDocument()
  expect(screen.getByLabelText('Host')).toHaveValue('db1')
  expect(screen.getByLabelText('User')).toHaveValue('ana')
  await userEvent.type(screen.getByLabelText('Password'), 'wrong')
  await userEvent.click(screen.getByRole('button', { name: 'Connect' }))
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'PostgreSQL rejected the user or password.',
  )
})

test('a server fixed by the environment is shown locked', async () => {
  server.use(freeConfig({ db_host: 'pg.internal', db_port: 5433 }))
  renderApp('/login')
  expect(await screen.findByLabelText('Host')).toHaveValue('pg.internal')
  expect(screen.getByLabelText('Host')).toBeDisabled()
  expect(screen.getByLabelText('Port')).toHaveValue('5433')
})

test('with server, database and user fixed, only the password is asked', async () => {
  let body: unknown
  localStorage.setItem(
    'gresbase:recent-connections',
    JSON.stringify([{ host: 'db1', port: 6432, database: 'crm', user: 'ana', sslmode: 'require' }]),
  )
  server.use(
    freeConfig({ db_host: 'pg.internal', db_port: 5433, db_name: 'sales', db_user: 'reader' }),
    http.post('*/api/v1/auth/connect', async ({ request }) => {
      body = await request.json()
      return HttpResponse.json({
        auth_enabled: true,
        username: 'reader@pg.internal:5433/sales',
        role: 'user',
      })
    }),
  )
  renderApp('/login')
  await screen.findByRole('heading', { name: 'Connect to PostgreSQL' })
  const password = screen.getByLabelText('Password')
  expect(password).toHaveFocus()
  for (const [label, value] of [
    ['Host', 'pg.internal'],
    ['Port', '5433'],
    ['Database', 'sales'],
    ['User', 'reader'],
  ] as const) {
    expect(screen.getByLabelText(label)).toHaveValue(value)
    expect(screen.getByLabelText(label)).toBeDisabled()
  }
  // Nothing left to fill from a URL or a recent connection.
  expect(screen.queryByLabelText('Connection URL')).not.toBeInTheDocument()
  expect(screen.queryByText('Recent')).not.toBeInTheDocument()
  await userEvent.type(password, 'pw-123')
  await userEvent.click(screen.getByRole('button', { name: 'Connect' }))
  await waitFor(() => expect(body).toMatchObject({ password: 'pw-123' }))
  expect(JSON.parse(localStorage.getItem('gresbase:recent-connections') ?? '[]')[0]).toEqual({
    host: 'pg.internal',
    port: 5433,
    database: 'sales',
    user: 'reader',
    sslmode: 'require', // the SSL choice of the last connection stays
  })
})

test('signed in, the SQL editor keeps its queries card and saves without connection folders', async () => {
  const created: unknown[] = []
  server.use(
    freeConfig(),
    http.get('*/api/v1/snippets', () => HttpResponse.json([])),
    http.post('*/api/v1/snippets', async ({ request }) => {
      const body = (await request.json()) as { path: string; sql: string }
      created.push(body)
      return HttpResponse.json({ ...body, modified_at: '2026-01-01T00:00:00Z' }, { status: 201 })
    }),
  )
  renderApp('/sql')
  // Same card as with a saved connection: saved queries (private to this user) and history.
  expect(await screen.findByRole('region', { name: 'Saved' })).toBeInTheDocument()
  expect(screen.getByRole('region', { name: 'History' })).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Save' }))
  const dialog = await screen.findByRole('dialog', { name: 'Save query' })
  // The connection id changes with every session: no "only this connection" folder.
  expect(within(dialog).queryByRole('checkbox')).not.toBeInTheDocument()
  await userEvent.type(within(dialog).getByRole('textbox'), 'mine')
  await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }))
  await waitFor(() => expect(created).toEqual([{ path: 'mine.sql', sql: '' }]))
})

test('the connection card menu switches connection or disconnects, each after a confirmation', async () => {
  let logouts = 0
  server.use(
    freeConfig(),
    http.post('*/api/v1/auth/logout', () => {
      logouts++
      return new HttpResponse(null, { status: 204 })
    }),
  )
  const { router } = renderApp('/tables')
  const openMenu = async () => {
    await userEvent.click(await screen.findByRole('button', { name: 'Session options' }))
    return screen.findByRole('menu')
  }
  // No buttons on the card itself: they overflowed.
  expect(screen.queryByRole('button', { name: 'Disconnect' })).not.toBeInTheDocument()

  const menu = await openMenu()
  expect(
    within(menu)
      .getAllByRole('menuitem')
      .map((i) => i.textContent),
  ).toEqual(['Switch connection', 'Disconnect'])
  await userEvent.click(within(menu).getByRole('menuitem', { name: 'Disconnect' }))
  let dialog = await screen.findByRole('dialog', { name: 'Disconnect?' })
  await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))
  expect(logouts).toBe(0)

  await userEvent.click(
    within(await openMenu()).getByRole('menuitem', { name: 'Switch connection' }),
  )
  dialog = await screen.findByRole('dialog', { name: 'Switch connection?' })
  await userEvent.click(within(dialog).getByRole('button', { name: 'Switch connection' }))
  await waitFor(() => expect(router.state.location.pathname).toBe('/login'))
  expect(logouts).toBe(0)
})

test('disconnect ends the session after its confirmation', async () => {
  let logouts = 0
  server.use(
    freeConfig(),
    http.post('*/api/v1/auth/logout', () => {
      logouts++
      return new HttpResponse(null, { status: 204 })
    }),
  )
  const { router } = renderApp('/tables')
  await userEvent.click(await screen.findByRole('button', { name: 'Session options' }))
  await userEvent.click(await screen.findByRole('menuitem', { name: 'Disconnect' }))
  const dialog = await screen.findByRole('dialog', { name: 'Disconnect?' })
  await userEvent.click(within(dialog).getByRole('button', { name: 'Disconnect' }))
  await waitFor(() => expect(logouts).toBe(1))
  await waitFor(() => expect(router.state.location.pathname).toBe('/login'))
})
