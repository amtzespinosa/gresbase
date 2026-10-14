package rows_test

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"testing"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/amtzespinosa/gresbase/internal/pg/introspect"
	"github.com/amtzespinosa/gresbase/internal/pg/pgvalue"
	"github.com/amtzespinosa/gresbase/internal/pg/rows"
	"github.com/amtzespinosa/gresbase/internal/pgtest"
)

func TestMain(m *testing.M) { pgtest.Main(m) }

type env struct {
	pool  *pgxpool.Pool
	cat   *introspect.Catalog
	types *pgvalue.Types
}

func newEnv(t *testing.T) env {
	pool := pgtest.Pool(t)
	return env{pool, introspect.New(pool), pgvalue.NewTypes()}
}

func (e env) table(t *testing.T, schema, name string) *introspect.Table {
	t.Helper()
	tbl, err := e.cat.Lookup(context.Background(), schema, name)
	if err != nil {
		t.Fatal(err)
	}
	return tbl
}

func (e env) read(t *testing.T, tbl *introspect.Table, q rows.Query) *rows.Page {
	t.Helper()
	p, err := rows.Read(context.Background(), e.pool, e.types, tbl, q)
	if err != nil {
		t.Fatalf("read %+v: %v", q, err)
	}
	return p
}

func col(p *rows.Page, name string) int {
	for i, c := range p.Columns {
		if c.Name == name {
			return i
		}
	}
	panic(name)
}

func raw(s string) json.RawMessage { return json.RawMessage(s) }

// Walking every page with keyset pagination must give exactly the rows of the equivalent
// ORDER BY, in the same order: no gaps, no repeats, also with duplicates, NULLs and DESC.
func TestKeysetWalk(t *testing.T) {
	e := newEnv(t)
	users := e.table(t, "public", "users")
	ctx := context.Background()

	for _, tc := range []struct {
		sort    []rows.Sort
		filters []rows.Filter
		orderBy string
		where   string
	}{
		{nil, nil, "id", ""},
		{[]rows.Sort{{"plan", "asc"}}, nil, "plan, id", ""},
		{[]rows.Sort{{"org_id", "desc"}}, nil, "org_id DESC NULLS FIRST, id", ""},
		{[]rows.Sort{{"org_id", "asc"}, {"is_active", "desc"}}, nil, "org_id, is_active DESC, id", ""},
		{[]rows.Sort{{"bio", "desc"}, {"id", "desc"}}, nil, "bio DESC NULLS FIRST, id DESC", ""},
		{[]rows.Sort{{"balance", "asc"}}, []rows.Filter{{Column: "plan", Op: "eq", Value: raw(`"pro"`)}},
			"balance, id", "WHERE plan = 'pro'"},
	} {
		name := fmt.Sprint(tc.orderBy, tc.where)
		r, err := e.pool.Query(ctx, "SELECT id::text AS sid FROM users "+tc.where+" ORDER BY "+tc.orderBy)
		if err != nil {
			t.Fatal(err)
		}
		var want []string
		for r.Next() {
			var id string
			_ = r.Scan(&id)
			want = append(want, id)
		}
		r.Close()

		var got []string
		q := rows.Query{Sort: tc.sort, Filters: tc.filters, Limit: 500}
		for pages := 0; ; pages++ {
			if pages > 100 {
				t.Fatalf("%s: too many pages", name)
			}
			p := e.read(t, users, q)
			for _, row := range p.Rows {
				got = append(got, row[col(p, "id")].(string))
			}
			if !p.HasMore {
				break
			}
			if p.NextCursor == nil {
				t.Fatalf("%s: has_more without cursor", name)
			}
			q.Cursor = *p.NextCursor
		}
		if strings.Join(got, ",") != strings.Join(want, ",") {
			t.Errorf("%s: walked %d rows, want %d in the same order", name, len(got), len(want))
		}
	}
}

func TestOffsetWithoutPrimaryKey(t *testing.T) {
	e := newEnv(t)
	audit := e.table(t, "public", "audit_log")
	seen := map[string]bool{}
	q := rows.Query{Sort: []rows.Sort{{"at", "asc"}}, Limit: 50}
	for {
		p := e.read(t, audit, q)
		if p.NextCursor != nil {
			t.Fatal("offset pagination must not return a cursor")
		}
		for _, r := range p.Rows {
			seen[r[col(p, "at")].(string)] = true
		}
		if !p.HasMore {
			break
		}
		q.Offset += 50
	}
	if len(seen) != 300 {
		t.Errorf("walked %d distinct rows, want 300", len(seen))
	}
	if _, err := rows.Read(context.Background(), e.pool, e.types, audit, rows.Query{Cursor: "x"}); !errors.Is(err, rows.ErrInvalid) {
		t.Errorf("cursor without primary key: %v", err)
	}
}

// A foreign table (postgres_fdw over orgs) is read like any relation without a primary key.
func TestForeignTable(t *testing.T) {
	e := newEnv(t)
	remote := e.table(t, "public", "remote_orgs")
	p := e.read(t, remote, rows.Query{
		Filters: []rows.Filter{{Column: "plan", Op: "eq", Value: raw(`"pro"`)}},
		Sort:    []rows.Sort{{"id", "asc"}},
		Limit:   50,
	})
	if len(p.Rows) != 7 || p.Rows[0][col(p, "name")] != "Org 1" {
		t.Errorf("remote_orgs pro rows = %v", p.Rows)
	}
}

func TestOperators(t *testing.T) {
	e := newEnv(t)
	users := e.table(t, "public", "users")
	weird := e.table(t, "public", "Weird Table")
	ctx := context.Background()

	for _, tc := range []struct {
		tbl  *introspect.Table
		f    rows.Filter
		want int64
	}{
		{users, rows.Filter{Column: "id", Op: "eq", Value: raw(`"9007199254740993"`)}, 1},
		{users, rows.Filter{Column: "id", Op: "eq", Value: raw(`42`)}, 1},
		{users, rows.Filter{Column: "plan", Op: "neq", Value: raw(`"free"`)}, 8001},
		{users, rows.Filter{Column: "id", Op: "lt", Value: raw(`11`)}, 10},
		{users, rows.Filter{Column: "id", Op: "lte", Value: raw(`11`)}, 11},
		{users, rows.Filter{Column: "balance", Op: "gt", Value: raw(`"999.98"`)}, 1},
		{users, rows.Filter{Column: "created_at", Op: "gte", Value: raw(`"2024-01-01 00:37:00+00"`)}, 12001},
		{users, rows.Filter{Column: "email", Op: "contains", Value: raw(`"USER1199"`)}, 11},
		{users, rows.Filter{Column: "email", Op: "starts_with", Value: raw(`"big-"`)}, 1},
		{users, rows.Filter{Column: "bio", Op: "is_null"}, 2401},
		{users, rows.Filter{Column: "bio", Op: "not_null"}, 9600},
		{users, rows.Filter{Column: "plan", Op: "in", Value: raw(`["pro", "team"]`)}, 8001},
		{users, rows.Filter{Column: "id", Op: "between", Value: raw(`[10, 19]`)}, 10},
		{users, rows.Filter{Column: "birth_date", Op: "between", Value: raw(`["1960-01-01", "1960-01-31"]`)}, 26},
		{users, rows.Filter{Column: "settings", Op: "json_contains", Value: raw(`{"nested": {"array": [2]}}`)}, 1},
		{users, rows.Filter{Column: "settings", Op: "json_contains", Value: raw(`"{\"theme\": \"dark\"}"`)}, 6000},
		{users, rows.Filter{Column: "is_active", Op: "eq", Value: raw(`false`)}, 1714},
		{users, rows.Filter{Column: "tags", Op: "eq", Value: raw(`"{beta,vip}"`)}, 3000},
		{users, rows.Filter{Column: "last_ip", Op: "eq", Value: raw(`"10.0.0.7"`)}, 1},
		// LIKE wildcards in the value are literal characters.
		{weird, rows.Filter{Column: "select", Op: "contains", Value: raw(`"%_w"`)}, 1},
		{weird, rows.Filter{Column: "select", Op: "contains", Value: raw(`"_"`)}, 1},
		{weird, rows.Filter{Column: "Column With Spaces", Op: "eq", Value: raw(`"quote ' inside"`)}, 1},
	} {
		n, err := rows.Count(ctx, e.pool, tc.tbl, rows.Query{Filters: []rows.Filter{tc.f}})
		if err != nil {
			t.Errorf("%s %s %s: %v", tc.f.Column, tc.f.Op, tc.f.Value, err)
			continue
		}
		if n != tc.want {
			t.Errorf("%s %s %s: %d rows, want %d", tc.f.Column, tc.f.Op, tc.f.Value, n, tc.want)
		}
	}

	// or combines filters.
	n, err := rows.Count(ctx, e.pool, users, rows.Query{Logic: "or", Filters: []rows.Filter{
		{Column: "id", Op: "eq", Value: raw(`1`)}, {Column: "id", Op: "eq", Value: raw(`2`)}}})
	if err != nil || n != 2 {
		t.Errorf("or: %d, %v", n, err)
	}
}

// Names, operators, values and cursors from the client never reach SQL unchecked.
func TestInvalidRequests(t *testing.T) {
	e := newEnv(t)
	users := e.table(t, "public", "users")
	for _, q := range []rows.Query{
		{Filters: []rows.Filter{{Column: `id"; DROP TABLE users; --`, Op: "eq", Value: raw(`1`)}}},
		{Filters: []rows.Filter{{Column: "id", Op: "= 1 OR 1=1 --", Value: raw(`1`)}}},
		{Filters: []rows.Filter{{Column: "id", Op: "eq"}}},
		{Filters: []rows.Filter{{Column: "id", Op: "eq", Value: raw(`{"a": 1}`)}}},
		{Filters: []rows.Filter{{Column: "id", Op: "contains", Value: raw(`"1"`)}}},
		{Filters: []rows.Filter{{Column: "email", Op: "json_contains", Value: raw(`{}`)}}},
		{Filters: []rows.Filter{{Column: "settings", Op: "lt", Value: raw(`"{}"`)}}},
		{Filters: []rows.Filter{{Column: "tags", Op: "in", Value: raw(`["{a}"]`)}}},
		{Filters: []rows.Filter{{Column: "id", Op: "between", Value: raw(`[1]`)}}},
		{Filters: []rows.Filter{{Column: "id", Op: "in", Value: raw(`[]`)}}},
		{Filters: []rows.Filter{{Column: "settings", Op: "json_contains", Value: raw(`"not json"`)}}},
		{Logic: "xor"},
		{Sort: []rows.Sort{{"id; DROP TABLE users", "asc"}}},
		{Sort: []rows.Sort{{"id", "sideways"}}},
		{Limit: 501},
		{Limit: -1},
		{Offset: -5},
		{Cursor: "not base64 !"},
		{Cursor: "eyJrIjpbImlkIl0sInYiOlsiMSJdfQ", Sort: []rows.Sort{{"plan", "asc"}}}, // {"k":["id"],"v":["1"]}
	} {
		if _, err := rows.Read(context.Background(), e.pool, e.types, users, q); !errors.Is(err, rows.ErrInvalid) {
			t.Errorf("%+v: got %v, want ErrInvalid", q, err)
		}
	}
	// A hostile value is just data: no match, and the table is still there.
	p := e.read(t, users, rows.Query{Filters: []rows.Filter{{Column: "email", Op: "eq", Value: raw(`"x'; DROP TABLE users; --"`)}}})
	if len(p.Rows) != 0 {
		t.Errorf("hostile value matched %d rows", len(p.Rows))
	}
	if _, err := rows.Count(context.Background(), e.pool, users, rows.Query{}); err != nil {
		t.Fatal(err)
	}
}

func TestEncodingAndValue(t *testing.T) {
	e := newEnv(t)
	users := e.table(t, "public", "users")
	ctx := context.Background()
	p := e.read(t, users, rows.Query{Filters: []rows.Filter{{Column: "id", Op: "in", Value: raw(`[1, 3, 50, 9007199254740993]`)}}})
	if len(p.Rows) != 4 {
		t.Fatalf("got %d rows", len(p.Rows))
	}
	b, _ := json.Marshal(p.Rows)
	var got [][]any
	_ = json.Unmarshal(b, &got)
	byID := map[string][]any{}
	for _, r := range got {
		byID[r[col(p, "id")].(string)] = r
	}
	big := byID["9007199254740993"]
	if big[col(p, "balance")] != "9999999999.99" {
		t.Errorf("numeric: %v", big[col(p, "balance")])
	}
	if s, _ := json.Marshal(big[col(p, "settings")]); string(s) != `{"nested":{"array":[1,2,3],"null":null}}` {
		t.Errorf("jsonb: %s", s)
	}
	if s, _ := json.Marshal(byID["3"][col(p, "tags")]); string(s) != `["admin","with,comma","with \"quotes\""]` {
		t.Errorf("text[]: %s", s)
	}
	if s, _ := json.Marshal(byID["50"][col(p, "avatar")]); !strings.Contains(string(s), `"size":16`) {
		t.Errorf("bytea: %s", s)
	}
	if v := byID["1"][col(p, "is_active")]; v != true {
		t.Errorf("bool: %v", v)
	}
	if v := byID["1"][col(p, "plan")]; v != "pro" {
		t.Errorf("enum: %v", v)
	}
	bio, _ := byID["1"][col(p, "bio")].(map[string]any)
	if bio["truncated"] != true || bio["size"] != float64(22800) || len(bio["$text"].(string)) != pgvalue.MaxText {
		t.Errorf("long text: %v", bio["size"])
	}

	full, err := rows.Value(ctx, e.pool, e.types, users, map[string]json.RawMessage{"id": raw(`"1"`)}, "bio")
	if err != nil {
		t.Fatal(err)
	}
	if s, _ := full.(string); len(s) != 22800 {
		t.Errorf("full value has %d bytes", len(s))
	}
	if _, err := rows.Value(ctx, e.pool, e.types, users, map[string]json.RawMessage{"id": raw(`0`)}, "bio"); !errors.Is(err, rows.ErrRowNotFound) {
		t.Errorf("missing row: %v", err)
	}
	if _, err := rows.Value(ctx, e.pool, e.types, users, map[string]json.RawMessage{"email": raw(`"x"`)}, "bio"); !errors.Is(err, rows.ErrInvalid) {
		t.Errorf("wrong pk: %v", err)
	}
	if _, err := rows.Value(ctx, e.pool, e.types, users, map[string]json.RawMessage{"id": raw(`1`)}, "nope"); !errors.Is(err, rows.ErrInvalid) {
		t.Errorf("unknown column: %v", err)
	}
}

func TestOddNamesAndSQL(t *testing.T) {
	e := newEnv(t)
	ctx := context.Background()
	weird := e.table(t, "public", "Weird Table")
	q := rows.Query{Sort: []rows.Sort{{"select", "desc"}},
		Filters: []rows.Filter{{Column: "Column With Spaces", Op: "not_null"}}}
	p := e.read(t, weird, q)
	if len(p.Rows) != 2 || p.Rows[0][col(p, "select")] != "semi;colon" {
		t.Errorf("Weird Table: %v", p.Rows)
	}
	mixed := e.table(t, "public", "MixedCase")
	if p := e.read(t, mixed, rows.Query{Filters: []rows.Filter{{Column: "DisplayName", Op: "eq", Value: raw(`"Beta"`)}}}); len(p.Rows) != 1 {
		t.Errorf("MixedCase: %v", p.Rows)
	}

	// The display SQL is valid and returns the same rows.
	q.Filters = append(q.Filters, rows.Filter{Column: "Column With Spaces", Op: "contains", Value: raw(`"quote '"`)})
	sql, err := rows.SQL(weird, q)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(sql, `"Weird Table"`) || !strings.Contains(sql, `'%quote ''%'::text`) {
		t.Errorf("sql: %s", sql)
	}
	var n int
	if err := e.pool.QueryRow(ctx, "SELECT count(*) FROM ("+sql+") s").Scan(&n); err != nil || n != 1 {
		t.Errorf("running the display SQL: %d, %v", n, err)
	}
}

func TestReferencedBy(t *testing.T) {
	e := newEnv(t)
	ctx := context.Background()
	for _, tc := range []struct{ table, pk string }{
		{"invoices", `{"id": "1"}`},
		{"users", `{"id": 2}`},
	} {
		tbl := e.table(t, "public", tc.table)
		var pk map[string]json.RawMessage
		_ = json.Unmarshal([]byte(tc.pk), &pk)
		refs, err := rows.ReferencedBy(ctx, e.pool, tbl, pk)
		if err != nil {
			t.Fatal(err)
		}
		if len(refs) != len(tbl.ReferencedBy) || len(refs) == 0 {
			t.Fatalf("%s: %d references for %d foreign keys", tc.table, len(refs), len(tbl.ReferencedBy))
		}
		for _, r := range refs {
			var want int64
			sql := "SELECT count(*) FROM " + pgx.Identifier{r.Schema, r.Table}.Sanitize() + " WHERE " +
				pgx.Identifier{r.Columns[0]}.Sanitize() + " = ($1::text)::int8"
			if err := e.pool.QueryRow(ctx, sql, strings.Trim(string(pk["id"]), `"`)).Scan(&want); err != nil {
				t.Fatal(err)
			}
			if r.Count != want {
				t.Errorf("%s ← %s.%s: %d, want %d", tc.table, r.Schema, r.Table, r.Count, want)
			}
		}
	}
	for _, pk := range []string{`{}`, `{"id": "1", "x": 1}`, `{"nope": 1}`, `{"id": [1]}`} {
		var m map[string]json.RawMessage
		_ = json.Unmarshal([]byte(pk), &m)
		if _, err := rows.ReferencedBy(ctx, e.pool, e.table(t, "public", "users"), m); !errors.Is(err, rows.ErrInvalid) {
			t.Errorf("pk %s: %v", pk, err)
		}
	}
	if _, err := rows.ReferencedBy(ctx, e.pool, e.table(t, "public", "audit_log"), nil); !errors.Is(err, rows.ErrInvalid) {
		t.Errorf("audit_log: %v", err)
	}
}
