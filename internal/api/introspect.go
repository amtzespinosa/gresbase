package api

import (
	"errors"
	"net/http"
	"net/url"

	"github.com/go-chi/chi/v5"

	"github.com/amtzespinosa/gresbase/internal/pg/introspect"
)

// PathParam returns a decoded URL parameter. chi matches on the raw path when the URL has escapes
// that change its meaning (e.g. %2F), and then its params are still escaped.
func PathParam(r *http.Request, name string) string {
	v := chi.URLParam(r, name)
	if r.URL.RawPath == "" {
		return v
	}
	if u, err := url.PathUnescape(v); err == nil {
		return u
	}
	return v
}

// CatalogError writes an introspection error: ErrNotFound becomes 404, the rest goes to DBError.
func CatalogError(w http.ResponseWriter, err error) {
	if errors.Is(err, introspect.ErrNotFound) {
		Fail(w, http.StatusNotFound, CodeNotFound, err.Error())
		return
	}
	DBError(w, err)
}

// Schemas handles GET /api/v1/schemas.
func Schemas(cat *introspect.Catalog) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		s, err := cat.Schemas(r.Context())
		if err != nil {
			CatalogError(w, err)
			return
		}
		WriteJSON(w, http.StatusOK, s)
	}
}

// Relations handles GET /api/v1/schemas/{schema}/relations.
func Relations(cat *introspect.Catalog) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		rels, err := cat.Relations(r.Context(), PathParam(r, "schema"))
		if err != nil {
			CatalogError(w, err)
			return
		}
		WriteJSON(w, http.StatusOK, rels)
	}
}

// TableDDL handles GET /api/v1/tables/{schema}/{table}/ddl.
func TableDDL(cat *introspect.Catalog) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		t, err := cat.Lookup(r.Context(), PathParam(r, "schema"), PathParam(r, "table"))
		if err != nil {
			CatalogError(w, err)
			return
		}
		ddl, err := cat.DDL(r.Context(), t)
		if err != nil {
			CatalogError(w, err)
			return
		}
		WriteJSON(w, http.StatusOK, introspect.DDLResult{DDL: ddl})
	}
}

// TableDetail handles GET /api/v1/tables/{schema}/{table}.
func TableDetail(cat *introspect.Catalog) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		t, err := cat.Lookup(r.Context(), PathParam(r, "schema"), PathParam(r, "table"))
		if err != nil {
			CatalogError(w, err)
			return
		}
		WriteJSON(w, http.StatusOK, t)
	}
}

// Completions handles GET /api/v1/sql/completions.
func Completions(cat *introspect.Catalog) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		c, err := cat.Completions(r.Context())
		if err != nil {
			CatalogError(w, err)
			return
		}
		WriteJSON(w, http.StatusOK, c)
	}
}
