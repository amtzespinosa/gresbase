package write_test

import (
	"context"
	"errors"
	"io"
	"slices"
	"strings"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/amtzespinosa/gresbase/internal/pg/introspect"
	"github.com/amtzespinosa/gresbase/internal/pg/pgvalue"
	"github.com/amtzespinosa/gresbase/internal/pg/write"
	"github.com/amtzespinosa/gresbase/internal/pgtest"
)

func m(pairs ...any) []write.ImportMapping {
	var out []write.ImportMapping
	for i := 0; i < len(pairs); i += 2 {
		out = append(out, write.ImportMapping{Column: pairs[i].(string), Source: pairs[i+1].(int)})
	}
	return out
}

func TestImportPartialMappingWithBOMAndDefaults(t *testing.T) {
	e := newEnv(t)
	ctx := context.Background()
	users := e.table(t, "public", "users")
	csv := "\xef\xbb\xbffull_name,email,plan,tags,ignored\n" +
		"Ada Lovelace,ada@import.test,pro,\"{a,b}\",x\n" +
		"\"Multi\nLine\",multi@import.test,team,{},y\n" +
		",empty@import.test,free,{},z\n"
	res, err := e.w.Import(ctx, session, users, write.ImportOptions{
		Delimiter: ",", Header: true, EmptyAsNull: true,
		Mapping: m("email", 1, "full_name", 0, "plan", 2, "tags", 3),
	}, strings.NewReader(csv))
	if err != nil {
		t.Fatal(err)
	}
	if res.Inserted != 3 || len(res.Errors) != 0 {
		t.Fatalf("result %+v", res)
	}
	for sql, want := range map[string]string{
		`SELECT full_name FROM users WHERE email = 'ada@import.test'`:                "Ada Lovelace",
		`SELECT plan::text FROM users WHERE email = 'ada@import.test'`:               "pro",
		`SELECT tags::text FROM users WHERE email = 'ada@import.test'`:               "{a,b}",
		`SELECT is_active::text FROM users WHERE email = 'ada@import.test'`:          "true", // default
		`SELECT (uuid IS NOT NULL)::text FROM users WHERE email = 'ada@import.test'`: "true",
		`SELECT full_name FROM users WHERE email = 'multi@import.test'`:              "Multi\nLine",
		`SELECT full_name FROM users WHERE email = 'empty@import.test'`:              "<null>", // empty as NULL
	} {
		if got := e.val(t, sql); got != want {
			t.Errorf("%s = %q, want %q", sql, got, want)
		}
	}
	if len(e.rec.changes) != 1 || e.rec.changes[0].Ops[0].Kind != "import" {
		t.Errorf("recorder got %+v", e.rec.changes)
	}
}

func TestImportDelimiters(t *testing.T) {
	e := newEnv(t)
	orgs := e.table(t, "public", "orgs")
	for _, tc := range []struct{ name, delim, csv string }{
		{"semicolon", ";", "name;plan\nSemi One;pro\nSemi Two;free\n"},
		{"tab", "\t", "name\tplan\nTab One\tteam\nTab Two\tfree\n"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			res, err := e.w.Import(context.Background(), session, orgs, write.ImportOptions{
				Delimiter: tc.delim, Header: true, Mapping: m("name", 0, "plan", 1),
			}, strings.NewReader(tc.csv))
			if err != nil || res.Inserted != 2 {
				t.Fatalf("%+v %v", res, err)
			}
		})
	}
	if got := e.val(t, `SELECT string_agg(plan::text, ',' ORDER BY name) FROM orgs WHERE name LIKE 'Semi%' OR name LIKE 'Tab%'`); got != "pro,free,team,free" {
		t.Errorf("plans = %s", got)
	}
}

func TestImportReportsBadRowsAndInsertsNothing(t *testing.T) {
	e := newEnv(t)
	ctx := context.Background()
	items := e.table(t, "public", "invoice_items")
	before := e.val(t, `SELECT count(*)::text FROM invoice_items`)
	// Line 1 is the header; lines 3, 5, 6 and 7 are bad; line 8 is too short.
	csv := "invoice_id,description,quantity,unit_price\n" +
		"1,ok,1,10\n" +
		"1,bad quantity,x,10\n" +
		"1,ok,2,10\n" +
		"1,zero,0,10\n" +
		"999999999,no invoice,1,10\n" +
		"1,,1,10\n" +
		"1,short\n" +
		"1,ok,3,10\n"
	res, err := e.w.Import(ctx, session, items, write.ImportOptions{
		Delimiter: ",", Header: true, EmptyAsNull: true,
		Mapping: m("invoice_id", 0, "description", 1, "quantity", 2, "unit_price", 3),
	}, strings.NewReader(csv))
	if err != nil {
		t.Fatal(err)
	}
	type got struct {
		row    int64
		column string
	}
	var rows []got
	for _, x := range res.Errors {
		rows = append(rows, got{x.Row, x.Column})
		if x.Message == "" {
			t.Errorf("row %d without message", x.Row)
		}
	}
	want := []got{{3, "quantity"}, {5, ""}, {6, ""}, {7, "description"}, {8, ""}}
	if !slices.Equal(rows, want) || res.Inserted != 0 {
		t.Fatalf("errors %+v (inserted %d), want rows %v", res.Errors, res.Inserted, want)
	}
	if after := e.val(t, `SELECT count(*)::text FROM invoice_items`); after != before {
		t.Errorf("rows changed: %s → %s", before, after)
	}
	if len(e.rec.changes) != 0 {
		t.Errorf("recorded a failed import")
	}
}

func TestImportFindsDuplicatesWithinTheFile(t *testing.T) {
	e := newEnv(t)
	res, err := e.w.Import(context.Background(), session, e.table(t, "public", "orgs"), write.ImportOptions{
		Delimiter: ",", Mapping: m("name", 0),
	}, strings.NewReader("Dup Org\nOther Org\nDup Org\n"))
	if err != nil {
		t.Fatal(err)
	}
	if len(res.Errors) != 1 || res.Errors[0].Row != 3 {
		t.Fatalf("errors %+v", res.Errors)
	}
}

func TestImportNoPrimaryKeyTable(t *testing.T) {
	e := newEnv(t)
	res, err := e.w.Import(context.Background(), session, e.table(t, "public", "audit_log"), write.ImportOptions{
		Delimiter: ",", Mapping: m("action", 0, "payload", 1),
	}, strings.NewReader("imported,\"{\"\"k\"\": 1}\"\n"))
	if err != nil || res.Inserted != 1 {
		t.Fatalf("%+v %v", res, err)
	}
	if got := e.val(t, `SELECT payload->>'k' FROM audit_log WHERE action = 'imported'`); got != "1" {
		t.Errorf("payload k = %s", got)
	}
}

func TestImportRejectsInvalidRequests(t *testing.T) {
	e := newEnv(t)
	ctx := context.Background()
	users := e.table(t, "public", "users")
	for _, tc := range []struct {
		name  string
		table string
		opts  write.ImportOptions
		csv   string
		want  error
	}{
		{"view", "active_users", write.ImportOptions{Delimiter: ",", Mapping: m("email", 0)}, "a\n", write.ErrNotWritable},
		{"generated column", "invoice_items", write.ImportOptions{Delimiter: ",", Mapping: m("amount", 0)}, "1\n", write.ErrInvalid},
		{"identity always", "orgs", write.ImportOptions{Delimiter: ",", Mapping: m("id", 0)}, "1\n", write.ErrInvalid},
		{"unknown column", "users", write.ImportOptions{Delimiter: ",", Mapping: m(`email"; DROP TABLE users; --`, 0)}, "a\n", write.ErrInvalid},
		{"twice", "users", write.ImportOptions{Delimiter: ",", Mapping: m("email", 0, "email", 1)}, "a,b\n", write.ErrInvalid},
		{"no mapping", "users", write.ImportOptions{Delimiter: ","}, "a\n", write.ErrInvalid},
		{"bad delimiter", "users", write.ImportOptions{Delimiter: `"`, Mapping: m("email", 0)}, "a\n", write.ErrInvalid},
		{"long delimiter", "users", write.ImportOptions{Delimiter: ",,", Mapping: m("email", 0)}, "a\n", write.ErrInvalid},
		{"bad csv", "users", write.ImportOptions{Delimiter: ",", Mapping: m("email", 0)}, "a\"b,c\n", write.ErrInvalid},
	} {
		t.Run(tc.name, func(t *testing.T) {
			tbl := users
			if tc.table != "users" {
				tbl = e.table(t, "public", tc.table)
			}
			if _, err := e.w.Import(ctx, session, tbl, tc.opts, strings.NewReader(tc.csv)); !errors.Is(err, tc.want) {
				t.Errorf("got %v, want %v", err, tc.want)
			}
		})
	}
}

// slowCSV hands out one line per Read after a pause, so COPY sits waiting for data. before runs
// ahead of line i.
type slowCSV struct {
	lines  []string
	pause  time.Duration
	before func(i int)
	i      int
}

func (s *slowCSV) Read(p []byte) (int, error) {
	if s.i == len(s.lines) {
		return 0, io.EOF
	}
	if s.before != nil {
		s.before(s.i)
	}
	time.Sleep(s.pause)
	n := copy(p, s.lines[s.i])
	s.i++
	return n, nil
}

// shortTimeoutEnv is newEnv with a 200 ms statement_timeout on every connection of the pool.
func shortTimeoutEnv(t *testing.T) env {
	t.Helper()
	pc, err := pgxpool.ParseConfig(pgtest.NewDatabase(t))
	if err != nil {
		t.Fatal(err)
	}
	pc.ConnConfig.RuntimeParams["statement_timeout"] = "200"
	pool, err := pgxpool.NewWithConfig(context.Background(), pc)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(pool.Close)
	cat := introspect.New(pool)
	return env{pool, cat, write.New(pool, pgvalue.NewTypes(), cat, &recorder{}), &recorder{}}
}

func slowOrgs() *slowCSV {
	return &slowCSV{pause: 150 * time.Millisecond,
		lines: []string{"name,plan\n", "Slow One,pro\n", "Slow Two,free\n", "Slow Three,team\n"}}
}

func TestImportUsesItsOwnTimeout(t *testing.T) {
	opts := write.ImportOptions{Delimiter: ",", Header: true, Mapping: m("name", 0, "plan", 1)}

	// The COPY takes ~600 ms, past the pool's 200 ms statement_timeout.
	e := shortTimeoutEnv(t)
	res, err := e.w.Import(context.Background(), session, e.table(t, "public", "orgs"), opts, slowOrgs())
	if err != nil || res.Inserted != 3 {
		t.Fatalf("slow import under the default import timeout: %+v %v", res, err)
	}

	// The import timeout itself still applies.
	e = shortTimeoutEnv(t)
	e.w.ImportTimeout = 300 * time.Millisecond
	if _, err := e.w.Import(context.Background(), session, e.table(t, "public", "orgs"), opts, slowOrgs()); err == nil {
		t.Fatal("import past ImportTimeout succeeded")
	}
	if got := e.val(t, `SELECT count(*)::text FROM orgs WHERE name LIKE 'Slow%'`); got != "0" {
		t.Errorf("timed-out import left %s rows", got)
	}
}

func TestImportStopsWhenCanceled(t *testing.T) {
	e := newEnv(t)
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	src := slowOrgs()
	src.before = func(i int) {
		if i == 2 { // mid-COPY, like a client that disconnects during the upload
			cancel()
		}
	}
	_, err := e.w.Import(ctx, session, e.table(t, "public", "orgs"), write.ImportOptions{
		Delimiter: ",", Header: true, Mapping: m("name", 0, "plan", 1)}, src)
	if !errors.Is(err, context.Canceled) {
		t.Fatalf("err = %v, want context.Canceled", err)
	}
	if got := e.val(t, `SELECT count(*)::text FROM orgs WHERE name LIKE 'Slow%'`); got != "0" {
		t.Errorf("canceled import left %s rows", got)
	}
	if n := e.pool.Stat().AcquiredConns(); n != 0 {
		t.Errorf("%d connections still acquired after cancel", n)
	}
	if len(e.rec.changes) != 0 {
		t.Errorf("canceled import was recorded: %+v", e.rec.changes)
	}
}
