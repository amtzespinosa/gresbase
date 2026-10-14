import {
  addHistory,
  clearHistory,
  HISTORY_LIMIT,
  readHistory,
  searchHistory,
  useHistory,
} from './history'

const entry = (sql: string, at = Date.now()) => ({ sql, at, duration_ms: 1, rows: 1 })

describe('query history', () => {
  it('stores runs newest first and searches them', async () => {
    await addHistory(entry('SELECT * FROM users', 1))
    await addHistory(entry('select count(*) from invoices', 2))
    const all = await readHistory()
    expect(all.map((e) => e.sql)).toEqual(['select count(*) from invoices', 'SELECT * FROM users'])
    expect(searchHistory(all, 'USERS').map((e) => e.sql)).toEqual(['SELECT * FROM users'])
    expect(searchHistory(all, '  ')).toHaveLength(2)
  })

  it(`keeps only the last ${HISTORY_LIMIT} entries`, async () => {
    for (let i = 0; i < HISTORY_LIMIT + 3; i++) await addHistory(entry(`SELECT ${i}`, i))
    const all = await readHistory()
    expect(all).toHaveLength(HISTORY_LIMIT)
    expect(all[0]?.sql).toBe(`SELECT ${HISTORY_LIMIT + 2}`)
    expect(all.at(-1)?.sql).toBe('SELECT 3')
  })

  it('clears, and the UI store follows IndexedDB', async () => {
    await useHistory.getState().add(entry('SELECT 1'))
    expect(useHistory.getState().entries.map((e) => e.sql)).toEqual(['SELECT 1'])
    useHistory.setState({ entries: [] })
    await useHistory.getState().load()
    expect(useHistory.getState().entries).toHaveLength(1)
    await useHistory.getState().clear()
    expect(await readHistory()).toEqual([])
    await clearHistory()
  })

  it('removes one entry, in the UI and in IndexedDB', async () => {
    await useHistory.getState().add(entry('SELECT 1', 1))
    await useHistory.getState().add(entry('SELECT 2', 2))
    const second = useHistory.getState().entries.find((e) => e.sql === 'SELECT 2')
    if (!second) throw new Error('missing')
    await useHistory.getState().remove(second)
    expect(useHistory.getState().entries.map((e) => e.sql)).toEqual(['SELECT 1'])
    expect((await readHistory()).map((e) => e.sql)).toEqual(['SELECT 1'])
    await clearHistory()
  })
})
