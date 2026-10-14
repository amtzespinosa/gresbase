import { http, HttpResponse } from 'msw'
import { server } from '@/test/msw'
import { api, ApiError, setUnauthorizedHandler } from './client'

test('adds X-Gresbase only to non-GET requests and sends JSON', async () => {
  const seen: Record<string, string | null> = {}
  server.use(
    http.get('*/api/v1/thing', ({ request }) => {
      seen.get = request.headers.get('X-Gresbase')
      return HttpResponse.json({ ok: true })
    }),
    http.post('*/api/v1/thing', async ({ request }) => {
      seen.post = request.headers.get('X-Gresbase')
      return HttpResponse.json(await request.json())
    }),
  )
  expect(await api('thing')).toEqual({ ok: true })
  expect(await api('thing', { method: 'POST', body: { a: 1 } })).toEqual({ a: 1 })
  expect(seen).toEqual({ get: null, post: '1' })
})

test('throws ApiError with the common error body', async () => {
  server.use(
    http.post('*/api/v1/sql', () =>
      HttpResponse.json(
        {
          error: {
            code: 'pg_error',
            message: 'syntax error',
            detail: 'd',
            hint: 'h',
            position: 12,
            pg_code: '42601',
          },
        },
        { status: 422 },
      ),
    ),
  )
  const err = await api('sql', { method: 'POST', body: {} }).catch((e: unknown) => e)
  expect(err).toBeInstanceOf(ApiError)
  expect(err).toMatchObject({
    status: 422,
    code: 'pg_error',
    position: 12,
    pgCode: '42601',
    hint: 'h',
    detail: 'd',
  })
})

test('non-JSON errors get a generic code', async () => {
  server.use(http.get('*/api/v1/boom', () => new HttpResponse('oops', { status: 502 })))
  await expect(api('boom')).rejects.toMatchObject({ code: 'internal', status: 502 })
})

test('401 calls the unauthorized handler', async () => {
  const handler = vi.fn()
  setUnauthorizedHandler(handler)
  server.use(
    http.get('*/api/v1/c/:conn/connection', () =>
      HttpResponse.json({ error: { code: 'unauthorized', message: 'login' } }, { status: 401 }),
    ),
  )
  await expect(api('connection')).rejects.toMatchObject({ code: 'unauthorized' })
  expect(handler).toHaveBeenCalledOnce()
})

test('an error after heartbeats (200, leading spaces) is still an error', async () => {
  server.use(
    http.post(
      '*/api/v1/slow-error',
      () =>
        new HttpResponse('   {"error":{"code":"timeout","message":"canceling statement"}}', {
          headers: { 'Content-Type': 'application/json' },
        }),
    ),
    http.post(
      '*/api/v1/slow-ok',
      () =>
        new HttpResponse('  {"results":[]}', { headers: { 'Content-Type': 'application/json' } }),
    ),
  )
  await expect(api('slow-error', { method: 'POST', body: {} })).rejects.toMatchObject({
    code: 'timeout',
  })
  await expect(api('slow-ok', { method: 'POST', body: {} })).resolves.toEqual({ results: [] })
})
