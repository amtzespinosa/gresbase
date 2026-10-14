import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import en from '@/locales/en.json'
import es from '@/locales/es.json'

// Every reason the server can put in a connection_failed error (the Kind* constants of
// internal/pg/connect_error.go) has its own message in each language, instead of falling back to
// setup.reason.other. unsupported_version is not a reason: probeDSN answers it with its own error code.
describe('connection failure reasons', () => {
  // Vitest runs from web/.
  const go = readFileSync('../internal/pg/connect_error.go', 'utf8')
  const reasons = [...go.matchAll(/^\s*Kind\w+\s*=\s*"(\w+)"/gm)]
    .flatMap((m) => (m[1] ? [m[1]] : []))
    .filter((r) => r !== 'unsupported_version')

  it('reads the reasons from the Go code', () => {
    expect(reasons).toContain('host_not_allowed')
  })

  it.each([
    ['en', en],
    ['es', es],
  ])('%s has a message for every reason', (_, locale) => {
    for (const reason of reasons) expect(locale.setup.reason).toHaveProperty(reason)
  })
})
