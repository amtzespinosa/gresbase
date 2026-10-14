package server

import (
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/amtzespinosa/gresbase/internal/config"
	"github.com/amtzespinosa/gresbase/internal/pg/connections"
	"github.com/amtzespinosa/gresbase/internal/pgtest"
)

// envConnections is a manager with pool as the DATABASE_URL connection, as main builds it.
func envConnections(t *testing.T, cfg config.Config, pool *pgxpool.Pool) *connections.Manager {
	t.Helper()
	cfg.MaxPools, cfg.PoolIdleTimeout = max(cfg.MaxPools, 20), max(cfg.PoolIdleTimeout, time.Minute)
	m := connections.New(cfg, slog.New(slog.NewTextHandler(io.Discard, nil)))
	m.AddEnv(pool)
	return m
}

// Two connections to different databases share nothing: catalog cache, SQL transactions and
// undo history stay with their database, and the default routes keep using DATABASE_URL.
func TestConnectionsDoNotMix(t *testing.T) {
	cfg := config.Config{StatementTimeout: 30 * time.Second, MaxConns: 3}
	m := envConnections(t, cfg, pgtest.Pool(t))
	m.Add(connections.Connection{ID: "a", Source: connections.Saved, DSN: config.Secret(pgtest.NewDatabase(t))})
	m.Add(connections.Connection{ID: "b", Source: connections.Saved, DSN: config.Secret(pgtest.NewDatabase(t))})
	t.Cleanup(m.Close)
	h := New(Options{Config: cfg, Logger: slog.New(slog.NewTextHandler(io.Discard, nil)), UI: testUI, Connections: m})
	call := func(method, path, body string) *httptest.ResponseRecorder {
		t.Helper()
		req := httptest.NewRequest(method, path, strings.NewReader(body))
		req.Host = "localhost:8080"
		req.Header.Set("X-Gresbase", "1")
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, req)
		return rec
	}
	relations := func(conn string) string {
		return call("GET", "/api/v1/c/"+conn+"/schemas/public/relations", "").Body.String()
	}

	// Warm b's cache, then change a's schema.
	if strings.Contains(relations("b"), "only_a") {
		t.Fatal("b has only_a before it exists")
	}
	if rec := call("POST", "/api/v1/c/a/sql/execute", `{"sql": "CREATE TABLE only_a (id int)"}`); rec.Code != http.StatusOK {
		t.Fatalf("create on a = %d %s", rec.Code, rec.Body)
	}
	if !strings.Contains(relations("a"), `"only_a"`) || strings.Contains(relations("b"), "only_a") {
		t.Errorf("catalogs mixed: a=%s b=%s", relations("a"), relations("b"))
	}
	if strings.Contains(call("GET", "/api/v1/schemas/public/relations", "").Body.String(), "only_a") {
		t.Error("the default connection sees a's table")
	}

	// A transaction belongs to its connection.
	rec := call("POST", "/api/v1/c/a/sql/transactions", "")
	var tx struct{ ID string }
	if rec.Code != http.StatusCreated || json.Unmarshal(rec.Body.Bytes(), &tx) != nil {
		t.Fatalf("begin on a = %d %s", rec.Code, rec.Body)
	}
	if got := call("GET", "/api/v1/c/b/sql/transactions", "").Body.String(); strings.TrimSpace(got) != "[]" {
		t.Errorf("b lists a's transaction: %s", got)
	}
	if rec := call("POST", "/api/v1/c/b/sql/transactions/"+tx.ID+"/rollback", ""); rec.Code != http.StatusNotFound {
		t.Errorf("rollback of a's transaction through b = %d, want 404", rec.Code)
	}
	if rec := call("POST", "/api/v1/c/a/sql/transactions/"+tx.ID+"/rollback", ""); rec.Code != http.StatusOK {
		t.Errorf("rollback on a = %d %s", rec.Code, rec.Body)
	}

	// So does the undo history.
	rec = call("POST", "/api/v1/c/a/tables/public/orgs/changesets",
		`{"ops": [{"kind": "update", "pk": {"id": 1}, "set": {"name": "Changed on a"}}]}`)
	var cs struct{ ID string }
	if rec.Code != http.StatusOK || json.Unmarshal(rec.Body.Bytes(), &cs) != nil || cs.ID == "" {
		t.Fatalf("changeset on a = %d %s", rec.Code, rec.Body)
	}
	if rec := call("POST", "/api/v1/c/b/changesets/"+cs.ID+"/undo", ""); rec.Code != http.StatusNotFound {
		t.Errorf("undo of a's change through b = %d, want 404", rec.Code)
	}
	if rec := call("POST", "/api/v1/c/a/changesets/"+cs.ID+"/undo", ""); rec.Code != http.StatusOK {
		t.Errorf("undo on a = %d %s", rec.Code, rec.Body)
	}

	if rec := call("GET", "/api/v1/c/nope/schemas", ""); rec.Code != http.StatusNotFound {
		t.Errorf("unknown connection = %d, want 404", rec.Code)
	}
}
