import { describe, expect, it } from 'vitest'
import { parseConnectionUrl } from './connectionUrl'

describe('parseConnectionUrl', () => {
  it('reads every part of a postgres URL', () => {
    expect(
      parseConnectionUrl('postgresql://app:p%40ss@db.internal:6432/sales?sslmode=require&x=1'),
    ).toEqual({
      host: 'db.internal',
      port: 6432,
      user: 'app',
      password: 'p@ss',
      database: 'sales',
      sslmode: 'require',
    })
  })

  it('keeps only what the URL has and ignores unknown SSL modes', () => {
    expect(parseConnectionUrl('postgres://[::1]/app?sslmode=bogus')).toEqual({
      host: '::1',
      database: 'app',
    })
  })

  it('rejects other schemes and plain text', () => {
    expect(parseConnectionUrl('mysql://u@h/db')).toBeNull()
    expect(parseConnectionUrl('not a url')).toBeNull()
  })
})
