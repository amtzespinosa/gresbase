package sqlguard

import (
	"slices"
	"testing"
)

func TestPlaceholders(t *testing.T) {
	for _, tc := range []struct {
		sql  string
		want []string
	}{
		{"SELECT * FROM t WHERE id = :id AND name = :name", []string{"id", "name"}},
		{"SELECT :a, :a", []string{"a", "a"}},
		{"SELECT x::int, '{1}'::int[], (y)::text", nil},
		{"SELECT a[1:2], a[lo:hi], f(x):y", nil},
		{"SELECT ':no', \":no\", $$ :no $$, E'\\' :no' -- :no\n/* :no */", nil},
		{"SELECT : spaced, :1, :\"quoted\"", nil},
		{"UPDATE t SET v=:value WHERE id=:id", []string{"value", "id"}},
	} {
		var got []string
		for _, p := range Placeholders(tc.sql, Scan(tc.sql)) {
			got = append(got, p.Name)
			if tc.sql[p.Start:p.End] != ":"+p.Name {
				t.Errorf("%q: range %d-%d", tc.sql, p.Start, p.End)
			}
		}
		if !slices.Equal(got, tc.want) {
			t.Errorf("%q: got %v, want %v", tc.sql, got, tc.want)
		}
	}
}
