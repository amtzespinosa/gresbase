package introspect

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5"
)

// Completions returns the names the SQL editor autocompletes. Functions that only take or return
// pseudo-types (type I/O, handlers, triggers) are left out: nobody calls them from a query.
func (c *Catalog) Completions(ctx context.Context) (*Completions, error) {
	return load(ctx, c, "completions", func(ctx context.Context) (*Completions, error) {
		rows, _ := c.pool.Query(ctx, `SELECT n.nspname, c.relname, c.relispartition,
				coalesce(array_agg(a.attname ORDER BY a.attnum) FILTER (WHERE a.attnum > 0), '{}')
			FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
			LEFT JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
			WHERE c.relkind IN ('r', 'v', 'm', 'f', 'p')
				AND n.nspname !~ '^pg_' AND n.nspname <> 'information_schema'
			GROUP BY 1, 2, 3 ORDER BY 1, 2`)
		tables, err := pgx.CollectRows(rows, func(r pgx.CollectableRow) (CompletionTable, error) {
			var t CompletionTable
			return t, r.Scan(&t.Schema, &t.Name, &t.Partition, &t.Columns)
		})
		if err != nil {
			return nil, fmt.Errorf("completion tables: %w", err)
		}
		rows, _ = c.pool.Query(ctx, `SELECT DISTINCT p.proname
			FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
			WHERE (n.nspname = 'pg_catalog' OR (n.nspname !~ '^pg_' AND n.nspname <> 'information_schema'))
				AND p.proname !~ '^_'
				AND p.prorettype NOT IN ('internal'::regtype, 'cstring'::regtype, 'trigger'::regtype,
					'event_trigger'::regtype, 'language_handler'::regtype, 'fdw_handler'::regtype,
					'index_am_handler'::regtype, 'table_am_handler'::regtype, 'tsm_handler'::regtype)
				AND NOT p.proargtypes::oid[] && ARRAY['internal'::regtype, 'cstring'::regtype]::oid[]
			ORDER BY 1`)
		funcs, err := pgx.CollectRows(rows, pgx.RowTo[string])
		if err != nil {
			return nil, fmt.Errorf("completion functions: %w", err)
		}
		var path []string
		if err := c.pool.QueryRow(ctx, `SELECT current_schemas(false)`).Scan(&path); err != nil {
			return nil, fmt.Errorf("completion search_path: %w", err)
		}
		if tables == nil {
			tables = []CompletionTable{}
		}
		return &Completions{Tables: tables, Functions: funcs, SearchPath: path}, nil
	})
}
