package write

import (
	"bufio"
	"context"
	"encoding/csv"
	"errors"
	"fmt"
	"io"
	"slices"
	"strconv"
	"strings"
	"unicode/utf8"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"

	"github.com/amtzespinosa/gresbase/internal/pg/introspect"
)

// MaxImportErrors is how many rejected records an import reports before it stops looking.
const MaxImportErrors = 100

// importTable is the temporary table the CSV is copied into (dropped on commit or rollback).
const importTable = "gresbase_import"

// Import inserts the records of the CSV src into t, all or nothing, in one transaction. The CSV is
// parsed here (delimiter, quotes, BOM, header) and copied as text into a temporary table, then
// INSERT … SELECT casts every value to the catalog type of its column. When that fails, the
// records are bisected with savepoints to find the bad ones (up to MaxImportErrors), the
// transaction is rolled back and the result lists them. An import cannot be undone.
//
// The import runs under w.ImportTimeout, not the pool's statement_timeout, and stops (rolling
// back) as soon as ctx is canceled: an HTTP client that disconnects cancels the request context.
func (w *Writer) Import(ctx context.Context, session string, t *introspect.Table, opts ImportOptions, src io.Reader) (*ImportResult, error) {
	if t.Kind != introspect.KindTable && t.Kind != introspect.KindPartitionedTable {
		return nil, ErrNotWritable
	}
	cols, delim, err := importColumns(t, opts)
	if err != nil {
		return nil, err
	}

	ctx, cancel := context.WithTimeout(ctx, w.ImportTimeout)
	defer cancel()
	tx, err := w.pool.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	if _, err := tx.Exec(ctx, "SET LOCAL statement_timeout = "+strconv.FormatInt(w.ImportTimeout.Milliseconds(), 10)); err != nil {
		return nil, err
	}

	names := []string{"i", "line"}
	defs := []string{"i int8", "line int8"}
	for i := range cols {
		names = append(names, "c"+strconv.Itoa(i))
		defs = append(defs, "c"+strconv.Itoa(i)+" text")
	}
	if _, err := tx.Exec(ctx, "CREATE TEMP TABLE "+importTable+" ("+strings.Join(defs, ", ")+") ON COMMIT DROP"); err != nil {
		return nil, err
	}

	rd := bufio.NewReader(src)
	if bom, _ := rd.Peek(3); string(bom) == "\xef\xbb\xbf" {
		_, _ = rd.Discard(3)
	}
	r := csv.NewReader(rd)
	r.Comma = delim
	r.FieldsPerRecord = -1
	if opts.Header {
		if _, err := r.Read(); err != nil && !errors.Is(err, io.EOF) {
			return nil, csvError(err)
		}
	}
	s := &copySource{r: r, mapping: opts.Mapping}
	if _, err := tx.CopyFrom(ctx, pgx.Identifier{importTable}, names, s); err != nil {
		if s.err != nil {
			return nil, s.err
		}
		return nil, err
	}

	exprs := make([]string, len(cols))
	targets := make([]string, len(cols))
	for i, c := range cols {
		v := "c" + strconv.Itoa(i)
		if opts.EmptyAsNull {
			v = "NULLIF(" + v + ", '')"
		}
		exprs[i] = v + "::" + c.Type
		targets[i] = ident(c.Name)
	}
	imp := &importer{
		tx:     tx,
		cols:   cols,
		exprs:  exprs,
		errs:   s.short,
		insert: "INSERT INTO " + table(t) + " (" + strings.Join(targets, ", ") + ") SELECT " + strings.Join(exprs, ", ") + " FROM " + importTable + " WHERE i BETWEEN $1 AND $2 ORDER BY i",
	}
	if s.n > 0 {
		if err := imp.locate(ctx, 1, s.n); err != nil {
			return nil, err
		}
	}
	if len(imp.errs) > 0 {
		slices.SortFunc(imp.errs, func(a, b ImportError) int { return int(a.Row - b.Row) })
		return &ImportResult{Errors: imp.errs}, nil
	}
	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}
	w.rec.Record(ctx, Change{ID: newID(), Session: session, Schema: t.Schema, Table: t.Name, Ops: []TextOp{{Kind: "import"}}})
	return &ImportResult{Inserted: s.n, Errors: []ImportError{}}, nil
}

// importColumns validates the options against the catalog and returns the target columns, in
// mapping order, and the delimiter.
func importColumns(t *introspect.Table, opts ImportOptions) ([]*introspect.Column, rune, error) {
	delim, size := utf8.DecodeRuneInString(opts.Delimiter)
	if size == 0 || size != len(opts.Delimiter) || delim == '"' || delim == '\r' || delim == '\n' || delim == utf8.RuneError {
		return nil, 0, invalid("the delimiter must be one character other than a quote or a line break")
	}
	if len(opts.Mapping) == 0 {
		return nil, 0, invalid("map at least one column")
	}
	cols := make([]*introspect.Column, len(opts.Mapping))
	for i, m := range opts.Mapping {
		c, ok := t.Column(m.Column)
		switch {
		case !ok:
			return nil, 0, invalid("column %q does not exist", m.Column)
		case c.Generated != nil || c.Identity == "always":
			return nil, 0, invalid("column %q is set by the database", m.Column)
		case m.Source < 0:
			return nil, 0, invalid("invalid source column for %q", m.Column)
		case slices.Contains(cols[:i], c):
			return nil, 0, invalid("column %q is mapped twice", m.Column)
		}
		cols[i] = c
	}
	return cols, delim, nil
}

// copySource feeds the CSV records to COPY: their ordinal, their line and the mapped fields.
// Records too short for the mapping are left out and reported.
type copySource struct {
	r       *csv.Reader
	mapping []ImportMapping
	n       int64 // records copied
	row     []any
	short   []ImportError
	err     error
}

func (s *copySource) Next() bool {
	for {
		rec, err := s.r.Read()
		if errors.Is(err, io.EOF) {
			return false
		}
		if err != nil {
			s.err = csvError(err)
			return false
		}
		line, _ := s.r.FieldPos(0)
		if need := maxSource(s.mapping) + 1; len(rec) < need {
			if len(s.short) < MaxImportErrors {
				s.short = append(s.short, ImportError{Row: int64(line),
					Message: fmt.Sprintf("the record has %d fields, the mapping needs %d", len(rec), need)})
			}
			continue
		}
		s.n++
		s.row = append(s.row[:0], s.n, int64(line))
		for _, m := range s.mapping {
			s.row = append(s.row, rec[m.Source])
		}
		return true
	}
}

func (s *copySource) Values() ([]any, error) { return s.row, nil }

func (s *copySource) Err() error { return s.err }

func maxSource(m []ImportMapping) int {
	n := 0
	for _, x := range m {
		n = max(n, x.Source)
	}
	return n
}

func csvError(err error) error {
	var pe *csv.ParseError
	if errors.As(err, &pe) {
		return invalid("the file is not valid CSV (line %d): %v", pe.StartLine, pe.Err)
	}
	return err
}

// importer inserts ranges of the copied records inside savepoints.
type importer struct {
	tx     pgx.Tx
	cols   []*introspect.Column
	exprs  []string
	insert string
	errs   []ImportError
}

// locate inserts records lo..hi; if that fails it rolls the range back and bisects it until the
// failing records are found. Ranges that succeed stay inserted, so duplicates within the file are
// found too. Errors that are not about the data (cancelation, timeout, lost connection) abort.
func (imp *importer) locate(ctx context.Context, lo, hi int64) error {
	if len(imp.errs) >= MaxImportErrors {
		return nil
	}
	err := imp.try(ctx, imp.insert, lo, hi)
	if err == nil {
		return nil
	}
	pgErr, ok := dataError(err)
	if !ok {
		return err
	}
	if lo == hi {
		return imp.reject(ctx, lo, pgErr)
	}
	mid := lo + (hi-lo)/2
	if err := imp.locate(ctx, lo, mid); err != nil {
		return err
	}
	return imp.locate(ctx, mid+1, hi)
}

// reject records the error of record i, pinned to the first column whose value does not cast.
func (imp *importer) reject(ctx context.Context, i int64, insertErr *pgconn.PgError) error {
	var line int64
	if err := imp.tx.QueryRow(ctx, "SELECT line FROM "+importTable+" WHERE i = $1", i).Scan(&line); err != nil {
		return err
	}
	e := ImportError{Row: line, Column: insertErr.ColumnName, Message: pgMessage(insertErr)}
	for k, expr := range imp.exprs {
		err := imp.try(ctx, "SELECT "+expr+" FROM "+importTable+" WHERE i BETWEEN $1 AND $2", i, i)
		if err == nil {
			continue
		}
		pgErr, ok := dataError(err)
		if !ok {
			return err
		}
		e.Column, e.Message = imp.cols[k].Name, pgMessage(pgErr)
		break
	}
	imp.errs = append(imp.errs, e)
	return nil
}

// try runs sql inside a savepoint, rolling back to it when it fails.
func (imp *importer) try(ctx context.Context, sql string, lo, hi int64) error {
	if _, err := imp.tx.Exec(ctx, "SAVEPOINT gresbase_import"); err != nil {
		return err
	}
	_, err := imp.tx.Exec(ctx, sql, lo, hi)
	if err != nil {
		if _, rbErr := imp.tx.Exec(ctx, "ROLLBACK TO SAVEPOINT gresbase_import"); rbErr != nil {
			return rbErr
		}
	}
	if _, relErr := imp.tx.Exec(ctx, "RELEASE SAVEPOINT gresbase_import"); relErr != nil && err == nil {
		return relErr
	}
	return err
}

// dataError tells errors caused by the records (bad values, constraint violations) from the rest.
func dataError(err error) (*pgconn.PgError, bool) {
	var pgErr *pgconn.PgError
	if !errors.As(err, &pgErr) {
		return nil, false
	}
	switch pgErr.Code[:2] {
	case "22", "23": // data exception, integrity constraint violation
		return pgErr, true
	}
	return nil, false
}

func pgMessage(e *pgconn.PgError) string {
	if e.Detail != "" {
		return e.Message + ". " + e.Detail
	}
	return e.Message
}
