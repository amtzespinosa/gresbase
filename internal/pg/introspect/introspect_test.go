package introspect_test

import (
	"context"
	"errors"
	"reflect"
	"slices"
	"strings"
	"testing"

	"github.com/jackc/pgx/v5"

	"github.com/amtzespinosa/gresbase/internal/pg/capabilities"
	"github.com/amtzespinosa/gresbase/internal/pg/introspect"
	"github.com/amtzespinosa/gresbase/internal/pgtest"
)

func TestMain(m *testing.M) { pgtest.Main(m) }

func catalog(t *testing.T) *introspect.Catalog {
	t.Helper()
	return introspect.New(pgtest.Pool(t))
}

func TestSchemas(t *testing.T) {
	s, err := catalog(t).Schemas(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if !slices.Equal(s, []string{"billing", "public"}) {
		t.Fatalf("schemas = %v", s)
	}
}

func TestRelations(t *testing.T) {
	ctx := context.Background()
	cat := catalog(t)
	rels, err := cat.Relations(ctx, "public")
	if err != nil {
		t.Fatal(err)
	}
	kinds := map[string]introspect.Relation{}
	for _, r := range rels {
		kinds[r.Name] = r
	}
	for name, kind := range map[string]string{
		"users": "table", "audit_log": "table", "Weird Table": "table", "MixedCase": "table",
		"active_users": "view", "org_stats": "materialized_view", "events": "partitioned_table",
		"wide_metrics": "table", "remote_orgs": "foreign_table",
	} {
		if kinds[name].Kind != kind {
			t.Errorf("%s: kind %q, want %q", name, kinds[name].Kind, kind)
		}
	}
	if _, top := kinds["events_2025"]; top {
		t.Error("partition listed at top level")
	}
	var parts []string
	for _, p := range kinds["events"].Partitions {
		parts = append(parts, p.Name)
	}
	if !slices.Equal(parts, []string{"events_2025", "events_2026"}) {
		t.Errorf("events partitions = %v", parts)
	}
	if kinds["active_users"].EstimatedRows != nil {
		t.Error("view has estimated rows")
	}
	if c := kinds["users"].Comment; c == nil || *c != "Application users" {
		t.Errorf("users comment = %v", c)
	}

	billing, err := cat.Relations(ctx, "billing")
	if err != nil || len(billing) != 2 {
		t.Fatalf("billing relations = %v, %v", billing, err)
	}
	if _, err := cat.Relations(ctx, "nope"); !errors.Is(err, introspect.ErrNotFound) {
		t.Errorf("missing schema: err = %v", err)
	}
}

func TestTableDetail(t *testing.T) {
	ctx := context.Background()
	cat := catalog(t)

	users, err := cat.Table(ctx, "public", "users")
	if err != nil {
		t.Fatal(err)
	}
	col := func(tb *introspect.Table, name string) introspect.Column {
		t.Helper()
		c, ok := tb.Column(name)
		if !ok {
			t.Fatalf("%s.%s missing", tb.Name, name)
		}
		return *c
	}
	if id := col(users, "id"); id.Type != "bigint" || id.Identity != "by_default" || !id.NotNull {
		t.Errorf("users.id = %+v", id)
	}
	if plan := col(users, "plan"); plan.BaseType != "plan_t" ||
		!slices.Equal(plan.EnumValues, []string{"free", "pro", "team"}) || plan.Default == nil {
		t.Errorf("users.plan = %+v", plan)
	}
	if tags := col(users, "tags"); !tags.IsArray || tags.BaseType != "text" || tags.Type != "text[]" {
		t.Errorf("users.tags = %+v", tags)
	}
	if bal := col(users, "balance"); bal.Type != "numeric(12,2)" || bal.BaseType != "numeric" {
		t.Errorf("users.balance = %+v", bal)
	}
	if c := col(users, "bio").Comment; c == nil {
		t.Error("users.bio comment missing")
	}
	if !users.HasPrimaryKey || !slices.Equal(users.PrimaryKey, []string{"id"}) || users.HasUserTriggers {
		t.Errorf("users pk/triggers = %v %v %v", users.HasPrimaryKey, users.PrimaryKey, users.HasUserTriggers)
	}
	if len(users.Indexes) < 4 {
		t.Errorf("users indexes = %d", len(users.Indexes))
	}
	// sessions.user_id → users ON DELETE SET NULL
	if !slices.ContainsFunc(users.ReferencedBy, func(fk introspect.ForeignKey) bool {
		return fk.Table == "sessions" && fk.OnDelete == "set_null" && slices.Equal(fk.RefColumns, []string{"id"})
	}) {
		t.Errorf("users referenced_by = %+v", users.ReferencedBy)
	}

	items, err := cat.Table(ctx, "public", "invoice_items")
	if err != nil {
		t.Fatal(err)
	}
	if len(items.ForeignKeys) != 1 || items.ForeignKeys[0].RefTable != "invoices" ||
		items.ForeignKeys[0].OnDelete != "cascade" || items.ForeignKeys[0].OnUpdate != "no_action" {
		t.Errorf("invoice_items fks = %+v", items.ForeignKeys)
	}
	if amount := col(items, "amount"); amount.Generated == nil || amount.Default != nil {
		t.Errorf("invoice_items.amount = %+v", amount)
	}
	if !slices.ContainsFunc(items.Constraints, func(c introspect.Constraint) bool { return c.Type == "check" }) {
		t.Error("invoice_items check constraint missing")
	}

	invoices, err := cat.Table(ctx, "public", "invoices")
	if err != nil {
		t.Fatal(err)
	}
	// billing.payments references invoices from another schema.
	var from []string
	for _, fk := range invoices.ReferencedBy {
		from = append(from, fk.Schema+"."+fk.Table)
	}
	slices.Sort(from)
	if !slices.Equal(from, []string{"billing.payments", "public.invoice_items"}) {
		t.Errorf("invoices referenced_by = %v", from)
	}

	projects, err := cat.Table(ctx, "public", "projects")
	if err != nil {
		t.Fatal(err)
	}
	if !projects.HasUserTriggers || projects.Triggers[0].Name != "projects_touch_updated_at" {
		t.Errorf("projects triggers = %+v", projects.Triggers)
	}
	if col(projects, "id").Identity != "always" {
		t.Error("projects.id identity")
	}

	audit, err := cat.Table(ctx, "public", "audit_log")
	if err != nil {
		t.Fatal(err)
	}
	if audit.HasPrimaryKey || len(audit.PrimaryKey) != 0 {
		t.Errorf("audit_log pk = %v", audit.PrimaryKey)
	}

	events, err := cat.Table(ctx, "public", "events")
	if err != nil {
		t.Fatal(err)
	}
	if events.Kind != "partitioned_table" || !slices.Equal(events.PrimaryKey, []string{"id", "occurred_at"}) {
		t.Errorf("events = %s %v", events.Kind, events.PrimaryKey)
	}

	plans, err := cat.Table(ctx, "billing", "plans")
	if err != nil {
		t.Fatal(err)
	}
	if code := col(plans, "code"); code.BaseType != "plan_t" || len(code.EnumValues) != 3 {
		t.Errorf("billing.plans.code = %+v", code)
	}
}

func TestOddIdentifiers(t *testing.T) {
	ctx := context.Background()
	cat := catalog(t)
	weird, err := cat.Lookup(ctx, "public", "Weird Table", "Column With Spaces", "select")
	if err != nil {
		t.Fatal(err)
	}
	if !slices.Equal(weird.PrimaryKey, []string{"id"}) {
		t.Errorf("Weird Table pk = %v", weird.PrimaryKey)
	}
	if _, err := cat.Lookup(ctx, "public", "MixedCase", "Id", "DisplayName"); err != nil {
		t.Fatal(err)
	}
	if _, err := cat.Lookup(ctx, "public", "mixedcase"); !errors.Is(err, introspect.ErrNotFound) {
		t.Errorf("case-folded name must not match: %v", err)
	}
}

func TestLookupRejects(t *testing.T) {
	ctx := context.Background()
	cat := catalog(t)
	for _, tc := range []struct{ schema, table, column string }{
		{"public", "nope", ""},
		{"nope", "users", ""},
		{"public", "users", "nope"},
		{"public", "users; DROP TABLE users", ""},
		{"public", "users", "id; --"},
	} {
		var cols []string
		if tc.column != "" {
			cols = []string{tc.column}
		}
		_, err := cat.Lookup(ctx, tc.schema, tc.table, cols...)
		if !errors.Is(err, introspect.ErrNotFound) {
			t.Errorf("Lookup(%q, %q, %q) err = %v", tc.schema, tc.table, tc.column, err)
		}
	}
}

func TestCacheInvalidate(t *testing.T) {
	ctx := context.Background()
	dsn := pgtest.NewDatabase(t)
	pool := pgtest.PoolFor(t, dsn)
	cat := introspect.New(pool)
	if _, err := cat.Relations(ctx, "public"); err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(ctx, `CREATE TABLE fresh (id int PRIMARY KEY)`); err != nil {
		t.Fatal(err)
	}
	if _, err := cat.Lookup(ctx, "public", "fresh"); err != nil {
		t.Fatalf("not-found results must not be cached: %v", err)
	}
	rels, _ := cat.Relations(ctx, "public")
	if slices.ContainsFunc(rels, func(r introspect.Relation) bool { return r.Name == "fresh" }) {
		t.Fatal("relations served from cache should not see the new table yet")
	}
	cat.Invalidate()
	rels, _ = cat.Relations(ctx, "public")
	if !slices.ContainsFunc(rels, func(r introspect.Relation) bool { return r.Name == "fresh" }) {
		t.Fatal("Invalidate did not refresh relations")
	}
}

// TestDDLRecreatesTable drops each relation in a fresh copy of the seed and recreates it from its
// generated DDL: the result must describe the same columns, constraints, indexes and comments.
func TestDDLRecreatesTable(t *testing.T) {
	ctx := context.Background()
	pool := pgtest.PoolFor(t, pgtest.NewDatabase(t))
	cat := introspect.New(pool)
	for _, tc := range []struct{ schema, name, drop string }{
		{"public", "active_users", "VIEW"},
		{"public", "org_stats", "MATERIALIZED VIEW"},
		{"public", "users", "TABLE"},
		{"public", "invoices", "TABLE"},
		{"public", "invoice_items", "TABLE"}, // generated column and check
		{"public", "Weird Table", "TABLE"},
		{"public", "events_2025", "TABLE"}, // partition
		{"billing", "plans", "TABLE"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			before, err := cat.Lookup(ctx, tc.schema, tc.name)
			if err != nil {
				t.Fatal(err)
			}
			ddl, err := cat.DDL(ctx, before)
			if err != nil {
				t.Fatal(err)
			}
			name := pgx.Identifier{tc.schema, tc.name}.Sanitize()
			if _, err := pool.Exec(ctx, "DROP "+tc.drop+" "+name+" CASCADE"); err != nil {
				t.Fatal(err)
			}
			if _, err := pool.Exec(ctx, ddl); err != nil {
				t.Fatalf("%v\n%s", err, ddl)
			}
			cat.Invalidate()
			after, err := cat.Lookup(ctx, tc.schema, tc.name)
			if err != nil {
				t.Fatal(err)
			}
			if !reflect.DeepEqual(before.Columns, after.Columns) {
				t.Errorf("columns differ:\n%+v\n%+v", before.Columns, after.Columns)
			}
			if !reflect.DeepEqual(before.Constraints, after.Constraints) {
				t.Errorf("constraints differ:\n%+v\n%+v", before.Constraints, after.Constraints)
			}
			if !reflect.DeepEqual(indexDefs(before), indexDefs(after)) {
				t.Errorf("indexes differ:\n%v\n%v", indexDefs(before), indexDefs(after))
			}
			if !reflect.DeepEqual(before.Comment, after.Comment) || before.Kind != after.Kind {
				t.Errorf("comment or kind differ")
			}
		})
	}
}

// TestDDLSequences checks that serial columns bring their sequence and OWNED BY, and identity columns
// none (GENERATED … AS IDENTITY recreates it). Each table is dropped and recreated from its DDL.
func TestDDLSequences(t *testing.T) {
	ctx := context.Background()
	pool := pgtest.PoolFor(t, pgtest.NewDatabase(t))
	cat := introspect.New(pool)
	if _, err := pool.Exec(ctx, `CREATE SCHEMA "S q";
		CREATE TABLE "S q"."Ser" (id serial PRIMARY KEY, big bigserial, n int);
		ALTER SEQUENCE "S q"."Ser_big_seq" INCREMENT BY 5 CACHE 10 CYCLE;
		CREATE TABLE ident (id int GENERATED ALWAYS AS IDENTITY PRIMARY KEY, n int)`); err != nil {
		t.Fatal(err)
	}
	for _, tc := range []struct {
		schema, name string
		want         []string
		seqs         int
	}{
		{"S q", "Ser", []string{
			`CREATE SEQUENCE "S q"."Ser_id_seq" AS integer START WITH 1 INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 CACHE 1;`,
			`CREATE SEQUENCE "S q"."Ser_big_seq" AS bigint START WITH 1 INCREMENT BY 5 MINVALUE 1 MAXVALUE 9223372036854775807 CACHE 10 CYCLE;`,
			`ALTER SEQUENCE "S q"."Ser_id_seq" OWNED BY "S q"."Ser"."id";`,
			`ALTER SEQUENCE "S q"."Ser_big_seq" OWNED BY "S q"."Ser"."big";`,
		}, 2},
		{"public", "ident", nil, 0},
	} {
		t.Run(tc.name, func(t *testing.T) {
			before, err := cat.Lookup(ctx, tc.schema, tc.name)
			if err != nil {
				t.Fatal(err)
			}
			ddl, err := cat.DDL(ctx, before)
			if err != nil {
				t.Fatal(err)
			}
			for _, w := range tc.want {
				if !strings.Contains(ddl, w) {
					t.Errorf("missing %s in\n%s", w, ddl)
				}
			}
			if n := strings.Count(ddl, "CREATE SEQUENCE"); n != tc.seqs {
				t.Errorf("%d CREATE SEQUENCE, want %d:\n%s", n, tc.seqs, ddl)
			}
			if _, err := pool.Exec(ctx, "DROP TABLE "+pgx.Identifier{tc.schema, tc.name}.Sanitize()); err != nil {
				t.Fatal(err)
			}
			if _, err := pool.Exec(ctx, ddl); err != nil {
				t.Fatalf("%v\n%s", err, ddl)
			}
			cat.Invalidate()
			after, err := cat.Lookup(ctx, tc.schema, tc.name)
			if err != nil {
				t.Fatal(err)
			}
			if !reflect.DeepEqual(before.Columns, after.Columns) {
				t.Errorf("columns differ:\n%+v\n%+v", before.Columns, after.Columns)
			}
			if again, _ := cat.DDL(ctx, after); again != ddl {
				t.Errorf("DDL changed after recreating:\n%s\n%s", ddl, again)
			}
		})
	}
}

func indexDefs(t *introspect.Table) []string {
	var defs []string
	for _, ix := range t.Indexes {
		defs = append(defs, ix.Definition)
	}
	return defs
}

func TestCompletions(t *testing.T) {
	c, err := catalog(t).Completions(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	cols := map[string][]string{}
	partition := map[string]bool{}
	for _, tb := range c.Tables {
		cols[tb.Schema+"."+tb.Name] = tb.Columns
		partition[tb.Schema+"."+tb.Name] = tb.Partition
	}
	if partition["public.events"] || !partition["public.events_2025"] {
		t.Errorf("partition flags: events %v, events_2025 %v", partition["public.events"], partition["public.events_2025"])
	}
	if !slices.Contains(cols["public.users"], "email") || !slices.Contains(cols["public.Weird Table"], "Column With Spaces") {
		t.Errorf("columns: users %v, Weird Table %v", cols["public.users"], cols["public.Weird Table"])
	}
	if _, ok := cols["billing.plans"]; !ok {
		t.Error("billing.plans missing")
	}
	if !slices.Equal(c.SearchPath, []string{"public"}) {
		t.Errorf("search_path: %v", c.SearchPath)
	}
	for _, f := range []string{"now", "count", "jsonb_build_object"} {
		if !slices.Contains(c.Functions, f) {
			t.Errorf("function %s missing", f)
		}
	}
	for _, f := range []string{"int4in", "boolout"} {
		if slices.Contains(c.Functions, f) {
			t.Errorf("type I/O function %s listed", f)
		}
	}
}

// Version-dependent DDL follows the capability: NULLS NOT DISTINCT shows up from 15 and fails before.
func TestDDLNullsNotDistinct(t *testing.T) {
	ctx := context.Background()
	pool := pgtest.PoolFor(t, pgtest.NewDatabase(t))
	var num int
	if err := pool.QueryRow(ctx, `SELECT current_setting('server_version_num')::int`).Scan(&num); err != nil {
		t.Fatal(err)
	}
	_, err := pool.Exec(ctx, `CREATE TABLE nnd (a int, CONSTRAINT nnd_a UNIQUE NULLS NOT DISTINCT (a))`)
	if !capabilities.Compute(num, nil).Has(capabilities.NullsNotDistinct) {
		if err == nil {
			t.Fatalf("NULLS NOT DISTINCT accepted on %d, the capability table is wrong", num)
		}
		return
	}
	if err != nil {
		t.Fatal(err)
	}
	cat := introspect.New(pool)
	tbl, err := cat.Lookup(ctx, "public", "nnd")
	if err != nil {
		t.Fatal(err)
	}
	ddl, err := cat.DDL(ctx, tbl)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(ddl, "UNIQUE NULLS NOT DISTINCT (a)") {
		t.Errorf("DDL lost NULLS NOT DISTINCT:\n%s", ddl)
	}
}
