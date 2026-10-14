package server

import (
	"errors"
	"net/http"

	"github.com/go-chi/chi/v5"

	"github.com/amtzespinosa/gresbase/internal/api"
	"github.com/amtzespinosa/gresbase/internal/auth"
	"github.com/amtzespinosa/gresbase/internal/pg"
	"github.com/amtzespinosa/gresbase/internal/pg/capabilities"
	"github.com/amtzespinosa/gresbase/internal/pg/connections"
	"github.com/amtzespinosa/gresbase/internal/pg/introspect"
)

// withConn resolves the connection of the request (the {connection} route parameter, else the
// default one: Manager.DefaultID) and puts it in the context for the handlers. No handler reaches a pool any
// other way.
func withConn(m *connections.Manager) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			id := chi.URLParam(r, "connection")
			if id == "" {
				id = m.DefaultID(auth.SessionID(r.Context()))
			}
			c, release, err := m.Acquire(r.Context(), id, auth.SessionID(r.Context()))
			switch {
			case errors.Is(err, connections.ErrNotFound):
				api.Fail(w, http.StatusNotFound, api.CodeNotFound, "no such connection")
				return
			case errors.Is(err, connections.ErrTooMany):
				api.Fail(w, http.StatusServiceUnavailable, api.CodeTooManyConnections, err.Error())
				return
			case err != nil:
				api.DBError(w, err)
				return
			}
			defer release()
			next.ServeHTTP(w, r.WithContext(connections.With(r.Context(), c)))
		})
	}
}

// The adapters build the handlers of the request's connection; they are plain structs, so this
// costs nothing.
func catalog(f func(*introspect.Catalog) http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) { f(connections.From(r.Context()).Catalog)(w, r) }
}

func rows(f func(api.Rows, http.ResponseWriter, *http.Request)) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		c := connections.From(r.Context())
		f(api.Rows{Catalog: c.Catalog, Pool: c.Pool, Types: c.Types}, w, r)
	}
}

func changesets(f func(api.Changesets, http.ResponseWriter, *http.Request)) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		c := connections.From(r.Context())
		f(api.Changesets{Catalog: c.Catalog, Writer: c.Writer, ReadOnly: c.ReadOnly, Session: auth.SessionID}, w, r)
	}
}

func sql(f func(api.SQL, http.ResponseWriter, *http.Request)) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		c := connections.From(r.Context())
		f(api.SQL{Exec: c.SQL, Catalog: c.Catalog, Session: auth.SessionID}, w, r)
	}
}

func searchHandler(w http.ResponseWriter, r *http.Request) {
	api.Search{Pool: connections.From(r.Context()).Pool}.Run(w, r)
}

func connectionInfo(w http.ResponseWriter, r *http.Request) {
	info, err := pg.Info(r.Context(), connections.From(r.Context()).Pool)
	if err != nil {
		api.DBError(w, err)
		return
	}
	if info.SupportLevel == capabilities.Unsupported {
		api.Fail(w, http.StatusUnprocessableEntity, api.CodeUnsupportedVersion,
			"Gresbase needs PostgreSQL 12 or newer, the server is "+info.ServerVersion)
		return
	}
	api.WriteJSON(w, http.StatusOK, info)
}

// dbRoutes mounts every route that works on a database under prefix.
func dbRoutes(r chi.Router, p string) {
	r.Get(p+"/connection", connectionInfo)
	r.Get(p+"/schemas", catalog(api.Schemas))
	r.Get(p+"/schemas/{schema}/relations", catalog(api.Relations))
	r.Get(p+"/tables/{schema}/{table}", catalog(api.TableDetail))
	r.Get(p+"/tables/{schema}/{table}/ddl", catalog(api.TableDDL))
	r.Get(p+"/sql/completions", catalog(api.Completions))
	r.Post(p+"/tables/{schema}/{table}/rows:query", rows(api.Rows.Query))
	r.Post(p+"/tables/{schema}/{table}/rows:count", rows(api.Rows.Count))
	r.Post(p+"/tables/{schema}/{table}/rows:sql", rows(api.Rows.SQL))
	r.Get(p+"/tables/{schema}/{table}/rows/value", rows(api.Rows.Value))
	r.Get(p+"/tables/{schema}/{table}/rows/referenced-by", rows(api.Rows.ReferencedBy))
	r.Get(p+"/tables/{schema}/{table}/export", rows(api.Rows.Export))
	r.Post(p+"/tables/{schema}/{table}/changesets", changesets(api.Changesets.Apply))
	r.Post(p+"/tables/{schema}/{table}/changesets:preview", changesets(api.Changesets.Preview))
	r.Post(p+"/changesets/{id}/undo", changesets(api.Changesets.Undo))
	r.Post(p+"/tables/{schema}/{table}/changesets:impact", changesets(api.Changesets.Impact))
	r.Post(p+"/changesets/{id}/redo", changesets(api.Changesets.Redo))
	r.Get(p+"/tables/{schema}/{table}/dependents", changesets(api.Changesets.Dependents))
	r.Post(p+"/tables/{schema}/{table}:truncate", changesets(api.Changesets.Truncate))
	r.Delete(p+"/tables/{schema}/{table}", changesets(api.Changesets.Drop))
	// Long requests: heartbeats keep them alive behind proxies that cut idle responses.
	long := r.With(api.Heartbeat(api.HeartbeatEvery))
	long.Post(p+"/tables/{schema}/{table}/import", changesets(api.Changesets.Import))
	r.Get(p+"/types", changesets(api.Changesets.Types))
	r.Post(p+"/structure:preview", changesets(api.Changesets.StructurePreview))
	long.Post(p+"/structure", changesets(api.Changesets.Structure))
	long.Post(p+"/sql/execute", sql(api.SQL.Execute))
	r.Post(p+"/sql/analyze", sql(api.SQL.Analyze))
	r.Post(p+"/search", searchHandler)
	r.Post(p+"/sql/executions/{id}/cancel", sql(api.SQL.Cancel))
	r.Post(p+"/sql/transactions", sql(api.SQL.Begin))
	r.Get(p+"/sql/transactions", sql(api.SQL.Txs))
	r.Get(p+"/sql/transactions/{id}", sql(api.SQL.Tx))
	r.Post(p+"/sql/transactions/{id}/commit", sql(api.SQL.Commit))
	r.Post(p+"/sql/transactions/{id}/rollback", sql(api.SQL.Rollback))
}
