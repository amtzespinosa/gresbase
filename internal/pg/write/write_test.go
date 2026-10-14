package write_test

import (
	"context"
	"encoding/json"
	"errors"
	"slices"
	"strings"
	"testing"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/amtzespinosa/gresbase/internal/pg/introspect"
	"github.com/amtzespinosa/gresbase/internal/pg/pgvalue"
	"github.com/amtzespinosa/gresbase/internal/pg/write"
	"github.com/amtzespinosa/gresbase/internal/pgtest"
)

func TestMain(m *testing.M) { pgtest.Main(m) }

const session = "s1"

type recorder struct{ changes []write.Change }

func (r *recorder) Record(_ context.Context, c write.Change) { r.changes = append(r.changes, c) }

type env struct {
	pool *pgxpool.Pool
	cat  *introspect.Catalog
	w    *write.Writer
	rec  *recorder
}

// newEnv works on a fresh copy of the seed: every test here writes.
func newEnv(t *testing.T) env {
	pool := pgtest.PoolFor(t, pgtest.NewDatabase(t))
	cat := introspect.New(pool)
	rec := &recorder{}
	return env{pool, cat, write.New(pool, pgvalue.NewTypes(), cat, rec), rec}
}

func (e env) table(t *testing.T, schema, name string) *introspect.Table {
	t.Helper()
	tbl, err := e.cat.Lookup(context.Background(), schema, name)
	if err != nil {
		t.Fatal(err)
	}
	return tbl
}

func (e env) apply(t *testing.T, tbl *introspect.Table, ops ...write.Op) *write.ChangesetResult {
	t.Helper()
	res, err := e.w.Apply(context.Background(), session, tbl, write.Changeset{Ops: ops})
	if err != nil {
		t.Fatalf("apply: %v", err)
	}
	return res
}

// val runs a query returning one value as text ("<null>" for NULL).
func (e env) val(t *testing.T, sql string) string {
	t.Helper()
	var s *string
	if err := e.pool.QueryRow(context.Background(), sql).Scan(&s); err != nil {
		t.Fatalf("%s: %v", sql, err)
	}
	if s == nil {
		return "<null>"
	}
	return *s
}

// cells builds a column → wire value map from name, JSON pairs.
func cells(kv ...string) map[string]json.RawMessage {
	m := map[string]json.RawMessage{}
	for i := 0; i < len(kv); i += 2 {
		m[kv[i]] = json.RawMessage(kv[i+1])
	}
	return m
}

func conflictOf(t *testing.T, err error) write.Conflict {
	t.Helper()
	var c *write.ConflictError
	if !errors.As(err, &c) {
		t.Fatalf("want conflict, got %v", err)
	}
	return c.Conflict
}

func TestApplyMixedAndRollback(t *testing.T) {
	e := newEnv(t)
	weird := e.table(t, "public", "Weird Table")
	const q = `SELECT string_agg(id || ':' || coalesce("Column With Spaces", '∅'), ',' ORDER BY id) FROM "Weird Table"`

	res := e.apply(t, weird,
		write.Op{Kind: "insert", Values: cells("id", `10`, "Column With Spaces", `"new"`, "select", `"x"`)},
		write.Op{Kind: "update", PK: cells("id", `1`), Set: cells("Column With Spaces", `null`),
			Expected: cells("Column With Spaces", `"spaces are fine"`)},
		write.Op{Kind: "delete", PK: cells("id", `"2"`), Expected: cells("id", `2`, "select", `"semi;colon"`)},
	)
	if got := e.val(t, q); got != "1:∅,3:∅,10:new" {
		t.Fatalf("after mixed changeset: %s", got)
	}
	if res.Applied != 3 || !res.Undoable || len(res.Reasons) != 0 || len(e.rec.changes) != 1 {
		t.Fatalf("result %+v, recorded %d", res, len(e.rec.changes))
	}

	// The second operation fails: the first one does not stay either.
	_, err := e.w.Apply(context.Background(), session, weird, write.Changeset{Ops: []write.Op{
		{Kind: "update", PK: cells("id", `3`), Set: cells("select", `"changed"`)},
		{Kind: "insert", Values: cells("id", `"not a number"`)},
	}})
	if err == nil || !strings.Contains(err.Error(), "22P02") {
		t.Fatalf("want invalid input error, got %v", err)
	}
	if got := e.val(t, `SELECT "select" FROM "Weird Table" WHERE id = 3`); got != "%_wildcards_%" {
		t.Fatalf("first operation was not rolled back: %s", got)
	}
}

func TestConflicts(t *testing.T) {
	e := newEnv(t)
	ctx := context.Background()
	mixed := e.table(t, "public", "MixedCase")

	// Another connection changes the row after the client read it.
	if _, err := e.pool.Exec(ctx, `UPDATE "MixedCase" SET "DisplayName" = 'Other' WHERE "Id" = 1`); err != nil {
		t.Fatal(err)
	}
	_, err := e.w.Apply(ctx, session, mixed, write.Changeset{Ops: []write.Op{
		{Kind: "update", PK: cells("Id", `2`), Set: cells("DisplayName", `"B"`)},
		{Kind: "update", PK: cells("Id", `1`), Set: cells("DisplayName", `"A"`), Expected: cells("DisplayName", `"Alpha"`)},
	}})
	c := conflictOf(t, err)
	if c.Op != 1 || c.Missing || !slices.Equal(c.Columns, []string{"DisplayName"}) ||
		c.Expected["DisplayName"] != "Alpha" || c.Current["DisplayName"] != "Other" || js(c.PK["Id"]) != "1" {
		t.Fatalf("conflict %+v", c)
	}
	if got := e.val(t, `SELECT "DisplayName" FROM "MixedCase" WHERE "Id" = 2`); got != "Beta" {
		t.Fatalf("changeset was not rolled back: %s", got)
	}

	// The row is gone.
	_, err = e.w.Apply(ctx, session, mixed, write.Changeset{Ops: []write.Op{{Kind: "delete", PK: cells("Id", `99`)}}})
	if c := conflictOf(t, err); !c.Missing || c.Current != nil {
		t.Fatalf("conflict %+v", c)
	}

	// The row already exists.
	_, err = e.w.Apply(ctx, session, mixed, write.Changeset{Ops: []write.Op{
		{Kind: "insert", Values: cells("Id", `3`, "DisplayName", `"dup"`)}}})
	if c := conflictOf(t, err); !c.Exists || c.Current["DisplayName"] != "Gamma" {
		t.Fatalf("conflict %+v", c)
	}
}

func TestUndoRedo(t *testing.T) {
	e := newEnv(t)
	ctx := context.Background()
	items := e.table(t, "public", "invoice_items") // identity ALWAYS and a generated column
	const row = `SELECT id || '|' || description || '|' || quantity || '|' || amount FROM invoice_items WHERE id = 7`
	before := e.val(t, row)
	count := func() string { return e.val(t, `SELECT count(*)::text FROM invoice_items`) }
	n := count()

	// Delete, undo (reinserts the same identity value), redo.
	del := e.apply(t, items, write.Op{Kind: "delete", PK: cells("id", `"7"`)})
	if !del.Undoable {
		t.Fatalf("delete should be undoable: %+v", del)
	}
	if _, err := e.w.Undo(ctx, session, del.ID); err != nil {
		t.Fatal(err)
	}
	if got := e.val(t, row); got != before {
		t.Fatalf("undo delete: %s, want %s", got, before)
	}
	if _, err := e.w.Undo(ctx, session, del.ID); !errors.Is(err, write.ErrNotUndoable) {
		t.Fatalf("second undo: %v", err)
	}
	if _, err := e.w.Redo(ctx, session, del.ID); err != nil {
		t.Fatal(err)
	}
	if e.val(t, `SELECT count(*)::text FROM invoice_items WHERE id = 7`) != "0" {
		t.Fatal("redo delete did not delete")
	}
	if _, err := e.w.Undo(ctx, session, del.ID); err != nil {
		t.Fatal(err)
	}

	// Update, undo, redo.
	upd := e.apply(t, items, write.Op{Kind: "update", PK: cells("id", `7`), Set: cells("quantity", `5`, "description", `"Changed"`)})
	if _, err := e.w.Undo(ctx, session, upd.ID); err != nil || e.val(t, row) != before {
		t.Fatalf("undo update: %v %s", err, e.val(t, row))
	}
	if _, err := e.w.Redo(ctx, session, upd.ID); err != nil || e.val(t, `SELECT description FROM invoice_items WHERE id = 7`) != "Changed" {
		t.Fatalf("redo update: %v", err)
	}

	// Insert (consumes the identity sequence), undo, redo.
	ins := e.apply(t, items, write.Op{Kind: "insert", Values: cells("invoice_id", `1`, "description", `"New"`, "quantity", `2`, "unit_price", `"3.50"`)})
	if _, err := e.w.Undo(ctx, session, ins.ID); err != nil || count() != n {
		t.Fatalf("undo insert: %v, count %s want %s", err, count(), n)
	}
	if _, err := e.w.Redo(ctx, session, ins.ID); err != nil || e.val(t, `SELECT amount::text FROM invoice_items WHERE description = 'New'`) != "7.00" {
		t.Fatalf("redo insert: %v", err)
	}

	// Conflict when undoing: the row changed since the changeset was applied.
	if _, err := e.pool.Exec(ctx, `UPDATE invoice_items SET quantity = 9 WHERE id = 7`); err != nil {
		t.Fatal(err)
	}
	_, err := e.w.Undo(ctx, session, upd.ID)
	if c := conflictOf(t, err); !slices.Contains(c.Columns, "quantity") || js(c.Current["quantity"]) != "9" {
		t.Fatalf("conflict %+v", c)
	}

	// Changesets belong to their session.
	if _, err := e.w.Undo(ctx, "other", ins.ID); !errors.Is(err, write.ErrNotFound) {
		t.Fatalf("undo from another session: %v", err)
	}
}

func TestNotUndoable(t *testing.T) {
	e := newEnv(t)
	ctx := context.Background()
	for _, tc := range []struct {
		table  string
		op     write.Op
		reason string
	}{
		{"projects", write.Op{Kind: "update", PK: cells("id", `1`), Set: cells("name", `"Renamed"`)}, write.ReasonUserTriggers},
		{"invoices", write.Op{Kind: "delete", PK: cells("id", `1`)}, write.ReasonDeleteCascade},
		{"users", write.Op{Kind: "delete", PK: cells("id", `2`)}, write.ReasonDeleteCascade},
	} {
		tbl := e.table(t, "public", tc.table)
		p, err := e.w.Preview(tbl, write.Changeset{Ops: []write.Op{tc.op}})
		if err != nil || p.Undoable || !slices.Equal(p.Reasons, []string{tc.reason}) {
			t.Fatalf("%s preview: %+v %v", tc.table, p, err)
		}
		res := e.apply(t, tbl, tc.op)
		if res.Undoable || !slices.Equal(res.Reasons, []string{tc.reason}) {
			t.Fatalf("%s: %+v", tc.table, res)
		}
		if _, err := e.w.Undo(ctx, session, res.ID); !errors.Is(err, write.ErrNotUndoable) {
			t.Fatalf("%s undo: %v", tc.table, err)
		}
	}
	if e.val(t, `SELECT count(*)::text FROM invoice_items WHERE invoice_id = 1`) != "0" {
		t.Fatal("cascade did not run")
	}
}

func TestCastsEveryType(t *testing.T) {
	e := newEnv(t)
	users := e.table(t, "public", "users")
	e.apply(t, users, write.Op{Kind: "update", PK: cells("id", `"9007199254740993"`), Set: cells(
		"uuid", `"6f1c0d0e-0000-4000-8000-000000000001"`,
		"is_active", `false`,
		"plan", `"team"`,
		"balance", `"1234567890.25"`,
		"birth_date", `"1990-02-03"`,
		"tags", `["a", "b \"c\"", null, "d,e"]`,
		"settings", `{"theme": "dark", "n": [1, 2]}`,
		"last_ip", `"10.0.0.1"`,
		"avatar", `"\\xdeadbeef"`,
		"bio", `"it's"`,
		"created_at", `"2025-05-06 07:08:09+00"`,
	)})
	got := e.val(t, `SELECT concat_ws(' | ', uuid, is_active, plan, balance, birth_date, tags, settings, last_ip,
		encode(avatar, 'hex'), bio, created_at AT TIME ZONE 'UTC') FROM users WHERE id = 9007199254740993`)
	want := `6f1c0d0e-0000-4000-8000-000000000001 | f | team | 1234567890.25 | 1990-02-03 | ` +
		`{a,"b \"c\"",NULL,"d,e"} | {"n": [1, 2], "theme": "dark"} | 10.0.0.1 | deadbeef | it's | 2025-05-06 07:08:09`
	if got != want {
		t.Fatalf("got  %s\nwant %s", got, want)
	}

	projects := e.table(t, "public", "projects")
	e.apply(t, projects, write.Op{Kind: "update", PK: cells("id", `2`), Set: cells("estimate", `"P1DT2H"`, "budget", `null`)})
	if got := e.val(t, `SELECT estimate::text || coalesce(budget::text, '∅') FROM projects WHERE id = 2`); got != "1 day 02:00:00∅" {
		t.Fatalf("interval/null: %s", got)
	}

	// Expected values in the wire encoding match the row read back, every type included.
	e.apply(t, users, write.Op{Kind: "update", PK: cells("id", `"9007199254740993"`), Set: cells("bio", `"ok"`),
		Expected: cells("tags", `["a", "b \"c\"", null, "d,e"]`, "settings", `{"theme":"dark","n":[1,2]}`,
			"balance", `"1234567890.25"`, "is_active", `false`, "avatar", `{"$bytea": {"size": 4, "hex_preview": "deadbeef"}}`)})
}

func TestRejects(t *testing.T) {
	e := newEnv(t)
	ctx := context.Background()
	users := e.table(t, "public", "users")
	for _, tc := range []struct {
		table string
		ops   []write.Op
		want  error
	}{
		{"users", []write.Op{{Kind: "update", PK: cells("id", `1`), Set: cells("email; DROP TABLE users", `"x"`)}}, write.ErrInvalid},
		{"users", []write.Op{{Kind: "update", PK: cells("id", `1`, "email", `"x"`), Set: cells("bio", `"x"`)}}, write.ErrInvalid},
		{"users", []write.Op{{Kind: "update", PK: cells("id", `1`)}}, write.ErrInvalid},
		{"users", []write.Op{{Kind: "drop"}}, write.ErrInvalid},
		{"users", nil, write.ErrInvalid},
		{"users", []write.Op{{Kind: "update", PK: cells("id", `1`), Set: cells("avatar", `{"$bytea": {"size": 1}}`)}}, write.ErrInvalid},
		{"invoice_items", []write.Op{{Kind: "update", PK: cells("id", `1`), Set: cells("amount", `"1"`)}}, write.ErrInvalid},
		{"audit_log", []write.Op{{Kind: "insert", Values: cells("action", `"x"`)}}, write.ErrNoPrimaryKey},
		{"active_users", []write.Op{{Kind: "delete", PK: cells("id", `1`)}}, write.ErrNotWritable},
	} {
		_, err := e.w.Apply(ctx, session, e.table(t, "public", tc.table), write.Changeset{Ops: tc.ops})
		if !errors.Is(err, tc.want) {
			t.Errorf("%s %+v: got %v, want %v", tc.table, tc.ops, err, tc.want)
		}
	}

	// Values are parameters: SQL in a value is just an invalid number, or harmless text.
	_, err := e.w.Apply(ctx, session, users, write.Changeset{Ops: []write.Op{
		{Kind: "update", PK: cells("id", `"1; DROP TABLE users"`), Set: cells("bio", `"x"`)}}})
	if err == nil || !strings.Contains(err.Error(), "22P02") {
		t.Fatalf("want invalid input error, got %v", err)
	}
	e.apply(t, users, write.Op{Kind: "update", PK: cells("id", `1`), Set: cells("bio", `"'); DROP TABLE users; --"`)})
	if got := e.val(t, `SELECT bio FROM users WHERE id = 1`); got != "'); DROP TABLE users; --" {
		t.Fatalf("bio %s", got)
	}

	p, err := e.w.Preview(e.table(t, "public", "Weird Table"), write.Changeset{Ops: []write.Op{
		{Kind: "update", PK: cells("id", `1`), Set: cells("Column With Spaces", `"o'neil"`)}}})
	if err != nil || p.SQL[0] != `UPDATE "public"."Weird Table" SET "Column With Spaces" = 'o''neil'::text WHERE "id" = '1'::integer` {
		t.Fatalf("preview %+v %v", p, err)
	}
}

func js(v any) string {
	b, _ := json.Marshal(v)
	return string(b)
}
