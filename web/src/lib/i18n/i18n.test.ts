import en from '@/locales/en.json'
import es from '@/locales/es.json'
import { ApiError } from '@/lib/api/client'
import { errorMessage } from '@/lib/api/errors'
import i18n, { resolveLang } from '.'
import { formatApprox, formatNumber } from './format'

function keys(obj: object, prefix = ''): string[] {
  return Object.entries(obj).flatMap(([k, v]) =>
    v && typeof v === 'object' ? keys(v, `${prefix}${k}.`) : [`${prefix}${k}`],
  )
}

test('en.json and es.json have exactly the same keys', () => {
  expect(keys(es).sort()).toEqual(keys(en).sort())
})

test('every API error code has a translation', () => {
  const codes = [
    'bad_request',
    'not_found',
    'unauthorized',
    'forbidden',
    'read_only',
    'conflict',
    'confirmation_required',
    'no_primary_key',
    'timeout',
    'canceled',
    'pg_error',
    'internal',
    'rate_limited',
    'not_writable',
    'not_undoable',
    'unsupported_version',
    'locked_by_env',
    'too_many_connections',
  ]
  for (const code of codes) expect(Object.keys(en.errors)).toContain(code)
})

test.each([
  [null, undefined, 'en'],
  [null, 'es', 'es'],
  [null, 'fr', 'en'],
  ['en', 'es', 'en'],
  ['es', 'en', 'es'],
] as const)('saved %s, server %s → %s', (saved, server, want) => {
  expect(resolveLang(saved, server)).toBe(want)
})

test('approximate counts follow the language', () => {
  expect(formatApprox(12_400, 'en')).toBe('≈12.4k')
  expect(formatApprox(12_400, 'es')).toBe('≈12,4 k')
  expect(formatApprox(950, 'en')).toBe('≈950')
  expect(formatApprox(3_250_000, 'en')).toBe('≈3.3M')
  expect(formatNumber(12_400, 'en')).toBe('12,400')
})

test('API errors are translated by code, unknown codes fall back', async () => {
  const t = i18n.getFixedT('es')
  expect(errorMessage(new ApiError(403, { code: 'read_only', message: 'x' }), t)).toBe(
    es.errors.read_only,
  )
  expect(errorMessage(new ApiError(500, { code: 'weird', message: 'x' }), t)).toBe(
    es.errors.internal,
  )
  expect(errorMessage(new TypeError('fetch failed'), t)).toBe(es.errors.network)
  expect(errorMessage(new Error('render bug'), t)).toBe(es.errors.unexpected)
})
