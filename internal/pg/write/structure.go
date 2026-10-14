package write

import (
	"context"
	"errors"
	"fmt"
	"slices"
	"strings"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/amtzespinosa/gresbase/internal/pg/introspect"
	"github.com/amtzespinosa/gresbase/internal/pg/sqlguard"
)

// Structure changes (ALTER TABLE and friends). DDL takes no parameters, so every piece of the SQL
// comes from the catalog or is built here: names are validated and escaped with pgx.Identifier,
// types are resolved with to_regtype() and written back with format_type(), default values are
// string literals cast to the column type, and default functions come from a fixed list. The one
// exception is the condition of a check or a partial index, which has no other form than an SQL
// expression: it is kept inside its parentheses (expression), shown in the preview as written and
// run with the extended protocol, which takes a single statement (execOne).

// defaultFunctions are the default expressions the UI offers as shortcuts.
var defaultFunctions = map[string]string{
	"now":               "now()",
	"current_timestamp": "CURRENT_TIMESTAMP",
	"current_date":      "CURRENT_DATE",
	"gen_random_uuid":   "gen_random_uuid()",
}

// columnKinds are the changes to an existing column (named by StructureChange.Column).
var columnKinds = map[string]bool{
	"rename_column": true, "alter_column_type": true, "set_not_null": true, "set_default": true, "drop_column": true,
}

// volatileDefaults rewrite the table when a column is added with them.
var volatileDefaults = map[string]bool{"gen_random_uuid": true}

// PreviewStructure returns the statements StructureChange would run and its warnings.
func (w *Writer) PreviewStructure(ctx context.Context, c StructureChange) (*StructurePreview, error) {
	return w.planStructure(ctx, c)
}

// ApplyStructure runs c in one transaction and returns what it ran. The statements are built by the
// same code as PreviewStructure, so for the same catalog they are the ones the user saw. CREATE
// INDEX CONCURRENTLY cannot run in a transaction: it runs alone, on its own connection.
func (w *Writer) ApplyStructure(ctx context.Context, c StructureChange) (*StructurePreview, error) {
	p, err := w.planStructure(ctx, c)
	if err != nil {
		return nil, err
	}
	if c.Kind == "create_index" && c.Index.Concurrently {
		err = w.pool.AcquireFunc(ctx, func(conn *pgxpool.Conn) error { return execOne(ctx, conn.Conn(), p.SQL[0]) })
	} else {
		err = pgx.BeginFunc(ctx, w.pool, func(tx pgx.Tx) error {
			for _, s := range p.SQL {
				if err := execOne(ctx, tx.Conn(), s); err != nil {
					return err
				}
			}
			return nil
		})
	}
	w.cat.Invalidate() // a failed CONCURRENTLY build still leaves an (invalid) index behind
	if err != nil {
		return nil, err
	}
	return p, nil
}

// execOne runs sql with the extended protocol, which takes exactly one statement: whatever the
// expressions of a check or a partial index contain, the server refuses to run a second one.
// (pgx's Exec without arguments would use the simple protocol, which runs several.)
func execOne(ctx context.Context, conn *pgx.Conn, sql string) error {
	return conn.PgConn().ExecParams(ctx, sql, nil, nil, nil, nil).Read().Err
}

type plan struct {
	sql      []string
	warnings []string
}

func (p *plan) add(sql string, warnings ...string) {
	p.sql = append(p.sql, sql)
	for _, wn := range warnings {
		if !slices.Contains(p.warnings, wn) {
			p.warnings = append(p.warnings, wn)
		}
	}
}

func (w *Writer) planStructure(ctx context.Context, c StructureChange) (*StructurePreview, error) {
	p := &plan{}
	var err error
	if c.Kind == "create_table" {
		err = w.planCreate(ctx, c, p)
	} else {
		err = w.planAlter(ctx, c, p)
	}
	if err != nil {
		return nil, err
	}
	if p.warnings == nil {
		p.warnings = []string{}
	}
	return &StructurePreview{SQL: p.sql, Warnings: p.warnings}, nil
}

func (w *Writer) planCreate(ctx context.Context, c StructureChange, p *plan) error {
	if err := w.schemaExists(ctx, c.Schema); err != nil {
		return err
	}
	if err := validName(c.Table); err != nil {
		return err
	}
	if len(c.Columns) == 0 {
		return invalid("a table needs at least one column")
	}
	name := pgx.Identifier{c.Schema, c.Table}.Sanitize()
	var lines []string
	for _, def := range c.Columns {
		if slices.ContainsFunc(c.Columns[:len(lines)], func(d ColumnDef) bool { return d.Name == def.Name }) {
			return invalid("column %q appears twice", def.Name)
		}
		sql, _, err := w.columnDef(ctx, def)
		if err != nil {
			return err
		}
		lines = append(lines, sql)
	}
	if len(c.PrimaryKey) > 0 {
		for _, k := range c.PrimaryKey {
			if !slices.ContainsFunc(c.Columns, func(d ColumnDef) bool { return d.Name == k }) {
				return invalid("primary key column %q is not a column of the table", k)
			}
		}
		lines = append(lines, "PRIMARY KEY ("+idents(c.PrimaryKey)+")")
	}
	p.add("CREATE TABLE " + name + " (\n  " + strings.Join(lines, ",\n  ") + "\n)")
	if c.Comment != nil && *c.Comment != "" {
		if err := checkText(*c.Comment); err != nil {
			return err
		}
		p.add("COMMENT ON TABLE " + name + " IS " + literal(*c.Comment))
	}
	return nil
}

func (w *Writer) planAlter(ctx context.Context, c StructureChange, p *plan) error {
	t, err := w.cat.Lookup(ctx, c.Schema, c.Table)
	if err != nil {
		return err
	}
	if t.Kind != introspect.KindTable && t.Kind != introspect.KindPartitionedTable {
		return ErrNotWritable
	}
	alter := "ALTER TABLE " + table(t) + " "
	var col *introspect.Column
	if columnKinds[c.Kind] {
		var ok bool
		if col, ok = t.Column(c.Column); !ok {
			return fmt.Errorf("column %q of %q.%q: %w", c.Column, t.Schema, t.Name, introspect.ErrNotFound)
		}
	}
	switch c.Kind {
	case "rename_table":
		if err := validName(c.Name); err != nil {
			return err
		}
		p.add(alter+"RENAME TO "+ident(c.Name), WarnLock)
	case "set_table_comment":
		v := "NULL"
		if c.Comment != nil && *c.Comment != "" {
			if err := checkText(*c.Comment); err != nil {
				return err
			}
			v = literal(*c.Comment)
		}
		p.add("COMMENT ON TABLE " + table(t) + " IS " + v)
	case "set_table_schema":
		if err := w.schemaExists(ctx, c.Name); err != nil {
			return err
		}
		p.add(alter+"SET SCHEMA "+ident(c.Name), WarnLock)
	case "add_column":
		if c.Def == nil {
			return invalid("add_column needs def")
		}
		if _, exists := t.Column(c.Def.Name); exists {
			return invalid("column %q already exists", c.Def.Name)
		}
		sql, _, err := w.columnDef(ctx, *c.Def)
		if err != nil {
			return err
		}
		warns := []string{WarnLock}
		if c.Def.Identity != "" || c.Def.Default != nil && c.Def.Default.Kind == "function" && volatileDefaults[c.Def.Default.Value] {
			warns = append(warns, WarnRewrite)
		}
		if c.Def.NotNull && c.Def.Default == nil && c.Def.Identity == "" {
			warns = append(warns, WarnExistingData)
		}
		p.add(alter+"ADD COLUMN "+sql, warns...)
	case "rename_column":
		if err := validName(c.Name); err != nil {
			return err
		}
		p.add(alter+"RENAME COLUMN "+ident(col.Name)+" TO "+ident(c.Name), WarnLock)
	case "alter_column_type":
		if c.Type == nil {
			return invalid("alter_column_type needs type")
		}
		ty, err := w.resolveType(ctx, *c.Type)
		if err != nil {
			return err
		}
		sql := alter + "ALTER COLUMN " + ident(col.Name) + " TYPE " + ty.sql
		if c.Using {
			sql += " USING " + ident(col.Name) + "::" + ty.sql
		}
		warns := []string{WarnLock}
		safe, err := w.changesInPlace(ctx, t, col.Name, ty)
		if err != nil {
			return err
		}
		if !safe {
			warns = append(warns, WarnRewrite, WarnExistingData)
		}
		p.add(sql, warns...)
	case "set_not_null":
		if c.NotNull {
			p.add(alter+"ALTER COLUMN "+ident(col.Name)+" SET NOT NULL", WarnLock, WarnScan, WarnExistingData)
		} else {
			p.add(alter+"ALTER COLUMN "+ident(col.Name)+" DROP NOT NULL", WarnLock)
		}
	case "set_default":
		if c.Default == nil {
			p.add(alter+"ALTER COLUMN "+ident(col.Name)+" DROP DEFAULT", WarnLock)
			break
		}
		d, err := defaultSQL(*c.Default, col.Type)
		if err != nil {
			return err
		}
		p.add(alter+"ALTER COLUMN "+ident(col.Name)+" SET DEFAULT "+d, WarnLock)
	case "drop_column":
		if c.Confirm != col.Name {
			return ErrConfirmation
		}
		p.add(alter+"DROP COLUMN "+ident(col.Name), WarnLock)
	case "create_index":
		return w.planIndex(ctx, t, c.Index, p)
	case "drop_index":
		if !slices.ContainsFunc(t.Indexes, func(ix introspect.Index) bool { return ix.Name == c.Name }) {
			return fmt.Errorf("index %q of %q.%q: %w", c.Name, t.Schema, t.Name, introspect.ErrNotFound)
		}
		if c.Confirm != c.Name {
			return ErrConfirmation
		}
		p.add("DROP INDEX "+pgx.Identifier{t.Schema, c.Name}.Sanitize(), WarnLock)
	case "add_unique", "add_check", "add_foreign_key":
		return w.planConstraint(ctx, t, c.Kind, c.Constraint, alter, p)
	case "validate_constraint", "drop_constraint":
		i := slices.IndexFunc(t.Constraints, func(k introspect.Constraint) bool { return k.Name == c.Name })
		if i < 0 {
			return fmt.Errorf("constraint %q of %q.%q: %w", c.Name, t.Schema, t.Name, introspect.ErrNotFound)
		}
		if c.Kind == "validate_constraint" {
			p.add(alter+"VALIDATE CONSTRAINT "+ident(c.Name), WarnScan, WarnExistingData)
			break
		}
		if c.Confirm != c.Name {
			return ErrConfirmation
		}
		p.add(alter+"DROP CONSTRAINT "+ident(c.Name), WarnLock)
	default:
		return invalid("unknown structure change %q", c.Kind)
	}
	return nil
}

// fkActions are the ON DELETE / ON UPDATE actions of a foreign key.
var fkActions = map[string]string{
	"no_action": "NO ACTION", "restrict": "RESTRICT", "cascade": "CASCADE", "set_null": "SET NULL", "set_default": "SET DEFAULT",
}

// planIndex is CREATE [UNIQUE] INDEX [CONCURRENTLY] [name] ON table [USING method] (cols) [WHERE …].
func (w *Writer) planIndex(ctx context.Context, t *introspect.Table, d *IndexDef, p *plan) error {
	if d == nil {
		return invalid("create_index needs index")
	}
	names := make([]string, len(d.Columns))
	for i, c := range d.Columns {
		names[i] = c.Name
	}
	if _, err := columnList(t, names); err != nil {
		return err
	}
	cols := make([]string, len(d.Columns))
	for i, c := range d.Columns {
		cols[i] = ident(c.Name)
		if c.Descending {
			cols[i] += " DESC"
		}
	}
	sql := "CREATE "
	if d.Unique {
		sql += "UNIQUE "
	}
	sql += "INDEX "
	if d.Concurrently {
		sql += "CONCURRENTLY "
	}
	if d.Name != "" {
		if err := validName(d.Name); err != nil {
			return err
		}
		sql += ident(d.Name) + " "
	}
	sql += "ON " + table(t)
	if d.Method != "" && d.Method != "btree" {
		var ok bool
		if err := w.pool.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM pg_am WHERE amname = $1 AND amtype = 'i')`,
			d.Method).Scan(&ok); err != nil {
			return err
		}
		if !ok {
			return invalid("unknown index method %q", d.Method)
		}
		sql += " USING " + ident(d.Method)
	}
	sql += " (" + strings.Join(cols, ", ") + ")"
	if d.Where != "" {
		e, err := expression(d.Where)
		if err != nil {
			return err
		}
		sql += " WHERE " + e
	}
	warns := []string{WarnBlocksWrites, WarnScan}
	if d.Concurrently {
		warns = []string{WarnNoTx, WarnScan}
	}
	if d.Unique {
		warns = append(warns, WarnExistingData)
	}
	p.add(sql, warns...)
	return nil
}

// planConstraint is ALTER TABLE … ADD [CONSTRAINT name] UNIQUE / CHECK / FOREIGN KEY … [NOT VALID].
func (w *Writer) planConstraint(ctx context.Context, t *introspect.Table, kind string, d *ConstraintDef, alter string, p *plan) error {
	if d == nil {
		return invalid("%s needs constraint", kind)
	}
	sql := alter + "ADD "
	if d.Name != "" {
		if err := validName(d.Name); err != nil {
			return err
		}
		sql += "CONSTRAINT " + ident(d.Name) + " "
	}
	// Checking existing rows takes the lock for a whole scan; NOT VALID leaves it to VALIDATE.
	checked := func(lock string) []string {
		if d.NotValid {
			return []string{lock}
		}
		return []string{lock, WarnScan, WarnExistingData}
	}
	notValid := ""
	if d.NotValid {
		notValid = " NOT VALID"
	}
	switch kind {
	case "add_unique":
		if d.NotValid {
			return invalid("a unique constraint cannot be NOT VALID")
		}
		cols, err := columnList(t, d.Columns)
		if err != nil {
			return err
		}
		p.add(sql+"UNIQUE ("+cols+")", checked(WarnLock)...)
	case "add_check":
		e, err := expression(d.Expression)
		if err != nil {
			return err
		}
		p.add(sql+"CHECK "+e+notValid, checked(WarnLock)...)
	case "add_foreign_key":
		cols, err := columnList(t, d.Columns)
		if err != nil {
			return err
		}
		ref, err := w.cat.Lookup(ctx, d.RefSchema, d.RefTable)
		if err != nil {
			return err
		}
		if ref.Kind != introspect.KindTable && ref.Kind != introspect.KindPartitionedTable {
			return invalid("%q.%q is not a table", ref.Schema, ref.Name)
		}
		refCols, err := columnList(ref, d.RefColumns)
		if err != nil {
			return err
		}
		if len(d.RefColumns) != len(d.Columns) {
			return invalid("a foreign key needs as many referenced columns as columns")
		}
		sql += "FOREIGN KEY (" + cols + ") REFERENCES " + table(ref) + " (" + refCols + ")"
		for _, a := range []struct{ clause, action string }{{"ON DELETE", d.OnDelete}, {"ON UPDATE", d.OnUpdate}} {
			if a.action == "" || a.action == "no_action" {
				continue
			}
			s, ok := fkActions[a.action]
			if !ok {
				return invalid("unknown foreign key action %q", a.action)
			}
			sql += " " + a.clause + " " + s
		}
		// SHARE ROW EXCLUSIVE on both tables: blocks their writes, not their reads.
		p.add(sql+notValid, checked(WarnBlocksWrites)...)
	}
	return nil
}

// columnList checks that cols are distinct columns of t and returns them escaped, comma separated.
func columnList(t *introspect.Table, cols []string) (string, error) {
	if len(cols) == 0 {
		return "", invalid("choose at least one column")
	}
	for i, c := range cols {
		if _, ok := t.Column(c); !ok {
			return "", fmt.Errorf("column %q of %q.%q: %w", c, t.Schema, t.Name, introspect.ErrNotFound)
		}
		if slices.Contains(cols[:i], c) {
			return "", invalid("column %q appears twice", c)
		}
	}
	return idents(cols), nil
}

// expression returns the client's SQL expression of a check or a partial index in parentheses. These
// are the only client SQL in structure DDL (a condition has no other form): the preview shows them as
// written and execOne runs one statement only. Here the expression must stay one parenthesized group
// inside its clause: no semicolon, and only the final parenthesis closes it (an unterminated string
// or comment would swallow it). Like sqlguard, it assumes standard_conforming_strings=on.
func expression(s string) (string, error) {
	if strings.TrimSpace(s) == "" {
		return "", invalid("the expression is empty")
	}
	if err := checkText(s); err != nil {
		return "", err
	}
	sql := "(" + s + ")"
	toks := sqlguard.Scan(sql)
	depth := 0
	for i, t := range toks {
		if t.Kind != sqlguard.Punct {
			continue
		}
		switch sql[t.Start] {
		case ';':
			return "", invalid("the expression cannot contain ;")
		case '(':
			depth++
		case ')':
			if depth--; depth == 0 && i != len(toks)-1 {
				return "", invalid("unbalanced parentheses in the expression")
			}
		}
	}
	if last := toks[len(toks)-1]; depth != 0 || last.Kind != sqlguard.Punct || last.End != len(sql) || sql[last.Start] != ')' {
		return "", invalid("unbalanced parentheses, quotes or comment in the expression")
	}
	return sql, nil
}

// columnDef is the definition of a new column: name type [identity] [NOT NULL] [DEFAULT …].
func (w *Writer) columnDef(ctx context.Context, d ColumnDef) (string, resolvedType, error) {
	if err := validName(d.Name); err != nil {
		return "", resolvedType{}, err
	}
	ty, err := w.resolveType(ctx, d.Type)
	if err != nil {
		return "", ty, err
	}
	sql := ident(d.Name) + " " + ty.sql
	switch d.Identity {
	case "":
	case "always", "by_default":
		if d.Default != nil {
			return "", ty, invalid("an identity column cannot have a default")
		}
		sql += " GENERATED " + strings.ToUpper(strings.ReplaceAll(d.Identity, "_", " ")) + " AS IDENTITY"
	default:
		return "", ty, invalid("unknown identity %q", d.Identity)
	}
	if d.NotNull {
		sql += " NOT NULL"
	}
	if d.Default != nil {
		def, err := defaultSQL(*d.Default, ty.sql)
		if err != nil {
			return "", ty, err
		}
		sql += " DEFAULT " + def
	}
	return sql, ty, nil
}

func defaultSQL(d Default, typeSQL string) (string, error) {
	switch d.Kind {
	case "value":
		if err := checkText(d.Value); err != nil {
			return "", err
		}
		return literal(d.Value) + "::" + typeSQL, nil
	case "function":
		if f, ok := defaultFunctions[d.Value]; ok {
			return f, nil
		}
		return "", invalid("unknown default function %q", d.Value)
	}
	return "", invalid("unknown default kind %q", d.Kind)
}

type resolvedType struct {
	sql    string // format_type() of the type with its modifier
	oid    uint32
	typmod int32
}

// resolveType checks s against pg_type and returns the type as Postgres writes it. Modifiers go
// through the type's own typmodin function, as parameters.
func (w *Writer) resolveType(ctx context.Context, s TypeSpec) (resolvedType, error) {
	var (
		r            resolvedType
		typtype      string
		array        uint32
		modNs, modFn *string
	)
	// to_regtype() would silently drop a modifier written in the name: they go in Modifiers.
	if strings.ContainsAny(s.Name, "()") {
		return r, invalid("write the modifiers of %q apart", s.Name)
	}
	err := w.pool.QueryRow(ctx, `
		SELECT t.oid, t.typtype::text, t.typarray, pn.nspname, p.proname
		FROM pg_type t
		LEFT JOIN pg_proc p ON p.oid = t.typmodin
		LEFT JOIN pg_namespace pn ON pn.oid = p.pronamespace
		WHERE t.oid = to_regtype($1)`, s.Name).Scan(&r.oid, &typtype, &array, &modNs, &modFn)
	var pgErr *pgconn.PgError
	switch {
	case errors.Is(err, pgx.ErrNoRows) || errors.As(err, &pgErr) && !strings.HasPrefix(pgErr.Code, "57"):
		// to_regtype returns NULL for unknown types and, before 16, raises on bad syntax.
		return r, invalid("unknown type %q", s.Name)
	case err != nil:
		return r, err
	case typtype == "p":
		return r, invalid("%q is a pseudo-type", s.Name)
	}
	if s.Array {
		if array == 0 {
			return r, invalid("type %q has no array type", s.Name)
		}
		r.oid = array
	}
	r.typmod = -1
	if len(s.Modifiers) == 0 {
		err = w.pool.QueryRow(ctx, `SELECT format_type($1, NULL)`, r.oid).Scan(&r.sql)
		return r, err
	}
	if modFn == nil {
		return r, invalid("type %q takes no modifiers", s.Name)
	}
	fn := pgx.Identifier{*modNs, *modFn}.Sanitize()
	err = w.pool.QueryRow(ctx, `SELECT format_type($1, m), m FROM (SELECT `+fn+`($2::text[]::cstring[]) AS m) x`,
		r.oid, s.Modifiers).Scan(&r.sql, &r.typmod)
	if errors.As(err, &pgErr) && strings.HasPrefix(pgErr.Code, "22") {
		return r, invalid("modifiers of %q: %s", s.Name, pgErr.Message)
	}
	return r, err
}

// changesInPlace tells whether changing the type of column col to ty keeps the data as it is: same
// type with a modifier that does not shrink (varchar(50) → varchar(100)), or a binary-coercible cast
// without a modifier (varchar → text). Otherwise the change rewrites the table and can fail on its
// rows.
// ponytail: mirrors the common cases of Postgres' ATColumnChangeRequiresRewrite, erring on the side
// of the warning; ask the server (e.g. compare relfilenode in a rolled-back tx) if it must be exact.
func (w *Writer) changesInPlace(ctx context.Context, t *introspect.Table, col string, ty resolvedType) (bool, error) {
	var safe bool
	err := w.pool.QueryRow(ctx, `
		SELECT CASE WHEN a.atttypid = $3 THEN $4 = -1 OR (a.atttypmod <> -1 AND $4 >= a.atttypmod)
			ELSE $4 = -1 AND EXISTS (SELECT 1 FROM pg_cast c
				WHERE c.castsource = a.atttypid AND c.casttarget = $3 AND c.castmethod = 'b') END
		FROM pg_attribute a WHERE a.attrelid = $1::text::regclass AND a.attname = $2`,
		table(t), col, ty.oid, ty.typmod).Scan(&safe)
	return safe, err
}

func (w *Writer) schemaExists(ctx context.Context, schema string) error {
	schemas, err := w.cat.Schemas(ctx)
	if err != nil {
		return err
	}
	if !slices.Contains(schemas, schema) {
		return fmt.Errorf("schema %q: %w", schema, introspect.ErrNotFound)
	}
	return nil
}

// validName accepts what Postgres keeps as a name without truncating it.
func validName(name string) error {
	switch {
	case strings.TrimSpace(name) == "":
		return invalid("the name is empty")
	case len(name) > 63:
		return invalid("%q is longer than 63 bytes", name)
	case strings.ContainsRune(name, 0):
		return invalid("the name contains a NUL character")
	}
	return nil
}

// literal is s as an escape string constant (E'…'), correct whatever standard_conforming_strings
// says. Callers reject NUL first (checkText): Postgres text cannot hold it.
func literal(s string) string {
	return "E'" + strings.ReplaceAll(strings.ReplaceAll(s, `\`, `\\`), "'", "''") + "'"
}

func checkText(s string) error {
	if strings.ContainsRune(s, 0) {
		return invalid("text cannot contain a NUL character")
	}
	return nil
}

// Types lists the types a column can have, for the type picker: base types, enums, domains and
// ranges, without arrays (TypeSpec.Array makes one), pseudo-types, table row types or system ones.
func (w *Writer) Types(ctx context.Context) ([]TypeInfo, error) {
	rows, _ := w.pool.Query(ctx, `
		SELECT format_type(t.oid, NULL), t.typcategory::text, t.typmodin <> 0, n.nspname <> 'pg_catalog'
		FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
		WHERE t.typisdefined AND t.typtype IN ('b', 'e', 'd', 'r') AND t.typcategory NOT IN ('A', 'P', 'X')
		  AND n.nspname !~ '^pg_(toast|temp)' AND n.nspname <> 'information_schema'
		  AND (n.nspname <> 'pg_catalog' OR t.typcategory NOT IN ('U', 'Z') OR t.typname IN ('uuid', 'bytea', 'json', 'jsonb', 'xml', 'bool'))
		ORDER BY 4 DESC, 1`)
	return pgx.CollectRows(rows, func(r pgx.CollectableRow) (TypeInfo, error) {
		var ti TypeInfo
		err := r.Scan(&ti.Name, &ti.Category, &ti.Modifiers, &ti.User)
		return ti, err
	})
}
