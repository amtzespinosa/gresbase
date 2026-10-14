package sqlguard

import "strings"

// Levels of a finding: danger statements need an explicit confirmation before running outside a
// transaction; warnings are only shown.
const (
	Danger  = "danger"
	Warning = "warning"
)

// Kinds of destructive statements.
const (
	KindDrop      = "drop"       // DROP …
	KindTruncate  = "truncate"   // TRUNCATE …
	KindAlterDrop = "alter_drop" // ALTER … DROP …
	KindDeleteAll = "delete_all" // DELETE without WHERE
	KindUpdateAll = "update_all" // UPDATE without WHERE
	KindDelete    = "delete"     // DELETE … WHERE
	KindUpdate    = "update"     // UPDATE … WHERE
)

// Finding flags one statement of a script. From and To are the statement range in UTF-16 code
// units of the script.
type Finding struct {
	Statement int    `json:"statement"`
	Kind      string `json:"kind" tstype:"'drop' | 'truncate' | 'alter_drop' | 'delete_all' | 'update_all' | 'delete' | 'update'"`
	Level     string `json:"level" tstype:"'danger' | 'warning'"`
	From      int    `json:"from"`
	To        int    `json:"to"`
}

// Analysis is the result of Analyze (and the body of POST /api/v1/sql/analyze).
type Analysis struct {
	Findings             []Finding `json:"findings"`
	RequiresConfirmation bool      `json:"requires_confirmation"`
}

// Analyze classifies every statement of a script.
func Analyze(sql string) Analysis {
	a := Analysis{Findings: []Finding{}}
	for i, st := range Split(sql) {
		kind, level := Classify(sql, st.Tokens)
		if kind == "" {
			continue
		}
		a.Findings = append(a.Findings, Finding{Statement: i, Kind: kind, Level: level, From: st.From, To: st.To})
		a.RequiresConfirmation = a.RequiresConfirmation || level == Danger
	}
	return a
}

// Classify returns the most severe kind and level of one statement (its tokens within sql), or
// "" when it is not destructive.
func Classify(sql string, toks []Token) (kind, level string) {
	word := func(i int) string {
		if i < 0 || i >= len(toks) || toks[i].Kind != Word {
			return ""
		}
		return strings.ToLower(sql[toks[i].Start:toks[i].End])
	}
	punct := func(i int, c byte) bool {
		return i >= 0 && i < len(toks) && toks[i].Kind == Punct && sql[toks[i].Start] == c
	}

	start := 0
	if word(0) == "explain" { // only EXPLAIN ANALYZE runs the statement
		start = 1
		analyze := false
		if punct(1, '(') {
			for d := 0; start < len(toks); start++ {
				analyze = analyze || word(start) == "analyze"
				if punct(start, '(') {
					d++
				} else if punct(start, ')') {
					if d--; d == 0 {
						start++
						break
					}
				}
			}
		} else {
			for ; word(start) == "analyze" || word(start) == "analyse" || word(start) == "verbose"; start++ {
				analyze = analyze || word(start) != "verbose"
			}
		}
		if !analyze {
			return "", ""
		}
	}

	switch word(start) {
	case "drop":
		return KindDrop, Danger
	case "truncate":
		return KindTruncate, Danger
	case "alter":
		depth := 0
		for i := start; i < len(toks); i++ {
			switch {
			case punct(i, '('):
				depth++
			case punct(i, ')'):
				depth--
			case depth == 0 && word(i) == "drop":
				return KindAlterDrop, Danger
			}
		}
		return "", ""
	}

	// DELETE and UPDATE, also inside WITH: they run as commands when they start the statement, open
	// a parenthesis (a CTE) or follow the CTE list of a WITH statement.
	with := word(start) == "with"
	depth := 0
	for i := start; i < len(toks); i++ {
		if punct(i, '(') {
			depth++
			continue
		}
		if punct(i, ')') {
			depth--
			continue
		}
		w := word(i)
		if w == "merge" && (i == start || (with && depth == 0 && punct(i-1, ')'))) {
			return mergeKind(toks, i, punct, word)
		}
		if w != "delete" && w != "update" {
			continue
		}
		if i != start && !punct(i-1, '(') && (!with || depth != 0 || !punct(i-1, ')')) {
			continue
		}
		k, l := dml(w, hasWhere(toks, i, punct, word))
		if l == Danger {
			return k, l
		}
		if kind == "" {
			kind, level = k, l
		}
	}
	return kind, level
}

// hasWhere reports whether the command starting at toks[i] has a WHERE at its own parenthesis
// depth before it ends (end of statement or the parenthesis that encloses it).
func hasWhere(toks []Token, i int, punct func(int, byte) bool, word func(int) string) bool {
	depth := 0
	for ; i < len(toks); i++ {
		switch {
		case punct(i, '('):
			depth++
		case punct(i, ')'):
			if depth--; depth < 0 {
				return false
			}
		case depth == 0 && word(i) == "where":
			return true
		}
	}
	return false
}

// mergeKind classifies a MERGE starting at toks[i] by its WHEN … THEN DELETE/UPDATE actions. The
// ON condition limits matched rows like a WHERE (warning); WHEN NOT MATCHED BY SOURCE (17+)
// without an AND condition touches every target row missing from the source, which may be all of
// them (danger).
func mergeKind(toks []Token, i int, punct func(int, byte) bool, word func(int) string) (kind, level string) {
	depth := 0
	bySource, cond := false, false
	for ; i < len(toks); i++ {
		switch {
		case punct(i, '('):
			depth++
		case punct(i, ')'):
			depth--
		case depth != 0:
		case word(i) == "when":
			bySource, cond = false, false
		case word(i) == "source":
			bySource = true
		case word(i) == "and":
			cond = true
		case word(i) == "then" && (word(i+1) == "delete" || word(i+1) == "update"):
			k, l := dml(word(i+1), !bySource || cond)
			if l == Danger {
				return k, l
			}
			if kind == "" {
				kind, level = k, l
			}
		}
	}
	return kind, level
}

func dml(w string, where bool) (string, string) {
	switch {
	case w == "delete" && where:
		return KindDelete, Warning
	case w == "delete":
		return KindDeleteAll, Danger
	case where:
		return KindUpdate, Warning
	default:
		return KindUpdateAll, Danger
	}
}
