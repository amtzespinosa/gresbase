package rows

import (
	"bytes"
	"context"
	"encoding/json"
	"io"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/amtzespinosa/gresbase/internal/pg/introspect"
	"github.com/amtzespinosa/gresbase/internal/pg/pgvalue"
)

// ExportCSV writes every row of t matching query (filters and sort; limit, cursor and offset are
// ignored) to w as CSV with a header, in the same shape as COPY … (FORMAT csv, HEADER): Postgres text
// output for each value, NULL as an empty field and the empty string as "". The query is an ordinary
// parameterized SELECT; rows are written one by one as they arrive, nothing is buffered. There is no
// statement_timeout: the export ends when it finishes or when ctx is canceled (client gone).
func ExportCSV(ctx context.Context, pool *pgxpool.Pool, t *introspect.Table, query Query, w io.Writer) error {
	s, err := exportStatement(t, query)
	if err != nil {
		return err
	}
	return withExportTx(ctx, pool, func(tx pgx.Tx) error {
		rows, err := tx.Query(ctx, s.selectSQL(0), append([]any{pgvalue.TextResults}, s.args...)...)
		if err != nil {
			return err
		}
		defer rows.Close()
		var buf bytes.Buffer
		for i, c := range t.Columns {
			writeCSVField(&buf, i, len(t.Columns), []byte(c.Name))
		}
		buf.WriteByte('\n')
		header := true
		for rows.Next() {
			if !header {
				buf.Reset()
			}
			header = false
			for i, raw := range rows.RawValues() {
				writeCSVField(&buf, i, len(t.Columns), raw)
			}
			buf.WriteByte('\n')
			if _, err := w.Write(buf.Bytes()); err != nil {
				return err
			}
		}
		if err := rows.Err(); err != nil {
			return err
		}
		if header { // no rows: the header alone
			_, err = w.Write(buf.Bytes())
		}
		return err
	})
}

// writeCSVField appends the i-th of n fields quoted as COPY's CSV does: a nil value (NULL) is an
// empty field; a value that is empty or has a comma, quote, CR or LF (or is \. alone on its line) is
// quoted with its quotes doubled. Postgres text output needs no other escaping.
func writeCSVField(buf *bytes.Buffer, i, n int, v []byte) {
	if i > 0 {
		buf.WriteByte(',')
	}
	if v == nil {
		return
	}
	if len(v) > 0 && !bytes.ContainsAny(v, ",\"\r\n") && (n > 1 || string(v) != `\.`) {
		buf.Write(v)
		return
	}
	buf.WriteByte('"')
	buf.Write(bytes.ReplaceAll(v, []byte(`"`), []byte(`""`)))
	buf.WriteByte('"')
}

// ExportJSON writes every row of t matching query to w as a JSON array of objects (column → value)
// with the wire encoding, but complete: no truncation and bytea as hex text. Rows are written one by
// one as they arrive, nothing is buffered. Nothing is written if the query fails before the first row.
func ExportJSON(ctx context.Context, pool *pgxpool.Pool, types *pgvalue.Types, t *introspect.Table, query Query, w io.Writer) error {
	s, err := exportStatement(t, query)
	if err != nil {
		return err
	}
	keys := make([][]byte, len(t.Columns))
	for i, c := range t.Columns {
		keys[i], _ = json.Marshal(c.Name)
	}
	return withExportTx(ctx, pool, func(tx pgx.Tx) error {
		rows, err := tx.Query(ctx, s.selectSQL(0), append([]any{pgvalue.TextResults}, s.args...)...)
		if err != nil {
			return err
		}
		defer rows.Close()
		oids := make([]uint32, len(rows.FieldDescriptions()))
		for i, fd := range rows.FieldDescriptions() {
			oids[i] = fd.DataTypeOID
		}
		// The export connection is busy streaming: resolve the types on another one.
		if err := types.Resolve(ctx, pool, oids); err != nil {
			return err
		}
		var buf bytes.Buffer
		enc := json.NewEncoder(&buf)
		enc.SetEscapeHTML(false)
		n := 0
		for rows.Next() {
			buf.Reset()
			if n == 0 {
				buf.WriteString("[\n{")
			} else {
				buf.WriteString(",\n{")
			}
			for i, raw := range rows.RawValues() {
				if i > 0 {
					buf.WriteByte(',')
				}
				buf.Write(keys[i])
				buf.WriteByte(':')
				if err := enc.Encode(types.Encode(oids[i], raw, -1)); err != nil {
					return err
				}
				buf.Truncate(buf.Len() - 1) // Encode's newline
			}
			buf.WriteByte('}')
			if _, err := w.Write(buf.Bytes()); err != nil {
				return err
			}
			n++
		}
		if err := rows.Err(); err != nil {
			return err
		}
		end := "\n]\n"
		if n == 0 {
			end = "[]\n"
		}
		_, err = io.WriteString(w, end)
		return err
	})
}

func exportStatement(t *introspect.Table, query Query) (*statement, error) {
	query.Limit, query.Cursor, query.Offset = 0, "", 0
	return build(t, query, false)
}

// withExportTx runs fn in a transaction without statement_timeout (SET LOCAL ends with it). Read-only
// mode still applies: the pool sets default_transaction_read_only.
func withExportTx(ctx context.Context, pool *pgxpool.Pool, fn func(pgx.Tx) error) error {
	tx, err := pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback(context.WithoutCancel(ctx)) }()
	if _, err := tx.Exec(ctx, "SET LOCAL statement_timeout = 0"); err != nil {
		return err
	}
	return fn(tx)
}
