// Package introspect describes the database from pg_catalog: schemas, relations and table details.
//
// Every name the client sends must go through Catalog.Lookup before it reaches SQL: it proves the
// table (and columns) exist and returns their metadata, including the catalog types used for casts.
package introspect

import (
	"context"
	"errors"
	"fmt"
	"sync"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// ErrNotFound is returned (wrapped) when a schema, relation or column does not exist.
var ErrNotFound = errors.New("not found")

// Column returns the column called name.
func (t *Table) Column(name string) (*Column, bool) {
	for i := range t.Columns {
		if t.Columns[i].Name == name {
			return &t.Columns[i], true
		}
	}
	return nil, false
}

// Catalog reads the catalog through a pool and caches results for TTL.
type Catalog struct {
	pool *pgxpool.Pool
	ttl  time.Duration

	mu    sync.Mutex
	cache map[string]cached
}

type cached struct {
	val any
	at  time.Time
}

// New returns a catalog with a 30 s cache.
func New(pool *pgxpool.Pool) *Catalog {
	return &Catalog{pool: pool, ttl: 30 * time.Second, cache: map[string]cached{}}
}

// Invalidate drops every cached result. Call it after anything that changes structure.
func (c *Catalog) Invalidate() {
	c.mu.Lock()
	c.cache = map[string]cached{}
	c.mu.Unlock()
}

func load[T any](ctx context.Context, c *Catalog, key string, fn func(context.Context) (T, error)) (T, error) {
	c.mu.Lock()
	e, ok := c.cache[key]
	c.mu.Unlock()
	if ok && time.Since(e.at) < c.ttl {
		return e.val.(T), nil
	}
	v, err := fn(ctx)
	if err != nil {
		return v, err
	}
	c.mu.Lock()
	c.cache[key] = cached{v, time.Now()}
	c.mu.Unlock()
	return v, nil
}

// Lookup is the single gate for names coming from the client: it returns the table metadata if
// schema.table exists and has every listed column, and an error wrapping ErrNotFound otherwise.
func (c *Catalog) Lookup(ctx context.Context, schema, table string, columns ...string) (*Table, error) {
	t, err := c.Table(ctx, schema, table)
	if err != nil {
		return nil, err
	}
	for _, col := range columns {
		if _, ok := t.Column(col); !ok {
			return nil, fmt.Errorf("column %q of %q.%q: %w", col, schema, table, ErrNotFound)
		}
	}
	return t, nil
}

// Schemas lists user schemas (no pg_* nor information_schema).
func (c *Catalog) Schemas(ctx context.Context) ([]string, error) {
	return load(ctx, c, "schemas", func(ctx context.Context) ([]string, error) {
		rows, _ := c.pool.Query(ctx, `SELECT nspname FROM pg_namespace
			WHERE nspname !~ '^pg_' AND nspname <> 'information_schema' ORDER BY nspname`)
		s, err := pgx.CollectRows(rows, pgx.RowTo[string])
		if err != nil {
			return nil, fmt.Errorf("list schemas: %w", err)
		}
		return s, nil
	})
}

const kindSQL = `CASE c.relkind WHEN 'r' THEN 'table' WHEN 'v' THEN 'view' WHEN 'm' THEN 'materialized_view'
	WHEN 'f' THEN 'foreign_table' WHEN 'p' THEN 'partitioned_table' END`

// estimatedRowsSQL is reltuples (-1 = never analyzed → NULL); partitioned tables add their partitions.
const estimatedRowsSQL = `CASE
	WHEN c.relkind = 'v' THEN NULL
	WHEN c.relkind = 'p' THEN (SELECT sum(pc.reltuples)::int8 FROM pg_inherits i
		JOIN pg_class pc ON pc.oid = i.inhrelid WHERE i.inhparent = c.oid AND pc.reltuples >= 0)
	WHEN c.reltuples < 0 THEN NULL
	ELSE c.reltuples::int8 END`

// Relations lists the relations of a schema; partitions are nested under their parent.
func (c *Catalog) Relations(ctx context.Context, schema string) ([]Relation, error) {
	return load(ctx, c, "rel\x00"+schema, func(ctx context.Context) ([]Relation, error) {
		var exists bool
		if err := c.pool.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = $1)`,
			schema).Scan(&exists); err != nil {
			return nil, fmt.Errorf("relations of %q: %w", schema, err)
		}
		if !exists {
			return nil, fmt.Errorf("schema %q: %w", schema, ErrNotFound)
		}
		rows, err := c.pool.Query(ctx, `SELECT c.oid, c.relname, `+kindSQL+`, `+estimatedRowsSQL+`,
				pg_total_relation_size(c.oid), obj_description(c.oid, 'pg_class'),
				(SELECT i.inhparent FROM pg_inherits i WHERE c.relispartition AND i.inhrelid = c.oid)
			FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
			WHERE n.nspname = $1 AND c.relkind IN ('r', 'v', 'm', 'f', 'p')
			ORDER BY c.relname`, schema)
		if err != nil {
			return nil, fmt.Errorf("relations of %q: %w", schema, err)
		}
		var all []relRow
		for rows.Next() {
			var r relRow
			var parent *uint32
			r.rel.Schema = schema
			if err := rows.Scan(&r.oid, &r.rel.Name, &r.rel.Kind, &r.rel.EstimatedRows, &r.rel.TotalBytes,
				&r.rel.Comment, &parent); err != nil {
				return nil, fmt.Errorf("relations of %q: %w", schema, err)
			}
			if parent != nil {
				r.parent = *parent
			}
			all = append(all, r)
		}
		if err := rows.Err(); err != nil {
			return nil, fmt.Errorf("relations of %q: %w", schema, err)
		}
		return nest(all), nil
	})
}

// relRow is a relation with its oid and the oid of its partition parent (0 if none).
type relRow struct {
	oid, parent uint32
	rel         Relation
}

// nest builds the partition tree: rows whose parent is in the list go under it, the rest are roots.
func nest(all []relRow) []Relation {
	present := map[uint32]bool{}
	for _, r := range all {
		present[r.oid] = true
	}
	children := map[uint32][]relRow{}
	var roots []relRow
	for _, r := range all {
		if r.parent != 0 && present[r.parent] {
			children[r.parent] = append(children[r.parent], r)
		} else {
			roots = append(roots, r)
		}
	}
	var build func([]relRow) []Relation
	build = func(rs []relRow) []Relation {
		out := make([]Relation, 0, len(rs))
		for _, r := range rs {
			r.rel.Partitions = build(children[r.oid]) // [] rather than null on the wire
			out = append(out, r.rel)
		}
		return out
	}
	return build(roots)
}

// Table describes schema.table, or returns an error wrapping ErrNotFound.
func (c *Catalog) Table(ctx context.Context, schema, table string) (*Table, error) {
	return load(ctx, c, "tbl\x00"+schema+"\x00"+table, func(ctx context.Context) (*Table, error) {
		t, err := c.readTable(ctx, schema, table)
		if err != nil && !errors.Is(err, ErrNotFound) {
			err = fmt.Errorf("describe %q.%q: %w", schema, table, err)
		}
		return t, err
	})
}

func (c *Catalog) readTable(ctx context.Context, schema, name string) (*Table, error) {
	t := &Table{Schema: schema, Name: name}
	var oid uint32
	err := c.pool.QueryRow(ctx, `SELECT c.oid, `+kindSQL+`, obj_description(c.oid, 'pg_class'), `+
		estimatedRowsSQL+`, pg_total_relation_size(c.oid), pg_relation_size(c.oid), pg_indexes_size(c.oid)
		FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
		WHERE n.nspname = $1 AND c.relname = $2 AND c.relkind IN ('r', 'v', 'm', 'f', 'p')`, schema, name).
		Scan(&oid, &t.Kind, &t.Comment, &t.EstimatedRows, &t.Sizes.Total, &t.Sizes.Table, &t.Sizes.Indexes)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, fmt.Errorf("relation %q.%q: %w", schema, name, ErrNotFound)
	}
	if err != nil {
		return nil, err
	}
	for _, step := range []func(context.Context, uint32, *Table) error{
		c.readColumns, c.readConstraints, c.readIndexes, c.readTriggers,
	} {
		if err := step(ctx, oid, t); err != nil {
			return nil, err
		}
	}
	t.HasPrimaryKey = len(t.PrimaryKey) > 0
	t.HasUserTriggers = len(t.Triggers) > 0
	return t, nil
}

func (c *Catalog) readColumns(ctx context.Context, oid uint32, t *Table) error {
	// t0 is the declared type, t the type after unwrapping a domain, e the element type of arrays.
	rows, err := c.pool.Query(ctx, `SELECT a.attnum, a.attname, format_type(a.atttypid, a.atttypmod),
			e.typname, t.typcategory = 'A',
			CASE WHEN e.typtype = 'e' THEN ARRAY(SELECT enumlabel::text FROM pg_enum
				WHERE enumtypid = e.oid ORDER BY enumsortorder) END,
			a.attnotnull, pg_get_expr(d.adbin, d.adrelid), a.attidentity::text, a.attgenerated::text,
			col_description(a.attrelid, a.attnum)
		FROM pg_attribute a
		JOIN pg_type t0 ON t0.oid = a.atttypid
		JOIN pg_type t ON t.oid = CASE WHEN t0.typtype = 'd' THEN t0.typbasetype ELSE t0.oid END
		JOIN pg_type e ON e.oid = CASE WHEN t.typcategory = 'A' AND t.typelem <> 0 THEN t.typelem ELSE t.oid END
		LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
		WHERE a.attrelid = $1 AND a.attnum > 0 AND NOT a.attisdropped
		ORDER BY a.attnum`, oid)
	if err != nil {
		return err
	}
	t.Columns = []Column{}
	for rows.Next() {
		var col Column
		var expr *string
		var identity, generated string
		if err := rows.Scan(&col.Position, &col.Name, &col.Type, &col.BaseType, &col.IsArray,
			&col.EnumValues, &col.NotNull, &expr, &identity, &generated, &col.Comment); err != nil {
			return err
		}
		if col.EnumValues == nil {
			col.EnumValues = []string{} // [] rather than null on the wire
		}
		switch identity {
		case "a":
			col.Identity = "always"
		case "d":
			col.Identity = "by_default"
		}
		if generated == "s" {
			col.Generated = expr
		} else {
			col.Default = expr
		}
		t.Columns = append(t.Columns, col)
	}
	return rows.Err()
}

var constraintTypes = map[string]string{
	"p": "primary_key", "u": "unique", "c": "check", "f": "foreign_key", "x": "exclusion",
}

var fkActions = map[string]string{
	"a": "no_action", "r": "restrict", "c": "cascade", "n": "set_null", "d": "set_default",
}

func (c *Catalog) readConstraints(ctx context.Context, oid uint32, t *Table) error {
	// Incoming FKs to a partitioned table also get one clone per partition (conparentid <> 0): skip them.
	rows, err := c.pool.Query(ctx, `SELECT con.conname, con.contype::text, pg_get_constraintdef(con.oid),
			con.conrelid = $1, con.confrelid = $1, n.nspname, c.relname,
			ARRAY(SELECT a.attname::text FROM unnest(con.conkey) WITH ORDINALITY k(num, ord)
				JOIN pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = k.num ORDER BY k.ord),
			coalesce(fn.nspname, ''), coalesce(fc.relname, ''),
			ARRAY(SELECT a.attname::text FROM unnest(con.confkey) WITH ORDINALITY k(num, ord)
				JOIN pg_attribute a ON a.attrelid = con.confrelid AND a.attnum = k.num ORDER BY k.ord),
			con.confdeltype::text, con.confupdtype::text, con.convalidated
		FROM pg_constraint con
		JOIN pg_class c ON c.oid = con.conrelid JOIN pg_namespace n ON n.oid = c.relnamespace
		LEFT JOIN pg_class fc ON fc.oid = con.confrelid LEFT JOIN pg_namespace fn ON fn.oid = fc.relnamespace
		WHERE (con.conrelid = $1 OR (con.confrelid = $1 AND con.contype = 'f' AND con.conparentid = 0))
		  AND con.contype <> 'n' -- NOT NULL constraints (18+) are shown as the columns' nullability
		ORDER BY con.conname`, oid)
	if err != nil {
		return err
	}
	t.PrimaryKey, t.Constraints, t.ForeignKeys, t.ReferencedBy = []string{}, []Constraint{}, []ForeignKey{}, []ForeignKey{}
	for rows.Next() {
		var con Constraint
		var typ, onDel, onUpd string
		var outgoing, incoming bool
		var fk ForeignKey
		if err := rows.Scan(&con.Name, &typ, &con.Definition, &outgoing, &incoming, &fk.Schema, &fk.Table,
			&con.Columns, &fk.RefSchema, &fk.RefTable, &fk.RefColumns, &onDel, &onUpd, &con.Validated); err != nil {
			return err
		}
		con.Type = constraintTypes[typ]
		if outgoing {
			t.Constraints = append(t.Constraints, con)
			if typ == "p" {
				t.PrimaryKey = con.Columns
			}
		}
		if typ != "f" {
			continue
		}
		fk.Name, fk.Columns, fk.OnDelete, fk.OnUpdate = con.Name, con.Columns, fkActions[onDel], fkActions[onUpd]
		if outgoing {
			t.ForeignKeys = append(t.ForeignKeys, fk)
		}
		if incoming {
			t.ReferencedBy = append(t.ReferencedBy, fk)
		}
	}
	return rows.Err()
}

func (c *Catalog) readIndexes(ctx context.Context, oid uint32, t *Table) error {
	rows, err := c.pool.Query(ctx, `SELECT ic.relname, pg_get_indexdef(i.indexrelid), i.indisunique,
			i.indisprimary, pg_relation_size(i.indexrelid), coalesce(s.idx_scan, 0)
		FROM pg_index i JOIN pg_class ic ON ic.oid = i.indexrelid
		LEFT JOIN pg_stat_all_indexes s ON s.indexrelid = i.indexrelid
		WHERE i.indrelid = $1 ORDER BY ic.relname`, oid)
	if err != nil {
		return err
	}
	t.Indexes, err = pgx.CollectRows(rows, func(r pgx.CollectableRow) (Index, error) {
		var ix Index
		err := r.Scan(&ix.Name, &ix.Definition, &ix.IsUnique, &ix.IsPrimary, &ix.SizeBytes, &ix.Scans)
		return ix, err
	})
	if t.Indexes == nil {
		t.Indexes = []Index{}
	}
	return err
}

func (c *Catalog) readTriggers(ctx context.Context, oid uint32, t *Table) error {
	rows, err := c.pool.Query(ctx, `SELECT tgname, pg_get_triggerdef(oid), tgenabled <> 'D'
		FROM pg_trigger WHERE tgrelid = $1 AND NOT tgisinternal ORDER BY tgname`, oid)
	if err != nil {
		return err
	}
	t.Triggers, err = pgx.CollectRows(rows, func(r pgx.CollectableRow) (Trigger, error) {
		var tr Trigger
		err := r.Scan(&tr.Name, &tr.Definition, &tr.Enabled)
		return tr, err
	})
	if t.Triggers == nil {
		t.Triggers = []Trigger{}
	}
	return err
}
