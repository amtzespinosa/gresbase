package write

import (
	"context"
	"errors"
	"strings"

	"github.com/jackc/pgx/v5"

	"github.com/amtzespinosa/gresbase/internal/pg/introspect"
)

// ErrConfirmation is returned by Truncate and Drop when the request does not carry the exact name
// of the table. The UI asks the user to type it; the server checks it too, so a stray request
// cannot empty or drop a table.
var ErrConfirmation = errors.New("type the exact table name to confirm")

// maxImpactDepth limits how far Impact follows ON DELETE CASCADE chains.
const maxImpactDepth = 5

// Impact returns, per table, how many rows the deletes of cs would also delete (ON DELETE CASCADE,
// followed up to maxImpactDepth levels) or change (SET NULL / SET DEFAULT). It reads only, in a
// read-only transaction with the pool's statement_timeout.
func (w *Writer) Impact(ctx context.Context, t *introspect.Table, cs Changeset) (*Impact, error) {
	ops, err := parse(t, cs)
	if err != nil {
		return nil, err
	}
	b := &builder{}
	var preds []string
	for _, op := range ops {
		if op.Kind == "delete" {
			preds = append(preds, "("+pkWhere(b, t, op.PK)+")")
		}
	}
	out := &Impact{Tables: []ImpactEntry{}}
	if len(preds) == 0 {
		return out, nil
	}
	tx, err := w.pool.BeginTx(ctx, pgx.TxOptions{AccessMode: pgx.ReadOnly})
	if err != nil {
		return nil, err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	return out, w.impact(ctx, tx, b.args, t, strings.Join(preds, " OR "), 1, out)
}

// impact counts the rows that reference the rows of t matching where, and recurses on cascades.
// ponytail: a row reached through two paths is counted twice; fine for a warning.
func (w *Writer) impact(ctx context.Context, tx pgx.Tx, args []any, t *introspect.Table, where string, depth int, out *Impact) error {
	for _, fk := range t.ReferencedBy {
		action := fk.OnDelete
		if action != "cascade" && action != "set_null" && action != "set_default" {
			continue
		}
		child, err := w.cat.Lookup(ctx, fk.Schema, fk.Table)
		if err != nil {
			return err
		}
		childWhere := "(" + idents(fk.Columns) + ") IN (SELECT " + idents(fk.RefColumns) + " FROM " +
			table(t) + " WHERE " + where + ")"
		var n int64
		if err := tx.QueryRow(ctx, "SELECT count(*) FROM "+table(child)+" WHERE "+childWhere, args...).Scan(&n); err != nil {
			return err
		}
		if n == 0 {
			continue
		}
		out.add(child.Schema, child.Name, action, n)
		if action == "cascade" && depth < maxImpactDepth {
			if err := w.impact(ctx, tx, args, child, childWhere, depth+1, out); err != nil {
				return err
			}
		}
	}
	return nil
}

func (im *Impact) add(schema, table, action string, n int64) {
	for i, e := range im.Tables {
		if e.Schema == schema && e.Table == table && e.Action == action {
			im.Tables[i].Rows += n
			return
		}
	}
	im.Tables = append(im.Tables, ImpactEntry{Schema: schema, Table: table, Action: action, Rows: n})
}

// Dependents lists what TRUNCATE … CASCADE would also empty (tables referencing t, recursively) and
// what DROP TABLE … CASCADE would also drop (objects that depend on t, as Postgres describes them).
func (w *Writer) Dependents(ctx context.Context, t *introspect.Table) (*Dependents, error) {
	name := table(t)
	d := &Dependents{Truncate: []string{}, Drop: []string{}}
	rows, err := w.pool.Query(ctx, `
		WITH RECURSIVE r(oid) AS (
			SELECT $1::text::regclass::oid
			UNION
			SELECT c.conrelid FROM pg_constraint c JOIN r ON c.confrelid = r.oid
			WHERE c.contype = 'f' AND c.conparentid = 0
		)
		SELECT format('%I.%I', n.nspname, cl.relname) FROM r
		JOIN pg_class cl ON cl.oid = r.oid JOIN pg_namespace n ON n.oid = cl.relnamespace
		WHERE r.oid <> $1::text::regclass ORDER BY 1`, name)
	if err != nil {
		return nil, err
	}
	if d.Truncate, err = pgx.CollectRows(rows, pgx.RowTo[string]); err != nil {
		return nil, err
	}
	// Views depend on the table through their rewrite rule: describe the view, not the rule.
	// Constraints of the table itself (a self-referencing FK) go with it and are left out.
	rows, err = w.pool.Query(ctx, `
		SELECT DISTINCT coalesce(
			(SELECT pg_describe_object('pg_class'::regclass, rw.ev_class, 0) FROM pg_rewrite rw
			 WHERE d.classid = 'pg_rewrite'::regclass AND rw.oid = d.objid),
			pg_describe_object(d.classid, d.objid, d.objsubid)) AS what
		FROM pg_depend d
		WHERE d.refclassid = 'pg_class'::regclass AND d.refobjid = $1::text::regclass AND d.deptype = 'n'
		  AND NOT (d.classid = 'pg_constraint'::regclass AND EXISTS (
			SELECT 1 FROM pg_constraint c WHERE c.oid = d.objid AND c.conrelid = $1::text::regclass))
		ORDER BY 1`, name)
	if err != nil {
		return nil, err
	}
	if d.Drop, err = pgx.CollectRows(rows, pgx.RowTo[string]); err != nil {
		return nil, err
	}
	return d, nil
}

// Truncate empties t. It cannot be undone.
func (w *Writer) Truncate(ctx context.Context, session string, t *introspect.Table, req TruncateRequest) error {
	if err := droppable(t, req.Confirm); err != nil {
		return err
	}
	sql := "TRUNCATE TABLE " + table(t)
	if req.RestartIdentity {
		sql += " RESTART IDENTITY"
	}
	if req.Cascade {
		sql += " CASCADE"
	}
	return w.exec1(ctx, session, t, "truncate", sql)
}

// Drop drops t. It cannot be undone.
func (w *Writer) Drop(ctx context.Context, session string, t *introspect.Table, req DropRequest) error {
	if err := droppable(t, req.Confirm); err != nil {
		return err
	}
	sql := "DROP TABLE " + table(t)
	if req.Cascade {
		sql += " CASCADE"
	}
	return w.exec1(ctx, session, t, "drop", sql)
}

func (w *Writer) exec1(ctx context.Context, session string, t *introspect.Table, kind, sql string) error {
	if _, err := w.pool.Exec(ctx, sql); err != nil {
		return err
	}
	w.cat.Invalidate()
	w.rec.Record(ctx, Change{ID: newID(), Session: session, Schema: t.Schema, Table: t.Name, Ops: []TextOp{{Kind: kind}}})
	return nil
}

func droppable(t *introspect.Table, confirm string) error {
	if t.Kind != introspect.KindTable && t.Kind != introspect.KindPartitionedTable {
		return ErrNotWritable
	}
	if confirm != t.Name {
		return ErrConfirmation
	}
	return nil
}

func idents(names []string) string {
	out := make([]string, len(names))
	for i, n := range names {
		out[i] = ident(n)
	}
	return strings.Join(out, ", ")
}
