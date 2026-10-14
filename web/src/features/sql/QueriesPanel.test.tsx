import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import type { Entry, SQLRequest } from '@/lib/api/types.gen'
import { config, server } from '@/test/msw'
import { renderApp } from '@/test/render'
import { useHistory } from './history'
import { useSqlEditor } from './store'

const at = '2026-10-09T10:00:00Z'

/** An in-memory snippets API: path → sql, plus explicit folders. */
function serveSnippets(files: Record<string, string>, folders: string[] = []) {
  const dirs = new Set(folders)
  const calls: string[] = []
  const list = (): Entry[] => {
    const all = new Set(dirs)
    for (const p of Object.keys(files))
      p.split('/')
        .slice(0, -1)
        .forEach((_, i, parts) => all.add(parts.slice(0, i + 1).join('/')))
    return [
      ...[...all].map((path) => ({ path, folder: true, size: 0, modified_at: at })),
      ...Object.entries(files).map(([path, sql]) => ({
        path,
        folder: false,
        size: sql.length,
        modified_at: at,
      })),
    ].sort((a, b) => a.path.localeCompare(b.path))
  }
  const notFound = () =>
    HttpResponse.json({ error: { code: 'not_found', message: 'no' } }, { status: 404 })
  server.use(
    http.get('*/api/v1/snippets', () => HttpResponse.json(list())),
    http.get('*/api/v1/snippets/file', ({ request }) => {
      const path = new URL(request.url).searchParams.get('path') ?? ''
      const sql = files[path]
      return sql === undefined ? notFound() : HttpResponse.json({ path, sql, modified_at: at })
    }),
    http.post('*/api/v1/snippets', async ({ request }) => {
      const { path, sql } = (await request.json()) as { path: string; sql: string }
      calls.push(`create ${path}`)
      if (path in files)
        return HttpResponse.json({ error: { code: 'conflict', message: 'x' } }, { status: 409 })
      files[path] = sql
      return HttpResponse.json({ path, sql, modified_at: at }, { status: 201 })
    }),
    http.put('*/api/v1/snippets', async ({ request }) => {
      const { path, sql } = (await request.json()) as { path: string; sql: string }
      calls.push(`update ${path}`)
      files[path] = sql
      return HttpResponse.json({ path, sql, modified_at: at })
    }),
    http.post('*/api/v1/snippets\\:move', async ({ request }) => {
      const { from, to } = (await request.json()) as { from: string; to: string }
      calls.push(`move ${from} ${to}`)
      files[to] = files[from] ?? ''
      Reflect.deleteProperty(files, from)
      return new HttpResponse(null, { status: 204 })
    }),
    http.delete('*/api/v1/snippets', ({ request }) => {
      const path = new URL(request.url).searchParams.get('path') ?? ''
      calls.push(`delete ${path}`)
      Reflect.deleteProperty(files, path)
      return new HttpResponse(null, { status: 204 })
    }),
    http.post('*/api/v1/snippets/folders', async ({ request }) => {
      const { path } = (await request.json()) as { path: string }
      calls.push(`folder ${path}`)
      dirs.add(path)
      return new HttpResponse(null, { status: 204 })
    }),
  )
  return { files, calls }
}

const saved = () => screen.findByRole('region', { name: 'Saved' })
const editorTitle = () => screen.getByRole('heading', { level: 1 })

describe('saved queries', () => {
  it('lists folders and queries, and opens one from the list and from its URL', async () => {
    serveSnippets({ 'reports/monthly.sql': 'SELECT 1', 'top.sql': 'SELECT 2' })
    const { router } = renderApp('/sql/top.sql')
    await waitFor(() => expect(editorTitle()).toHaveTextContent('top'))
    expect(useSqlEditor.getState().doc).toBe('SELECT 2')

    const list = await saved()
    expect(within(list).getByRole('button', { name: 'reports' })).toHaveAttribute(
      'aria-expanded',
      'true',
    )
    await userEvent.click(within(list).getByRole('link', { name: 'monthly' }))
    await waitFor(() => expect(editorTitle()).toHaveTextContent('monthly'))
    expect(useSqlEditor.getState().doc).toBe('SELECT 1')
    expect(router.state.location.pathname).toBe('/c/env/sql/reports%2Fmonthly.sql')

    // Folders fold.
    await userEvent.click(within(list).getByRole('button', { name: 'reports' }))
    expect(within(list).queryByRole('link', { name: 'monthly' })).not.toBeInTheDocument()
  })

  it('saves a new query with Ctrl+S under a name, then updates it in place', async () => {
    const { files, calls } = serveSnippets({})
    useSqlEditor.setState({ doc: 'SELECT now()' })
    const { router } = renderApp('/sql')
    expect(await within(await saved()).findByText(/No saved queries yet/)).toBeInTheDocument()

    await userEvent.keyboard('{Control>}s{/Control}')
    const dialog = await screen.findByRole('dialog', { name: 'Save query' })
    await userEvent.type(within(dialog).getByLabelText('Name'), 'reports/daily')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }))

    await waitFor(() =>
      expect(router.state.location.pathname).toBe('/c/env/sql/reports%2Fdaily.sql'),
    )
    expect(files['reports/daily.sql']).toBe('SELECT now()')
    expect(editorTitle()).toHaveTextContent('daily')

    // Editing marks it unsaved; saving again updates the same file.
    useSqlEditor.getState().setDoc('SELECT now(), 1')
    expect(await screen.findAllByRole('img', { name: 'Unsaved changes' })).not.toHaveLength(0)
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(files['reports/daily.sql']).toBe('SELECT now(), 1'))
    expect(screen.queryByRole('img', { name: 'Unsaved changes' })).not.toBeInTheDocument()
    expect(calls).toEqual(['create reports/daily.sql', 'update reports/daily.sql'])
  })

  it('says when the name is taken', async () => {
    serveSnippets({ 'a.sql': 'SELECT 1' })
    useSqlEditor.setState({ doc: 'SELECT 2' })
    renderApp('/sql')
    await saved()
    await userEvent.click(await screen.findByRole('button', { name: 'Save' }))
    const dialog = await screen.findByRole('dialog', { name: 'Save query' })
    await userEvent.type(within(dialog).getByLabelText('Name'), 'a')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }))
    expect(
      await within(dialog).findByText("There's already something saved with that name."),
    ).toBeInTheDocument()
  })

  it('renames inline (moving the open query), creates folders and deletes after confirming', async () => {
    const { files, calls } = serveSnippets({ 'old.sql': 'SELECT 1' })
    const { router } = renderApp('/sql/old.sql')
    const list = await saved()
    await waitFor(() => expect(editorTitle()).toHaveTextContent('old'))

    await userEvent.click(await within(list).findByRole('button', { name: 'Rename old' }))
    const input = within(list).getByRole('textbox', { name: 'New name or path for old' })
    await userEvent.clear(input)
    await userEvent.type(input, 'archive/new{Enter}')
    await waitFor(() => expect(files['archive/new.sql']).toBe('SELECT 1'))
    expect(router.state.location.pathname).toBe('/c/env/sql/archive%2Fnew.sql')
    expect(useSqlEditor.getState().snippet?.path).toBe('archive/new.sql')

    await userEvent.click(within(list).getByRole('button', { name: 'New folder' }))
    const dialog = await screen.findByRole('dialog', { name: 'New folder' })
    await userEvent.type(within(dialog).getByLabelText('Folder name'), 'drafts')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Create' }))
    expect(await within(list).findByRole('button', { name: 'drafts' })).toBeInTheDocument()

    await userEvent.click(await within(list).findByRole('button', { name: 'Delete new' }))
    const confirm = await screen.findByRole('dialog', { name: 'Delete “new”?' })
    await userEvent.click(within(confirm).getByRole('button', { name: 'Delete' }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/c/env/sql'))
    expect(useSqlEditor.getState().snippet).toBeNull()
    expect(useSqlEditor.getState().doc).toBe('SELECT 1')
    expect(calls).toEqual([
      'move old.sql archive/new.sql',
      'folder drafts',
      'delete archive/new.sql',
    ])
  })

  it('opens another saved query in its own tab, keeping unsaved changes', async () => {
    serveSnippets({ 'a.sql': 'SELECT 1', 'b.sql': 'SELECT 2' })
    useSqlEditor.setState({
      doc: 'SELECT 1 -- edited',
      snippet: { path: 'a.sql', saved: 'SELECT 1' },
    })
    const { router } = renderApp('/sql/a.sql')
    await userEvent.click(await within(await saved()).findByRole('link', { name: 'b' }))
    await waitFor(() => expect(useSqlEditor.getState().doc).toBe('SELECT 2'))
    expect(router.state.location.pathname).toBe('/c/env/sql/b.sql')

    // Back to the first tab: its edits are still there, and the URL follows it.
    const tabs = screen.getByRole('list', { name: 'Query tabs' })
    expect(
      within(tabs)
        .getAllByRole('listitem')
        .map((t) => t.textContent),
    ).toEqual(['a', 'b'])
    await userEvent.click(within(tabs).getByRole('button', { name: /^a/ }))
    expect(useSqlEditor.getState().doc).toBe('SELECT 1 -- edited')
    await waitFor(() => expect(router.state.location.pathname).toBe('/c/env/sql/a.sql'))
  })

  it('explains a saved query that no longer exists', async () => {
    serveSnippets({})
    const { router } = renderApp('/sql/gone.sql')
    expect(await screen.findByText("That saved query doesn't exist anymore.")).toBeInTheDocument()
    await waitFor(() => expect(router.state.location.pathname).toBe('/c/env/sql'))
  })

  it('warns when saved queries are not persistent, saying why', async () => {
    serveSnippets({})
    server.use(
      http.get('*/api/v1/config', () =>
        HttpResponse.json({ ...config, data_persistent: false, data_loss: 'anonymous_volume' }),
      ),
    )
    renderApp('/sql')
    expect(
      await screen.findByText(
        'The data directory is an anonymous volume: saved queries and settings are lost when the container is removed. Mount a named volume on /data (GRESBASE_DATA_DIR) to keep them.',
      ),
    ).toBeInTheDocument()
  })
})

describe('history', () => {
  beforeEach(() => {
    serveSnippets({})
    server.use(
      http.post('*/api/v1/c/:conn/sql/execute', async ({ request }) => {
        const req = (await request.json()) as SQLRequest
        return HttpResponse.json({
          execution_id: req.execution_id,
          results: [
            {
              statement: 0,
              from: 0,
              to: req.sql.length,
              columns: [{ name: 'n', type: 'integer' }],
              rows: [[1], [2]],
              truncated: false,
              rows_affected: 0,
              command_tag: 'SELECT 2',
              duration_ms: 3,
              notices: [],
            },
          ],
        })
      }),
    )
  })

  it('records runs, searches them, loads one and runs it again', async () => {
    useSqlEditor.setState({ doc: 'SELECT n FROM numbers' })
    renderApp('/sql')
    const history = await screen.findByRole('region', { name: 'History' })
    expect(within(history).getByText('Queries you run show up here.')).toBeInTheDocument()

    await userEvent.click(await screen.findByRole('button', { name: 'Run' }))
    expect(await within(history).findByText('SELECT n FROM numbers')).toBeInTheDocument()
    expect(within(history).getByText(/2 rows/)).toBeInTheDocument()

    useSqlEditor.setState({ doc: 'SELECT 42' })
    await userEvent.click(screen.getByRole('button', { name: 'Run' }))
    await within(history).findByText('SELECT 42')

    await userEvent.type(within(history).getByRole('searchbox'), 'numbers')
    expect(within(history).queryByText('SELECT 42')).not.toBeInTheDocument()

    await userEvent.click(within(history).getByText('SELECT n FROM numbers'))
    expect(useSqlEditor.getState().doc).toBe('SELECT n FROM numbers')

    await userEvent.click(within(history).getByRole('button', { name: 'Run again' }))
    await waitFor(() => expect(useHistory.getState().entries).toHaveLength(3))
  })

  it('clears the history after confirming', async () => {
    await useHistory.getState().add({ sql: 'SELECT 1', at: Date.now(), duration_ms: 1 })
    renderApp('/sql')
    const history = await screen.findByRole('region', { name: 'History' })
    await within(history).findByText('SELECT 1')
    await userEvent.click(within(history).getByRole('button', { name: 'Clear history' }))
    await userEvent.click(
      within(await screen.findByRole('dialog', { name: 'Clear the history?' })).getByRole(
        'button',
        { name: 'Clear history' },
      ),
    )
    expect(await within(history).findByText('Queries you run show up here.')).toBeInTheDocument()
  })

  it('has a context menu per entry: open, run, copy, save as query, delete that one', async () => {
    const { calls, files } = serveSnippets({})
    const writeText = vi.fn(() => Promise.resolve())
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
    await useHistory.getState().add({ sql: 'SELECT 1', at: Date.now() - 1000, duration_ms: 1 })
    await useHistory.getState().add({ sql: 'SELECT 2', at: Date.now(), duration_ms: 1 })
    renderApp('/sql')
    const history = await screen.findByRole('region', { name: 'History' })
    const entry = async (sql: string) =>
      (await within(history).findByText(sql)).closest('button') as HTMLElement
    const menuFor = async (sql: string) => {
      fireEvent.contextMenu(await entry(sql))
      return screen.findByRole('menu')
    }

    const menu = await menuFor('SELECT 1')
    expect(
      within(menu)
        .getAllByRole('menuitem')
        .map((i) => i.textContent),
    ).toEqual(['Open', 'Run', 'Copy SQL', 'Save as query…', 'Delete from history'])
    expect(within(menu).getByRole('menuitem', { name: 'Delete from history' })).toHaveClass(
      'text-danger',
    )
    await userEvent.click(within(menu).getByRole('menuitem', { name: 'Copy SQL' }))
    expect(writeText).toHaveBeenCalledWith('SELECT 1')

    // The keyboard opens it too.
    ;(await entry('SELECT 1')).focus()
    await userEvent.keyboard('{Shift>}{F10}{/Shift}')
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Save as query…' }))
    const dialog = await screen.findByRole('dialog', { name: 'Save query' })
    await userEvent.type(within(dialog).getByRole('textbox'), 'first')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(calls).toEqual(['create first.sql']))
    expect(files['first.sql']).toBe('SELECT 1')

    await userEvent.click(
      within(await menuFor('SELECT 2')).getByRole('menuitem', { name: 'Delete from history' }),
    )
    await waitFor(() => expect(within(history).queryByText('SELECT 2')).not.toBeInTheDocument())
    expect(within(history).getByText('SELECT 1')).toBeInTheDocument()
    expect(useHistory.getState().entries.map((e) => e.sql)).toEqual(['SELECT 1'])

    await userEvent.click(within(await menuFor('SELECT 1')).getByRole('menuitem', { name: 'Run' }))
    await waitFor(() => expect(useHistory.getState().entries).toHaveLength(2))
    expect(useSqlEditor.getState().doc).toBe('SELECT 1')
  })
})

test('saved queries have a context menu: open, rename, duplicate, copy SQL, delete', async () => {
  const { calls } = serveSnippets({ 'report.sql': 'SELECT r' })
  const writeText = vi.fn(() => Promise.resolve())
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
  const { router } = renderApp('/sql')
  const list = await saved()
  const menuFor = async (name: string) => {
    fireEvent.contextMenu(await within(list).findByRole('link', { name }))
    return screen.findByRole('menu')
  }

  const menu = await menuFor('report')
  expect(
    within(menu)
      .getAllByRole('menuitem')
      .map((i) => i.textContent),
  ).toEqual(['Open', 'Rename…', 'Duplicate', 'Copy SQL', 'Delete…'])
  await userEvent.click(within(menu).getByRole('menuitem', { name: 'Copy SQL' }))
  await waitFor(() => expect(writeText).toHaveBeenCalledWith('SELECT r'))

  await userEvent.click(
    within(await menuFor('report')).getByRole('menuitem', { name: 'Duplicate' }),
  )
  await within(list).findByRole('link', { name: 'report-copy' })
  await userEvent.click(
    within(await menuFor('report')).getByRole('menuitem', { name: 'Duplicate' }),
  )
  await within(list).findByRole('link', { name: 'report-copy-2' })
  expect(calls).toEqual(['create report-copy.sql', 'create report-copy-2.sql'])

  await userEvent.click(within(await menuFor('report')).getByRole('menuitem', { name: 'Open' }))
  await waitFor(() => expect(router.state.location.pathname).toBe('/c/env/sql/report.sql'))

  await userEvent.click(
    within(await menuFor('report-copy')).getByRole('menuitem', { name: 'Rename…' }),
  )
  const input = await screen.findByRole('textbox', { name: 'New name or path for report-copy' })
  await userEvent.clear(input)
  await userEvent.type(input, 'renamed{Enter}')
  await within(list).findByRole('link', { name: 'renamed' })

  await userEvent.click(within(await menuFor('renamed')).getByRole('menuitem', { name: 'Delete…' }))
  const dialog = await screen.findByRole('dialog', { name: 'Delete “renamed”?' })
  await userEvent.click(within(dialog).getByRole('button', { name: 'Delete' }))
  await waitFor(() => expect(calls).toContain('delete renamed.sql'))
})
