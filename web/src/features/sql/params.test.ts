import { paramNames } from './params'

// Same cases as internal/pg/sqlguard params_test.go.
test.each([
  ['SELECT * FROM t WHERE id = :id AND name = :name', ['id', 'name']],
  ['SELECT :a, :a', ['a']],
  ["SELECT x::int, '{1}'::int[], (y)::text", []],
  ['SELECT a[1:2], a[lo:hi], f(x):y', []],
  ["SELECT ':no', \":no\", $$ :no $$, E'\\' :no' -- :no\n/* :no */", []],
  ['SELECT : spaced, :1, :"quoted"', []],
  ['UPDATE t SET v=:value WHERE id=:id', ['value', 'id']],
])('%s', (sql, names) => {
  expect(paramNames(sql)).toEqual(names)
})
