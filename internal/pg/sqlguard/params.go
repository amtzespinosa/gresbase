package sqlguard

// Placeholder is a :name parameter of the SQL editor: sql[Start:End] is ":name".
type Placeholder struct {
	Name       string
	Start, End int
}

// Placeholders returns the :name parameters among toks (so never inside strings, quoted
// identifiers or comments). A colon right after an identifier, number, ')', ']' or another colon
// is not one: that keeps casts (x::int) and array slices (a[lo:hi]) out. web/src/features/sql/params.ts
// applies the same rule.
func Placeholders(sql string, toks []Token) []Placeholder {
	var out []Placeholder
	for i, t := range toks {
		if t.Kind != Punct || sql[t.Start] != ':' || i+1 >= len(toks) {
			continue
		}
		next := toks[i+1]
		if next.Kind != Word || next.Start != t.End {
			continue
		}
		if t.Start > 0 {
			if c := sql[t.Start-1]; isIdentChar(c) || c == ':' || c == ')' || c == ']' {
				continue
			}
		}
		out = append(out, Placeholder{Name: sql[next.Start:next.End], Start: t.Start, End: next.End})
	}
	return out
}
