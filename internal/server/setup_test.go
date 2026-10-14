package server

import (
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"slices"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/amtzespinosa/gresbase/internal/config"
	"github.com/amtzespinosa/gresbase/internal/pg/connections"
	"github.com/amtzespinosa/gresbase/internal/pgtest"
	"github.com/amtzespinosa/gresbase/internal/snippets"
)

// setupServer is a fresh Gresbase without DATABASE_URL: it starts in setup mode.
func setupServer(t *testing.T, env map[string]string) (http.Handler, string, *strings.Builder) {
	t.Helper()
	t.Setenv("TMPDIR", t.TempDir()) // where the generated setup token is left for `gresbase setup-token`
	dir := t.TempDir()
	getenv := func(k string) string {
		if k == "GRESBASE_DATA_DIR" {
			return dir
		}
		return env[k]
	}
	store, cfg, err := config.Open(getenv)
	if err != nil {
		t.Fatal(err)
	}
	var logs strings.Builder
	log := slog.New(slog.NewTextHandler(&logs, nil))
	m := connections.New(cfg, log)
	t.Cleanup(m.Close)
	sn, err := snippets.Open(dir)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = sn.Close() })
	return New(Options{Config: cfg, Logger: log, UI: testUI, Connections: m, Settings: store, Snippets: sn}), dir, &logs
}

type caller struct {
	h       http.Handler
	host    string
	peer    string
	token   string
	cookies []*http.Cookie
}

func (c *caller) do(t *testing.T, method, path string, body any) *httptest.ResponseRecorder {
	t.Helper()
	var r io.Reader
	if body != nil {
		raw, _ := json.Marshal(body)
		r = strings.NewReader(string(raw))
	}
	req := httptest.NewRequest(method, path, r)
	req.Host, req.RemoteAddr = c.host, c.peer
	req.Header.Set("X-Gresbase", "1")
	if c.token != "" {
		req.Header.Set(SetupTokenHeader, c.token)
	}
	for _, ck := range c.cookies {
		req.AddCookie(ck)
	}
	rec := httptest.NewRecorder()
	c.h.ServeHTTP(rec, req)
	for _, ck := range rec.Result().Cookies() {
		c.cookies = append(slices.DeleteFunc(c.cookies, func(o *http.Cookie) bool { return o.Name == ck.Name }), ck)
	}
	return rec
}

// formFor turns a DSN into the wizard's connection form.
func formFor(t *testing.T, dsn string) ConnectionInput {
	t.Helper()
	u, err := url.Parse(dsn)
	if err != nil {
		t.Fatal(err)
	}
	port, _ := strconv.Atoi(u.Port())
	pw, _ := u.User.Password()
	return ConnectionInput{Host: u.Hostname(), Port: port, Database: strings.TrimPrefix(u.Path, "/"),
		User: u.User.Username(), Password: pw, SSLMode: "disable"}
}

func TestSetupMode(t *testing.T) {
	h, _, logs := setupServer(t, nil)
	local := &caller{h: h, host: "localhost:8080", peer: "127.0.0.1:5000"}

	if rec := local.do(t, "GET", "/healthz", nil); !strings.Contains(rec.Body.String(), `"status":"setup"`) {
		t.Errorf("healthz = %d %s", rec.Code, rec.Body)
	}
	if rec := local.do(t, "GET", "/api/v1/config", nil); !strings.Contains(rec.Body.String(), `"setup_required":true`) {
		t.Errorf("config = %s", rec.Body)
	}
	for _, p := range []string{"/api/v1/schemas", "/api/v1/settings", "/api/v1/auth/session"} {
		if rec := local.do(t, "GET", p, nil); rec.Code != http.StatusConflict || !strings.Contains(rec.Body.String(), "setup_required") {
			t.Errorf("%s = %d %s", p, rec.Code, rec.Body)
		}
	}
	var st SetupStatus
	rec := local.do(t, "GET", "/api/v1/setup", nil)
	_ = json.Unmarshal(rec.Body.Bytes(), &st)
	if !st.Required || st.TokenRequired || st.DataPersistent != (st.DataLoss == "") {
		t.Errorf("local status = %+v", st)
	}
	m := regexp.MustCompile(`setup_token=([0-9a-f]{32})`).FindStringSubmatch(logs.String())
	if m == nil {
		t.Fatalf("generated token not logged: %s", logs)
	}
	// A ready link with the token after "#", and the file `gresbase setup-token` prints.
	if !strings.Contains(logs.String(), `path="/setup#token=`+m[1]) {
		t.Errorf("no setup link in the logs: %s", logs)
	}
	if b, err := os.ReadFile(config.SetupTokenFile()); err != nil || strings.TrimSpace(string(b)) != m[1] {
		t.Errorf("token file = %q %v", b, err)
	} else if fi, _ := os.Stat(config.SetupTokenFile()); fi.Mode().Perm() != 0o600 {
		t.Errorf("token file mode = %v", fi.Mode())
	}
}

func TestSetupToken(t *testing.T) {
	h, _, logs := setupServer(t, map[string]string{"GRESBASE_SETUP_TOKEN": "a-long-setup-token-123"})
	if strings.Contains(logs.String(), "a-long-setup-token-123") {
		t.Error("a token from the environment must not be logged")
	}
	remote := &caller{h: h, host: "gres.example.com", peer: "10.0.0.5:4000"}
	// DNS rebinding: loopback peer, foreign Host.
	rebound := &caller{h: h, host: "evil.example:8080", peer: "127.0.0.1:4000"}
	for name, c := range map[string]*caller{"remote": remote, "rebound": rebound} {
		var st SetupStatus
		rec := c.do(t, "GET", "/api/v1/setup", nil)
		_ = json.Unmarshal(rec.Body.Bytes(), &st)
		if rec.Code != http.StatusOK || !st.TokenRequired {
			t.Errorf("%s: status = %d %s", name, rec.Code, rec.Body)
		}
		if rec := c.do(t, "GET", "/", nil); rec.Code != http.StatusOK {
			t.Errorf("%s: the SPA must load in setup mode, got %d", name, rec.Code)
		}
		if rec := c.do(t, "POST", "/api/v1/setup/verify", nil); rec.Code != http.StatusForbidden ||
			!strings.Contains(rec.Body.String(), "setup_token_invalid") {
			t.Errorf("%s: verify without token = %d %s", name, rec.Code, rec.Body)
		}
		if rec := c.do(t, "POST", "/api/v1/setup", SetupRequest{Mode: "free"}); rec.Code != http.StatusForbidden {
			t.Errorf("%s: complete without token = %d %s", name, rec.Code, rec.Body)
		}
		// Data routes stay behind the Host guard.
		if rec := c.do(t, "GET", "/api/v1/schemas", nil); rec.Code != http.StatusForbidden {
			t.Errorf("%s: schemas = %d", name, rec.Code)
		}
	}
	remote.token = "a-long-setup-token-123"
	if rec := remote.do(t, "POST", "/api/v1/setup/verify", nil); rec.Code != http.StatusNoContent {
		t.Errorf("verify with token = %d %s", rec.Code, rec.Body)
	}
}

func TestSetupTestConnection(t *testing.T) {
	h, _, _ := setupServer(t, nil)
	c := &caller{h: h, host: "localhost", peer: "127.0.0.1:1"}
	good := formFor(t, pgtest.DSN(t))

	var res ConnectionTest
	rec := c.do(t, "POST", "/api/v1/setup/test", good)
	_ = json.Unmarshal(rec.Body.Bytes(), &res)
	if rec.Code != http.StatusOK || res.ServerVersionNum < 120000 || res.SupportLevel == "" {
		t.Fatalf("good = %d %s", rec.Code, rec.Body)
	}

	bad := good
	bad.Password = "wrong-password-xyz"
	refused := good
	refused.Host, refused.Port = "127.0.0.1", 1
	for name, tc := range map[string]struct {
		in     ConnectionInput
		reason string
	}{"auth": {bad, "authentication"}, "refused": {refused, "connection_refused"}} {
		rec := c.do(t, "POST", "/api/v1/setup/test", tc.in)
		if rec.Code != http.StatusUnprocessableEntity || !strings.Contains(rec.Body.String(), `"reason":"`+tc.reason+`"`) {
			t.Errorf("%s = %d %s", name, rec.Code, rec.Body)
		}
		if strings.Contains(rec.Body.String(), tc.in.Password) {
			t.Errorf("%s: password in the response", name)
		}
	}
	if rec := c.do(t, "POST", "/api/v1/setup/test", ConnectionInput{Host: "db/x", User: "u"}); rec.Code != http.StatusBadRequest {
		t.Errorf("bad host = %d", rec.Code)
	}
}

func TestSetupComplete(t *testing.T) {
	h, dir, logs := setupServer(t, nil)
	c := &caller{h: h, host: "localhost:8080", peer: "127.0.0.1:1"}
	conn := formFor(t, pgtest.NewDatabase(t))

	if rec := c.do(t, "POST", "/api/v1/setup", SetupRequest{Mode: "saved", Connection: &conn}); rec.Code != http.StatusBadRequest {
		t.Errorf("without admin = %d %s", rec.Code, rec.Body)
	}
	req := SetupRequest{Mode: "saved", Lang: "es", Admin: &SetupAdmin{Username: "admin", Password: "admin-password-1"},
		Connection: &conn}
	rec := c.do(t, "POST", "/api/v1/setup", req)
	if rec.Code != http.StatusOK || !strings.Contains(rec.Body.String(), `"signed_in":true`) {
		t.Fatalf("complete = %d %s", rec.Code, rec.Body)
	}

	if _, err := os.Stat(config.SetupTokenFile()); !os.IsNotExist(err) {
		t.Errorf("token file left after setup: %v", err)
	}
	// The wizard is gone for good and the app works with the saved connection, signed in.
	if rec := c.do(t, "POST", "/api/v1/setup", req); rec.Code != http.StatusNotFound {
		t.Errorf("second complete = %d", rec.Code)
	}
	if rec := c.do(t, "GET", "/api/v1/setup", nil); !strings.Contains(rec.Body.String(), `"required":false`) {
		t.Errorf("status after = %s", rec.Body)
	}
	if rec := c.do(t, "GET", "/healthz", nil); !strings.Contains(rec.Body.String(), `"status":"ok"`) {
		t.Errorf("healthz after = %s", rec.Body)
	}
	if rec := c.do(t, "GET", "/api/v1/connection", nil); rec.Code != http.StatusOK ||
		!strings.Contains(rec.Body.String(), `"database":"`+conn.Database+`"`) {
		t.Errorf("connection = %d %s", rec.Code, rec.Body)
	}
	anon := &caller{h: h, host: "localhost:8080", peer: "127.0.0.1:1"}
	if rec := anon.do(t, "GET", "/api/v1/schemas", nil); rec.Code != http.StatusUnauthorized {
		t.Errorf("without session = %d (login must be on)", rec.Code)
	}
	if rec := c.do(t, "GET", "/api/v1/config", nil); !strings.Contains(rec.Body.String(), `"lang":"es"`) {
		t.Errorf("lang not saved: %s", rec.Body)
	}

	raw, err := os.ReadFile(filepath.Join(dir, config.FileName))
	if err != nil {
		t.Fatal(err)
	}
	for _, secret := range []string{conn.Password, "admin-password-1"} {
		if strings.Contains(string(raw), secret) || strings.Contains(logs.String(), secret) {
			t.Errorf("%q stored or logged in clear", secret)
		}
	}
	if !strings.Contains(string(raw), `"mode": "saved"`) {
		t.Errorf("mode not saved: %s", raw)
	}

	// A restart loads the saved connection: no setup mode.
	h2, _, _ := reopen(t, dir)
	if rec := (&caller{h: h2, host: "localhost", peer: "127.0.0.1:1"}).do(t, "GET", "/healthz", nil); !strings.Contains(rec.Body.String(), `"ok"`) {
		t.Errorf("after restart healthz = %s", rec.Body)
	}
}

// reopen starts a server on an existing data dir, loading saved connections as main does.
func reopen(t *testing.T, dir string) (http.Handler, *config.Store, *connections.Manager) {
	t.Helper()
	store, cfg, err := config.Open(func(k string) string {
		if k == "GRESBASE_DATA_DIR" {
			return dir
		}
		return ""
	})
	if err != nil {
		t.Fatal(err)
	}
	cfg.PoolIdleTimeout = time.Minute
	log := slog.New(slog.NewTextHandler(io.Discard, nil))
	m := connections.New(cfg, log)
	for _, c := range store.Connections() {
		m.Add(connections.Connection{ID: c.ID, Source: connections.Saved, DSN: store.ConnectionDSN(c), ReadOnly: c.ReadOnly})
	}
	t.Cleanup(m.Close)
	return New(Options{Config: cfg, Logger: log, UI: testUI, Connections: m, Settings: store}), store, m
}
