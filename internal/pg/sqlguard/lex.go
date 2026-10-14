// Package sqlguard tokenizes SQL without cgo: it splits a script into statements (respecting
// quotes, dollar quoting and comments) and flags destructive statements. The flags are a UX aid,
// not a security barrier: the real protection is the Postgres role (see docs).
package sqlguard

import "unicode/utf16"

// Kind is the kind of a token.
type Kind int

// Token kinds. Comments and whitespace produce no tokens.
const (
	Word   Kind = iota // keyword or unquoted identifier
	Ident              // "quoted identifier"
	String             // '…', E'…', B'…', X'…', N'…', U&'…' and $tag$…$tag$
	Number             // numeric literal
	Param              // $1
	Punct              // any other single character: ; ( ) , . :: + …
)

// Token is a lexical token: sql[Start:End] (byte offsets).
type Token struct {
	Kind       Kind
	Start, End int
}

// Scan tokenizes sql. Unterminated strings, quoted identifiers and comments run to the end of the
// input. It assumes standard_conforming_strings=on (the default since PostgreSQL 9.1): backslashes
// only escape inside E'…' strings.
func Scan(sql string) []Token {
	var out []Token
	n := len(sql)
	for i := 0; i < n; {
		c := sql[i]
		start := i
		switch {
		case c == ' ' || c == '\t' || c == '\n' || c == '\r' || c == '\f' || c == '\v':
			i++
			continue
		case c == '-' && i+1 < n && sql[i+1] == '-':
			for i < n && sql[i] != '\n' {
				i++
			}
			continue
		case c == '/' && i+1 < n && sql[i+1] == '*':
			i = skipBlockComment(sql, i)
			continue
		case c == '\'':
			i = scanQuoted(sql, i, '\'', false)
			out = append(out, Token{String, start, i})
		case c == '"':
			i = scanQuoted(sql, i, '"', false)
			out = append(out, Token{Ident, start, i})
		case c == '$':
			if i+1 < n && isDigit(sql[i+1]) {
				for i++; i < n && isDigit(sql[i]); i++ {
				}
				out = append(out, Token{Param, start, i})
			} else if end, ok := scanDollar(sql, i); ok {
				i = end
				out = append(out, Token{String, start, i})
			} else {
				i++
				out = append(out, Token{Punct, start, i})
			}
		case isDigit(c) || (c == '.' && i+1 < n && isDigit(sql[i+1])):
			for i++; i < n && (isIdentChar(sql[i]) || sql[i] == '.'); i++ {
			}
			out = append(out, Token{Number, start, i})
		case isIdentStart(c):
			for i++; i < n && isIdentChar(sql[i]); i++ {
			}
			// Prefixed string constants: E'…' (backslash escapes), B'…', X'…', N'…' and U&'…'.
			if i < n && sql[i] == '\'' && i-start == 1 {
				switch c | 0x20 {
				case 'e':
					i = scanQuoted(sql, i, '\'', true)
					out = append(out, Token{String, start, i})
					continue
				case 'b', 'x', 'n':
					i = scanQuoted(sql, i, '\'', false)
					out = append(out, Token{String, start, i})
					continue
				}
			}
			if i+1 < n && i-start == 1 && c|0x20 == 'u' && sql[i] == '&' && (sql[i+1] == '\'' || sql[i+1] == '"') {
				q := sql[i+1]
				i = scanQuoted(sql, i+1, q, false)
				kind := String
				if q == '"' {
					kind = Ident
				}
				out = append(out, Token{kind, start, i})
				continue
			}
			out = append(out, Token{Word, start, i})
		default:
			i++
			out = append(out, Token{Punct, start, i})
		}
	}
	return out
}

// scanQuoted returns the end of the quoted text starting at sql[i] == q. A doubled quote is an
// escaped quote; with backslash, a backslash escapes the next byte.
func scanQuoted(sql string, i int, q byte, backslash bool) int {
	for i++; i < len(sql); i++ {
		switch sql[i] {
		case '\\':
			if backslash {
				i++
			}
		case q:
			if i+1 < len(sql) && sql[i+1] == q {
				i++
				continue
			}
			return i + 1
		}
	}
	return len(sql)
}

// skipBlockComment returns the end of the /* … */ comment at sql[i]. Block comments nest.
func skipBlockComment(sql string, i int) int {
	depth := 0
	for i < len(sql) {
		switch {
		case sql[i] == '/' && i+1 < len(sql) && sql[i+1] == '*':
			depth++
			i += 2
		case sql[i] == '*' && i+1 < len(sql) && sql[i+1] == '/':
			depth--
			i += 2
			if depth == 0 {
				return i
			}
		default:
			i++
		}
	}
	return len(sql)
}

// scanDollar reads a dollar-quoted string ($$…$$ or $tag$…$tag$) at sql[i] == '$'. It reports
// false when the text at i is not an opening delimiter.
func scanDollar(sql string, i int) (int, bool) {
	j := i + 1
	if j < len(sql) && isIdentStart(sql[j]) {
		for j++; j < len(sql) && isIdentChar(sql[j]) && sql[j] != '$'; j++ {
		}
	}
	if j >= len(sql) || sql[j] != '$' {
		return 0, false
	}
	delim := sql[i : j+1]
	for k := j + 1; k+len(delim) <= len(sql); k++ {
		if sql[k:k+len(delim)] == delim {
			return k + len(delim), true
		}
	}
	return len(sql), true
}

func isDigit(c byte) bool      { return c >= '0' && c <= '9' }
func isIdentStart(c byte) bool { return c == '_' || c|0x20 >= 'a' && c|0x20 <= 'z' || c >= 0x80 }
func isIdentChar(c byte) bool  { return isIdentStart(c) || isDigit(c) || c == '$' }

// UTF16 returns the length in UTF-16 code units of s[:byteOff]: the offset the browser editor uses.
func UTF16(s string, byteOff int) int {
	n := 0
	for _, r := range s[:byteOff] {
		n += utf16.RuneLen(r)
	}
	return n
}
