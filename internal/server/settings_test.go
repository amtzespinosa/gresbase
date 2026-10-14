package server

import (
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"testing"

	"github.com/amtzespinosa/gresbase/internal/config"
	"github.com/amtzespinosa/gresbase/internal/pg/sqlexec"
	"github.com/amtzespinosa/gresbase/internal/pgtest"
)

// The SQL row limit setting applies live: /config reports it and executions use it as default.
func TestSQLMaxRowsSettingIsLive(t *testing.T) {
	dsn := pgtest.DSN(t)
	dir := t.TempDir()
	store, cfg, err := config.Open(func(k string) string {
		return map[string]string{"DATABASE_URL": dsn, "GRESBASE_DATA_DIR": dir}[k]
	})
	if err != nil {
		t.Fatal(err)
	}
	m := envConnections(t, cfg, pgtest.Pool(t))
	t.Cleanup(m.Close)
	h := New(Options{Config: cfg, Logger: slog.New(slog.NewTextHandler(io.Discard, nil)), UI: testUI,
		Connections: m, Settings: store})
	c := &caller{h: h, host: "localhost", peer: "127.0.0.1:1"}

	rows := func() (int, bool) {
		t.Helper()
		rec := c.do(t, "POST", "/api/v1/sql/execute", map[string]string{"sql": "SELECT generate_series(1, 5)"})
		var res sqlexec.SQLResponse
		if err := json.Unmarshal(rec.Body.Bytes(), &res); err != nil || rec.Code != http.StatusOK || len(res.Results) != 1 {
			t.Fatalf("execute = %d %s", rec.Code, rec.Body)
		}
		return len(res.Results[0].Rows), res.Results[0].Truncated
	}
	if n, trunc := rows(); n != 5 || trunc {
		t.Fatalf("default limit: %d rows, truncated %v", n, trunc)
	}
	if rec := c.do(t, "PATCH", "/api/v1/settings", config.SettingsPatch{Settings: map[string]string{"sql_max_rows": "2"}}); rec.Code != http.StatusOK {
		t.Fatalf("patch = %d %s", rec.Code, rec.Body)
	}
	if n, trunc := rows(); n != 2 || !trunc {
		t.Errorf("after patch: %d rows, truncated %v", n, trunc)
	}
	var conf ConfigResponse
	if err := json.Unmarshal(c.do(t, "GET", "/api/v1/config", nil).Body.Bytes(), &conf); err != nil || conf.SQLMaxRows != 2 {
		t.Errorf("config sql_max_rows = %d (%v)", conf.SQLMaxRows, err)
	}
	if rec := c.do(t, "PATCH", "/api/v1/settings", config.SettingsPatch{Settings: map[string]string{"sql_max_rows": "0"}}); rec.Code != http.StatusBadRequest {
		t.Errorf("invalid limit = %d", rec.Code)
	}
}
