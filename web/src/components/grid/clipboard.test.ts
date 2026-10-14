import { formatSelection, parsePasted } from './clipboard'

const cols = ['id', 'name', 'meta']
const rows = [
  [1, 'Ada, "the first"', { a: 1 }],
  ['2', null, 'two\tlines\nhere'],
]

test('copies as TSV, CSV, JSON and INSERT', () => {
  expect(formatSelection('tsv', cols, rows)).toBe(
    '1\t"Ada, ""the first"""\t"{""a"":1}"\n2\t\t"two\tlines\nhere"',
  )
  expect(formatSelection('csv', cols, rows)).toBe(
    'id,name,meta\n1,"Ada, ""the first""","{""a"":1}"\n2,,"two\tlines\nhere"',
  )
  expect(JSON.parse(formatSelection('json', cols, rows))).toEqual([
    { id: 1, name: 'Ada, "the first"', meta: { a: 1 } },
    { id: '2', name: null, meta: 'two\tlines\nhere' },
  ])
  expect(
    formatSelection(
      'insert',
      ['id', 'we"ird'],
      [
        [1, "O'Brien"],
        [true, null],
      ],
      {
        schema: 'public',
        name: 'users',
      },
    ),
  ).toBe(
    'INSERT INTO "public"."users" ("id", "we""ird") VALUES\n  (1, \'O\'\'Brien\'),\n  (TRUE, NULL);',
  )
})

test('parses TSV as spreadsheets write it', () => {
  // Excel quotes fields with tabs, newlines or quotes; lines end in CRLF and the last one too.
  expect(parsePasted('a\t"b\tc"\r\n"multi\nline"\t"say ""hi"""\r\n\t\r\n')).toEqual([
    ['a', 'b\tc'],
    ['multi\nline', 'say "hi"'],
    ['', ''],
  ])
  expect(parsePasted('one')).toEqual([['one']])
  expect(parsePasted('x\ny')).toEqual([['x'], ['y']])
})

test('CSV only when every line has the same number of fields', () => {
  expect(parsePasted('a,b\n"c,d",e')).toEqual([
    ['a', 'b'],
    ['c,d', 'e'],
  ])
  expect(parsePasted('Smith, John')).toEqual([['Smith, John']])
  expect(parsePasted('a,b\nc')).toEqual([['a,b'], ['c']])
})
