package api_test

import (
	"context"
	"encoding/json"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/amtzespinosa/gresbase/internal/api"
	"github.com/amtzespinosa/gresbase/internal/pg/introspect"
	"github.com/amtzespinosa/gresbase/internal/pg/pgvalue"
	"github.com/amtzespinosa/gresbase/internal/pg/sqlexec"
	"github.com/amtzespinosa/gresbase/internal/pgtest"
)

func sqlRouter(t *testing.T, dsn string, readOnly bool) *chi.Mux {
	pool := pgtest.PoolFor(t, dsn)
	h := api.SQL{Exec: sqlexec.New(pool, pgvalue.NewTypes(), readOnly, 30*time.Second), Catalog: introspect.New(pool),
		Session: func(context.Context) string { return "s" }}
	r := chi.NewRouter()
	r.Post("/sql/execute", h.Execute)
	r.Post("/sql/analyze", h.Analyze)
	r.Post("/sql/executions/{id}/cancel", h.Cancel)
	r.Post("/sql/transactions", h.Begin)
	r.Get("/sql/transactions", h.Txs)
	r.Get("/sql/transactions/{id}", h.Tx)
	r.Post("/sql/transactions/{id}/commit", h.Commit)
	r.Post("/sql/transactions/{id}/rollback", h.Rollback)
	return r
}

func TestSQLEndpoints(t *testing.T) {
	r := sqlRouter(t, pgtest.NewDatabase(t), false)
	for _, tc := range []struct {
		path, body string
		status     int
		contains   string
	}{
		{"/sql/execute", `{"sql": "SELECT 1 AS one"}`, 200, `"columns":[{"name":"one","type":"integer"}],"rows":[[1]]`},
		{"/sql/execute", `{"sql": "SELECT 1;\nTRUNCATE sessions"}`, 409,
			`"code":"confirmation_required","message":"the script has destructive statements: confirm to run it","analysis":{"findings":[{"statement":1,"kind":"truncate","level":"danger","from":10,"to":27}],"requires_confirmation":true}`},
		{"/sql/execute", `{"sql": "TRUNCATE sessions", "confirm_destructive": true}`, 200, `"command_tag":"TRUNCATE TABLE"`},
		{"/sql/execute", `{"sql": "SELECT nope"}`, 200, `"error":{"code":"pg_error","message":"column \"nope\" does not exist","position":8,"pg_code":"42703"}`},
		{"/sql/execute", `{"sql": ""}`, 400, `"bad_request"`},
		{"/sql/execute", `{"sql": "SELECT 1", "tx_id": "nope"}`, 404, `"not_found"`},
		{"/sql/analyze", `{"sql": "UPDATE users SET name = 'x' WHERE id = 1"}`, 200,
			`{"findings":[{"statement":0,"kind":"update","level":"warning","from":0,"to":40}],"requires_confirmation":false}`},
		{"/sql/executions/nope/cancel", ``, 404, `"not_found"`},
		{"/sql/transactions/nope/commit", ``, 404, `"not_found"`},
	} {
		rec := post(r, tc.path, tc.body)
		if rec.Code != tc.status || !strings.Contains(rec.Body.String(), tc.contains) {
			t.Errorf("POST %s %s = %d %s; want %d containing %s", tc.path, tc.body, rec.Code, rec.Body, tc.status, tc.contains)
		}
	}

	rec := post(r, "/sql/transactions", ``)
	var tx sqlexec.TxInfo
	if rec.Code != 201 || json.Unmarshal(rec.Body.Bytes(), &tx) != nil || tx.Status != "active" {
		t.Fatalf("begin = %d %s", rec.Code, rec.Body)
	}
	rec = post(r, "/sql/execute", `{"sql": "DELETE FROM audit_log", "tx_id": "`+tx.ID+`"}`)
	if rec.Code != 200 || !strings.Contains(rec.Body.String(), `"kind":"delete_all","level":"danger"`) {
		t.Errorf("execute in transaction (no confirmation needed) = %d %s", rec.Code, rec.Body)
	}
	rec = httptest.NewRecorder()
	r.ServeHTTP(rec, httptest.NewRequest("GET", "/sql/transactions/"+tx.ID, nil))
	if rec.Code != 200 || !strings.Contains(rec.Body.String(), `"command_tag":"DELETE`) {
		t.Errorf("get transaction = %d %s", rec.Code, rec.Body)
	}
	rec = httptest.NewRecorder()
	r.ServeHTTP(rec, httptest.NewRequest("GET", "/sql/transactions", nil))
	if rec.Code != 200 || !strings.Contains(rec.Body.String(), `[{"id":"`+tx.ID+`"`) {
		t.Errorf("list transactions = %d %s", rec.Code, rec.Body)
	}
	if rec := post(r, "/sql/transactions/"+tx.ID+"/rollback", ``); rec.Code != 200 || rec.Body.String() != "{\"committed\":false}\n" {
		t.Errorf("rollback = %d %s", rec.Code, rec.Body)
	}
	rec = httptest.NewRecorder()
	r.ServeHTTP(rec, httptest.NewRequest("GET", "/sql/transactions", nil))
	if rec.Body.String() != "[]\n" {
		t.Errorf("list after rollback = %s", rec.Body)
	}
}

func TestSQLReadOnly(t *testing.T) {
	r := sqlRouter(t, pgtest.DSN(t), true)
	if rec := post(r, "/sql/transactions", ``); rec.Code != 403 || !strings.Contains(rec.Body.String(), `"read_only"`) {
		t.Errorf("begin in read-only = %d %s", rec.Code, rec.Body)
	}
	rec := post(r, "/sql/execute", `{"sql": "DELETE FROM sessions"}`)
	if rec.Code != 200 || !strings.Contains(rec.Body.String(), `"code":"read_only"`) {
		t.Errorf("write in read-only = %d %s", rec.Code, rec.Body)
	}
	if rec := post(r, "/sql/execute", `{"sql": "COMMIT"}`); rec.Code != 400 {
		t.Errorf("COMMIT in read-only = %d %s", rec.Code, rec.Body)
	}
}
