// Package write is the only place where the app changes table data. A changeset (inserts, updates
// and deletes) runs in one transaction: every update and delete first locks its row by primary key
// and checks the values the client saw, and every operation records its inverse so the changeset
// can be undone (and redone) with the same checks.
//
// Column names are only used after checking them against the catalog metadata and are always
// escaped; values are always parameters cast to the catalog type of their column.
package write

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"slices"
	"sync"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/amtzespinosa/gresbase/internal/pg/introspect"
	"github.com/amtzespinosa/gresbase/internal/pg/pgvalue"
)

var (
	// ErrInvalid is returned (wrapped) when the changeset is not valid.
	ErrInvalid = errors.New("invalid changeset")
	// ErrNoPrimaryKey is returned when the table has no primary key.
	ErrNoPrimaryKey = errors.New("the table has no primary key, so its rows cannot be edited")
	// ErrNotWritable is returned for views, materialized views and foreign tables.
	ErrNotWritable = errors.New("only tables can be edited")
	// ErrNotFound is returned when the session has no changeset with that id.
	ErrNotFound = errors.New("changeset not found")
	// ErrNotUndoable is returned by Undo and Redo when the changeset cannot be undone reliably, or
	// is not in a state to be undone (already undone) or redone (not undone).
	ErrNotUndoable = errors.New("changeset cannot be undone")
)

func invalid(format string, a ...any) error {
	return fmt.Errorf("%w: %s", ErrInvalid, fmt.Sprintf(format, a...))
}

// ConflictError is returned when a row is gone, already exists or changed since the client read it.
// Nothing of the changeset was applied.
type ConflictError struct{ Conflict Conflict }

func (e *ConflictError) Error() string {
	return fmt.Sprintf("conflict in operation %d (%s)", e.Conflict.Op, e.Conflict.Kind)
}

// TextOp is an operation with its values as Postgres text (nil is NULL): the form the client's Op
// is validated into and the form inverses are kept in.
type TextOp struct {
	Kind     string
	Values   map[string]*string // insert
	PK       map[string]string  // update, delete
	Set      map[string]*string // update
	Expected map[string]*string // update, delete
}

// Change is what a ChangeRecorder receives after a changeset (or its undo/redo) commits.
type Change struct {
	ID, Session, Schema, Table string
	Ops                        []TextOp
}

// ChangeRecorder is told about every committed change. It is the hook of the future Evidence Mode;
// in v0.1 it does nothing.
type ChangeRecorder interface {
	Record(ctx context.Context, c Change)
}

// NopRecorder ignores every change.
type NopRecorder struct{}

// Record does nothing.
func (NopRecorder) Record(context.Context, Change) {}

// DefaultImportTimeout is the default of GRESBASE_IMPORT_TIMEOUT.
const DefaultImportTimeout = 10 * time.Minute

// maxLog is how many changesets each session keeps for undo/redo.
const maxLog = 50

// Writer applies changesets and keeps, per session, the last ones with what undoes or redoes them.
type Writer struct {
	pool  *pgxpool.Pool
	types *pgvalue.Types
	cat   *introspect.Catalog
	rec   ChangeRecorder

	// ImportTimeout bounds a CSV import (each statement and the whole run) instead of the pool's
	// statement_timeout. New sets DefaultImportTimeout.
	ImportTimeout time.Duration

	mu  sync.Mutex
	log map[string][]*entry // session → changesets, oldest first

	// ponytail: one lock serializes every undo/redo (they are rare, human-triggered actions).
	undoMu sync.Mutex
}

type entry struct {
	id, schema, table string
	reasons           []string
	undone            bool
	next              []TextOp // what the next undo (or redo, when undone) applies
}

// New returns a Writer. rec may be nil.
func New(pool *pgxpool.Pool, types *pgvalue.Types, cat *introspect.Catalog, rec ChangeRecorder) *Writer {
	if rec == nil {
		rec = NopRecorder{}
	}
	return &Writer{pool: pool, types: types, cat: cat, rec: rec, ImportTimeout: DefaultImportTimeout, log: map[string][]*entry{}}
}

// Apply runs cs on t in one transaction and remembers it for undo in session.
func (w *Writer) Apply(ctx context.Context, session string, t *introspect.Table, cs Changeset) (*ChangesetResult, error) {
	ops, err := parse(t, cs)
	if err != nil {
		return nil, err
	}
	inverse, err := w.run(ctx, t, ops)
	if err != nil {
		return nil, err
	}
	e := &entry{id: newID(), schema: t.Schema, table: t.Name, reasons: reasons(t, ops), next: inverse}
	w.mu.Lock()
	l := append(w.log[session], e)
	if len(l) > maxLog {
		l = l[len(l)-maxLog:]
	}
	w.log[session] = l
	w.mu.Unlock()
	w.rec.Record(ctx, Change{ID: e.id, Session: session, Schema: t.Schema, Table: t.Name, Ops: ops})
	return e.result(len(ops)), nil
}

// Preview returns the statements cs would run on t, without running them.
func (w *Writer) Preview(t *introspect.Table, cs Changeset) (*ChangesetPreview, error) {
	ops, err := parse(t, cs)
	if err != nil {
		return nil, err
	}
	p := &ChangesetPreview{SQL: make([]string, len(ops)), Reasons: reasons(t, ops)}
	p.Undoable = len(p.Reasons) == 0
	for i, op := range ops {
		p.SQL[i] = dml(&builder{literal: true}, t, op, false)
	}
	return p, nil
}

// Undo applies the inverse of changeset id of session.
func (w *Writer) Undo(ctx context.Context, session, id string) (*ChangesetResult, error) {
	return w.toggle(ctx, session, id, false)
}

// Redo applies again changeset id of session after an Undo.
func (w *Writer) Redo(ctx context.Context, session, id string) (*ChangesetResult, error) {
	return w.toggle(ctx, session, id, true)
}

func (w *Writer) toggle(ctx context.Context, session, id string, undone bool) (*ChangesetResult, error) {
	w.undoMu.Lock()
	defer w.undoMu.Unlock()
	w.mu.Lock()
	i := slices.IndexFunc(w.log[session], func(e *entry) bool { return e.id == id })
	var e *entry
	if i >= 0 {
		e = w.log[session][i]
	}
	w.mu.Unlock()
	switch {
	case e == nil:
		return nil, ErrNotFound
	case len(e.reasons) > 0 || e.undone != undone:
		return nil, ErrNotUndoable
	}
	t, err := w.cat.Lookup(ctx, e.schema, e.table)
	if err != nil {
		return nil, err
	}
	if err := writable(t); err != nil {
		return nil, err
	}
	ops := e.next
	inverse, err := w.run(ctx, t, ops)
	if err != nil {
		return nil, err
	}
	e.next, e.undone = inverse, !undone
	w.rec.Record(ctx, Change{ID: e.id, Session: session, Schema: t.Schema, Table: t.Name, Ops: ops})
	return e.result(len(ops)), nil
}

func (e *entry) result(applied int) *ChangesetResult {
	return &ChangesetResult{ID: e.id, Applied: applied, Undoable: len(e.reasons) == 0,
		Reasons: append([]string{}, e.reasons...), Undone: e.undone}
}

// run applies ops in one transaction and returns the operations that undo them, in undo order.
func (w *Writer) run(ctx context.Context, t *introspect.Table, ops []TextOp) ([]TextOp, error) {
	tx, err := w.pool.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	inverse := make([]TextOp, 0, len(ops))
	for i, op := range ops {
		inv, err := w.exec(ctx, tx, t, i, op)
		if err != nil {
			return nil, err
		}
		inverse = append(inverse, inv)
	}
	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}
	slices.Reverse(inverse)
	return inverse, nil
}

// exec applies one operation and returns its inverse.
func (w *Writer) exec(ctx context.Context, tx pgx.Tx, t *introspect.Table, i int, op TextOp) (TextOp, error) {
	var prev [][]byte
	switch pk := op.PK; op.Kind {
	case "insert":
		if pk = pkOf(t, op.Values); pk != nil { // the row would be a duplicate: report it as a conflict
			row, oids, _, err := lockRow(ctx, tx, t, pk, nil)
			if err != nil {
				return TextOp{}, err
			}
			if row != nil {
				return TextOp{}, w.conflict(ctx, tx, t, i, op, pk, row, oids, nil, true)
			}
		}
	default:
		row, oids, diff, err := lockRow(ctx, tx, t, pk, op.Expected)
		if err != nil {
			return TextOp{}, err
		}
		if row == nil || len(diff) > 0 {
			return TextOp{}, w.conflict(ctx, tx, t, i, op, pk, row, oids, diff, false)
		}
		prev = row
	}

	b := &builder{}
	rows, err := tx.Query(ctx, dml(b, t, op, true), append([]any{pgvalue.TextResults}, b.args...)...)
	if err != nil {
		return TextOp{}, err
	}
	raws, _, err := pgvalue.Collect(rows)
	if err != nil {
		return TextOp{}, err
	}

	switch op.Kind {
	case "insert":
		after := rowMap(t, raws[0])
		return TextOp{Kind: "delete", PK: pkOf(t, after), Expected: after}, nil
	case "update":
		if len(raws) == 0 { // locked a moment ago: only a trigger can make it vanish
			return TextOp{}, fmt.Errorf("update of operation %d changed no row", i)
		}
		before, after := rowMap(t, prev), rowMap(t, raws[0])
		set := map[string]*string{}
		for name := range op.Set {
			set[name] = before[name]
		}
		return TextOp{Kind: "update", PK: pkOf(t, after), Set: set, Expected: after}, nil
	default:
		values := rowMap(t, prev)
		for _, c := range t.Columns {
			if c.Generated != nil {
				delete(values, c.Name)
			}
		}
		return TextOp{Kind: "insert", Values: values}, nil
	}
}

// lockRow locks the row of t with primary key pk and returns it (nil when missing) with the column
// type OIDs and the expected columns whose value differs. Values are compared as the text of the
// column type, so every type compares (json has no equality operator) and the client's text is
// normalized by the type first ('1.5' and '1.50' are the same numeric(12,2)).
func lockRow(ctx context.Context, tx pgx.Tx, t *introspect.Table, pk map[string]string, expected map[string]*string) ([][]byte, []uint32, []string, error) {
	b := &builder{}
	names := sortedKeys(expected)
	sel := selectList(t)
	for _, name := range names {
		c, _ := t.Column(name)
		sel += ", " + ident(name) + "::text IS NOT DISTINCT FROM (" + b.arg(expected[name], c.Type) + ")::text"
	}
	sql := "SELECT " + sel + " FROM " + table(t) + " WHERE " + pkWhere(b, t, pk) + " FOR UPDATE"
	rows, err := tx.Query(ctx, sql, append([]any{pgvalue.TextResults}, b.args...)...)
	if err != nil {
		return nil, nil, nil, err
	}
	raws, oids, err := pgvalue.Collect(rows)
	if err != nil || len(raws) == 0 {
		return nil, oids, nil, err
	}
	n := len(t.Columns)
	var diff []string
	for j, name := range names {
		if string(raws[0][n+j]) != "t" {
			diff = append(diff, name)
		}
	}
	return raws[0][:n], oids[:n], diff, nil
}

// conflict builds the 409 payload with every value in the wire encoding.
func (w *Writer) conflict(ctx context.Context, tx pgx.Tx, t *introspect.Table, i int, op TextOp, pk map[string]string, row [][]byte, oids []uint32, diff []string, exists bool) error {
	if err := w.types.Resolve(ctx, tx, oids); err != nil {
		return err
	}
	enc := func(name string, v *string) any {
		if v == nil {
			return nil
		}
		j := slices.IndexFunc(t.Columns, func(c introspect.Column) bool { return c.Name == name })
		return w.types.Encode(oids[j], []byte(*v), pgvalue.MaxText)
	}
	c := Conflict{Op: i, Kind: op.Kind, PK: map[string]any{}, Missing: row == nil && !exists, Exists: exists,
		Columns: append([]string{}, diff...), Expected: map[string]any{}}
	for name, v := range pk {
		c.PK[name] = enc(name, &v)
	}
	for name, v := range op.Expected {
		c.Expected[name] = enc(name, v)
	}
	if row != nil {
		c.Current = map[string]any{}
		for name, v := range rowMap(t, row) {
			c.Current[name] = enc(name, v)
		}
	}
	return &ConflictError{c}
}

// reasons lists why undoing ops on t would not be reliable (empty: it is).
func reasons(t *introspect.Table, ops []TextOp) []string {
	var out []string
	add := func(r string) {
		if !slices.Contains(out, r) {
			out = append(out, r)
		}
	}
	if t.HasUserTriggers {
		add(ReasonUserTriggers)
	}
	spreads := func(action string) bool {
		return action == "cascade" || action == "set_null" || action == "set_default"
	}
	for _, op := range ops {
		for _, fk := range t.ReferencedBy {
			switch {
			case op.Kind == "delete" && spreads(fk.OnDelete):
				add(ReasonDeleteCascade)
			case op.Kind == "update" && spreads(fk.OnUpdate) &&
				slices.ContainsFunc(fk.RefColumns, func(c string) bool { _, ok := op.Set[c]; return ok }):
				add(ReasonUpdateCascade)
			}
		}
	}
	if out == nil {
		out = []string{}
	}
	return out
}

func writable(t *introspect.Table) error {
	switch {
	case t.Kind != introspect.KindTable && t.Kind != introspect.KindPartitionedTable:
		return ErrNotWritable
	case !t.HasPrimaryKey:
		return ErrNoPrimaryKey
	}
	return nil
}

// rowMap turns a row read with selectList into column → text.
func rowMap(t *introspect.Table, row [][]byte) map[string]*string {
	m := make(map[string]*string, len(t.Columns))
	for i, c := range t.Columns {
		if row[i] != nil {
			s := string(row[i])
			m[c.Name] = &s
		} else {
			m[c.Name] = nil
		}
	}
	return m
}

// pkOf returns the primary key values in m, or nil when one is missing or NULL.
func pkOf(t *introspect.Table, m map[string]*string) map[string]string {
	pk := map[string]string{}
	for _, name := range t.PrimaryKey {
		v := m[name]
		if v == nil {
			return nil
		}
		pk[name] = *v
	}
	return pk
}

func newID() string {
	b := make([]byte, 12)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}
