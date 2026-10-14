package sqlguard

import "strings"

// Statement is one statement of a script: Text is sql[Offset:Offset+len(Text)], from its first
// token to its last (leading and trailing comments and the ';' are left out). From and To are the
// same range in UTF-16 code units, the unit of the browser editor.
type Statement struct {
	Text     string
	Offset   int
	From, To int
	Tokens   []Token // offsets in the original script
}

// Split splits a script at top-level semicolons. Semicolons inside strings, quoted identifiers,
// dollar quotes, comments and BEGIN ATOMIC … END function bodies do not split. Statements made only
// of comments or whitespace are dropped.
func Split(sql string) []Statement {
	var out []Statement
	var cur []Token
	atomic := 0 // nesting inside BEGIN ATOMIC … END (CASE … END nests too)
	flush := func() {
		if len(cur) > 0 {
			s, e := cur[0].Start, cur[len(cur)-1].End
			out = append(out, Statement{Text: sql[s:e], Offset: s, From: UTF16(sql, s), To: UTF16(sql, e), Tokens: cur})
		}
		cur, atomic = nil, 0
	}
	for _, t := range Scan(sql) {
		if t.Kind == Punct && sql[t.Start] == ';' && atomic == 0 {
			flush()
			continue
		}
		if t.Kind == Word {
			switch w := sql[t.Start:t.End]; {
			case strings.EqualFold(w, "atomic") && len(cur) > 0 && isWord(sql, cur[len(cur)-1], "begin"):
				atomic++
			case atomic > 0 && strings.EqualFold(w, "case"):
				atomic++
			case atomic > 0 && strings.EqualFold(w, "end"):
				atomic--
			}
		}
		cur = append(cur, t)
	}
	flush()
	return out
}

func isWord(sql string, t Token, w string) bool {
	return t.Kind == Word && strings.EqualFold(sql[t.Start:t.End], w)
}
