import { describe, expect, it } from 'vitest'
import { toCSV, toJSON, toMarkdown } from './export'

const data = {
  columns: [{ name: 'id' }, { name: 'v' }],
  rows: [
    ['1', 'a,b'],
    ['2', 'say "hi"'],
    ['3', 'line1\nline2'],
    ['4', ''],
    ['5', null],
    ['6', { k: [1, 2] }],
  ],
}

describe('export', () => {
  it('writes CSV with Postgres escaping, NULL differs from empty string', () => {
    expect(toCSV(data)).toBe(
      'id,v\n1,"a,b"\n2,"say ""hi"""\n3,"line1\nline2"\n4,""\n5,\n6,"{""k"":[1,2]}"\n',
    )
  })

  it('writes JSON objects keyed by column', () => {
    expect(JSON.parse(toJSON(data))[5]).toEqual({ id: '6', v: { k: [1, 2] } })
  })

  it('writes a Markdown table escaping pipes and newlines', () => {
    const md = toMarkdown({ columns: [{ name: 'a|b' }], rows: [['x\ny'], [null]] })
    expect(md).toBe('| a\\|b |\n| --- |\n| x<br>y |\n| NULL |')
  })
})
