import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import type { Setting, SettingsResponse } from '@/lib/api/types.gen'
import { usePrefs } from '@/lib/prefs/store'
import { config, server, session } from '@/test/msw'
import { renderApp } from '@/test/render'

const setting = (key: string, value: string, over: Partial<Setting> = {}): Setting => ({
  key,
  env: `GRESBASE_${key.toUpperCase()}`,
  value,
  source: 'default',
  locked: false,
  restart_required: false,
  ...over,
})

const all = (): SettingsResponse => ({
  data_persistent: true,
  settings: [
    setting('lang', 'en'),
    setting('session_ttl', '12h', { source: 'env', locked: true }),
    setting('allowed_hosts', ''),
    setting('read_only', 'false'),
    setting('statement_timeout', '30s', { restart_required: true }),
    setting('sql_max_rows', '1000'),
    setting('import_timeout', '10m'),
    setting('max_conns', '10'),
    setting('max_pools', '20'),
    setting('pool_idle_timeout', '10m'),
  ],
})

const heading = (name: string) => screen.findByRole('heading', { name })

test('the administrator sees every section, with locked fields and their variable', async () => {
  server.use(http.get('*/api/v1/settings', () => HttpResponse.json(all())))
  renderApp('/c/env/settings')
  for (const name of ['General', 'Security', 'SQL editor', 'Database pools', 'About'])
    expect(await heading(name)).toBeInTheDocument()
  const ttl = await screen.findByLabelText('Session duration')
  expect(ttl).toBeDisabled()
  expect(
    screen.getAllByText('Defined by environment variable GRESBASE_SESSION_TTL').length,
  ).toBeGreaterThan(0)
  expect(screen.getByLabelText('Row limit')).toBeEnabled()
  expect(screen.getByText('Applies on restart')).toBeInTheDocument()
  expect(await screen.findByText('17.2')).toBeInTheDocument()
})

test('free mode only shows the personal sections', async () => {
  let asked = false
  server.use(
    http.get('*/api/v1/config', () => HttpResponse.json({ ...config, free_mode: true })),
    http.get('*/api/v1/auth/session', () =>
      HttpResponse.json({ ...session, auth_enabled: true, role: 'user', username: 'pg@db' }),
    ),
    http.get('*/api/v1/settings', () => {
      asked = true
      return HttpResponse.json(all())
    }),
  )
  renderApp('/c/env/settings')
  expect(await heading('General')).toBeInTheDocument()
  expect(await heading('About')).toBeInTheDocument()
  expect(screen.queryByRole('heading', { name: 'Security' })).not.toBeInTheDocument()
  expect(screen.queryByRole('heading', { name: 'SQL editor' })).not.toBeInTheDocument()
  expect(asked).toBe(false)
})

test('About links to the Apache license, NOTICE and the generated third-party notices', async () => {
  server.use(http.get('*/api/v1/settings', () => HttpResponse.json(all())))
  renderApp('/c/env/settings')
  const about = (await heading('About')).closest('section') as HTMLElement
  const href = (name: string) => within(about).getByRole('link', { name }).getAttribute('href')
  expect(href('Apache License 2.0')).toBe('licenses/LICENSE.txt')
  expect(href('NOTICE')).toBe('licenses/NOTICE.txt')
  expect(href('Third-party licenses')).toBe('licenses/THIRD_PARTY_NOTICES.txt')
})

test('About shows the build version with its commit', async () => {
  server.use(
    http.get('*/api/v1/settings', () => HttpResponse.json(all())),
    http.get('*/api/v1/config', () =>
      HttpResponse.json({ ...config, version: 'dev+1e2c9b0-dirty' }),
    ),
  )
  renderApp('/c/env/settings')
  const about = (await heading('About')).closest('section') as HTMLElement
  expect(await within(about).findByText('dev+1e2c9b0-dirty')).toBeInTheDocument()
})

test('saving a server setting sends only that key and shows errors', async () => {
  const sent: { settings: Record<string, string> }[] = []
  server.use(
    http.get('*/api/v1/settings', () => HttpResponse.json(all())),
    http.patch('*/api/v1/settings', async ({ request }) => {
      const body = (await request.json()) as { settings: Record<string, string> }
      sent.push(body)
      if (body.settings.sql_max_rows === '0')
        return HttpResponse.json(
          { error: { code: 'bad_request', message: 'invalid' } },
          { status: 400 },
        )
      const next = all()
      next.settings = next.settings.map((s) =>
        s.key === 'sql_max_rows'
          ? { ...s, value: body.settings.sql_max_rows ?? '', source: 'file' }
          : s,
      )
      return HttpResponse.json(next)
    }),
  )
  const user = userEvent.setup()
  renderApp('/c/env/settings')
  const input = await screen.findByLabelText('Row limit')
  const form = input.closest('form') as HTMLFormElement
  const save = within(form).getByRole('button', { name: 'Save' })
  expect(save).toBeDisabled()

  await user.clear(input)
  await user.type(input, '0')
  await user.click(save)
  expect(await within(form).findByRole('alert')).toBeInTheDocument()

  await user.clear(input)
  await user.type(input, '500{Enter}')
  await waitFor(() => expect(sent).toHaveLength(2))
  expect(sent[1]).toEqual({ settings: { sql_max_rows: '500' } })
  await waitFor(() => expect(within(form).queryByRole('alert')).not.toBeInTheDocument())
  expect(input).toHaveValue(500)
})

test('changing the password asks for the current one and reports a wrong one', async () => {
  const sent: unknown[] = []
  server.use(
    http.get('*/api/v1/config', () => HttpResponse.json({ ...config, auth_enabled: true })),
    http.get('*/api/v1/auth/session', () =>
      HttpResponse.json({ ...session, auth_enabled: true, username: 'admin' }),
    ),
    http.post('*/api/v1/auth/password', async ({ request }) => {
      const body = (await request.json()) as { current_password: string }
      sent.push(body)
      return body.current_password === 'right-password'
        ? new HttpResponse(null, { status: 204 })
        : HttpResponse.json({ error: { code: 'forbidden', message: 'x' } }, { status: 403 })
    }),
  )
  const user = userEvent.setup()
  renderApp('/c/env/settings')
  const form = await screen.findByRole('form', { name: 'Change password' })
  const submit = within(form).getByRole('button', { name: 'Change password' })
  await user.type(within(form).getByLabelText('Current password'), 'wrong-password')
  await user.type(within(form).getByLabelText('New password'), 'new-password-1')
  await user.type(within(form).getByLabelText('Confirm password'), 'new-password-1')
  await user.click(submit)
  expect(await within(form).findByRole('alert')).toHaveTextContent(
    'The current password is incorrect.',
  )

  await user.clear(within(form).getByLabelText('Current password'))
  await user.type(within(form).getByLabelText('Current password'), 'right-password')
  await user.click(submit)
  expect(await screen.findByText(/Password changed/)).toBeInTheDocument()
  expect(sent[1]).toEqual({ current_password: 'right-password', new_password: 'new-password-1' })
})

test('an account from the environment cannot be changed here', async () => {
  server.use(
    http.get('*/api/v1/config', () => HttpResponse.json({ ...config, auth_enabled: true })),
    http.get('*/api/v1/auth/session', () =>
      HttpResponse.json({ ...session, auth_enabled: true, username: 'ops', account_locked: true }),
    ),
  )
  renderApp('/c/env/settings')
  expect(await screen.findByText(/The administrator ops is defined by/)).toBeInTheDocument()
  expect(screen.queryByRole('form', { name: 'Change password' })).not.toBeInTheDocument()
})

test('grid density is a personal preference', async () => {
  const user = userEvent.setup()
  renderApp('/c/env/settings')
  await user.click(await screen.findByRole('radio', { name: 'Compact' }))
  expect(usePrefs.getState().density).toBe('compact')
  usePrefs.getState().setDensity('comfortable')
})
