import {
  type ExistingRow,
  emptyQueue,
  pendingCount,
  reduceQueue,
  rowKey,
  tableKey,
  toOps,
  useChanges,
} from './queue'

const row = (id: string, email: string, n = 7): ExistingRow => ({
  pk: { id },
  original: { id, email, n },
})

test('editing a cell queues an update with the value the user saw as expected', () => {
  const q = reduceQueue(emptyQueue, { type: 'set', row: row('1', 'a@x'), values: { email: 'b@x' } })
  expect(toOps(q)).toEqual([
    { kind: 'update', pk: { id: '1' }, set: { email: 'b@x' }, expected: { email: 'a@x' } },
  ])
})

test('editing the same cell twice keeps one change; going back to the original drops it', () => {
  const r = row('1', 'a@x')
  let q = reduceQueue(emptyQueue, { type: 'set', row: r, values: { email: 'b@x' } })
  q = reduceQueue(q, { type: 'set', row: r, values: { email: 'c@x' } })
  expect(toOps(q)).toEqual([
    { kind: 'update', pk: { id: '1' }, set: { email: 'c@x' }, expected: { email: 'a@x' } },
  ])
  q = reduceQueue(q, { type: 'set', row: r, values: { email: 'a@x' } })
  expect(pendingCount(q)).toBe(0)
  expect(q.updates).toEqual({})
})

test('an int4 loaded as a number equals the same number typed as text', () => {
  const q = reduceQueue(emptyQueue, { type: 'set', row: row('1', 'a@x', 7), values: { n: '7' } })
  expect(pendingCount(q)).toBe(0)
})

test('a new row can be filled in and removed again', () => {
  let q = reduceQueue(emptyQueue, { type: 'insert', id: 'new-1', values: { email: 'z@x' } })
  q = reduceQueue(q, { type: 'setInsert', id: 'new-1', column: 'n', value: '3' })
  q = reduceQueue(q, { type: 'setInsert', id: 'new-1', column: 'email', value: undefined })
  expect(toOps(q)).toEqual([{ kind: 'insert', values: { n: '3' } }])
  q = reduceQueue(q, { type: 'removeInserts', ids: ['new-1'] })
  expect(pendingCount(q)).toBe(0)
})

test('deleting wins over editing, and ops go updates → deletes → inserts', () => {
  const a = row('1', 'a@x')
  const b = row('2', 'b@x')
  let q = reduceQueue(emptyQueue, { type: 'insert', id: 'new-1', values: {} })
  q = reduceQueue(q, { type: 'set', row: a, values: { email: 'edited' } })
  q = reduceQueue(q, { type: 'set', row: b, values: { email: 'edited' } })
  q = reduceQueue(q, { type: 'delete', rows: [a] })
  expect(toOps(q).map((o) => o.kind)).toEqual(['update', 'delete', 'insert'])
  expect(toOps(q)[1]).toEqual({ kind: 'delete', pk: { id: '1' }, expected: a.original })

  // Undoing the delete brings the edit back.
  q = reduceQueue(q, { type: 'undelete', keys: ['{"id":"1"}'] })
  expect(toOps(q).map((o) => o.kind)).toEqual(['update', 'update', 'insert'])
})

test('discard empties the queue', () => {
  let q = reduceQueue(emptyQueue, { type: 'delete', rows: [row('1', 'a@x')] })
  q = reduceQueue(q, { type: 'discard' })
  expect(q).toEqual(emptyQueue)
})

describe('history', () => {
  const t = tableKey('public', 'users')
  const row = { pk: { id: '1' }, original: { id: '1', email: 'a' } }
  const email = () => useChanges.getState().queues[t]?.updates[rowKey(row.pk)]?.set.email
  afterEach(() => useChanges.setState({ queues: {}, history: {} }))

  test('undo and redo step through queue snapshots; a new change drops the redo side', () => {
    const { dispatch, undo, redo } = useChanges.getState()
    dispatch(t, { type: 'set', row, values: { email: 'b' } })
    dispatch(t, { type: 'set', row, values: { email: 'c' } })
    expect(undo(t)).toBe(true)
    expect(email()).toBe('b')
    expect(redo(t)).toBe(true)
    expect(email()).toBe('c')
    expect(redo(t)).toBe(false)
    undo(t)
    dispatch(t, { type: 'set', row, values: { email: 'd' } })
    expect(redo(t)).toBe(false)
    expect(undo(t)).toBe(true)
    expect(email()).toBe('b')
  })

  test('no-op changes add no step and clear forgets everything', () => {
    const { dispatch, undo, clear } = useChanges.getState()
    dispatch(t, { type: 'set', row, values: { email: 'a' } })
    expect(undo(t)).toBe(false)
    dispatch(t, { type: 'set', row, values: { email: 'b' } })
    clear(t)
    expect(email()).toBeUndefined()
    expect(undo(t)).toBe(false)
  })
})
