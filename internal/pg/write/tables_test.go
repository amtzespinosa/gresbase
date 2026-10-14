package write_test

import (
	"context"
	"errors"
	"fmt"
	"slices"
	"testing"

	"github.com/amtzespinosa/gresbase/internal/pg/write"
)

func TestImpact(t *testing.T) {
	e := newEnv(t)
	ctx := context.Background()
	if _, err := e.pool.Exec(ctx, `
		CREATE TABLE c0 (id int PRIMARY KEY);
		CREATE TABLE c1 (id int PRIMARY KEY, p int REFERENCES c0 ON DELETE CASCADE);
		CREATE TABLE c2 (id int PRIMARY KEY, p int REFERENCES c1 ON DELETE CASCADE);
		CREATE TABLE c3 (id int PRIMARY KEY, p int REFERENCES c2 ON DELETE CASCADE);
		CREATE TABLE c4 (id int PRIMARY KEY, p int REFERENCES c3 ON DELETE CASCADE);
		CREATE TABLE c5 (id int PRIMARY KEY, p int REFERENCES c4 ON DELETE CASCADE);
		CREATE TABLE c6 (id int PRIMARY KEY, p int REFERENCES c5 ON DELETE SET NULL);
		INSERT INTO c0 VALUES (1), (2);
		INSERT INTO c1 VALUES (1, 1), (2, 1), (3, 2);
		INSERT INTO c2 SELECT id, id FROM c1;
		INSERT INTO c3 SELECT id, id FROM c2;
		INSERT INTO c4 SELECT id, id FROM c3;
		INSERT INTO c5 SELECT id, id FROM c4;
		INSERT INTO c6 SELECT id, id FROM c5;`); err != nil {
		t.Fatal(err)
	}
	e.cat.Invalidate()

	invoiceItems := e.val(t, `SELECT count(*)::text FROM invoice_items WHERE invoice_id IN (1, 2)`)
	user := e.val(t, `SELECT min(user_id)::text FROM sessions`)
	userSessions := e.val(t, `SELECT count(*)::text FROM sessions WHERE user_id = `+user)
	for _, tc := range []struct {
		table string
		ops   []write.Op
		want  []write.ImpactEntry
	}{
		{"invoices", []write.Op{{Kind: "delete", PK: cells("id", `1`)}, {Kind: "delete", PK: cells("id", `"2"`)}},
			[]write.ImpactEntry{{Schema: "public", Table: "invoice_items", Action: "cascade", Rows: atoi(invoiceItems)}}},
		{"users", []write.Op{{Kind: "delete", PK: cells("id", user)}},
			[]write.ImpactEntry{{Schema: "public", Table: "sessions", Action: "set_null", Rows: atoi(userSessions)}}},
		// Updates and inserts have no impact.
		{"users", []write.Op{{Kind: "update", PK: cells("id", `2`), Set: cells("full_name", `"X"`)}}, []write.ImpactEntry{}},
		// The chain stops after 5 levels: c6 (6 levels down) is not reached.
		{"c0", []write.Op{{Kind: "delete", PK: cells("id", `1`)}}, []write.ImpactEntry{
			{Schema: "public", Table: "c1", Action: "cascade", Rows: 2},
			{Schema: "public", Table: "c2", Action: "cascade", Rows: 2},
			{Schema: "public", Table: "c3", Action: "cascade", Rows: 2},
			{Schema: "public", Table: "c4", Action: "cascade", Rows: 2},
			{Schema: "public", Table: "c5", Action: "cascade", Rows: 2},
		}},
	} {
		im, err := e.w.Impact(ctx, e.table(t, "public", tc.table), write.Changeset{Ops: tc.ops})
		if err != nil || !slices.Equal(im.Tables, tc.want) {
			t.Errorf("%s: %+v %v, want %+v", tc.table, im, err, tc.want)
		}
	}
	if invoiceItems == "0" || userSessions == "0" {
		t.Fatal("the seed should have invoice items and sessions to count")
	}
}

func TestDependents(t *testing.T) {
	e := newEnv(t)
	d, err := e.w.Dependents(context.Background(), e.table(t, "public", "users"))
	if err != nil {
		t.Fatal(err)
	}
	if !slices.Equal(d.Truncate, []string{"public.projects", "public.sessions"}) {
		t.Errorf("truncate: %q", d.Truncate)
	}
	for _, want := range []string{"view active_users", "constraint sessions_user_id_fkey on table sessions"} {
		if !slices.Contains(d.Drop, want) {
			t.Errorf("drop %q lacks %q", d.Drop, want)
		}
	}
}

func TestTruncateAndDrop(t *testing.T) {
	e := newEnv(t)
	ctx := context.Background()
	items := e.table(t, "public", "invoice_items")
	invoices := e.table(t, "public", "invoices")

	if err := e.w.Truncate(ctx, session, items, write.TruncateRequest{Confirm: "Invoice_items"}); !errors.Is(err, write.ErrConfirmation) {
		t.Fatalf("wrong name: %v", err)
	}
	if err := e.w.Truncate(ctx, session, e.table(t, "public", "active_users"), write.TruncateRequest{Confirm: "active_users"}); !errors.Is(err, write.ErrNotWritable) {
		t.Fatalf("view: %v", err)
	}
	// invoices is referenced by billing.payments: without CASCADE Postgres refuses.
	if err := e.w.Truncate(ctx, session, invoices, write.TruncateRequest{Confirm: "invoices"}); err == nil {
		t.Fatal("truncate of a referenced table without cascade")
	}
	if err := e.w.Truncate(ctx, session, items, write.TruncateRequest{Confirm: "invoice_items", RestartIdentity: true}); err != nil {
		t.Fatal(err)
	}
	if n := e.val(t, `SELECT count(*)::text FROM invoice_items`); n != "0" {
		t.Fatalf("invoice_items has %s rows", n)
	}
	if err := e.w.Truncate(ctx, session, invoices, write.TruncateRequest{Confirm: "invoices", Cascade: true}); err != nil {
		t.Fatal(err)
	}
	if n := e.val(t, `SELECT count(*)::text FROM billing.payments`); n != "0" {
		t.Fatalf("cascade left %s payments", n)
	}

	weird := e.table(t, "public", "Weird Table")
	if err := e.w.Drop(ctx, session, weird, write.DropRequest{Confirm: "Weird Table"}); err != nil {
		t.Fatal(err)
	}
	if _, err := e.cat.Lookup(ctx, "public", "Weird Table"); err == nil {
		t.Fatal("dropped table still in the catalog cache")
	}
	users := e.table(t, "public", "users")
	if err := e.w.Drop(ctx, session, users, write.DropRequest{Confirm: "users"}); err == nil {
		t.Fatal("drop of a table with dependents without cascade")
	}
	if err := e.w.Drop(ctx, session, users, write.DropRequest{Confirm: "users", Cascade: true}); err != nil {
		t.Fatal(err)
	}
	if v := e.val(t, `SELECT coalesce(to_regclass('public.active_users')::text, '<gone>')`); v != "<gone>" {
		t.Fatalf("view survived drop cascade: %s", v)
	}
	kinds := []string{}
	for _, c := range e.rec.changes {
		kinds = append(kinds, c.Ops[0].Kind)
	}
	if !slices.Equal(kinds, []string{"truncate", "truncate", "drop", "drop"}) {
		t.Fatalf("recorded %q", kinds)
	}
}

func atoi(s string) int64 {
	var n int64
	_, _ = fmt.Sscan(s, &n)
	return n
}
