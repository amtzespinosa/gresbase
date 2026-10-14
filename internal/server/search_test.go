package server

import (
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"strings"
	"testing"

	"github.com/amtzespinosa/gresbase/internal/config"
	"github.com/amtzespinosa/gresbase/internal/pg/search"
	"github.com/amtzespinosa/gresbase/internal/pgtest"
)

// The search answers NDJSON with the headers that keep proxies from holding it back, on a read-only
// instance too, and a bad term is a plain 400.
func TestSearchStreams(t *testing.T) {
	dsn := pgtest.DSN(t)
	dir := t.TempDir()
	store, cfg, err := config.Open(func(k string) string {
		return map[string]string{"DATABASE_URL": dsn, "GRESBASE_DATA_DIR": dir, "GRESBASE_READ_ONLY": "true"}[k]
	})
	if err != nil {
		t.Fatal(err)
	}
	m := envConnections(t, cfg, pgtest.Pool(t))
	t.Cleanup(m.Close)
	h := New(Options{Config: cfg, Logger: slog.New(slog.NewTextHandler(io.Discard, nil)), UI: testUI,
		Connections: m, Settings: store})
	c := &caller{h: h, host: "localhost", peer: "127.0.0.1:1"}

	rec := c.do(t, "POST", "/api/v1/c/env/search", search.SearchRequest{Q: "user12000@", Schemas: []string{"public"}})
	if rec.Code != http.StatusOK || rec.Header().Get("Content-Type") != "application/x-ndjson; charset=utf-8" ||
		rec.Header().Get("X-Accel-Buffering") != "no" || !strings.Contains(rec.Header().Get("Cache-Control"), "no-transform") {
		t.Fatalf("search = %d %v", rec.Code, rec.Header())
	}
	lines := strings.Split(strings.TrimSpace(rec.Body.String()), "\n")
	var first, last search.SearchEvent
	_ = json.Unmarshal([]byte(lines[0]), &first)
	_ = json.Unmarshal([]byte(lines[len(lines)-1]), &last)
	if first.Type != "start" || last.Type != "done" || last.Found != 1 ||
		!strings.Contains(rec.Body.String(), `"snippet":"user12000@example.com"`) {
		t.Errorf("events = %s", rec.Body)
	}
	if rec := c.do(t, "POST", "/api/v1/search", search.SearchRequest{Q: "x"}); rec.Code != http.StatusBadRequest {
		t.Errorf("one character = %d %s", rec.Code, rec.Body)
	}
}
