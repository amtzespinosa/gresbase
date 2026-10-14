import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import type { SQLRequest } from '@/lib/api/types.gen'
import { server } from '@/test/msw'
import { renderApp } from '@/test/render'
import { SQL_KEY, useSqlEditor } from './store'

const tablist = () => screen.findByRole('list', { name: 'Query tabs' })
const tabNames = async () =>
  within(await tablist())
    .getAllByRole('listitem')
    .map((t) => t.textContent)

function mockExecute() {
  const requests: SQLRequest[] = []
  server.use(
    http.post('*/api/v1/c/:conn/sql/execute', async ({ request }) => {
      const body = (await request.json()) as SQLRequest
      requests.push(body)
      return HttpResponse.json({ execution_id: body.execution_id ?? '', results: [] })
    }),
  )
  return requests
}

test('new, switch, rename and close query tabs; each keeps its text', async () => {
  const user = userEvent.setup()
  useSqlEditor.setState({ doc: 'SELECT 1' })
  renderApp('/sql')
  expect(await tabNames()).toEqual(['Untitled query'])

  await user.click(screen.getByRole('button', { name: 'New tab' }))
  expect(await tabNames()).toEqual(['Untitled query', 'Untitled query'])
  expect(useSqlEditor.getState().doc).toBe('')
  useSqlEditor.getState().setDoc('SELECT 2')

  // Rename with F2.
  const second = within(await tablist()).getAllByRole('listitem')[1]
  if (second) within(second).getAllByRole('button')[0]?.focus()
  await user.keyboard('{F2}')
  const name = await screen.findByRole('textbox', { name: 'Name' })
  await user.clear(name)
  await user.type(name, 'second{Enter}')
  await waitFor(async () => expect(await tabNames()).toEqual(['Untitled query', 'second']))

  await user.click(within(await tablist()).getByRole('button', { name: /^Untitled/ }))
  expect(useSqlEditor.getState().doc).toBe('SELECT 1')

  // SELECT 2 was never run nor saved: closing its tab asks first.
  await user.click(screen.getByRole('button', { name: 'Close second' }))
  const dialog = await screen.findByRole('dialog', { name: 'Close this tab?' })
  await user.click(within(dialog).getByRole('button', { name: 'Close tab' }))
  await waitFor(async () => expect(await tabNames()).toEqual(['Untitled query']))
  expect(useSqlEditor.getState().doc).toBe('SELECT 1')
})

test('tabs are kept per connection and persisted', () => {
  const s = useSqlEditor.getState()
  s.setDoc('env query')
  s.newTab('second env query')
  s.switchConnection('other')
  expect(useSqlEditor.getState().tabs).toHaveLength(1)
  expect(useSqlEditor.getState().doc).toBe('')
  useSqlEditor.getState().setDoc('other query')
  useSqlEditor.getState().switchConnection('env')
  const back = useSqlEditor.getState()
  expect(back.tabs.map((t) => t.doc)).toEqual(['env query', 'second env query'])
  expect(back.doc).toBe('second env query')
  expect(back.byConnection.other?.tabs[0]?.doc).toBe('other query')

  const stored = JSON.parse(localStorage.getItem(SQL_KEY) ?? '{}') as {
    state: { tabs: { doc: string }[]; byConnection: Record<string, unknown> }
    version: number
  }
  expect(stored.version).toBe(1)
  expect(stored.state.tabs.map((t) => t.doc)).toEqual(['env query', 'second env query'])
  expect(stored.state.byConnection).toHaveProperty('other')
})

test('a saved editor of version 0 becomes the first tab', async () => {
  localStorage.setItem(
    SQL_KEY,
    JSON.stringify({ state: { doc: 'SELECT old', snippet: null }, version: 0 }),
  )
  await useSqlEditor.persist.rehydrate()
  const s = useSqlEditor.getState()
  expect(s.doc).toBe('SELECT old')
  expect(s.tabs.map((t) => t.doc)).toEqual(['SELECT old'])
  expect(s.tabId).toBe(s.tabs[0]?.id)
})

test(':name parameters are asked for, sent bound and remembered per tab', async () => {
  const user = userEvent.setup()
  const requests = mockExecute()
  useSqlEditor.setState({
    doc: "SELECT * FROM users WHERE id = :id AND note <> ':no' AND x::int > 0",
  })
  renderApp('/sql')
  await user.click(await screen.findByRole('button', { name: 'Run' }))

  const dialog = await screen.findByRole('dialog', { name: 'Parameter values' })
  expect(within(dialog).getAllByRole('textbox')).toHaveLength(1)
  await user.type(within(dialog).getByRole('textbox', { name: ':id' }), "1' OR '1'='1")
  await user.click(within(dialog).getByRole('button', { name: 'Run' }))

  await waitFor(() => expect(requests).toHaveLength(1))
  // The SQL goes as written; the value only in params.
  expect(requests[0]?.sql).toBe(
    "SELECT * FROM users WHERE id = :id AND note <> ':no' AND x::int > 0",
  )
  expect(requests[0]?.params).toEqual({ id: "1' OR '1'='1" })

  // Next time the value is prefilled.
  await user.click(screen.getByRole('button', { name: 'Run' }))
  const again = await screen.findByRole('dialog', { name: 'Parameter values' })
  expect(within(again).getByRole('textbox', { name: ':id' })).toHaveValue("1' OR '1'='1")
})
