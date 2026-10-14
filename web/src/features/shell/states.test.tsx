import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { expect, test, vi } from 'vitest'
import { ErrorPanel, RouteError } from '@/components/ErrorPanel'
import { Results } from '@/features/sql/Results'
import { useSqlEditor } from '@/features/sql/store'
import { ApiError } from '@/lib/api/client'
import { config, server } from '@/test/msw'
import { renderApp } from '@/test/render'

// Task 23: access notices, empty states and the error panel behind the route error boundary.

const sidebar = () => screen.getByRole('complementary', { name: 'gresbase' })

test('read-only badge and local-only notice in the sidebar', async () => {
  server.use(http.get('*/api/v1/config', () => HttpResponse.json({ ...config, read_only: true })))
  renderApp('/settings')
  const badge = await screen.findByText('Read-only')
  expect(sidebar()).toContainElement(badge)
  expect(badge).toHaveAttribute(
    'aria-description',
    expect.stringContaining('nothing here can change'),
  )
  expect(screen.getByText('This computer only')).toBeInTheDocument()
})

test('no notices with login enabled and writes allowed', async () => {
  server.use(
    http.get('*/api/v1/config', () => HttpResponse.json({ ...config, auth_enabled: true })),
  )
  renderApp('/settings')
  await screen.findAllByRole('button', { name: 'Sign out' })
  expect(screen.queryByText('Read-only')).toBeNull()
  expect(screen.queryByText('This computer only')).toBeNull()
})

test('schema without tables', async () => {
  renderApp('/tables')
  await waitFor(() => expect(screen.getAllByText('This schema has no tables yet.')).toHaveLength(2))
  expect(
    screen.getByText('Create one with New table or from the SQL editor, or pick another schema.'),
  ).toBeVisible()
})

test('empty table', async () => {
  renderApp('/tables/public/things')
  expect(await screen.findByText('This table is empty.')).toBeInTheDocument()
})

test('no rows match the filters: clear them', async () => {
  const filters = JSON.stringify([{ column: 'id', op: 'eq', value: '-1' }])
  const { router } = renderApp(`/tables/public/things?filters=${encodeURIComponent(filters)}`)
  expect(await screen.findByText('No rows match these filters.')).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Clear filters' }))
  await waitFor(() => expect(router.state.location.search).not.toHaveProperty('filters'))
  expect(await screen.findByText('This table is empty.')).toBeInTheDocument()
})

test('SQL result without rows', () => {
  useSqlEditor.setState({
    running: null,
    error: null,
    active: 0,
    results: [
      {
        statement: 0,
        from: 0,
        to: 10,
        columns: [{ name: 'id', type: 'int4' }],
        rows: [],
        truncated: false,
        rows_affected: 0,
        command_tag: 'SELECT 0',
        duration_ms: 1,
        notices: [],
      },
    ],
  })
  render(<Results />)
  expect(screen.getByText('The query returned no rows.')).toBeInTheDocument()
})

test('error panel folds the full Postgres error and retries', async () => {
  const reset = vi.fn()
  const err = new ApiError(422, {
    code: 'pg_error',
    message: 'relation "nope" does not exist',
    detail: 'some detail',
    hint: 'some hint',
    pg_code: '42P01',
  })
  render(<RouteError error={err} reset={reset} />)
  expect(screen.getByRole('alert')).toHaveTextContent('Details')
  await userEvent.click(screen.getByText('Details'))
  expect(screen.getByText('relation "nope" does not exist')).toBeVisible()
  expect(screen.getByText('SQLSTATE 42P01')).toBeVisible()
  await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
  expect(reset).toHaveBeenCalled()
})

test('a crash that is not an API error reads as unexpected, not as a network problem', () => {
  render(<ErrorPanel error={new Error('boom')} />)
  expect(screen.getByRole('alert')).not.toHaveTextContent(/connection|network|reach/i)
})
