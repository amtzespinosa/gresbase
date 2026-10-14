import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import type { SetupStatus } from '@/lib/api/types.gen'
import { config, server } from '@/test/msw'
import { renderApp } from '@/test/render'

const status: SetupStatus = {
  required: true,
  token_required: false,
  data_persistent: true,
  lang_locked: false,
  account_locked: false,
}

function setupMode(over: Partial<SetupStatus> = {}) {
  server.use(
    http.get('*/api/v1/config', () => HttpResponse.json({ ...config, setup_required: true })),
    http.get('*/api/v1/setup', () => HttpResponse.json({ ...status, ...over })),
  )
}

const next = () => userEvent.click(screen.getByRole('button', { name: 'Next' }))

test('every route leads to the wizard while Gresbase is not set up', async () => {
  setupMode()
  const { router } = renderApp('/tables')
  expect(await screen.findByRole('heading', { name: 'Welcome to Gresbase' })).toBeInTheDocument()
  expect(router.state.location.pathname).toBe('/setup')
})

test('saved mode: account, tested connection and a summary', async () => {
  setupMode()
  let tested: unknown
  let saved: { mode?: string; admin?: unknown; connection?: { host: string } } = {}
  server.use(
    http.post('*/api/v1/setup/test', async ({ request }) => {
      tested = await request.json()
      return HttpResponse.json({
        server_version: '17.2',
        server_version_num: 170002,
        support_level: 'full',
      })
    }),
    http.post('*/api/v1/setup', async ({ request }) => {
      saved = (await request.json()) as typeof saved
      return HttpResponse.json({ signed_in: true })
    }),
  )
  renderApp('/setup')
  await screen.findByRole('heading', { name: 'Welcome to Gresbase' })
  await next()
  expect(screen.getByRole('radio', { name: /Saved connection/ })).toHaveAttribute(
    'aria-checked',
    'true',
  )
  await next()

  // Account: the button waits for a long enough, confirmed password.
  await userEvent.type(screen.getByLabelText('Password'), 'secret-pass')
  await userEvent.type(screen.getByLabelText('Confirm password'), 'secret-pazz')
  expect(screen.getByText("The passwords don't match.")).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled()
  await userEvent.clear(screen.getByLabelText('Confirm password'))
  await userEvent.type(screen.getByLabelText('Confirm password'), 'secret-pass')
  await next()

  // Connection: a pasted URL fills the fields; the test shows version and support level.
  await userEvent.click(screen.getByLabelText('Connection URL'))
  await userEvent.paste('postgres://app:pw@db.internal:6432/sales?sslmode=disable')
  expect(screen.getByLabelText('Host')).toHaveValue('db.internal')
  expect(screen.getByLabelText('Port')).toHaveValue('6432')
  expect(screen.getByLabelText('Database')).toHaveValue('sales')
  await userEvent.click(screen.getByRole('button', { name: 'Test connection' }))
  expect(await screen.findByText(/Connected to PostgreSQL 17.2/)).toHaveTextContent(
    'fully supported',
  )
  expect(tested).toMatchObject({ host: 'db.internal', port: 6432, user: 'app', password: 'pw' })

  await userEvent.click(screen.getByRole('button', { name: 'Save and finish' }))
  expect(await screen.findByRole('heading', { name: 'All set' })).toBeInTheDocument()
  expect(screen.getByText('app@db.internal:6432/sales')).toBeInTheDocument()
  expect(saved).toMatchObject({
    mode: 'saved',
    lang: 'en',
    admin: { username: 'admin', password: 'secret-pass' },
    connection: { host: 'db.internal' },
  })
})

test('a failed connection test explains the reason', async () => {
  setupMode({ account_locked: true, account_username: 'ops', db_host: 'db', db_port: 5433 })
  server.use(
    http.post('*/api/v1/setup/test', () =>
      HttpResponse.json(
        { error: { code: 'connection_failed', message: 'x', reason: 'authentication' } },
        { status: 422 },
      ),
    ),
  )
  renderApp('/setup')
  await screen.findByRole('heading', { name: 'Welcome to Gresbase' })
  await next()
  await next() // no account step: GRESBASE_USER defines it
  expect(screen.getByText(/The administrator ops is defined by GRESBASE_USER/)).toBeInTheDocument()
  // Host and port fixed by the environment.
  expect(screen.getByLabelText('Host')).toHaveValue('db')
  expect(screen.getByLabelText('Host')).toBeDisabled()
  expect(screen.getByLabelText('Port')).toHaveValue('5433')
  await userEvent.type(screen.getByLabelText('User'), 'app')
  await userEvent.click(screen.getByRole('button', { name: 'Test connection' }))
  expect(await screen.findByText('PostgreSQL rejected the user or password.')).toBeInTheDocument()
})

test('off this machine the token comes first and a wrong one is rejected', async () => {
  setupMode({ token_required: true })
  let header: string | null = null
  server.use(
    http.post('*/api/v1/setup/verify', ({ request }) => {
      header = request.headers.get('X-Gresbase-Setup-Token')
      return header === 'good-token'
        ? new HttpResponse(null, { status: 204 })
        : HttpResponse.json(
            { error: { code: 'setup_token_invalid', message: 'x' } },
            { status: 403 },
          )
    }),
  )
  renderApp('/setup')
  await screen.findByRole('heading', { name: 'Welcome to Gresbase' })
  await next()
  await userEvent.type(screen.getByLabelText('Token'), 'bad-token')
  await next()
  expect(await screen.findByRole('alert')).toHaveTextContent('The setup token is not valid')
  await userEvent.clear(screen.getByLabelText('Token'))
  await userEvent.type(screen.getByLabelText('Token'), 'good-token')
  await next()
  expect(await screen.findByRole('heading', { name: 'How will you use it?' })).toBeInTheDocument()
  expect(header).toBe('good-token')
})

test('the link in the logs fills the token and leaves the address bar', async () => {
  setupMode({ token_required: true, container: '3f2a9c1b7d4e' })
  let header: string | null = null
  server.use(
    http.post('*/api/v1/setup/verify', ({ request }) => {
      header = request.headers.get('X-Gresbase-Setup-Token')
      return new HttpResponse(null, { status: 204 })
    }),
  )
  window.history.replaceState(null, '', '/setup#token=0123abcd')
  renderApp('/setup')
  await screen.findByRole('heading', { name: 'Welcome to Gresbase' })
  expect(window.location.hash).toBe('')
  await next()
  expect(screen.getByLabelText('Token')).toHaveValue('0123abcd')
  expect(screen.getByText('docker exec 3f2a9c1b7d4e /gresbase setup-token')).toBeInTheDocument()
  await next()
  expect(await screen.findByRole('heading', { name: 'How will you use it?' })).toBeInTheDocument()
  expect(header).toBe('0123abcd')
})

test('free mode saves nothing but the mode, and warns without a volume', async () => {
  setupMode({ data_persistent: false, data_loss: 'container_layer' })
  let saved: unknown
  server.use(
    http.post('*/api/v1/setup', async ({ request }) => {
      saved = await request.json()
      return HttpResponse.json({ signed_in: false })
    }),
  )
  renderApp('/setup')
  expect(await screen.findByText('Settings are not persistent')).toBeInTheDocument()
  // It says why: without a volume, the files live in the container and go with it.
  expect(
    screen.getByText(
      /inside the container: saved queries and settings are lost when the container/,
    ),
  ).toBeInTheDocument()
  await next()
  await userEvent.click(screen.getByRole('radio', { name: /Free mode/ }))
  await userEvent.click(screen.getByRole('button', { name: 'Save and finish' }))
  expect(await screen.findByRole('heading', { name: 'All set' })).toBeInTheDocument()
  await waitFor(() => expect(saved).toEqual({ mode: 'free', lang: 'en' }))
})
