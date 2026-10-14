package server

import (
	"net/http"
	"strconv"
	"strings"
	"testing"

	"github.com/amtzespinosa/gresbase/internal/pgtest"
)

func freeServer(t *testing.T, env map[string]string) (*caller, *strings.Builder) {
	t.Helper()
	all := map[string]string{"GRESBASE_MODE_FREE": "true"}
	for k, v := range env {
		all[k] = v
	}
	h, _, logs := setupServer(t, all)
	return &caller{h: h, host: "gres.example.com", peer: "10.0.0.7:1000"}, logs
}

func TestFreeModeConnect(t *testing.T) {
	c, logs := freeServer(t, nil)
	if rec := c.do(t, "GET", "/api/v1/config", nil); !strings.Contains(rec.Body.String(), `"free_mode":true`) ||
		!strings.Contains(rec.Body.String(), `"auth_enabled":true`) {
		t.Fatalf("config = %s", rec.Body)
	}
	// Free mode needs no Host guard: the credentials are the login. Without a session, 401.
	if rec := c.do(t, "GET", "/api/v1/schemas", nil); rec.Code != http.StatusUnauthorized {
		t.Fatalf("schemas without session = %d", rec.Code)
	}

	form := formFor(t, pgtest.NewDatabase(t))
	rec := c.do(t, "POST", "/api/v1/auth/connect", form)
	if rec.Code != http.StatusOK || !strings.Contains(rec.Body.String(), `"role":"user"`) {
		t.Fatalf("connect = %d %s", rec.Code, rec.Body)
	}
	if rec := c.do(t, "GET", "/api/v1/connection", nil); !strings.Contains(rec.Body.String(), `"database":"`+form.Database+`"`) {
		t.Errorf("connection = %d %s", rec.Code, rec.Body)
	}
	// Nothing shared: no settings; saved queries are the session's own (TestFreeModePrivateSnippets).
	if rec := c.do(t, "GET", "/api/v1/settings", nil); rec.Code != http.StatusForbidden {
		t.Errorf("settings = %d", rec.Code)
	}
	if rec := c.do(t, "GET", "/api/v1/snippets", nil); rec.Code != http.StatusOK || strings.TrimSpace(rec.Body.String()) != "[]" {
		t.Errorf("snippets = %d %q", rec.Code, rec.Body)
	}
	// The selector only learns its own connection; managing saved ones is for the administrator.
	if rec := c.do(t, "GET", "/api/v1/connections", nil); rec.Code != http.StatusOK ||
		!strings.Contains(rec.Body.String(), `"connections":[]`) || strings.Contains(rec.Body.String(), `"default_id":""`) {
		t.Errorf("connections = %d %s", rec.Code, rec.Body)
	}
	if rec := c.do(t, "POST", "/api/v1/connections", SavedConnectionInput{Connection: form}); rec.Code != http.StatusForbidden {
		t.Errorf("create in free mode = %d", rec.Code)
	}
	if strings.Contains(rec.Body.String(), form.Password) || strings.Contains(logs.String(), form.Password) {
		t.Error("password in a response or the logs")
	}
	for _, ck := range c.cookies {
		if strings.Contains(ck.Value, form.Password) {
			t.Error("password in the cookie")
		}
	}

	// Sign out closes the connection: the old cookie is worth nothing.
	old := append(c.cookies[:0:0], c.cookies...)
	if rec := c.do(t, "POST", "/api/v1/auth/logout", nil); rec.Code != http.StatusNoContent {
		t.Fatalf("logout = %d", rec.Code)
	}
	c.cookies = old
	if rec := c.do(t, "GET", "/api/v1/connection", nil); rec.Code != http.StatusUnauthorized {
		t.Errorf("after logout = %d", rec.Code)
	}
}

func TestFreeModePrivateSnippets(t *testing.T) {
	c1, _ := freeServer(t, nil)
	c2 := &caller{h: c1.h, host: c1.host, peer: "10.0.0.8:1000"}
	again := &caller{h: c1.h, host: c1.host, peer: "10.0.0.9:1000"}
	a, b := formFor(t, pgtest.NewDatabase(t)), formFor(t, pgtest.NewDatabase(t))
	for _, x := range []struct {
		c    *caller
		form ConnectionInput
	}{{c1, a}, {c2, b}, {again, a}} {
		if rec := x.c.do(t, "POST", "/api/v1/auth/connect", x.form); rec.Code != http.StatusOK {
			t.Fatalf("connect = %d %s", rec.Code, rec.Body)
		}
	}
	if rec := c1.do(t, "POST", "/api/v1/snippets", map[string]string{"path": "mine.sql", "sql": "SELECT 1"}); rec.Code != http.StatusCreated {
		t.Fatalf("create = %d %s", rec.Code, rec.Body)
	}
	list := func(c *caller) string {
		rec := c.do(t, "GET", "/api/v1/snippets", nil)
		if rec.Code != http.StatusOK {
			t.Fatalf("list = %d %s", rec.Code, rec.Body)
		}
		return rec.Body.String()
	}
	// Another user (another database) doesn't see it; the same user in another session does.
	if got := list(c2); strings.TrimSpace(got) != "[]" {
		t.Errorf("other user = %s", got)
	}
	if got := list(again); !strings.Contains(got, `"path":"mine.sql"`) {
		t.Errorf("same user = %s", got)
	}
	if rec := c2.do(t, "GET", "/api/v1/snippets/file?path=mine.sql", nil); rec.Code != http.StatusNotFound {
		t.Errorf("other user reads it = %d", rec.Code)
	}
	if rec := c2.do(t, "GET", "/api/v1/snippets/file?path=../mine.sql", nil); rec.Code != http.StatusBadRequest {
		t.Errorf("climbing out = %d", rec.Code)
	}
}

// With GRESBASE_DB_HOST/PORT/NAME/USER the form only asks for the password: whatever else the
// client sends is replaced by the fixed values.
func TestFreeModeFixedFields(t *testing.T) {
	form := formFor(t, pgtest.NewDatabase(t))
	c, _ := freeServer(t, map[string]string{"GRESBASE_DB_HOST": form.Host, "GRESBASE_DB_PORT": strconv.Itoa(form.Port),
		"GRESBASE_DB_NAME": form.Database, "GRESBASE_DB_USER": form.User})
	if rec := c.do(t, "GET", "/api/v1/config", nil); !strings.Contains(rec.Body.String(), `"db_name":"`+form.Database+`"`) ||
		!strings.Contains(rec.Body.String(), `"db_user":"`+form.User+`"`) {
		t.Fatalf("config = %s", rec.Body)
	}
	rec := c.do(t, "POST", "/api/v1/auth/connect", ConnectionInput{Host: "elsewhere", Database: "other", User: "someone",
		Password: form.Password, SSLMode: "disable"})
	if rec.Code != http.StatusOK || !strings.Contains(rec.Body.String(), form.User+"@"+form.Host) {
		t.Fatalf("connect with only the password = %d %s", rec.Code, rec.Body)
	}
	if rec := c.do(t, "GET", "/api/v1/connection", nil); !strings.Contains(rec.Body.String(), `"database":"`+form.Database+`"`) {
		t.Errorf("connection = %s", rec.Body)
	}
}

func TestFreeModeErrors(t *testing.T) {
	c, _ := freeServer(t, nil)
	good := formFor(t, pgtest.DSN(t))
	bad, missing, refused := good, good, good
	bad.Password = "nope-nope"
	missing.Database = "no_such_db"
	refused.Host, refused.Port = "127.0.0.1", 1
	for name, tc := range map[string]struct {
		in     ConnectionInput
		reason string
	}{
		"auth": {bad, "authentication"}, "database": {missing, "database_not_found"},
		"refused": {refused, "connection_refused"},
	} {
		rec := c.do(t, "POST", "/api/v1/auth/connect", tc.in)
		if rec.Code != http.StatusUnprocessableEntity || !strings.Contains(rec.Body.String(), `"reason":"`+tc.reason+`"`) {
			t.Errorf("%s = %d %s", name, rec.Code, rec.Body)
		}
		if len(rec.Result().Cookies()) > 0 {
			t.Errorf("%s: a failed connect must not start a session", name)
		}
	}
	// Five failed attempts per minute and IP; a bad request or a success doesn't count.
	if rec := c.do(t, "POST", "/api/v1/auth/connect", ConnectionInput{Host: "db/x", User: "u"}); rec.Code != http.StatusBadRequest {
		t.Errorf("bad host = %d", rec.Code)
	}
	for i := range 3 {
		if rec := c.do(t, "POST", "/api/v1/auth/connect", good); rec.Code != http.StatusOK {
			t.Errorf("good %d = %d %s", i, rec.Code, rec.Body)
		}
	}
	for range 2 { // failures four and five
		c.do(t, "POST", "/api/v1/auth/connect", bad)
	}
	if rec := c.do(t, "POST", "/api/v1/auth/connect", good); rec.Code != http.StatusTooManyRequests {
		t.Errorf("after five failures = %d", rec.Code)
	}
}

func TestFreeModeIsolationAndLimits(t *testing.T) {
	c1, _ := freeServer(t, map[string]string{"GRESBASE_MAX_SESSIONS": "2"})
	c2 := &caller{h: c1.h, host: c1.host, peer: "10.0.0.8:1000"}
	c3 := &caller{h: c1.h, host: c1.host, peer: "10.0.0.9:1000"}
	a, b := formFor(t, pgtest.NewDatabase(t)), formFor(t, pgtest.NewDatabase(t))
	if rec := c1.do(t, "POST", "/api/v1/auth/connect", a); rec.Code != http.StatusOK {
		t.Fatalf("a = %d %s", rec.Code, rec.Body)
	}
	if rec := c2.do(t, "POST", "/api/v1/auth/connect", b); rec.Code != http.StatusOK {
		t.Fatalf("b = %d %s", rec.Code, rec.Body)
	}
	// Each session works on its own connection.
	if rec := c1.do(t, "POST", "/api/v1/sql/execute", map[string]string{"sql": "CREATE TABLE only_a (id int)"}); rec.Code != http.StatusOK {
		t.Fatalf("create = %d %s", rec.Code, rec.Body)
	}
	if body := c2.do(t, "GET", "/api/v1/schemas/public/relations", nil).Body.String(); strings.Contains(body, "only_a") {
		t.Errorf("b sees a's table: %s", body)
	}
	if body := c1.do(t, "GET", "/api/v1/connection", nil).Body.String(); !strings.Contains(body, `"database":"`+a.Database+`"`) {
		t.Errorf("a = %s", body)
	}
	// The limit counts sessions; switching connection inside a session does not add one.
	if rec := c3.do(t, "POST", "/api/v1/auth/connect", a); rec.Code != http.StatusServiceUnavailable ||
		!strings.Contains(rec.Body.String(), "too_many_sessions") {
		t.Errorf("third session = %d %s", rec.Code, rec.Body)
	}
	if rec := c1.do(t, "POST", "/api/v1/auth/connect", b); rec.Code != http.StatusOK {
		t.Errorf("switch = %d %s", rec.Code, rec.Body)
	}
	if body := c1.do(t, "GET", "/api/v1/connection", nil).Body.String(); !strings.Contains(body, `"database":"`+b.Database+`"`) {
		t.Errorf("after switch = %s", body)
	}
}

func TestFreeModeAllowedHosts(t *testing.T) {
	form := formFor(t, pgtest.DSN(t))
	denied, _ := freeServer(t, map[string]string{"GRESBASE_ALLOWED_DB_HOSTS": "10.255.0.0/16"})
	if rec := denied.do(t, "POST", "/api/v1/auth/connect", form); rec.Code != http.StatusForbidden ||
		!strings.Contains(rec.Body.String(), "db_host_not_allowed") {
		t.Errorf("outside the list = %d %s", rec.Code, rec.Body)
	}
	allowed, _ := freeServer(t, map[string]string{"GRESBASE_ALLOWED_DB_HOSTS": "10.255.0.0/16," + form.Host})
	if rec := allowed.do(t, "POST", "/api/v1/auth/connect", form); rec.Code != http.StatusOK {
		t.Errorf("listed host = %d %s", rec.Code, rec.Body)
	}
}

func TestSetupChoosesFreeMode(t *testing.T) {
	h, _, _ := setupServer(t, nil)
	c := &caller{h: h, host: "localhost", peer: "127.0.0.1:1"}
	if rec := c.do(t, "POST", "/api/v1/setup", SetupRequest{Mode: "free"}); rec.Code != http.StatusOK ||
		!strings.Contains(rec.Body.String(), `"signed_in":false`) {
		t.Fatalf("complete = %d %s", rec.Code, rec.Body)
	}
	if rec := c.do(t, "GET", "/api/v1/config", nil); !strings.Contains(rec.Body.String(), `"free_mode":true`) ||
		!strings.Contains(rec.Body.String(), `"setup_required":false`) {
		t.Errorf("config = %s", rec.Body)
	}
	if rec := c.do(t, "POST", "/api/v1/auth/connect", formFor(t, pgtest.DSN(t))); rec.Code != http.StatusOK {
		t.Errorf("connect = %d %s", rec.Code, rec.Body)
	}
}
