package server

import (
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/amtzespinosa/gresbase/internal/config"
	"github.com/amtzespinosa/gresbase/internal/pgtest"
)

func TestMain(m *testing.M) { pgtest.Main(m) }

// The editor rolls back on page exit with a keepalive fetch through the normal endpoint: it must
// carry X-Gresbase like any other write, and the transaction must be gone afterwards.
func TestExitRollbackGoesThroughCSRF(t *testing.T) {
	cfg := config.Config{StatementTimeout: 30 * time.Second}
	h := New(Options{
		Config:      cfg,
		Logger:      slog.New(slog.NewTextHandler(io.Discard, nil)),
		UI:          testUI,
		Connections: envConnections(t, cfg, pgtest.Pool(t)),
	})
	call := func(method, path string, csrf bool) *httptest.ResponseRecorder {
		req := httptest.NewRequest(method, path, nil)
		req.Host = "localhost:8080"
		if csrf {
			req.Header.Set("X-Gresbase", "1")
		}
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, req)
		return rec
	}
	open := func() int {
		var txs []json.RawMessage
		if err := json.Unmarshal(call("GET", "/api/v1/sql/transactions", false).Body.Bytes(), &txs); err != nil {
			t.Fatal(err)
		}
		return len(txs)
	}

	rec := call("POST", "/api/v1/sql/transactions", true)
	var tx struct{ ID string }
	if rec.Code != http.StatusCreated || json.Unmarshal(rec.Body.Bytes(), &tx) != nil {
		t.Fatalf("begin = %d %s", rec.Code, rec.Body)
	}
	rollback := "/api/v1/sql/transactions/" + tx.ID + "/rollback"
	if rec := call("POST", rollback, false); rec.Code != http.StatusForbidden {
		t.Errorf("rollback without X-Gresbase = %d, want 403", rec.Code)
	}
	if n := open(); n != 1 {
		t.Fatalf("open transactions after refused rollback = %d, want 1", n)
	}
	if rec := call("POST", rollback, true); rec.Code != http.StatusOK {
		t.Errorf("rollback with X-Gresbase = %d %s", rec.Code, rec.Body)
	}
	if n := open(); n != 0 {
		t.Errorf("open transactions after rollback = %d, want 0", n)
	}
}
