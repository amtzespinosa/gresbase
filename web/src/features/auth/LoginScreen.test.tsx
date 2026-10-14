import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { safeRedirect } from '@/lib/api/auth'
import type { TxInfo } from '@/lib/api/types.gen'
import { useSqlEditor } from '@/features/sql/store'
import { emptyQueue, tableKey, useChanges } from '@/features/tables/changes/queue'
import { config, server } from '@/test/msw'
import { renderApp } from '@/test/render'

const authConfig = () =>
  http.get('*/api/v1/config', () => HttpResponse.json({ ...config, auth_enabled: true }))
const fail = (status: number, code: string) =>
  http.post('*/api/v1/auth/login', () =>
    HttpResponse.json({ error: { code, message: code } }, { status }),
  )

async function signIn(user = 'admin', pass = 'secret') {
  await userEvent.type(await screen.findByLabelText('Username'), user)
  await userEvent.type(screen.getByLabelText('Password'), pass)
  await userEvent.click(screen.getByRole('button', { name: 'Sign in' }))
}

test('wrong credentials show a translated error, in both languages', async () => {
  server.use(authConfig(), fail(401, 'unauthorized'))
  renderApp('/login')
  await signIn()
  expect(await screen.findByRole('alert')).toHaveTextContent('Wrong username or password.')

  await userEvent.click(screen.getByRole('radio', { name: 'Español' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Usuario o contraseña incorrectos.')
  expect(screen.getByRole('button', { name: 'Entrar' })).toBeInTheDocument()
})

test('rate limit error is translated', async () => {
  server.use(authConfig(), fail(429, 'rate_limited'))
  renderApp('/login')
  await signIn()
  expect(await screen.findByRole('alert')).toHaveTextContent('Too many attempts')
})

test('successful login sends the anti-CSRF header and goes back to the requested page', async () => {
  let body: unknown
  let csrf: string | null = null
  server.use(
    authConfig(),
    http.post('*/api/v1/auth/login', async ({ request }) => {
      body = await request.json()
      csrf = request.headers.get('X-Gresbase')
      return HttpResponse.json({ auth_enabled: true, username: 'admin', expires_at: null })
    }),
  )
  const { router } = renderApp('/login?redirect=%2Fsql')
  await signIn()
  await waitFor(() => expect(router.state.location.pathname).toBe('/c/env/sql'))
  expect(body).toEqual({ username: 'admin', password: 'secret' })
  expect(csrf).toBe('1')
})

test('a 401 from any API call redirects to login, keeping the page to return to', async () => {
  server.use(
    authConfig(),
    http.get('*/api/v1/c/:conn/connection', () =>
      HttpResponse.json({ error: { code: 'unauthorized', message: 'x' } }, { status: 401 }),
    ),
  )
  const { router } = renderApp('/sql')
  await waitFor(() => expect(router.state.location.pathname).toBe('/login'))
  expect(router.state.location.search).toEqual({ redirect: '/c/env/sql' })
  expect(await screen.findByLabelText('Username')).toBeInTheDocument()
})

test('login is skipped when auth is disabled', async () => {
  const { router } = renderApp('/login')
  await waitFor(() => expect(router.state.location.pathname).toBe('/c/env/tables'))
})

test('sign out from the sidebar asks first, then goes to login', async () => {
  let loggedOut = false
  server.use(
    authConfig(),
    http.post('*/api/v1/auth/logout', () => {
      loggedOut = true
      return new HttpResponse(null, { status: 204 })
    }),
  )
  const { router } = renderApp('/tables')
  await userEvent.click(await screen.findByRole('button', { name: 'Sign out' }))
  const dialog = await screen.findByRole('dialog', { name: 'Sign out?' })
  expect(dialog).toHaveTextContent('this session will end')
  await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))
  expect(loggedOut).toBe(false)
  expect(router.state.location.pathname).not.toBe('/login')

  await userEvent.click(screen.getByRole('button', { name: 'Sign out' }))
  const again = await screen.findByRole('dialog', { name: 'Sign out?' })
  await userEvent.click(within(again).getByRole('button', { name: 'Sign out' }))
  await waitFor(() => expect(router.state.location.pathname).toBe('/login'))
  expect(loggedOut).toBe(true)
})

test('signing out warns about pending changes and an open transaction, and rolls it back', async () => {
  let rolledBack = false
  server.use(
    authConfig(),
    http.post('*/api/v1/auth/logout', () => new HttpResponse(null, { status: 204 })),
    http.post('*/sql/transactions/:id/rollback', () => {
      rolledBack = true
      return HttpResponse.json({ status: 'rolled_back' })
    }),
  )
  const update = { pk: { id: 1 }, original: { id: 1, name: 'a' }, set: { name: 'b' } }
  useChanges.setState({
    queues: { [tableKey('public', 'users')]: { ...emptyQueue, updates: { '{"id":1}': update } } },
  })
  useSqlEditor.setState({ tx: { id: 'tx1' } as TxInfo })
  const { router } = renderApp('/tables')
  await userEvent.click(await screen.findByRole('button', { name: 'Sign out' }))
  const dialog = await screen.findByRole('dialog', { name: 'Sign out?' })
  expect(dialog).toHaveTextContent('1 unsaved change in the grid will be lost.')
  expect(dialog).toHaveTextContent('The open SQL transaction will be rolled back.')
  await userEvent.click(within(dialog).getByRole('button', { name: 'Sign out' }))
  await waitFor(() => expect(router.state.location.pathname).toBe('/login'))
  expect(rolledBack).toBe(true)
  expect(useChanges.getState().queues).toEqual({})
})

test('only same-app paths are accepted as redirect targets', () => {
  expect(safeRedirect('/tables/public/users?x=1')).toBe('/tables/public/users?x=1')
  for (const bad of ['//evil.com', '/\\evil.com', 'https://evil.com', 'tables', undefined, 3]) {
    expect(safeRedirect(bad)).toBeUndefined()
  }
})
