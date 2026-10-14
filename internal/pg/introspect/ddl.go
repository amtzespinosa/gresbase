package introspect

import (
	"context"
	"fmt"
	"strings"

	"github.com/jackc/pgx/v5"
)

// ddlExtras is what DDL needs beyond Table: view definitions, partitioning and sequences.
type ddlExtras struct {
	partKey   *string // PARTITION BY clause of a partitioned table
	viewDef   *string // query of a view or materialized view
	parent    *string // qualified parent of a partition
	partBound *string // FOR VALUES clause of a partition
	sequences []sequence
}

// sequence is one the table's column defaults use (serial columns and nextval() defaults);
// identity sequences are not listed, GENERATED … AS IDENTITY recreates them.
type sequence struct {
	schema, name, typ          string
	start, increment, min, max int64
	cache                      int64
	cycle                      bool
	owner                      *string // column of OWNED BY, nil when the sequence is not owned
}

// DDL returns the SQL that recreates t: the sequences its defaults use, CREATE TABLE with columns,
// defaults and constraints, its indexes and comments (CREATE VIEW for views). Triggers and grants are
// not included.
func (c *Catalog) DDL(ctx context.Context, t *Table) (string, error) {
	var x ddlExtras
	err := c.pool.QueryRow(ctx, `SELECT pg_get_partkeydef(c.oid),
			CASE WHEN c.relkind IN ('v', 'm') THEN pg_get_viewdef(c.oid) END,
			(SELECT quote_ident(pn.nspname) || '.' || quote_ident(p.relname) FROM pg_inherits i
				JOIN pg_class p ON p.oid = i.inhparent JOIN pg_namespace pn ON pn.oid = p.relnamespace
				WHERE c.relispartition AND i.inhrelid = c.oid),
			CASE WHEN c.relispartition THEN pg_get_expr(c.relpartbound, c.oid) END
		FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
		WHERE n.nspname = $1 AND c.relname = $2`, t.Schema, t.Name).
		Scan(&x.partKey, &x.viewDef, &x.parent, &x.partBound)
	if err != nil {
		return "", fmt.Errorf("ddl of %q.%q: %w", t.Schema, t.Name, err)
	}
	// Sequences owned by a column (serial: dependency 'a'; identity is 'i') plus those a default
	// calls; DISTINCT ON keeps the owned row when a sequence is both.
	rows, _ := c.pool.Query(ctx, `WITH t AS (
			SELECT c.oid FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
			WHERE n.nspname = $1 AND c.relname = $2
		), used AS (
			SELECT d.objid AS seq, a.attname AS owner, a.attnum FROM pg_depend d
				JOIN pg_attribute a ON a.attrelid = d.refobjid AND a.attnum = d.refobjsubid
			WHERE d.classid = 'pg_class'::regclass AND d.refclassid = 'pg_class'::regclass
				AND d.deptype = 'a' AND d.refobjid = (SELECT oid FROM t)
			UNION ALL
			SELECT d.refobjid, NULL, ad.adnum FROM pg_depend d JOIN pg_attrdef ad ON ad.oid = d.objid
			WHERE d.classid = 'pg_attrdef'::regclass AND d.refclassid = 'pg_class'::regclass
				AND ad.adrelid = (SELECT oid FROM t)
		)
		SELECT sn.nspname, s.relname, format_type(q.seqtypid, NULL), q.seqstart, q.seqincrement,
			q.seqmin, q.seqmax, q.seqcache, q.seqcycle, u.owner
		FROM (SELECT DISTINCT ON (seq) * FROM used ORDER BY seq, owner NULLS LAST) u
			JOIN pg_class s ON s.oid = u.seq AND s.relkind = 'S'
			JOIN pg_namespace sn ON sn.oid = s.relnamespace
			JOIN pg_sequence q ON q.seqrelid = s.oid
		ORDER BY u.attnum`, t.Schema, t.Name)
	x.sequences, err = pgx.CollectRows(rows, func(r pgx.CollectableRow) (sequence, error) {
		var s sequence
		return s, r.Scan(&s.schema, &s.name, &s.typ, &s.start, &s.increment, &s.min, &s.max, &s.cache, &s.cycle, &s.owner)
	})
	if err != nil {
		return "", fmt.Errorf("sequences of %q.%q: %w", t.Schema, t.Name, err)
	}
	return ddl(t, x), nil
}

func ddl(t *Table, x ddlExtras) string {
	name := pgx.Identifier{t.Schema, t.Name}.Sanitize()
	var b strings.Builder
	switch {
	case t.Kind == KindView || t.Kind == KindMaterializedView:
		kw := "VIEW"
		if t.Kind == KindMaterializedView {
			kw = "MATERIALIZED VIEW"
		}
		def := ""
		if x.viewDef != nil {
			def = strings.TrimSuffix(strings.TrimSpace(*x.viewDef), ";")
		}
		fmt.Fprintf(&b, "CREATE %s %s AS\n%s;\n", kw, name, def)
	case t.Kind == KindForeignTable:
		fmt.Fprintf(&b, "-- %s is a foreign table: its DDL is not generated.\n", name)
	case x.parent != nil && x.partBound != nil:
		fmt.Fprintf(&b, "CREATE TABLE %s PARTITION OF %s %s;\n", name, *x.parent, *x.partBound)
	default:
		for _, s := range x.sequences {
			fmt.Fprintf(&b, "CREATE SEQUENCE %s AS %s START WITH %d INCREMENT BY %d MINVALUE %d MAXVALUE %d CACHE %d",
				pgx.Identifier{s.schema, s.name}.Sanitize(), s.typ, s.start, s.increment, s.min, s.max, s.cache)
			if s.cycle {
				b.WriteString(" CYCLE")
			}
			b.WriteString(";\n")
		}
		var lines []string
		for _, col := range t.Columns {
			lines = append(lines, "    "+columnDDL(col))
		}
		for _, con := range t.Constraints {
			if con.Type != "" { // PostgreSQL 18 lists NOT NULL as constraints; they are on the columns
				lines = append(lines, "    CONSTRAINT "+ident(con.Name)+" "+con.Definition)
			}
		}
		fmt.Fprintf(&b, "CREATE TABLE %s (\n%s\n)", name, strings.Join(lines, ",\n"))
		if x.partKey != nil {
			b.WriteString(" PARTITION BY " + *x.partKey)
		}
		b.WriteString(";\n")
		for _, s := range x.sequences {
			if s.owner != nil {
				fmt.Fprintf(&b, "ALTER SEQUENCE %s OWNED BY %s.%s;\n",
					pgx.Identifier{s.schema, s.name}.Sanitize(), name, ident(*s.owner))
			}
		}
	}

	backing := map[string]bool{} // indexes created by PRIMARY KEY, UNIQUE and EXCLUDE constraints
	for _, con := range t.Constraints {
		backing[con.Name] = true
	}
	for _, ix := range t.Indexes {
		if !backing[ix.Name] {
			b.WriteString(ix.Definition + ";\n")
		}
	}

	if t.Comment != nil {
		kind := "TABLE"
		switch t.Kind {
		case KindView:
			kind = "VIEW"
		case KindMaterializedView:
			kind = "MATERIALIZED VIEW"
		case KindForeignTable:
			kind = "FOREIGN TABLE"
		}
		fmt.Fprintf(&b, "COMMENT ON %s %s IS %s;\n", kind, name, literal(*t.Comment))
	}
	for _, col := range t.Columns {
		if col.Comment != nil {
			fmt.Fprintf(&b, "COMMENT ON COLUMN %s.%s IS %s;\n", name, ident(col.Name), literal(*col.Comment))
		}
	}
	return b.String()
}

func columnDDL(c Column) string {
	s := ident(c.Name) + " " + c.Type
	switch {
	case c.Identity == "always":
		s += " GENERATED ALWAYS AS IDENTITY"
	case c.Identity == "by_default":
		s += " GENERATED BY DEFAULT AS IDENTITY"
	case c.Generated != nil:
		s += " GENERATED ALWAYS AS (" + *c.Generated + ") STORED"
	case c.Default != nil:
		s += " DEFAULT " + *c.Default
	}
	if c.NotNull {
		s += " NOT NULL"
	}
	return s
}

func ident(name string) string { return pgx.Identifier{name}.Sanitize() }

// literal quotes s as an SQL string (standard_conforming_strings is on since PostgreSQL 9.1).
func literal(s string) string { return "'" + strings.ReplaceAll(s, "'", "''") + "'" }
