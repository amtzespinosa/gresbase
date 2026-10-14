package api

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"errors"
	"mime"
	"net/http"
	"strings"

	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/amtzespinosa/gresbase/internal/pg/introspect"
	"github.com/amtzespinosa/gresbase/internal/pg/pgvalue"
	"github.com/amtzespinosa/gresbase/internal/pg/rows"
)

// maxBody limits JSON request bodies.
const maxBody = 1 << 20

// Rows serves the row endpoints of /api/v1/tables/{schema}/{table}.
type Rows struct {
	Catalog *introspect.Catalog
	Pool    *pgxpool.Pool
	Types   *pgvalue.Types
}

// Query handles POST …/rows:query.
func (h Rows) Query(w http.ResponseWriter, r *http.Request) {
	t, q, ok := h.request(w, r)
	if !ok {
		return
	}
	page, err := rows.Read(r.Context(), h.Pool, h.Types, t, q)
	if err != nil {
		rowsError(w, err)
		return
	}
	WriteJSON(w, http.StatusOK, page)
}

// Count handles POST …/rows:count.
func (h Rows) Count(w http.ResponseWriter, r *http.Request) {
	t, q, ok := h.request(w, r)
	if !ok {
		return
	}
	n, err := rows.Count(r.Context(), h.Pool, t, q)
	if err != nil {
		rowsError(w, err)
		return
	}
	WriteJSON(w, http.StatusOK, rows.CountResult{Count: n})
}

// SQL handles POST …/rows:sql.
func (h Rows) SQL(w http.ResponseWriter, r *http.Request) {
	t, q, ok := h.request(w, r)
	if !ok {
		return
	}
	sql, err := rows.SQL(t, q)
	if err != nil {
		rowsError(w, err)
		return
	}
	WriteJSON(w, http.StatusOK, rows.SQLResult{SQL: sql})
}

// Value handles GET …/rows/value?pk=<json object>&column=<name>.
func (h Rows) Value(w http.ResponseWriter, r *http.Request) {
	t, ok := h.table(w, r)
	if !ok {
		return
	}
	var pk map[string]json.RawMessage
	if err := json.Unmarshal([]byte(r.URL.Query().Get("pk")), &pk); err != nil {
		Fail(w, http.StatusBadRequest, CodeBadRequest, "pk must be a JSON object")
		return
	}
	v, err := rows.Value(r.Context(), h.Pool, h.Types, t, pk, r.URL.Query().Get("column"))
	if err != nil {
		rowsError(w, err)
		return
	}
	WriteJSON(w, http.StatusOK, rows.ValueResult{Value: v})
}

// ReferencedBy handles GET …/rows/referenced-by?pk=<json object>.
func (h Rows) ReferencedBy(w http.ResponseWriter, r *http.Request) {
	t, ok := h.table(w, r)
	if !ok {
		return
	}
	var pk map[string]json.RawMessage
	if err := json.Unmarshal([]byte(r.URL.Query().Get("pk")), &pk); err != nil {
		Fail(w, http.StatusBadRequest, CodeBadRequest, "pk must be a JSON object")
		return
	}
	refs, err := rows.ReferencedBy(r.Context(), h.Pool, t, pk)
	if err != nil {
		rowsError(w, err)
		return
	}
	WriteJSON(w, http.StatusOK, refs)
}

// Export handles GET …/export?format=csv|json&q=<base64url of a rows:query body>: every matching
// row, streamed. It is a GET so a plain link downloads it with the session cookie. Errors before the
// first byte get the usual JSON error; after that the response is aborted so the download fails
// instead of ending in a file that looks complete.
func (h Rows) Export(w http.ResponseWriter, r *http.Request) {
	format := r.URL.Query().Get("format")
	if format != "csv" && format != "json" {
		Fail(w, http.StatusBadRequest, CodeBadRequest, "format must be csv or json")
		return
	}
	var q rows.Query
	if raw := r.URL.Query().Get("q"); raw != "" {
		data, err := base64.RawURLEncoding.DecodeString(strings.TrimRight(raw, "="))
		d := json.NewDecoder(bytes.NewReader(data))
		d.DisallowUnknownFields()
		if err == nil {
			err = d.Decode(&q)
		}
		if err != nil {
			Fail(w, http.StatusBadRequest, CodeBadRequest, "q must be a base64url rows query")
			return
		}
	}
	t, ok := h.table(w, r)
	if !ok {
		return
	}
	out := &lazyWriter{w: w, start: func() {
		ct := "text/csv; charset=utf-8"
		if format == "json" {
			ct = "application/json"
		}
		w.Header().Set("Content-Type", ct)
		name := strings.NewReplacer("/", "_", `\`, "_").Replace(t.Name) + "." + format
		w.Header().Set("Content-Disposition", mime.FormatMediaType("attachment", map[string]string{"filename": name}))
		w.Header().Set("Cache-Control", "no-store")
	}}
	var err error
	if format == "csv" {
		err = rows.ExportCSV(r.Context(), h.Pool, t, q, out)
	} else {
		err = rows.ExportJSON(r.Context(), h.Pool, h.Types, t, q, out)
	}
	switch {
	case err == nil:
	case !out.started:
		rowsError(w, err)
	default:
		panic(http.ErrAbortHandler)
	}
}

// lazyWriter sends the response headers on the first write, so an error before any data can
// still be answered as JSON.
type lazyWriter struct {
	w       http.ResponseWriter
	start   func()
	started bool
}

func (l *lazyWriter) Write(p []byte) (int, error) {
	if !l.started {
		l.started = true
		l.start()
	}
	return l.w.Write(p)
}

func (h Rows) table(w http.ResponseWriter, r *http.Request) (*introspect.Table, bool) {
	t, err := h.Catalog.Lookup(r.Context(), PathParam(r, "schema"), PathParam(r, "table"))
	if err != nil {
		CatalogError(w, err)
		return nil, false
	}
	return t, true
}

func (h Rows) request(w http.ResponseWriter, r *http.Request) (*introspect.Table, rows.Query, bool) {
	var q rows.Query
	if !DecodeJSON(w, r, &q) {
		return nil, q, false
	}
	t, ok := h.table(w, r)
	return t, q, ok
}

// DecodeJSON reads a JSON body into v, answering 400 itself when it is not valid.
func DecodeJSON(w http.ResponseWriter, r *http.Request, v any) bool {
	d := json.NewDecoder(http.MaxBytesReader(w, r.Body, maxBody))
	d.DisallowUnknownFields()
	if err := d.Decode(v); err != nil {
		Fail(w, http.StatusBadRequest, CodeBadRequest, "invalid JSON body: "+err.Error())
		return false
	}
	return true
}

// rowsError maps errors of the rows package. Invalid input values rejected by Postgres (SQLSTATE
// class 22, e.g. "abc" for an int8) are the client's fault too: 400 with the Postgres details.
func rowsError(w http.ResponseWriter, err error) {
	var pgErr *pgconn.PgError
	switch {
	case errors.Is(err, rows.ErrInvalid):
		Fail(w, http.StatusBadRequest, CodeBadRequest, err.Error())
	case errors.Is(err, rows.ErrRowNotFound):
		Fail(w, http.StatusNotFound, CodeNotFound, err.Error())
	case errors.As(err, &pgErr) && strings.HasPrefix(pgErr.Code, "22"):
		WriteError(w, http.StatusBadRequest, Error{Code: CodeBadRequest, Message: pgErr.Message,
			Detail: pgErr.Detail, Hint: pgErr.Hint, PgCode: pgErr.Code})
	default:
		DBError(w, err)
	}
}
