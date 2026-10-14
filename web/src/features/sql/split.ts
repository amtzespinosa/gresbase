// Port of internal/pg/sqlguard (Scan + Split): both pass testdata/sql-split-cases.json. JS strings are
// UTF-16, so offsets here are already the editor's (and the API's `from`/`to`).

type Kind = 'word' | 'ident' | 'string' | 'number' | 'param' | 'punct'

export interface Token {
  kind: Kind
  start: number
  end: number
}

/** One statement of a script: `text` is `sql.slice(from, to)`, without surrounding comments and `;`. */
export interface Statement {
  text: string
  from: number
  to: number
}

const isDigit = (c: string) => c >= '0' && c <= '9'
const isIdentStart = (c: string) =>
  c === '_' || (c.toLowerCase() >= 'a' && c.toLowerCase() <= 'z') || c.charCodeAt(0) >= 0x80
const isIdentChar = (c: string) => isIdentStart(c) || isDigit(c) || c === '$'

/** End of the quoted text at sql.charAt(i) === q. A doubled quote escapes; with `backslash`, so does `\`. */
function scanQuoted(sql: string, i: number, q: string, backslash: boolean): number {
  for (i++; i < sql.length; i++) {
    if (sql.charAt(i) === '\\' && backslash) i++
    else if (sql.charAt(i) === q) {
      if (sql.charAt(i + 1) === q) i++
      else return i + 1
    }
  }
  return sql.length
}

/** End of the (nesting) block comment at sql.charAt(i). */
function skipBlockComment(sql: string, i: number): number {
  let depth = 0
  while (i < sql.length) {
    if (sql.charAt(i) === '/' && sql.charAt(i + 1) === '*') {
      depth++
      i += 2
    } else if (sql.charAt(i) === '*' && sql.charAt(i + 1) === '/') {
      depth--
      i += 2
      if (depth === 0) return i
    } else i++
  }
  return sql.length
}

/** End of a $tag$…$tag$ string at sql.charAt(i) === '$', or -1 when it is not an opening delimiter. */
function scanDollar(sql: string, i: number): number {
  let j = i + 1
  if (j < sql.length && isIdentStart(sql.charAt(j))) {
    for (j++; j < sql.length && isIdentChar(sql.charAt(j)) && sql.charAt(j) !== '$'; j++);
  }
  if (sql.charAt(j) !== '$') return -1
  const delim = sql.slice(i, j + 1)
  const end = sql.indexOf(delim, j + 1)
  return end < 0 ? sql.length : end + delim.length
}

export function scan(sql: string): Token[] {
  const out: Token[] = []
  const n = sql.length
  for (let i = 0; i < n;) {
    const c = sql.charAt(i)
    const start = i
    const push = (kind: Kind) => out.push({ kind, start, end: i })
    if (' \t\n\r\f\v'.includes(c)) {
      i++
    } else if (c === '-' && sql.charAt(i + 1) === '-') {
      while (i < n && sql.charAt(i) !== '\n') i++
    } else if (c === '/' && sql.charAt(i + 1) === '*') {
      i = skipBlockComment(sql, i)
    } else if (c === "'") {
      i = scanQuoted(sql, i, "'", false)
      push('string')
    } else if (c === '"') {
      i = scanQuoted(sql, i, '"', false)
      push('ident')
    } else if (c === '$') {
      if (i + 1 < n && isDigit(sql.charAt(i + 1))) {
        for (i++; i < n && isDigit(sql.charAt(i)); i++);
        push('param')
      } else {
        const end = scanDollar(sql, i)
        i = end < 0 ? i + 1 : end
        push(end < 0 ? 'punct' : 'string')
      }
    } else if (isDigit(c) || (c === '.' && i + 1 < n && isDigit(sql.charAt(i + 1)))) {
      for (i++; i < n && (isIdentChar(sql.charAt(i)) || sql.charAt(i) === '.'); i++);
      push('number')
    } else if (isIdentStart(c)) {
      for (i++; i < n && isIdentChar(sql.charAt(i)); i++);
      const p = c.toLowerCase()
      // Prefixed strings: E'…' (backslash escapes), B'…', X'…', N'…', U&'…' and U&"…".
      if (sql.charAt(i) === "'" && i - start === 1 && 'ebxn'.includes(p)) {
        i = scanQuoted(sql, i, "'", p === 'e')
        push('string')
      } else if (
        i - start === 1 &&
        p === 'u' &&
        sql.charAt(i) === '&' &&
        (sql.charAt(i + 1) === "'" || sql.charAt(i + 1) === '"')
      ) {
        const q = sql.charAt(i + 1)
        i = scanQuoted(sql, i + 1, q, false)
        push(q === '"' ? 'ident' : 'string')
      } else push('word')
    } else {
      i++
      push('punct')
    }
  }
  return out
}

/**
 * Splits a script at top-level semicolons (not inside strings, quoted identifiers, dollar quotes,
 * comments or BEGIN ATOMIC … END bodies). Statements of only comments or whitespace are dropped.
 */
export function splitSql(sql: string): Statement[] {
  const out: Statement[] = []
  let cur: Token[] = []
  let atomic = 0
  const word = (t: Token | undefined, w: string) =>
    t?.kind === 'word' && sql.slice(t.start, t.end).toLowerCase() === w
  const flush = () => {
    const first = cur[0]
    const last = cur.at(-1)
    if (first && last)
      out.push({ text: sql.slice(first.start, last.end), from: first.start, to: last.end })
    cur = []
    atomic = 0
  }
  for (const t of scan(sql)) {
    if (t.kind === 'punct' && sql.charAt(t.start) === ';' && atomic === 0) {
      flush()
      continue
    }
    if (word(t, 'atomic') && word(cur.at(-1), 'begin')) atomic++
    else if (atomic > 0 && word(t, 'case')) atomic++
    else if (atomic > 0 && word(t, 'end')) atomic--
    cur.push(t)
  }
  flush()
  return out
}

/**
 * The statement to run for a cursor at `pos`: the one containing it, else the last one before it
 * (the cursor is after its `;`), else the first.
 */
export function statementAt(statements: Statement[], pos: number): Statement | undefined {
  let found = statements[0]
  for (const s of statements) {
    if (s.from > pos) break
    found = s
  }
  return found
}
