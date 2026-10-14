// Package search finds a term in every table the role can read: one read-only query per table, with
// its own short timeout, a few tables at a time, results streamed as each table finishes.
package search

import (
	"context"
	"errors"
	"fmt"
	"math/big"
	"regexp"
	"strings"
	"sync"
	"time"
	"unicode/utf8"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Limits of a search.
const (
	PerTable       = 20
	Total          = 500
	LargeRows      = 1_000_000
	DefaultTimeout = 5 * time.Second
	MaxTimeout     = 60 * time.Second
	Parallel       = 2
	snippetBefore  = 60
	snippetLength  = 200
)

// ErrInvalid is a bad request: term too short, timeout out of range.
var ErrInvalid = errors.New("invalid search")

var (
	numberRe = regexp.MustCompile(`^[+-]?(\d+(\.\d*)?|\.\d+)$`)
	uuidRe   = regexp.MustCompile(`^(?i)[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}$`)
	dateRe   = regexp.MustCompile(`^\d{4}-\d{2}-\d{2}$`)
)

// column is a column the role can read, with how it is matched.
type column struct {
	name string
	// kind: text, int2, int4, int8, numeric, float4, float8, uuid, date or timestamp. The exact
	// kinds are also the base type the term is cast to: no typmod, so numeric(10,2) never overflows.
	kind string
}

type table struct {
	schema, name string
	pk           []string // empty when there is none or a key column can't be read
	cols         []column
	rows         float64 // reltuples; -1 when never analyzed
}

// Run searches and calls emit for each event. emit is never called concurrently.
func Run(ctx context.Context, pool *pgxpool.Pool, req SearchRequest, emit func(SearchEvent) error) error {
	term := strings.TrimSpace(req.Q)
	if utf8.RuneCountInString(term) < 2 {
		return fmt.Errorf("%w: the term needs at least two characters", ErrInvalid)
	}
	timeout := DefaultTimeout
	if req.TimeoutMS != 0 {
		timeout = time.Duration(req.TimeoutMS) * time.Millisecond
		if timeout < 100*time.Millisecond || timeout > MaxTimeout {
			return fmt.Errorf("%w: timeout_ms must be between 100 and %d", ErrInvalid, MaxTimeout.Milliseconds())
		}
	}
	tables, err := readTables(ctx, pool, req.Schemas)
	if err != nil {
		return err
	}
	if len(req.Tables) > 0 {
		tables = only(tables, req.Tables)
	}
	var todo []table
	large := 0
	for _, t := range tables {
		if !req.IncludeLarge && len(req.Tables) == 0 && t.rows > LargeRows {
			large++
			continue
		}
		todo = append(todo, t)
	}
	if err := emit(SearchEvent{Type: "start", Tables: len(todo), SkippedLarge: large}); err != nil {
		return err
	}

	parent := ctx
	ctx, cancel := context.WithCancel(ctx)
	defer cancel()
	var (
		mu        sync.Mutex
		found     int
		truncated bool
		emitErr   error
	)
	send := func(e SearchEvent) {
		mu.Lock()
		defer mu.Unlock()
		if emitErr != nil || truncated {
			return
		}
		if e.Type == "table" {
			if left := Total - found; len(e.Rows) >= left {
				e.Rows, truncated = e.Rows[:left], true
				cancel() // enough: the remaining tables are not searched
			}
			found += len(e.Rows)
		}
		if err := emit(e); err != nil {
			emitErr = err
			cancel()
		}
	}
	jobs := make(chan table)
	var wg sync.WaitGroup
	for range Parallel {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for t := range jobs {
				send(searchTable(ctx, pool, t, term, timeout))
			}
		}()
	}
	for _, t := range todo {
		select {
		case jobs <- t:
		case <-ctx.Done():
		}
	}
	close(jobs)
	wg.Wait()
	if emitErr != nil {
		return emitErr
	}
	if err := parent.Err(); err != nil {
		return err // the client went away
	}
	return emit(SearchEvent{Type: "done", Found: found, Truncated: truncated})
}

// readTables lists the tables and partitioned tables (not their partitions) the role can read, with
// the columns it can read and can be matched, smallest first.
func readTables(ctx context.Context, pool *pgxpool.Pool, schemas []string) ([]table, error) {
	if schemas == nil {
		schemas = []string{}
	}
	rows, err := pool.Query(ctx, `
SELECT n.nspname, c.relname, c.reltuples,
       coalesce((SELECT array_agg(a.attname ORDER BY k.ord)
                 FROM pg_index i
                 CROSS JOIN LATERAL unnest(i.indkey) WITH ORDINALITY k(attnum, ord)
                 JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum = k.attnum
                 WHERE i.indrelid = c.oid AND i.indisprimary
                 HAVING bool_and(has_column_privilege(c.oid, a.attnum, 'SELECT'))), '{}'),
       coalesce(array_agg(a.attname ORDER BY a.attnum) FILTER (WHERE a.attnum IS NOT NULL), '{}'),
       coalesce(array_agg(
         CASE WHEN t.typtype = 'e' OR t.typcategory = 'S' THEN 'text'
              WHEN t.oid = 'int2'::regtype THEN 'int2'
              WHEN t.oid = 'int4'::regtype THEN 'int4'
              WHEN t.oid = 'int8'::regtype THEN 'int8'
              WHEN t.oid = 'numeric'::regtype THEN 'numeric'
              WHEN t.oid = 'float4'::regtype THEN 'float4'
              WHEN t.oid = 'float8'::regtype THEN 'float8'
              WHEN t.oid = 'uuid'::regtype THEN 'uuid'
              WHEN t.oid = 'date'::regtype THEN 'date'
              WHEN t.oid IN ('timestamp'::regtype, 'timestamptz'::regtype) THEN 'timestamp'
         END ORDER BY a.attnum) FILTER (WHERE a.attnum IS NOT NULL), '{}')
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
LEFT JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
  AND has_column_privilege(c.oid, a.attnum, 'SELECT')
LEFT JOIN pg_type t ON t.oid = a.atttypid
WHERE c.relkind IN ('r', 'p') AND NOT c.relispartition
  AND n.nspname NOT IN ('pg_catalog', 'information_schema') AND n.nspname NOT LIKE 'pg\_%'
  AND has_schema_privilege(n.oid, 'USAGE') AND (cardinality($1::text[]) = 0 OR n.nspname = ANY($1))
  AND (t.oid IS NULL OR t.typtype = 'e' OR t.typcategory = 'S'
       OR t.oid IN ('int2'::regtype, 'int4'::regtype, 'int8'::regtype, 'numeric'::regtype,
                    'float4'::regtype, 'float8'::regtype, 'uuid'::regtype, 'date'::regtype,
                    'timestamp'::regtype, 'timestamptz'::regtype))
GROUP BY c.oid, n.nspname, c.relname, c.reltuples
HAVING count(a.attnum) > 0
ORDER BY c.reltuples, n.nspname, c.relname`, schemas)
	if err != nil {
		return nil, fmt.Errorf("list tables: %w", err)
	}
	defer rows.Close()
	var out []table
	for rows.Next() {
		var (
			t           table
			names, kind []string
		)
		if err := rows.Scan(&t.schema, &t.name, &t.rows, &t.pk, &names, &kind); err != nil {
			return nil, fmt.Errorf("list tables: %w", err)
		}
		for i := range names {
			t.cols = append(t.cols, column{name: names[i], kind: kind[i]})
		}
		out = append(out, t)
	}
	return out, rows.Err()
}

func only(all []table, refs []SearchTableRef) []table {
	var out []table
	for _, t := range all {
		for _, r := range refs {
			if t.schema == r.Schema && t.name == r.Table {
				out = append(out, t)
			}
		}
	}
	return out
}

// matchable tells how a column can match the term: as text (ILIKE) or exactly, and with which value.
func matchable(c column, term string) (exact bool, ok bool) {
	switch c.kind {
	case "text":
		return false, true
	case "int2", "int4", "int8":
		n, isInt := new(big.Int).SetString(term, 10)
		bits := map[string]int{"int2": 16, "int4": 32, "int8": 64}[c.kind]
		limit := new(big.Int).Lsh(big.NewInt(1), uint(bits-1))
		return true, isInt && n.Cmp(new(big.Int).Neg(limit)) >= 0 && n.Cmp(limit) < 0
	case "numeric", "float4", "float8":
		return true, numberRe.MatchString(term)
	case "uuid":
		return true, uuidRe.MatchString(term)
	case "date", "timestamp":
		if !dateRe.MatchString(term) {
			return true, false
		}
		_, err := time.Parse("2006-01-02", term)
		return true, err == nil
	}
	return false, false
}

// escapeLike escapes the LIKE wildcards, so the term matches literally.
func escapeLike(s string) string {
	return strings.NewReplacer(`\`, `\\`, `%`, `\%`, `_`, `\_`).Replace(s)
}

// searchTable runs one table's query in its own read-only transaction with its own timeout.
func searchTable(ctx context.Context, pool *pgxpool.Pool, t table, term string, timeout time.Duration) SearchEvent {
	skipped := func(reason, msg string) SearchEvent {
		return SearchEvent{Type: "skipped", Schema: t.schema, Table: t.name, Reason: reason, Message: msg}
	}
	rel := pgx.Identifier{t.schema, t.name}.Sanitize()
	var conds, selects []string
	var cols []column
	// Each parameter only when a condition uses it: an unused one has no type for Postgres.
	var args []any
	likeArg, termArg := "", ""
	param := func(ref *string, v any) string {
		if *ref == "" {
			args = append(args, v)
			*ref = fmt.Sprintf("$%d", len(args))
		}
		return *ref
	}
	for _, c := range t.cols {
		exact, ok := matchable(c, term)
		if !ok {
			continue
		}
		id := pgx.Identifier{c.name}.Sanitize()
		switch {
		case !exact:
			conds = append(conds, id+"::text ILIKE "+param(&likeArg, "%"+escapeLike(term)+"%"))
		case c.kind == "timestamp":
			// The whole day, in a form that can use an index on the column.
			p := param(&termArg, term)
			conds = append(conds, fmt.Sprintf("(%s >= %s::text::date AND %s < %s::text::date + 1)", id, p, id, p))
		default:
			conds = append(conds, fmt.Sprintf("%s = %s::text::%s", id, param(&termArg, term), c.kind))
		}
		selects = append(selects, id+"::text")
		cols = append(cols, c)
	}
	if len(conds) == 0 {
		return SearchEvent{Type: "table", Schema: t.schema, Table: t.name, PrimaryKey: t.pk}
	}
	for _, k := range t.pk {
		selects = append(selects, pgx.Identifier{k}.Sanitize()+"::text")
	}
	query := fmt.Sprintf("SELECT %s FROM %s WHERE %s LIMIT %d",
		strings.Join(selects, ", "), rel, strings.Join(conds, " OR "), PerTable)

	tx, err := pool.BeginTx(ctx, pgx.TxOptions{AccessMode: pgx.ReadOnly})
	if err != nil {
		return skipped("error", err.Error())
	}
	defer func() { _ = tx.Rollback(context.WithoutCancel(ctx)) }()
	if _, err := tx.Exec(ctx, "SELECT set_config('statement_timeout', $1, true)",
		fmt.Sprintf("%dms", timeout.Milliseconds())); err != nil {
		return skipped("error", err.Error())
	}
	rows, err := tx.Query(ctx, query, args...)
	if err != nil {
		return failure(t, err)
	}
	defer rows.Close()
	ev := SearchEvent{Type: "table", Schema: t.schema, Table: t.name, PrimaryKey: t.pk}
	like := regexp.MustCompile("(?i)" + regexp.QuoteMeta(term))
	for rows.Next() {
		vals := make([]*string, len(selects))
		dest := make([]any, len(vals))
		for i := range vals {
			dest[i] = &vals[i]
		}
		if err := rows.Scan(dest...); err != nil {
			return failure(t, err)
		}
		m := SearchMatch{}
		for i, c := range cols {
			v := vals[i]
			if v == nil {
				continue
			}
			if snippet, ok := match(c, *v, term, like); ok {
				m.Column, m.Snippet = c.name, snippet
				if c.kind != "text" {
					m.Value = *v
				}
				break
			}
		}
		if m.Column == "" {
			continue // matched on a column whose text differs from the comparison (rare: a timestamp day)
		}
		if len(t.pk) > 0 {
			m.Key = map[string]string{}
			for i, k := range t.pk {
				if v := vals[len(cols)+i]; v != nil {
					m.Key[k] = *v
				}
			}
		}
		ev.Rows = append(ev.Rows, m)
	}
	if err := rows.Err(); err != nil {
		return failure(t, err)
	}
	return ev
}

// match tells whether a column's text value is the one that matched, and its snippet.
func match(c column, v, term string, like *regexp.Regexp) (string, bool) {
	switch c.kind {
	case "text":
		loc := like.FindStringIndex(v)
		if loc == nil {
			return "", false
		}
		return snippet(v, loc[0]), true
	case "timestamp":
		return v, strings.HasPrefix(v, term)
	case "date":
		return v, v == term
	case "uuid":
		norm := func(s string) string { return strings.ToLower(strings.ReplaceAll(s, "-", "")) }
		return v, norm(v) == norm(term)
	case "int2", "int4", "int8", "numeric", "float4", "float8":
		a, okA := new(big.Rat).SetString(v)
		b, okB := new(big.Rat).SetString(term)
		return v, okA && okB && a.Cmp(b) == 0
	}
	return "", false
}

// snippet cuts about snippetLength characters around the byte offset i, on rune boundaries.
func snippet(v string, i int) string {
	r := []rune(v)
	at := utf8.RuneCountInString(v[:i])
	from := max(0, at-snippetBefore)
	to := min(len(r), from+snippetLength)
	s := strings.Join(strings.Fields(string(r[from:to])), " ")
	if from > 0 {
		s = "…" + s
	}
	if to < len(r) {
		s += "…"
	}
	return s
}

// failure turns a table's error into a "skipped" event with its reason.
func failure(t table, err error) SearchEvent {
	reason := "error"
	var pe *pgconn.PgError
	if errors.As(err, &pe) {
		switch pe.Code {
		case "57014": // query_canceled: statement_timeout
			reason = "timeout"
		case "42501": // insufficient_privilege, e.g. a policy or a revoke since the catalog was read
			reason = "permission"
		}
	}
	return SearchEvent{Type: "skipped", Schema: t.schema, Table: t.name, Reason: reason, Message: err.Error()}
}
