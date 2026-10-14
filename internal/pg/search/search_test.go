package search_test

import (
	"context"
	"errors"
	"fmt"
	"net/url"
	"strings"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/amtzespinosa/gresbase/internal/pg/search"
	"github.com/amtzespinosa/gresbase/internal/pgtest"
)

func TestMain(m *testing.M) { pgtest.Main(m) }

func run(t *testing.T, pool *pgxpool.Pool, req search.SearchRequest) []search.SearchEvent {
	t.Helper()
	var events []search.SearchEvent
	if err := search.Run(context.Background(), pool, req, func(e search.SearchEvent) error {
		events = append(events, e)
		return nil
	}); err != nil {
		t.Fatalf("search %q: %v", req.Q, err)
	}
	return events
}

// matches lists "table.column=snippet" for the rows found, and the skipped tables as "table:reason".
func matches(events []search.SearchEvent) (found []string, skipped []string) {
	for _, e := range events {
		for _, m := range e.Rows {
			found = append(found, e.Table+"."+m.Column+"="+m.Snippet)
		}
		if e.Type == "skipped" {
			skipped = append(skipped, e.Table+":"+e.Reason)
		}
	}
	return found, skipped
}

func exec(t *testing.T, pool *pgxpool.Pool, sql string) {
	t.Helper()
	if _, err := pool.Exec(context.Background(), sql); err != nil {
		t.Fatalf("%s: %v", sql, err)
	}
}

func TestColumnsAndTerms(t *testing.T) {
	pool := pgtest.PoolFor(t, pgtest.NewDatabase(t))
	exec(t, pool, `
CREATE TYPE mood AS ENUM ('qqhappy', 'qqsad');
CREATE TABLE qq (
  id int PRIMARY KEY, name text, code varchar(20), m mood, n int2, big int8, amount numeric(10, 2),
  u uuid, d date, ts timestamptz, j jsonb);
INSERT INTO qq VALUES
  (1, 'qq 100% sure', 'qq_under', 'qqhappy', 77, 9000000000, 12.50,
   'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', '2031-05-06', '2031-05-07 23:30+00', '{"k": "qqjson"}'),
  (2, 'qq 1000 sure', 'qqXunder', 'qqsad', 8, 1, 3, NULL, NULL, NULL, NULL);`)
	cases := []struct {
		q    string
		want []string
	}{
		// LIKE wildcards in the term are literal.
		{"100%", []string{"qq.name=qq 100% sure"}},
		{"qq_u", []string{"qq.code=qq_under"}},
		// Enums match as text; JSON is not searched.
		{"QQHAP", []string{"qq.m=qqhappy"}},
		{"qqjson", nil},
		// Numbers only where they fit: 9000000000 is not an int2 or int4, and no error either.
		{"9000000000", []string{"qq.big=9000000000"}},
		{"12.5", []string{"qq.amount=12.50"}},
		{"a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11", []string{"qq.u=a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11"}},
		{"2031-05-06", []string{"qq.d=2031-05-06"}},
	}
	for _, tc := range cases {
		events := run(t, pool, search.SearchRequest{Q: tc.q, Tables: []search.SearchTableRef{{Schema: "public", Table: "qq"}}})
		found, skipped := matches(events)
		if strings.Join(found, "|") != strings.Join(tc.want, "|") || len(skipped) > 0 {
			t.Errorf("%q: found %v, skipped %v; want %v", tc.q, found, skipped, tc.want)
		}
	}
	// A row's primary key comes with the match, and the exact value for non-text columns.
	events := run(t, pool, search.SearchRequest{Q: "77", Tables: []search.SearchTableRef{{Schema: "public", Table: "qq"}}})
	if e := events[1]; len(e.Rows) != 1 || e.Rows[0].Key["id"] != "1" || e.Rows[0].Value != "77" ||
		strings.Join(e.PrimaryKey, ",") != "id" {
		t.Errorf("event = %+v", e)
	}
	if err := search.Run(context.Background(), pool, search.SearchRequest{Q: "x"}, func(search.SearchEvent) error { return nil }); !errors.Is(err, search.ErrInvalid) {
		t.Errorf("one character: %v", err)
	}
}

func TestSnippetAroundTheMatch(t *testing.T) {
	pool := pgtest.PoolFor(t, pgtest.NewDatabase(t))
	exec(t, pool, `CREATE TABLE long (id int PRIMARY KEY, body text);
INSERT INTO long VALUES (1, repeat('ñandú ', 100) || 'NEEDLE' || repeat(' after', 100));`)
	events := run(t, pool, search.SearchRequest{Q: "needle", Tables: []search.SearchTableRef{{Schema: "public", Table: "long"}}})
	s := events[1].Rows[0].Snippet
	if !strings.HasPrefix(s, "…") || !strings.HasSuffix(s, "…") || !strings.Contains(s, "NEEDLE") ||
		len([]rune(s)) > 202 {
		t.Errorf("snippet = %q", s)
	}
}

// roleDSN is dsn signed in as role.
func roleDSN(t *testing.T, dsn, role string) string {
	t.Helper()
	u, err := url.Parse(dsn)
	if err != nil {
		t.Fatal(err)
	}
	u.User = url.UserPassword(role, "pw")
	return u.String()
}

func TestPermissionsRLSAndTimeout(t *testing.T) {
	dsn := pgtest.NewDatabase(t)
	admin := pgtest.PoolFor(t, dsn)
	role := fmt.Sprintf("searcher_%d", time.Now().UnixNano())
	exec(t, admin, fmt.Sprintf(`
CREATE ROLE %[1]s LOGIN PASSWORD 'pw';
CREATE TABLE open_t (id int PRIMARY KEY, label text);
CREATE TABLE cols_t (id int PRIMARY KEY, public_note text, secret text);
CREATE TABLE hidden_t (id int PRIMARY KEY, label text);
CREATE TABLE rls_t (id int PRIMARY KEY, label text, owner text);
CREATE TABLE slow_t (id int PRIMARY KEY, label text);
INSERT INTO open_t VALUES (1, 'zebra one');
INSERT INTO cols_t VALUES (1, 'zebra note', 'zebra secret'), (2, 'plain', 'zebra only secret');
INSERT INTO hidden_t VALUES (1, 'zebra hidden');
INSERT INTO rls_t VALUES (1, 'zebra mine', '%[1]s'), (2, 'zebra theirs', 'someone');
INSERT INTO slow_t SELECT g, 'zebra ' || g FROM generate_series(1, 50) g;
GRANT USAGE ON SCHEMA public TO %[1]s;
GRANT SELECT ON open_t, rls_t, slow_t TO %[1]s;
GRANT SELECT (id, public_note) ON cols_t TO %[1]s;
ALTER TABLE rls_t ENABLE ROW LEVEL SECURITY;
CREATE POLICY mine ON rls_t USING (owner = current_user);
ALTER TABLE slow_t ENABLE ROW LEVEL SECURITY;
CREATE POLICY slow ON slow_t USING (pg_sleep(0.05) IS NOT NULL);`, role))
	t.Cleanup(func() {
		_, _ = admin.Exec(context.Background(), "DROP OWNED BY "+role+"; DROP ROLE "+role)
	})
	pool := pgtest.PoolFor(t, roleDSN(t, dsn, role))

	events := run(t, pool, search.SearchRequest{Q: "zebra", TimeoutMS: 500})
	found, skipped := matches(events)
	got := strings.Join(found, "|")
	for _, want := range []string{"open_t.label=zebra one", "cols_t.public_note=zebra note", "rls_t.label=zebra mine"} {
		if !strings.Contains(got, want) {
			t.Errorf("missing %q in %v", want, found)
		}
	}
	// Columns and tables without SELECT, and rows a policy hides, never show up.
	for _, never := range []string{"secret", "hidden", "theirs"} {
		if strings.Contains(got, never) {
			t.Errorf("%q leaked: %v", never, found)
		}
	}
	// A table slower than its timeout is reported and the search goes on.
	if strings.Join(skipped, ",") != "slow_t:timeout" {
		t.Errorf("skipped = %v", skipped)
	}
	if last := events[len(events)-1]; last.Type != "done" || last.Truncated {
		t.Errorf("last = %+v", last)
	}

	// The same search on a read-only connection.
	ro := pgtest.PoolFor(t, roleDSN(t, dsn, role)+"&options=-c%20default_transaction_read_only%3Don")
	found, _ = matches(run(t, ro, search.SearchRequest{Q: "zebra one", Tables: []search.SearchTableRef{{Schema: "public", Table: "open_t"}}}))
	if strings.Join(found, "|") != "open_t.label=zebra one" {
		t.Errorf("read-only: %v", found)
	}
}

func TestLimits(t *testing.T) {
	pool := pgtest.PoolFor(t, pgtest.NewDatabase(t))
	exec(t, pool, `DO $$ BEGIN
  FOR i IN 1..27 LOOP
    EXECUTE format('CREATE TABLE lim_%s (id int PRIMARY KEY, v text)', i);
    EXECUTE format('INSERT INTO lim_%s SELECT g, ''walrus'' FROM generate_series(1, 30) g', i);
  END LOOP;
END $$;
CREATE TABLE huge (id int PRIMARY KEY, v text);
INSERT INTO huge VALUES (1, 'walrus');
ANALYZE;
UPDATE pg_class SET reltuples = 2000000 WHERE relname = 'huge';`)
	events := run(t, pool, search.SearchRequest{Q: "walrus"})
	if events[0].SkippedLarge != 1 {
		t.Errorf("start = %+v", events[0])
	}
	perTable := true
	for _, e := range events {
		if e.Table == "huge" {
			t.Errorf("a large table was searched: %+v", e)
		}
		if e.Type == "table" && len(e.Rows) > search.PerTable {
			perTable = false
		}
	}
	if last := events[len(events)-1]; last.Type != "done" || last.Found != search.Total || !last.Truncated || !perTable {
		t.Errorf("last = %+v, per table ok = %v", last, perTable)
	}
	// Limited to a schema: only its tables.
	exec(t, pool, "CREATE SCHEMA other; CREATE TABLE other.o (id int PRIMARY KEY, v text); INSERT INTO other.o VALUES (1, 'walrus')")
	if found, _ := matches(run(t, pool, search.SearchRequest{Q: "walrus", Schemas: []string{"other"}})); strings.Join(found, "|") != "o.v=walrus" {
		t.Errorf("schema other: %v", found)
	}
	// Asked for, the large table is searched too.
	events = run(t, pool, search.SearchRequest{Q: "walrus", IncludeLarge: true, Tables: []search.SearchTableRef{{Schema: "public", Table: "huge"}}})
	if found, _ := matches(events); strings.Join(found, "|") != "huge.v=walrus" {
		t.Errorf("include large: %v", found)
	}
}
