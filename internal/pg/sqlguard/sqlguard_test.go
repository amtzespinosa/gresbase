package sqlguard

import (
	"encoding/json"
	"os"
	"testing"
	"unicode/utf16"
)

// The vectors are shared with the TypeScript splitter of the SQL editor.
func TestSplitSharedVectors(t *testing.T) {
	b, err := os.ReadFile("../../../testdata/sql-split-cases.json")
	if err != nil {
		t.Fatal(err)
	}
	var cases []struct {
		Name       string   `json:"name"`
		SQL        string   `json:"sql"`
		Statements []string `json:"statements"`
	}
	if err := json.Unmarshal(b, &cases); err != nil {
		t.Fatal(err)
	}
	for _, tc := range cases {
		t.Run(tc.Name, func(t *testing.T) {
			got := Split(tc.SQL)
			if len(got) != len(tc.Statements) {
				t.Fatalf("got %d statements %q, want %q", len(got), texts(got), tc.Statements)
			}
			u := utf16.Encode([]rune(tc.SQL))
			for i, st := range got {
				if st.Text != tc.Statements[i] {
					t.Errorf("statement %d = %q, want %q", i, st.Text, tc.Statements[i])
				}
				if tc.SQL[st.Offset:st.Offset+len(st.Text)] != st.Text {
					t.Errorf("statement %d: offset %d does not point at its text", i, st.Offset)
				}
				if string(utf16.Decode(u[st.From:st.To])) != st.Text {
					t.Errorf("statement %d: UTF-16 range %d-%d does not point at its text", i, st.From, st.To)
				}
			}
		})
	}
}

func texts(sts []Statement) []string {
	out := []string{}
	for _, s := range sts {
		out = append(out, s.Text)
	}
	return out
}

func TestClassify(t *testing.T) {
	for _, tc := range []struct {
		sql, kind, level string
	}{
		{"SELECT 1", "", ""},
		{"DROP TABLE users", KindDrop, Danger},
		{"drop index if exists i", KindDrop, Danger},
		{"TRUNCATE invoices CASCADE", KindTruncate, Danger},
		{"ALTER TABLE users DROP COLUMN email", KindAlterDrop, Danger},
		{"ALTER TABLE users ALTER COLUMN email DROP NOT NULL", KindAlterDrop, Danger},
		{"ALTER TABLE users ADD COLUMN x int", "", ""},
		{"ALTER TABLE t ADD CONSTRAINT c CHECK (x IN ('drop'))", "", ""},
		{"DELETE FROM users", KindDeleteAll, Danger},
		{"DELETE FROM users WHERE id = 1", KindDelete, Warning},
		{"delete from users using orgs where orgs.id = users.org_id", KindDelete, Warning},
		{"UPDATE users SET name = 'x'", KindUpdateAll, Danger},
		{"UPDATE users SET name = 'x' WHERE id = 1", KindUpdate, Warning},
		{"UPDATE users SET org_id = (SELECT id FROM orgs WHERE name = 'a')", KindUpdateAll, Danger},
		{"UPDATE users SET note = 'where' ", KindUpdateAll, Danger},
		{"UPDATE users SET \"where\" = 1", KindUpdateAll, Danger},
		{"SELECT * FROM users FOR UPDATE", "", ""},
		{"SELECT * FROM users FOR NO KEY UPDATE", "", ""},
		{"INSERT INTO t VALUES (1) ON CONFLICT (id) DO UPDATE SET a = 1", "", ""},
		{"CREATE TABLE t (id int REFERENCES u ON DELETE CASCADE ON UPDATE CASCADE)", "", ""},
		{"GRANT UPDATE, DELETE ON t TO r", "", ""},
		{"CREATE TRIGGER x BEFORE UPDATE OR DELETE ON t FOR EACH ROW EXECUTE FUNCTION f()", "", ""},
		{"WITH gone AS (DELETE FROM sessions RETURNING id) SELECT count(*) FROM gone", KindDeleteAll, Danger},
		{"WITH gone AS (DELETE FROM sessions WHERE id < 5 RETURNING id) SELECT count(*) FROM gone", KindDelete, Warning},
		{"WITH x AS (SELECT 1) UPDATE users SET name = 'a'", KindUpdateAll, Danger},
		{"WITH x AS (SELECT id FROM orgs WHERE id = 1) DELETE FROM users WHERE org_id IN (SELECT id FROM x)", KindDelete, Warning},
		{"MERGE INTO t USING s ON t.id = s.id WHEN NOT MATCHED THEN INSERT VALUES (s.id)", "", ""},
		{"MERGE INTO t USING s ON t.id = s.id WHEN MATCHED THEN DELETE", KindDelete, Warning},
		{"merge into t using s on t.id = s.id when matched and s.gone then delete when matched then update set a = s.a", KindDelete, Warning},
		{"MERGE INTO t USING s ON t.id = s.id WHEN MATCHED THEN UPDATE SET a = s.a", KindUpdate, Warning},
		{"MERGE INTO t USING s ON t.id = s.id WHEN MATCHED THEN UPDATE SET a = 1 WHEN NOT MATCHED BY SOURCE THEN DELETE", KindDeleteAll, Danger},
		{"MERGE INTO t USING s ON t.id = s.id WHEN NOT MATCHED BY SOURCE AND t.old THEN DELETE", KindDelete, Warning},
		{"MERGE INTO t USING s ON t.id = s.id WHEN NOT MATCHED BY SOURCE THEN UPDATE SET a = 0", KindUpdateAll, Danger},
		{"MERGE INTO t USING (SELECT id FROM s WHERE x AND y) q ON t.id = q.id WHEN MATCHED THEN DO NOTHING", "", ""},
		{"WITH s AS (SELECT 1 AS id) MERGE INTO t USING s ON t.id = s.id WHEN MATCHED THEN DELETE", KindDelete, Warning},
		{"EXPLAIN ANALYZE MERGE INTO t USING s ON true WHEN NOT MATCHED BY SOURCE THEN DELETE", KindDeleteAll, Danger},
		{"SELECT merge FROM t", "", ""},
		{"EXPLAIN DELETE FROM users", "", ""},
		{"EXPLAIN ANALYZE DELETE FROM users", KindDeleteAll, Danger},
		{"EXPLAIN (ANALYZE, BUFFERS) UPDATE users SET name = 'x'", KindUpdateAll, Danger},
		{"EXPLAIN (COSTS off) UPDATE users SET name = 'x'", "", ""},
		{"SELECT 'DROP TABLE users'", "", ""},
		{"-- DROP TABLE users\nSELECT 1", "", ""},
	} {
		st := Split(tc.sql)
		if len(st) != 1 {
			t.Fatalf("%q: %d statements", tc.sql, len(st))
		}
		kind, level := Classify(tc.sql, st[0].Tokens)
		if kind != tc.kind || level != tc.level {
			t.Errorf("Classify(%q) = %q, %q; want %q, %q", tc.sql, kind, level, tc.kind, tc.level)
		}
	}
}

func TestAnalyze(t *testing.T) {
	sql := "SELECT 1;\nDELETE FROM users WHERE id = 1;\nDROP TABLE 'ñ';"
	a := Analyze(sql)
	if !a.RequiresConfirmation || len(a.Findings) != 2 {
		t.Fatalf("analysis = %+v", a)
	}
	if f := a.Findings[0]; f.Statement != 1 || f.Kind != KindDelete || f.Level != Warning || f.From != 10 {
		t.Errorf("first finding = %+v", f)
	}
	if f := a.Findings[1]; f.Statement != 2 || f.Kind != KindDrop || f.To != len(utf16.Encode([]rune(sql)))-1 {
		t.Errorf("second finding = %+v", f)
	}
	if a := Analyze("UPDATE t SET a = 1 WHERE b"); a.RequiresConfirmation || len(a.Findings) != 1 {
		t.Errorf("warnings alone must not require confirmation: %+v", a)
	}
}
