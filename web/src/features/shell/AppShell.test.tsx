import { act, fireEvent, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { PREFS_KEY } from '@/lib/prefs/store'
import { connection, server } from '@/test/msw'
import { renderApp } from '@/test/render'

const stored = () => JSON.parse(localStorage.getItem(PREFS_KEY) ?? '{}').state

function sidebar() {
  return screen.getByRole('complementary', { name: 'gresbase' })
}

test('sidebar collapses and expands with the button, persists, and toggles with Ctrl+B', async () => {
  window.innerWidth = 1280
  renderApp()
  expect(await screen.findByRole('heading', { name: 'Tables' })).toBeInTheDocument()
  expect(sidebar()).toHaveAttribute('data-collapsed', 'false')

  await userEvent.click(screen.getByRole('button', { name: 'Collapse sidebar' }))
  expect(sidebar()).toHaveAttribute('data-collapsed', 'true')
  expect(stored().sidebarCollapsed).toBe(true)
  // Collapsed: labels hidden, links keep an accessible name for the tooltip.
  expect(screen.getByRole('link', { name: 'Tables' })).toBeInTheDocument()
  expect(screen.queryByText('SQL editor')).not.toBeInTheDocument()

  act(() => {
    fireEvent.keyDown(window, { key: 'b', ctrlKey: true })
  })
  expect(sidebar()).toHaveAttribute('data-collapsed', 'false')
  expect(stored().sidebarCollapsed).toBe(false)
})

test('sidebar starts collapsed below 1024 px when the user never chose', async () => {
  window.innerWidth = 900
  renderApp()
  await screen.findByRole('heading', { name: 'Tables' })
  expect(sidebar()).toHaveAttribute('data-collapsed', 'true')
  window.innerWidth = 1280
})

test('theme button updates data-theme on <html> and persists the choice', async () => {
  renderApp()
  await userEvent.click(await screen.findByRole('button', { name: 'Theme: Auto' }))
  expect(document.documentElement.dataset.theme).toBe('light')
  expect(stored().theme).toBe('light')

  await userEvent.click(screen.getByRole('button', { name: 'Theme: Light' }))
  expect(document.documentElement.dataset.theme).toBe('dark')
  expect(stored().theme).toBe('dark')
})

test('settings segmented control changes the theme', async () => {
  renderApp('/settings')
  await userEvent.click(await screen.findByRole('radio', { name: 'Dark' }))
  expect(document.documentElement.dataset.theme).toBe('dark')
})

test('connection card shows database, host and major version', async () => {
  renderApp()
  expect(await screen.findByText('app')).toBeInTheDocument()
  expect(screen.getByText('db:5432 · PG 17')).toBeInTheDocument()
})

test('connection card shows an error state', async () => {
  server.use(
    http.get('*/api/v1/c/:conn/connection', () =>
      HttpResponse.json({ error: { code: 'internal', message: 'down' } }, { status: 503 }),
    ),
  )
  renderApp()
  expect(await screen.findByText("Can't reach the database")).toBeInTheDocument()
})

test('routes render their screens and / redirects to /tables', async () => {
  const { router } = renderApp('/')
  await screen.findByRole('heading', { name: 'Tables' })
  expect(router.state.location.pathname).toBe('/c/env/tables')

  await act(() =>
    router.navigate({ to: '/tables/$schema/$table', params: { schema: 'public', table: 'users' } }),
  )
  expect(screen.getByRole('heading', { name: /public \/\s*users/ })).toBeInTheDocument()

  await act(() => router.navigate({ to: '/sql' }))
  expect(await screen.findByRole('heading', { name: 'Untitled query' })).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'SQL editor' })).toHaveAttribute('aria-current', 'page')
})

test.each([
  ['legacy', '12.22', 120022, 'PostgreSQL 12 no longer gets security updates.'],
  [
    'prerelease',
    '19beta4',
    190000,
    'Pre-release PostgreSQL (19beta4): some things may not work yet.',
  ],
] as const)('connection card warns about %s servers', async (level, version, num, text) => {
  server.use(
    http.get('*/api/v1/c/:conn/connection', () =>
      HttpResponse.json({
        ...connection,
        server_version: version,
        server_version_num: num,
        support_level: level,
      }),
    ),
  )
  renderApp()
  expect(await screen.findByText(text)).toBeInTheDocument()
})

test('connection card has no notice for fully supported servers', async () => {
  renderApp()
  await screen.findByText('db:5432 · PG 17')
  expect(screen.queryByText(/security updates|Pre-release/)).not.toBeInTheDocument()
})

test('connection card explains an unsupported server version', async () => {
  server.use(
    http.get('*/api/v1/c/:conn/connection', () =>
      HttpResponse.json(
        { error: { code: 'unsupported_version', message: 'server is 11.22' } },
        { status: 422 },
      ),
    ),
  )
  renderApp()
  expect(await screen.findByText('Gresbase needs PostgreSQL 12 or newer.')).toBeInTheDocument()
})
