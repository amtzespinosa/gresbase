package write_test

import (
	"context"
	"errors"
	"fmt"
	"slices"
	"testing"

	"github.com/jackc/pgx/v5/pgconn"

	"github.com/amtzespinosa/gresbase/internal/pg/introspect"
	"github.com/amtzespinosa/gresbase/internal/pg/write"
)

func str(s string) *string { return &s }

// structure previews c, applies it and checks that both return the same statements.
func (e env) structure(t *testing.T, c write.StructureChange) *write.StructurePreview {
	t.Helper()
	ctx := context.Background()
	p, err := e.w.PreviewStructure(ctx, c)
	if err != nil {
		t.Fatalf("preview %s: %v", c.Kind, err)
	}
	a, err := e.w.ApplyStructure(ctx, c)
	if err != nil {
		t.Fatalf("apply %s %v: %v", c.Kind, p.SQL, err)
	}
	if !slices.Equal(p.SQL, a.SQL) || !slices.Equal(p.Warnings, a.Warnings) {
		t.Fatalf("%s: preview %v %v, applied %v %v", c.Kind, p.SQL, p.Warnings, a.SQL, a.Warnings)
	}
	return a
}

func TestStructure(t *testing.T) {
	e := newEnv(t)
	ctx := context.Background()
	if _, err := e.pool.Exec(ctx, `CREATE SCHEMA "my schema"`); err != nil {
		t.Fatal(err)
	}
	e.cat.Invalidate()
	const tbl = `"my schema"."it's"`

	created := e.structure(t, write.StructureChange{
		Kind: "create_table", Schema: "my schema", Table: "it's", Comment: str(`a 'quoted' \ comment`),
		Columns: []write.ColumnDef{
			{Name: "id", Type: write.TypeSpec{Name: "bigint"}, Identity: "always"},
			{Name: "name", Type: write.TypeSpec{Name: "text"}, NotNull: true,
				Default: &write.Default{Kind: "value", Value: `it's \ fine`}},
			{Name: "at", Type: write.TypeSpec{Name: "timestamp with time zone", Modifiers: []string{"3"}},
				Default: &write.Default{Kind: "function", Value: "now"}},
			{Name: "price", Type: write.TypeSpec{Name: "numeric", Modifiers: []string{"10", "2"}}},
			{Name: "tags", Type: write.TypeSpec{Name: "character varying", Modifiers: []string{"20"}, Array: true}},
		},
		PrimaryKey: []string{"id"},
	})
	want := []string{
		"CREATE TABLE " + tbl + " (\n" +
			`  "id" bigint GENERATED ALWAYS AS IDENTITY,` + "\n" +
			`  "name" text NOT NULL DEFAULT E'it''s \\ fine'::text,` + "\n" +
			`  "at" timestamp(3) with time zone DEFAULT now(),` + "\n" +
			`  "price" numeric(10,2),` + "\n" +
			`  "tags" character varying(20)[],` + "\n" +
			`  PRIMARY KEY ("id")` + "\n)",
		"COMMENT ON TABLE " + tbl + ` IS E'a ''quoted'' \\ comment'`,
	}
	if !slices.Equal(created.SQL, want) || len(created.Warnings) != 0 {
		t.Fatalf("create: %q %v", created.SQL, created.Warnings)
	}
	e.val(t, `INSERT INTO `+tbl+` (price) VALUES (1.5) RETURNING id::text`)
	if got := e.val(t, `SELECT name || '|' || obj_description(tableoid) FROM `+tbl); got != `it's \ fine|a 'quoted' \ comment` {
		t.Fatalf("defaults and comment: %q", got)
	}

	alter := func(kind string, c write.StructureChange) write.StructureChange {
		c.Kind, c.Schema, c.Table = kind, "my schema", "it's"
		return c
	}
	for _, tc := range []struct {
		c        write.StructureChange
		sql      string
		warnings []string
	}{
		{alter("add_column", write.StructureChange{Def: &write.ColumnDef{Name: "note", Type: write.TypeSpec{Name: "varchar", Modifiers: []string{"50"}}}}),
			`ALTER TABLE ` + tbl + ` ADD COLUMN "note" character varying(50)`, []string{"lock"}},
		{alter("add_column", write.StructureChange{Def: &write.ColumnDef{Name: "code", Type: write.TypeSpec{Name: "uuid"},
			Default: &write.Default{Kind: "function", Value: "gen_random_uuid"}}}),
			`ALTER TABLE ` + tbl + ` ADD COLUMN "code" uuid DEFAULT gen_random_uuid()`, []string{"lock", "rewrite"}},
		{alter("alter_column_type", write.StructureChange{Column: "note", Type: &write.TypeSpec{Name: "character varying", Modifiers: []string{"100"}}}),
			`ALTER TABLE ` + tbl + ` ALTER COLUMN "note" TYPE character varying(100)`, []string{"lock"}},
		{alter("alter_column_type", write.StructureChange{Column: "note", Type: &write.TypeSpec{Name: "text"}}),
			`ALTER TABLE ` + tbl + ` ALTER COLUMN "note" TYPE text`, []string{"lock"}},
		{alter("alter_column_type", write.StructureChange{Column: "price", Type: &write.TypeSpec{Name: "integer"}, Using: true}),
			`ALTER TABLE ` + tbl + ` ALTER COLUMN "price" TYPE integer USING "price"::integer`, []string{"lock", "rewrite", "existing_data"}},
		{alter("set_not_null", write.StructureChange{Column: "price", NotNull: true}),
			`ALTER TABLE ` + tbl + ` ALTER COLUMN "price" SET NOT NULL`, []string{"lock", "scan", "existing_data"}},
		{alter("set_not_null", write.StructureChange{Column: "price"}),
			`ALTER TABLE ` + tbl + ` ALTER COLUMN "price" DROP NOT NULL`, []string{"lock"}},
		{alter("set_default", write.StructureChange{Column: "price", Default: &write.Default{Kind: "value", Value: "7"}}),
			`ALTER TABLE ` + tbl + ` ALTER COLUMN "price" SET DEFAULT E'7'::integer`, []string{"lock"}},
		{alter("set_default", write.StructureChange{Column: "price"}),
			`ALTER TABLE ` + tbl + ` ALTER COLUMN "price" DROP DEFAULT`, []string{"lock"}},
		{alter("add_column", write.StructureChange{Def: &write.ColumnDef{Name: "req", Type: write.TypeSpec{Name: "int"}, NotNull: true, Default: &write.Default{Kind: "value", Value: "0"}}}),
			`ALTER TABLE ` + tbl + ` ADD COLUMN "req" integer NOT NULL DEFAULT E'0'::integer`, []string{"lock"}},
		{alter("rename_column", write.StructureChange{Column: "note", Name: `x"); DROP TABLE users; --`}),
			`ALTER TABLE ` + tbl + ` RENAME COLUMN "note" TO "x""); DROP TABLE users; --"`, []string{"lock"}},
		{alter("drop_column", write.StructureChange{Column: `x"); DROP TABLE users; --`, Confirm: `x"); DROP TABLE users; --`}),
			`ALTER TABLE ` + tbl + ` DROP COLUMN "x""); DROP TABLE users; --"`, []string{"lock"}},
		{alter("set_table_comment", write.StructureChange{}), `COMMENT ON TABLE ` + tbl + ` IS NULL`, []string{}},
		{alter("rename_table", write.StructureChange{Name: "items"}), `ALTER TABLE ` + tbl + ` RENAME TO "items"`, []string{"lock"}},
		{write.StructureChange{Kind: "set_table_schema", Schema: "my schema", Table: "items", Name: "public"},
			`ALTER TABLE "my schema"."items" SET SCHEMA "public"`, []string{"lock"}},
	} {
		got := e.structure(t, tc.c)
		if !slices.Equal(got.SQL, []string{tc.sql}) || !slices.Equal(got.Warnings, tc.warnings) {
			t.Errorf("%s:\n got %q %v\nwant %q %v", tc.c.Kind, got.SQL, got.Warnings, tc.sql, tc.warnings)
		}
	}
	moved := e.table(t, "public", "items")
	var names []string
	for _, c := range moved.Columns {
		names = append(names, c.Name+" "+c.Type)
	}
	if want := []string{"id bigint", "name text", "at timestamp(3) with time zone", "price integer", "tags character varying(20)[]", "code uuid", "req integer"}; !slices.Equal(names, want) {
		t.Fatalf("columns: %q", names)
	}
	if e.val(t, `SELECT count(*)::text FROM users`) == "0" {
		t.Fatal("users was emptied")
	}
}

func TestStructureRejects(t *testing.T) {
	e := newEnv(t)
	ctx := context.Background()
	users := func(kind string, c write.StructureChange) write.StructureChange {
		c.Kind, c.Schema, c.Table = kind, "public", "users"
		return c
	}
	typ := func(name string, mods ...string) write.StructureChange {
		return users("add_column", write.StructureChange{Def: &write.ColumnDef{Name: "x", Type: write.TypeSpec{Name: name, Modifiers: mods}}})
	}
	for _, tc := range []struct {
		name string
		c    write.StructureChange
		want error
	}{
		{"type injection", typ("int); DROP TABLE users; --"), write.ErrInvalid},
		{"type injection without parentheses", typ("int; DROP TABLE users"), write.ErrInvalid},
		{"unknown type", typ("nope"), write.ErrInvalid},
		{"pseudo-type", typ("trigger"), write.ErrInvalid},
		{"modifier in the name", typ("varchar(50)"), write.ErrInvalid},
		{"modifier injection", typ("varchar", "50) ; DROP TABLE users; --"), write.ErrInvalid},
		{"modifiers on a type without them", typ("integer", "4"), write.ErrInvalid},
		{"unknown default function", users("set_default", write.StructureChange{Column: "full_name", Default: &write.Default{Kind: "function", Value: "pg_sleep(10)"}}), write.ErrInvalid},
		{"NUL in a default", users("set_default", write.StructureChange{Column: "full_name", Default: &write.Default{Kind: "value", Value: "a\x00b"}}), write.ErrInvalid},
		{"identity with default", users("add_column", write.StructureChange{Def: &write.ColumnDef{Name: "x", Type: write.TypeSpec{Name: "int"}, Identity: "always", Default: &write.Default{Kind: "value", Value: "1"}}}), write.ErrInvalid},
		{"existing column", typ("int"), nil},
		{"long name", users("rename_table", write.StructureChange{Name: string(make([]byte, 64))}), write.ErrInvalid},
		{"empty name", users("rename_column", write.StructureChange{Column: "full_name", Name: " "}), write.ErrInvalid},
		{"unknown column", users("rename_column", write.StructureChange{Column: "nope", Name: "x"}), introspect.ErrNotFound},
		{"unknown schema", users("set_table_schema", write.StructureChange{Name: "nope"}), introspect.ErrNotFound},
		{"create in unknown schema", write.StructureChange{Kind: "create_table", Schema: "nope", Table: "t", Columns: []write.ColumnDef{{Name: "a", Type: write.TypeSpec{Name: "int"}}}}, introspect.ErrNotFound},
		{"view", write.StructureChange{Kind: "rename_table", Schema: "public", Table: "active_users", Name: "x"}, write.ErrNotWritable},
		{"drop without confirmation", users("drop_column", write.StructureChange{Column: "full_name", Confirm: "users"}), write.ErrConfirmation},
		{"primary key not a column", write.StructureChange{Kind: "create_table", Schema: "public", Table: "t", Columns: []write.ColumnDef{{Name: "a", Type: write.TypeSpec{Name: "int"}}}, PrimaryKey: []string{"b"}}, write.ErrInvalid},
		{"duplicate column", write.StructureChange{Kind: "create_table", Schema: "public", Table: "t", Columns: []write.ColumnDef{{Name: "a", Type: write.TypeSpec{Name: "int"}}, {Name: "a", Type: write.TypeSpec{Name: "text"}}}}, write.ErrInvalid},
		{"unknown kind", users("truncate", write.StructureChange{}), write.ErrInvalid},
	} {
		if tc.want == nil {
			// The first run adds x; the second must refuse it.
			if _, err := e.w.ApplyStructure(ctx, tc.c); err != nil {
				t.Fatalf("%s: %v", tc.name, err)
			}
			if _, err := e.w.PreviewStructure(ctx, tc.c); !errors.Is(err, write.ErrInvalid) {
				t.Errorf("%s: %v", tc.name, err)
			}
			continue
		}
		if _, err := e.w.PreviewStructure(ctx, tc.c); !errors.Is(err, tc.want) {
			t.Errorf("%s: %v, want %v", tc.name, err, tc.want)
		}
	}
	// A value Postgres cannot cast fails on apply and leaves nothing behind.
	if _, err := e.w.ApplyStructure(ctx, users("set_default", write.StructureChange{Column: "birth_date", Default: &write.Default{Kind: "value", Value: "soon"}})); err == nil {
		t.Fatal("bad default value applied")
	}
	if e.val(t, `SELECT count(*)::text FROM users`) == "0" {
		t.Fatal("users was emptied")
	}

	types, err := e.w.Types(ctx)
	if err != nil {
		t.Fatal(err)
	}
	has := func(name string) bool {
		return slices.ContainsFunc(types, func(ti write.TypeInfo) bool { return ti.Name == name })
	}
	if !has("integer") || !has("character varying") || !has("uuid") || has("integer[]") || has("trigger") {
		t.Fatalf("types: %v", types)
	}
}

func TestStructureKeys(t *testing.T) {
	e := newEnv(t)
	ctx := context.Background()
	for _, s := range []string{
		`CREATE SCHEMA "my schema"`,
		`CREATE TABLE "my schema".parent (id int PRIMARY KEY)`,
		`CREATE TABLE "my schema"."it's" (id int PRIMARY KEY, parent_id int, qty int, name text)`,
		`INSERT INTO "my schema".parent VALUES (1)`,
		`INSERT INTO "my schema"."it's" VALUES (1, 1, 5, 'a'), (2, 2, 0, 'b')`,
	} {
		if _, err := e.pool.Exec(ctx, s); err != nil {
			t.Fatal(err)
		}
	}
	e.cat.Invalidate()
	const tbl = `"my schema"."it's"`
	on := func(kind string, c write.StructureChange) write.StructureChange {
		c.Kind, c.Schema, c.Table = kind, "my schema", "it's"
		return c
	}
	fk := func(name string, notValid bool) write.StructureChange {
		return on("add_foreign_key", write.StructureChange{Constraint: &write.ConstraintDef{
			Name: name, Columns: []string{"parent_id"}, RefSchema: "my schema", RefTable: "parent", RefColumns: []string{"id"},
			OnDelete: "cascade", OnUpdate: "set_null", NotValid: notValid,
		}})
	}
	check := func(c write.StructureChange, sql string, warnings ...string) {
		t.Helper()
		got := e.structure(t, c)
		if warnings == nil {
			warnings = []string{}
		}
		if !slices.Equal(got.SQL, []string{sql}) || !slices.Equal(got.Warnings, warnings) {
			t.Errorf("%s:\n got %q %v\nwant %q %v", c.Kind, got.SQL, got.Warnings, sql, warnings)
		}
	}
	pgCode := func(err error) string {
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) {
			return pgErr.Code
		}
		return fmt.Sprint(err)
	}

	check(on("create_index", write.StructureChange{Index: &write.IndexDef{Name: "it's_name", Unique: true,
		Columns: []write.IndexColumn{{Name: "name", Descending: true}}, Where: `qty > 0 AND name <> ')'`}}),
		`CREATE UNIQUE INDEX "it's_name" ON `+tbl+` ("name" DESC) WHERE (qty > 0 AND name <> ')')`,
		"blocks_writes", "scan", "existing_data")
	check(on("create_index", write.StructureChange{Index: &write.IndexDef{Method: "hash", Concurrently: true,
		Columns: []write.IndexColumn{{Name: "qty"}}}}),
		`CREATE INDEX CONCURRENTLY ON `+tbl+` USING "hash" ("qty")`, "no_transaction", "scan")
	if got := e.val(t, `SELECT string_agg(indisvalid::text, ',') FROM pg_index WHERE indrelid = '"my schema"."it''s"'::regclass AND NOT indisprimary`); got != "true,true" {
		t.Fatalf("indexes valid: %s", got)
	}
	check(on("add_check", write.StructureChange{Constraint: &write.ConstraintDef{Name: "qty_pos", Expression: "qty >= 0"}}),
		`ALTER TABLE `+tbl+` ADD CONSTRAINT "qty_pos" CHECK (qty >= 0)`, "lock", "scan", "existing_data")
	check(on("add_unique", write.StructureChange{Constraint: &write.ConstraintDef{Columns: []string{"name"}}}),
		`ALTER TABLE `+tbl+` ADD UNIQUE ("name")`, "lock", "scan", "existing_data")

	// Row 2 points at a parent that does not exist: the checked key fails with Postgres' error.
	if _, err := e.w.ApplyStructure(ctx, fk("fk_parent", false)); pgCode(err) != "23503" {
		t.Fatalf("foreign key over bad rows: %v", err)
	}
	check(fk("fk_parent", true), `ALTER TABLE `+tbl+` ADD CONSTRAINT "fk_parent" FOREIGN KEY ("parent_id") REFERENCES "my schema"."parent" ("id") ON DELETE CASCADE ON UPDATE SET NULL NOT VALID`,
		"blocks_writes")
	validate := on("validate_constraint", write.StructureChange{Name: "fk_parent"})
	if _, err := e.w.ApplyStructure(ctx, validate); pgCode(err) != "23503" {
		t.Fatalf("validate over bad rows: %v", err)
	}
	cons := e.table(t, "my schema", "it's").Constraints
	if i := slices.IndexFunc(cons, func(c introspect.Constraint) bool { return c.Name == "fk_parent" }); i < 0 || cons[i].Validated {
		t.Fatal("fk_parent should be listed as not validated")
	}
	e.val(t, `DELETE FROM `+tbl+` WHERE id = 2 RETURNING id::text`)
	check(validate, `ALTER TABLE `+tbl+` VALIDATE CONSTRAINT "fk_parent"`, "scan", "existing_data")

	check(on("drop_constraint", write.StructureChange{Name: "qty_pos", Confirm: "qty_pos"}),
		`ALTER TABLE `+tbl+` DROP CONSTRAINT "qty_pos"`, "lock")
	check(on("drop_index", write.StructureChange{Name: "it's_name", Confirm: "it's_name"}),
		`DROP INDEX "my schema"."it's_name"`, "lock")
	after := e.table(t, "my schema", "it's")
	types := map[string]bool{}
	for _, c := range after.Constraints {
		types[c.Type] = c.Validated
	}
	if len(types) != 3 || !types["foreign_key"] || !types["unique"] || !types["primary_key"] || len(after.Indexes) != 3 {
		t.Fatalf("after: constraints %v, %d indexes", types, len(after.Indexes))
	}
}

func TestStructureKeysReject(t *testing.T) {
	e := newEnv(t)
	ctx := context.Background()
	users := func(kind string, c write.StructureChange) write.StructureChange {
		c.Kind, c.Schema, c.Table = kind, "public", "users"
		return c
	}
	checkExpr := func(expr string) write.StructureChange {
		return users("add_check", write.StructureChange{Constraint: &write.ConstraintDef{Expression: expr}})
	}
	where := func(expr string) write.StructureChange {
		return users("create_index", write.StructureChange{Index: &write.IndexDef{Columns: []write.IndexColumn{{Name: "id"}}, Where: expr}})
	}
	index := func(d write.IndexDef) write.StructureChange {
		return users("create_index", write.StructureChange{Index: &d})
	}
	key := func(d write.ConstraintDef) write.StructureChange {
		d.Columns = append([]string{"id"}, d.Columns...)
		if d.RefTable == "" {
			d.RefSchema, d.RefTable, d.RefColumns = "public", "users", []string{"id"}
		}
		return users("add_foreign_key", write.StructureChange{Constraint: &d})
	}
	for _, tc := range []struct {
		name string
		c    write.StructureChange
		want error
	}{
		{"statement after a check", checkExpr("true); DROP TABLE users; --"), write.ErrInvalid},
		{"semicolon in a check", checkExpr("true; DROP TABLE users"), write.ErrInvalid},
		{"check closing its parenthesis", checkExpr("true) NOT VALID, ADD CHECK (true"), write.ErrInvalid},
		{"unterminated string", checkExpr("full_name = 'x"), write.ErrInvalid},
		{"line comment", checkExpr("true --"), write.ErrInvalid},
		{"open block comment", checkExpr("true /*"), write.ErrInvalid},
		{"empty check", checkExpr("  "), write.ErrInvalid},
		{"NUL in a check", checkExpr("true\x00"), write.ErrInvalid},
		{"statement after a predicate", where("id > 0); DROP TABLE users; --"), write.ErrInvalid},
		{"predicate closing its parenthesis", where("true) WITH (fillfactor = 10"), write.ErrInvalid},
		{"unknown method", index(write.IndexDef{Columns: []write.IndexColumn{{Name: "id"}}, Method: "nope"}), write.ErrInvalid},
		{"method injection", index(write.IndexDef{Columns: []write.IndexColumn{{Name: "id"}}, Method: "btree; DROP TABLE users"}), write.ErrInvalid},
		{"index without columns", index(write.IndexDef{}), write.ErrInvalid},
		{"index on unknown column", index(write.IndexDef{Columns: []write.IndexColumn{{Name: "nope"}}}), introspect.ErrNotFound},
		{"index column twice", index(write.IndexDef{Columns: []write.IndexColumn{{Name: "id"}, {Name: "id", Descending: true}}}), write.ErrInvalid},
		{"long index name", index(write.IndexDef{Name: string(make([]byte, 64)), Columns: []write.IndexColumn{{Name: "id"}}}), write.ErrInvalid},
		{"unique NOT VALID", users("add_unique", write.StructureChange{Constraint: &write.ConstraintDef{Columns: []string{"id"}, NotValid: true}}), write.ErrInvalid},
		{"foreign key column count", key(write.ConstraintDef{Columns: []string{"full_name"}}), write.ErrInvalid},
		{"foreign key to a view", key(write.ConstraintDef{RefSchema: "public", RefTable: "active_users", RefColumns: []string{"id"}}), write.ErrInvalid},
		{"foreign key to unknown table", key(write.ConstraintDef{RefSchema: "public", RefTable: "nope", RefColumns: []string{"id"}}), introspect.ErrNotFound},
		{"foreign key action injection", key(write.ConstraintDef{OnDelete: "cascade; DROP TABLE users"}), write.ErrInvalid},
		{"missing constraint", users("add_check", write.StructureChange{}), write.ErrInvalid},
		{"drop index without confirmation", users("drop_index", write.StructureChange{Name: "users_pkey", Confirm: "users"}), write.ErrConfirmation},
		{"unknown index", users("drop_index", write.StructureChange{Name: "nope", Confirm: "nope"}), introspect.ErrNotFound},
		{"unknown constraint", users("validate_constraint", write.StructureChange{Name: "nope"}), introspect.ErrNotFound},
		{"drop constraint without confirmation", users("drop_constraint", write.StructureChange{Name: "users_pkey"}), write.ErrConfirmation},
	} {
		if _, err := e.w.PreviewStructure(ctx, tc.c); !errors.Is(err, tc.want) {
			t.Errorf("%s: %v, want %v", tc.name, err, tc.want)
		}
	}
	if e.val(t, `SELECT count(*)::text FROM users`) == "0" {
		t.Fatal("users was emptied")
	}
}
