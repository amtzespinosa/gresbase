package server

import (
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/amtzespinosa/gresbase/internal/config"
	"github.com/amtzespinosa/gresbase/internal/pgtest"
)

func TestSavedConnections(t *testing.T) {
	h, dir, logs := setupServer(t, nil)
	c := &caller{h: h, host: "localhost:8080", peer: "127.0.0.1:1"}
	first := formFor(t, pgtest.NewDatabase(t))
	if rec := c.do(t, "POST", "/api/v1/setup", SetupRequest{Mode: "saved",
		Admin: &SetupAdmin{Username: "admin", Password: "admin-password-1"}, Connection: &first}); rec.Code != http.StatusOK {
		t.Fatalf("setup = %d %s", rec.Code, rec.Body)
	}
	list := func() ConnectionList {
		t.Helper()
		rec := c.do(t, "GET", "/api/v1/connections", nil)
		var l ConnectionList
		if err := json.Unmarshal(rec.Body.Bytes(), &l); err != nil || rec.Code != http.StatusOK {
			t.Fatalf("list = %d %s", rec.Code, rec.Body)
		}
		return l
	}
	l := list()
	if len(l.Connections) != 1 || l.DefaultID != l.Connections[0].ID || l.Connections[0].Color != "gray" {
		t.Fatalf("after setup: %+v", l)
	}
	firstID := l.Connections[0].ID

	// Create: 201 with the entry, never the password.
	second := formFor(t, pgtest.NewDatabase(t))
	rec := c.do(t, "POST", "/api/v1/connections", SavedConnectionInput{Name: "staging", Color: "red", Connection: second})
	var e ConnectionEntry
	if rec.Code != http.StatusCreated || json.Unmarshal(rec.Body.Bytes(), &e) != nil || e.Name != "staging" || e.Color != "red" {
		t.Fatalf("create = %d %s", rec.Code, rec.Body)
	}
	if rec := c.do(t, "POST", "/api/v1/connections", SavedConnectionInput{Color: "pink", Connection: second}); rec.Code != http.StatusBadRequest {
		t.Errorf("bad color = %d", rec.Code)
	}

	// Each connection is its own database, through /c/{id}/….
	if rec := c.do(t, "POST", "/api/v1/c/"+e.ID+"/sql/execute", map[string]string{"sql": "CREATE TABLE only_second (id int)"}); rec.Code != http.StatusOK {
		t.Fatalf("execute on second = %d %s", rec.Code, rec.Body)
	}
	if b := c.do(t, "GET", "/api/v1/c/"+firstID+"/schemas/public/relations", nil).Body.String(); strings.Contains(b, "only_second") {
		t.Errorf("first sees the second's table: %s", b)
	}

	// Edit without retyping the password: test and use keep the stored one.
	noPW := second
	noPW.Password = ""
	if rec := c.do(t, "POST", "/api/v1/connections:test", ConnectionTestRequest{ID: e.ID, Connection: noPW}); rec.Code != http.StatusOK {
		t.Errorf("test with stored password = %d %s", rec.Code, rec.Body)
	}
	if rec := c.do(t, "PUT", "/api/v1/connections/"+e.ID, SavedConnectionInput{Name: "stage", Color: "blue", Connection: noPW}); rec.Code != http.StatusOK {
		t.Fatalf("update = %d %s", rec.Code, rec.Body)
	}
	if rec := c.do(t, "GET", "/api/v1/c/"+e.ID+"/schemas/public/relations", nil); !strings.Contains(rec.Body.String(), "only_second") {
		t.Errorf("after update = %d %s", rec.Code, rec.Body)
	}
	if l := list(); len(l.Connections) != 2 || l.Connections[1].Name != "stage" || l.Connections[1].Color != "blue" {
		t.Errorf("after update: %+v", l)
	}
	if rec := c.do(t, "PUT", "/api/v1/connections/nope", SavedConnectionInput{Connection: second}); rec.Code != http.StatusNotFound {
		t.Errorf("update unknown = %d", rec.Code)
	}

	// Passwords never leave the server: not in responses, logs or the file in clear.
	raw, _ := os.ReadFile(filepath.Join(dir, config.FileName))
	for _, pw := range []string{first.Password, second.Password} {
		for where, s := range map[string]string{"list": c.do(t, "GET", "/api/v1/connections", nil).Body.String(),
			"logs": logs.String(), "file": string(raw)} {
			if strings.Contains(s, pw) {
				t.Errorf("password in %s", where)
			}
		}
	}

	// Only the administrator manages them.
	anon := &caller{h: h, host: "localhost:8080", peer: "127.0.0.1:1"}
	if rec := anon.do(t, "GET", "/api/v1/connections", nil); rec.Code != http.StatusUnauthorized {
		t.Errorf("anonymous list = %d", rec.Code)
	}

	if rec := c.do(t, "DELETE", "/api/v1/connections/"+e.ID, nil); rec.Code != http.StatusNoContent {
		t.Fatalf("delete = %d %s", rec.Code, rec.Body)
	}
	if rec := c.do(t, "GET", "/api/v1/c/"+e.ID+"/connection", nil); rec.Code != http.StatusNotFound {
		t.Errorf("deleted connection = %d", rec.Code)
	}
	if l := list(); len(l.Connections) != 1 {
		t.Errorf("after delete: %+v", l)
	}
}

// The DATABASE_URL connection shows in the list, locked: the app cannot edit or delete it.
func TestEnvConnectionLocked(t *testing.T) {
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

	rec := c.do(t, "GET", "/api/v1/connections", nil)
	var l ConnectionList
	if err := json.Unmarshal(rec.Body.Bytes(), &l); err != nil || len(l.Connections) != 1 || !l.Connections[0].Locked ||
		l.DefaultID != "env" || l.Connections[0].Host == "" {
		t.Fatalf("list = %s", rec.Body)
	}
	if pw := strings.SplitN(strings.SplitN(dsn, "@", 2)[0], ":", 3)[2]; strings.Contains(rec.Body.String(), pw) {
		t.Error("DATABASE_URL password in the list")
	}
	for _, method := range []string{"PUT", "DELETE"} {
		if rec := c.do(t, method, "/api/v1/connections/env", SavedConnectionInput{Connection: formFor(t, dsn)}); rec.Code != http.StatusConflict ||
			!strings.Contains(rec.Body.String(), "locked_by_env") {
			t.Errorf("%s env = %d %s", method, rec.Code, rec.Body)
		}
	}
}
