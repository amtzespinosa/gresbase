package rows_test

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"strings"
	"testing"
	"time"

	"github.com/amtzespinosa/gresbase/internal/pg/introspect"
	"github.com/amtzespinosa/gresbase/internal/pg/pgvalue"
	"github.com/amtzespinosa/gresbase/internal/pg/rows"
	"github.com/amtzespinosa/gresbase/internal/pgtest"
)

func TestExportCSVEscaping(t *testing.T) {
	pool := pgtest.PoolFor(t, pgtest.NewDatabase(t))
	ctx := context.Background()
	if _, err := pool.Exec(ctx, `CREATE TABLE export_cases (id int PRIMARY KEY, "v,""q" text, b bytea);
		INSERT INTO export_cases VALUES (1, 'a,b', '\xdead'), (2, 'say "hi"', NULL), (3, e'line1\nline2', NULL),
			(4, '', ''), (5, NULL, NULL), (6, e'\\.', NULL), (7, e'cr\rlf', NULL), (8, ' padded ', NULL)`); err != nil {
		t.Fatal(err)
	}
	tbl, err := introspect.New(pool).Lookup(ctx, "public", "export_cases")
	if err != nil {
		t.Fatal(err)
	}
	var out bytes.Buffer
	if err := rows.ExportCSV(ctx, pool, tbl, rows.Query{}, &out); err != nil {
		t.Fatal(err)
	}
	want := "id,\"v,\"\"q\",b\n1,\"a,b\",\\xdead\n2,\"say \"\"hi\"\"\",\n3,\"line1\nline2\",\n4,\"\",\\x\n5,,\n" +
		"6,\\.,\n7,\"cr\rlf\",\n8, padded ,\n"
	if out.String() != want {
		t.Errorf("csv:\n%q\nwant\n%q", out.String(), want)
	}

	// Alone on its line, \. would read as end of data: COPY quotes it.
	if _, err := pool.Exec(ctx, `CREATE TABLE lone (v text); INSERT INTO lone VALUES (e'\\.')`); err != nil {
		t.Fatal(err)
	}
	if tbl, err = introspect.New(pool).Lookup(ctx, "public", "lone"); err != nil {
		t.Fatal(err)
	}
	out.Reset()
	if err := rows.ExportCSV(ctx, pool, tbl, rows.Query{}, &out); err != nil || out.String() != "v\n\"\\.\"\n" {
		t.Errorf("lone \\. = %q, %v", out.String(), err)
	}
}

// Filter values and column names travel as parameters and quoted identifiers: hostile ones are
// matched literally and leave the table intact.
func TestExportFilterInjection(t *testing.T) {
	pool := pgtest.PoolFor(t, pgtest.NewDatabase(t))
	ctx := context.Background()
	if _, err := pool.Exec(ctx, `CREATE TABLE victim (id int PRIMARY KEY, "na'me"")--" text);
		INSERT INTO victim VALUES (1, 'x''); DROP TABLE victim; --'), (2, 'plain'), (3, e'back\\slash''')`); err != nil {
		t.Fatal(err)
	}
	tbl, err := introspect.New(pool).Lookup(ctx, "public", "victim")
	if err != nil {
		t.Fatal(err)
	}
	col := `na'me")--`
	for _, tc := range []struct {
		name string
		f    rows.Filter
		want string // ids in the export
	}{
		{"eq", rows.Filter{Column: col, Op: "eq", Value: raw(`"x'); DROP TABLE victim; --"`)}, "1"},
		{"contains", rows.Filter{Column: col, Op: "contains", Value: raw(`"'); DROP"`)}, "1"},
		{"backslash", rows.Filter{Column: col, Op: "eq", Value: raw(`"back\\slash'"`)}, "3"},
		{"in", rows.Filter{Column: col, Op: "in", Value: raw(`["plain", "' OR '1'='1"]`)}, "2"},
		{"no match", rows.Filter{Column: col, Op: "eq", Value: raw(`"' OR '1'='1"`)}, ""},
	} {
		var out bytes.Buffer
		if err := rows.ExportCSV(ctx, pool, tbl, rows.Query{Filters: []rows.Filter{tc.f}}, &out); err != nil {
			t.Fatalf("%s: %v", tc.name, err)
		}
		lines := strings.Split(strings.TrimSuffix(out.String(), "\n"), "\n")
		var ids []string
		for _, l := range lines[1:] {
			ids = append(ids, strings.SplitN(l, ",", 2)[0])
		}
		if got := strings.Join(ids, " "); got != tc.want {
			t.Errorf("%s: ids %q, want %q\n%s", tc.name, got, tc.want, out.String())
		}
	}
	var n int
	if err := pool.QueryRow(ctx, "SELECT count(*) FROM victim").Scan(&n); err != nil || n != 3 {
		t.Fatalf("victim table: %d rows, %v", n, err)
	}
}

func TestExportFilters(t *testing.T) {
	e := newEnv(t)
	users := e.table(t, "public", "users")
	ctx := context.Background()
	for _, tc := range []struct {
		name  string
		q     rows.Query
		lines int // CSV lines including the header
	}{
		{"filtered", rows.Query{Filters: []rows.Filter{{Column: "plan", Op: "eq", Value: raw(`"pro"`)}}}, 4001},
		{"quote in value", rows.Query{Filters: []rows.Filter{{Column: "email", Op: "eq", Value: raw(`"x' OR '1'='1"`)}}}, 1},
		{"limit and offset ignored", rows.Query{Limit: 2, Offset: 5, Sort: []rows.Sort{{Column: "email", Dir: "desc"}}}, 12002},
	} {
		var out bytes.Buffer
		if err := rows.ExportCSV(ctx, e.pool, users, tc.q, &out); err != nil {
			t.Fatalf("%s: %v", tc.name, err)
		}
		if n := strings.Count(out.String(), "\n"); n != tc.lines {
			t.Errorf("%s: %d lines, want %d", tc.name, n, tc.lines)
		}
	}

	var out bytes.Buffer
	q := rows.Query{Filters: []rows.Filter{{Column: "plan", Op: "eq", Value: raw(`"pro"`)}}}
	if err := rows.ExportJSON(ctx, e.pool, e.types, users, q, &out); err != nil {
		t.Fatal(err)
	}
	var got []map[string]any
	if err := json.Unmarshal(out.Bytes(), &got); err != nil {
		t.Fatalf("invalid JSON: %v", err)
	}
	if len(got) != 4000 {
		t.Errorf("json: %d rows, want 4000", len(got))
	}
}

func TestExportJSONFullValues(t *testing.T) {
	e := newEnv(t)
	users := e.table(t, "public", "users")
	var out bytes.Buffer
	q := rows.Query{Filters: []rows.Filter{{Column: "id", Op: "in", Value: raw(`["1", "9007199254740993"]`)}},
		Sort: []rows.Sort{{Column: "id", Dir: "asc"}}}
	if err := rows.ExportJSON(context.Background(), e.pool, e.types, users, q, &out); err != nil {
		t.Fatal(err)
	}
	var got []map[string]any
	if err := json.Unmarshal(out.Bytes(), &got); err != nil {
		t.Fatalf("invalid JSON: %v\n%.500s", err, out.String())
	}
	if len(got) != 2 {
		t.Fatalf("%d rows, want 2", len(got))
	}
	if bio, _ := got[0]["bio"].(string); len(bio) < 20_000 {
		t.Errorf("bio truncated: %d bytes", len(bio))
	}
	if av, ok := got[0]["avatar"].(string); got[0]["avatar"] != nil && (!ok || !strings.HasPrefix(av, `\x`)) {
		t.Errorf("avatar = %v, want hex text", got[0]["avatar"])
	}
	if got[1]["id"] != "9007199254740993" {
		t.Errorf("id = %v, want int8 as text", got[1]["id"])
	}
	if _, ok := got[0]["settings"].(map[string]any); !ok {
		t.Errorf("settings = %v, want a JSON object", got[0]["settings"])
	}

	out.Reset()
	empty := rows.Query{Filters: []rows.Filter{{Column: "id", Op: "eq", Value: raw(`"-1"`)}}}
	if err := rows.ExportJSON(context.Background(), e.pool, e.types, users, empty, &out); err != nil || out.String() != "[]\n" {
		t.Errorf("empty export = %q, %v", out.String(), err)
	}
}

// writeStats records how the export writes: many small writes mean it streams instead of building
// the whole file in memory.
type writeStats struct {
	writes, total, largest int
}

func (s *writeStats) Write(p []byte) (int, error) {
	s.writes++
	s.total += len(p)
	s.largest = max(s.largest, len(p))
	return len(p), nil
}

func TestExportStreams(t *testing.T) {
	e := newEnv(t)
	users := e.table(t, "public", "users")
	for name, export := range map[string]func(w *writeStats) error{
		"csv": func(w *writeStats) error { return rows.ExportCSV(context.Background(), e.pool, users, rows.Query{}, w) },
		"json": func(w *writeStats) error {
			return rows.ExportJSON(context.Background(), e.pool, e.types, users, rows.Query{}, w)
		},
	} {
		var w writeStats
		if err := export(&w); err != nil {
			t.Fatalf("%s: %v", name, err)
		}
		// 12,001 rows: one write per row; the largest is the row with the 23 KB bio.
		if w.writes < 12_000 || w.largest > 64<<10 || w.total < 1<<20 {
			t.Errorf("%s: %d writes, largest %d, total %d", name, w.writes, w.largest, w.total)
		}
	}
}

// cancelAfter cancels the export context on the first write, as when the client disconnects.
type cancelAfter struct {
	cancel context.CancelFunc
	bytes  int
}

func (c *cancelAfter) Write(p []byte) (int, error) {
	c.cancel()
	c.bytes += len(p)
	return len(p), nil
}

func TestExportCanceled(t *testing.T) {
	e := newEnv(t)
	users := e.table(t, "public", "users")
	for name, export := range map[string]func(ctx context.Context, w *cancelAfter) error{
		"csv": func(ctx context.Context, w *cancelAfter) error {
			return rows.ExportCSV(ctx, e.pool, users, rows.Query{}, w)
		},
		"json": func(ctx context.Context, w *cancelAfter) error {
			return rows.ExportJSON(ctx, e.pool, pgvalue.NewTypes(), users, rows.Query{}, w)
		},
	} {
		ctx, cancel := context.WithCancel(context.Background())
		w := &cancelAfter{cancel: cancel}
		err := export(ctx, w)
		if err == nil || !errors.Is(err, context.Canceled) && !strings.Contains(err.Error(), "cancel") {
			t.Errorf("%s: err = %v, want canceled", name, err)
		}
		if w.bytes > 1<<20 {
			t.Errorf("%s: kept writing after cancel: %d bytes", name, w.bytes)
		}
		deadline := time.Now().Add(5 * time.Second)
		for e.pool.Stat().AcquiredConns() > 0 && time.Now().Before(deadline) {
			time.Sleep(50 * time.Millisecond)
		}
		if n := e.pool.Stat().AcquiredConns(); n > 0 {
			t.Errorf("%s: %d connections still acquired", name, n)
		}
	}
}
