import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import i18n from '@/lib/i18n'
import { usePrefs } from '@/lib/prefs/store'
import { shortcuts } from '@/lib/shortcuts'
import { server } from '@/test/msw'
import { renderApp } from '@/test/render'

beforeEach(() => {
  window.innerWidth = 1280
  server.use(
    http.get('*/api/v1/c/:conn/sql/completions', () =>
      HttpResponse.json({
        tables: [
          { schema: 'public', name: 'users', columns: ['id'] },
          { schema: 'billing', name: 'plans', columns: ['id'] },
          { schema: 'public', name: 'events', columns: [], partition: false },
          { schema: 'public', name: 'events_2025', columns: [], partition: true },
        ],
        functions: [],
        search_path: ['public'],
      }),
    ),
    http.get('*/api/v1/snippets', () =>
      HttpResponse.json([
        { path: 'reports', folder: true, size: 0, modified_at: '2026-10-09T00:00:00Z' },
        {
          path: 'reports/monthly.sql',
          folder: false,
          size: 9,
          modified_at: '2026-10-09T00:00:00Z',
        },
      ]),
    ),
  )
})

const palette = () => screen.findByRole('dialog', { name: 'Command palette' })
const ctrlK = () => act(() => void fireEvent.keyDown(window, { key: 'k', ctrlKey: true }))

test('opens with Ctrl+K and the sidebar button, closes with Escape', async () => {
  renderApp()
  await screen.findByRole('heading', { name: 'Tables' })

  ctrlK()
  expect(await palette()).toBeInTheDocument()
  await userEvent.keyboard('{Escape}')
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())

  await userEvent.click(screen.getByRole('button', { name: 'Search' }))
  expect(await palette()).toBeInTheDocument()
  ctrlK()
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
})

test('finds tables in every schema and opens them', async () => {
  const { router } = renderApp()
  await screen.findByRole('heading', { name: 'Tables' })
  ctrlK()
  const dialog = await palette()
  await within(dialog).findByText('users')
  // Partitions are reached through their parent, not listed on their own.
  expect(within(dialog).getByText('events')).toBeInTheDocument()
  expect(within(dialog).queryByText('events_2025')).not.toBeInTheDocument()

  // A term that matches nothing still offers the global search, without "Nothing matches.".
  await userEvent.type(within(dialog).getByRole('combobox'), 'zzqx')
  expect(within(dialog).getByRole('option', { name: /in all tables/ })).toBeInTheDocument()
  expect(within(dialog).queryByText('Nothing matches.')).not.toBeInTheDocument()
  await userEvent.clear(within(dialog).getByRole('combobox'))

  await userEvent.type(within(dialog).getByRole('combobox'), 'plans')
  expect(within(dialog).queryByText('users')).not.toBeInTheDocument()
  await userEvent.click(within(dialog).getByRole('option', { name: /billing\.plans/ }))

  await waitFor(() => expect(router.state.location.pathname).toBe('/c/env/tables/billing/plans'))
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  // Opening a table makes it a recent item.
  await waitFor(() =>
    expect(usePrefs.getState().recent[0]).toEqual({
      connection: 'env',
      kind: 'table',
      schema: 'billing',
      table: 'plans',
    }),
  )
  ctrlK()
  const again = await palette()
  const recent = within(again).getByRole('group', { name: 'Recent' })
  expect(within(recent).getByText('billing.plans')).toBeInTheDocument()
})

test('opens saved queries', async () => {
  server.use(
    http.get('*/api/v1/snippets/file', () =>
      HttpResponse.json({
        path: 'reports/monthly.sql',
        sql: 'select 1',
        modified_at: '2026-10-09T00:00:00Z',
      }),
    ),
  )
  const { router } = renderApp()
  await screen.findByRole('heading', { name: 'Tables' })
  ctrlK()
  const dialog = await palette()
  await userEvent.click(await within(dialog).findByRole('option', { name: /reports\/monthly/ }))
  await waitFor(() =>
    expect(router.state.location.pathname).toBe(
      `/c/env/sql/${encodeURIComponent('reports/monthly.sql')}`,
    ),
  )
  await waitFor(() =>
    expect(usePrefs.getState().recent[0]).toEqual({
      connection: 'env',
      kind: 'snippet',
      path: 'reports/monthly.sql',
    }),
  )
})

test('runs actions: theme and language', async () => {
  renderApp()
  await screen.findByRole('heading', { name: 'Tables' })

  ctrlK()
  await userEvent.click(await within(await palette()).findByRole('option', { name: 'Theme: Dark' }))
  expect(usePrefs.getState().theme).toBe('dark')
  await waitFor(() => expect(document.documentElement.dataset.theme).toBe('dark'))

  ctrlK()
  await userEvent.click(
    await within(await palette()).findByRole('option', { name: /Language: Español/ }),
  )
  await waitFor(() => expect(i18n.language).toBe('es'))
})

test('? shows the help generated from the shortcut registry', async () => {
  renderApp()
  await screen.findByRole('heading', { name: 'Tables' })
  act(() => void fireEvent.keyDown(window, { key: '?', shiftKey: true }))
  const help = await screen.findByRole('dialog', { name: 'Keyboard shortcuts' })
  const items = within(help).getAllByRole('listitem')
  expect(items).toHaveLength(Object.keys(shortcuts).length)
  for (const def of Object.values(shortcuts)) {
    expect(within(help).getByText(i18n.t(def.label))).toBeInTheDocument()
  }
  expect(within(help).getAllByText('Ctrl').length).toBeGreaterThan(0)
})
