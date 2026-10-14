package auth

import (
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/amtzespinosa/gresbase/internal/config"
)

func TestPasswordHash(t *testing.T) {
	h, err := HashPassword("correct horse")
	if err != nil {
		t.Fatal(err)
	}
	if !strings.HasPrefix(h, "$argon2id$v=19$m=65536,t=3,p=4$") || strings.Contains(h, "correct horse") {
		t.Fatalf("hash: %s", h)
	}
	h2, _ := HashPassword("correct horse")
	if h == h2 {
		t.Fatal("hashes must be salted")
	}
	for _, tc := range []struct {
		hash, pw string
		want     bool
	}{
		{h, "correct horse", true},
		{h, "correct horsE", false},
		{h, "", false},
		{"$argon2i$v=19$m=65536,t=3,p=4$c2FsdA$a2V5", "correct horse", false},
		{"plain", "plain", false},
		{strings.Replace(h, "m=65536", "m=99999999", 1), "correct horse", false},
	} {
		if got := VerifyPassword(tc.hash, tc.pw); got != tc.want {
			t.Errorf("VerifyPassword(%q, %q) = %v", tc.hash, tc.pw, got)
		}
	}
	for pw, ok := range map[string]bool{"1234567": false, "12345678": true, "ñññññññ": false, strings.Repeat("x", 257): false} {
		if (ValidatePassword(pw) == nil) != ok {
			t.Errorf("ValidatePassword(%q) ok=%v", pw, !ok)
		}
	}
}

// accountHarness wires an Auth backed by a settings store, like the server.
func accountHarness(t *testing.T, kv map[string]string) (*harness, *config.Store, string) {
	t.Helper()
	kv["DATABASE_URL"] = "postgres://u:p@db/app"
	kv["GRESBASE_DATA_DIR"] = t.TempDir()
	kv["GRESBASE_SESSION_TTL"] = "1h"
	store, cfg, err := config.Open(func(k string) string { return kv[k] })
	if err != nil {
		t.Fatal(err)
	}
	h := &harness{a: New(cfg, store), now: time.Date(2026, 1, 1, 12, 0, 0, 0, time.UTC), mux: http.NewServeMux()}
	h.a.now = func() time.Time { return h.now }
	h.mux.HandleFunc("POST /login", h.a.Login)
	h.mux.Handle("GET /session", h.a.Require(http.HandlerFunc(h.a.Session)))
	h.mux.Handle("POST /password", h.a.Require(http.HandlerFunc(h.a.ChangePassword)))
	h.mux.Handle("GET /admin", h.a.Require(RequireAdmin(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusNoContent)
	}))))
	return h, store, kv["GRESBASE_DATA_DIR"]
}

func setAdmin(t *testing.T, store *config.Store, user, pw string) {
	t.Helper()
	hash, err := HashPassword(pw)
	if err != nil {
		t.Fatal(err)
	}
	if err := store.SetAdmin(config.User{Username: user, PasswordHash: hash}); err != nil {
		t.Fatal(err)
	}
}

func TestFileAccount(t *testing.T) {
	h, store, dir := accountHarness(t, map[string]string{})
	if h.a.Enabled() {
		t.Fatal("no account yet: login must be off")
	}
	if rec, _ := h.login(t, "admin", "whatever"); rec.Code != http.StatusBadRequest {
		t.Fatalf("login without account: %d", rec.Code)
	}

	setAdmin(t, store, "admin", "first-password")
	if !h.a.Enabled() {
		t.Fatal("an account in the file enables login at runtime")
	}
	if rec := h.do("GET", "/session", "", nil, nil); rec.Code != http.StatusUnauthorized {
		t.Fatalf("local session must end once an account exists: %d", rec.Code)
	}
	if rec, _ := h.login(t, "admin", "wrong-password"); rec.Code != http.StatusUnauthorized {
		t.Fatalf("wrong password: %d", rec.Code)
	}
	rec, c := h.login(t, "admin", "first-password")
	if rec.Code != http.StatusOK || !strings.Contains(rec.Body.String(), `"role":"admin","account_locked":false`) {
		t.Fatalf("login: %d %s", rec.Code, rec.Body)
	}
	if rec := h.do("GET", "/admin", "", c, nil); rec.Code != http.StatusNoContent {
		t.Fatalf("admin route: %d", rec.Code)
	}

	// The account survives a restart (it lives in gresbase.json, hashed).
	raw, _ := os.ReadFile(filepath.Join(dir, config.FileName))
	if strings.Contains(string(raw), "first-password") || !strings.Contains(string(raw), `"password_hash": "$argon2id$`) {
		t.Fatalf("stored account: %s", raw)
	}
}

func TestEnvAccountWins(t *testing.T) {
	h, store, _ := accountHarness(t, map[string]string{"GRESBASE_USER": "root", "GRESBASE_PASSWORD": "env-password"})
	setAdmin(t, store, "admin", "file-password")
	if rec, _ := h.login(t, "admin", "file-password"); rec.Code != http.StatusUnauthorized {
		t.Fatalf("file account must be ignored while the env one exists: %d", rec.Code)
	}
	rec, c := h.login(t, "root", "env-password")
	if rec.Code != http.StatusOK || !strings.Contains(rec.Body.String(), `"account_locked":true`) {
		t.Fatalf("env login: %d %s", rec.Code, rec.Body)
	}
	if rec := h.do("POST", "/password", `{"current_password":"env-password","new_password":"another-one"}`, c, nil); rec.Code != http.StatusConflict ||
		!strings.Contains(rec.Body.String(), `"locked_by_env"`) {
		t.Fatalf("change env password: %d %s", rec.Code, rec.Body)
	}
}

func TestChangePasswordEndsOtherSessions(t *testing.T) {
	h, store, _ := accountHarness(t, map[string]string{})
	setAdmin(t, store, "admin", "first-password")
	_, mine := h.login(t, "admin", "first-password")
	_, other := h.login(t, "admin", "first-password")

	for _, tc := range []struct {
		body   string
		status int
	}{
		{`{"current_password":"nope-nope","new_password":"second-password"}`, http.StatusForbidden},
		{`{"current_password":"first-password","new_password":"short"}`, http.StatusBadRequest},
		{`{"current_password":`, http.StatusBadRequest},
	} {
		if rec := h.do("POST", "/password", tc.body, mine, nil); rec.Code != tc.status {
			t.Fatalf("%s: %d %s", tc.body, rec.Code, rec.Body)
		}
	}

	h.now = h.now.Add(loginWindow) // password changes share the login rate limit
	rec := h.do("POST", "/password", `{"current_password":"first-password","new_password":"second-password"}`, mine, nil)
	if rec.Code != http.StatusNoContent {
		t.Fatalf("change: %d %s", rec.Code, rec.Body)
	}
	var renewed *http.Cookie
	for _, c := range rec.Result().Cookies() {
		if c.Name == CookieName {
			renewed = c
		}
	}
	if renewed == nil {
		t.Fatal("the current session must get a renewed cookie")
	}
	if rec := h.do("GET", "/session", "", renewed, nil); rec.Code != http.StatusOK {
		t.Fatalf("renewed session: %d", rec.Code)
	}
	for name, c := range map[string]*http.Cookie{"other": other, "old cookie of this session": mine} {
		if rec := h.do("GET", "/session", "", c, nil); rec.Code != http.StatusUnauthorized {
			t.Fatalf("%s still valid: %d", name, rec.Code)
		}
	}
	if rec, _ := h.login(t, "admin", "first-password"); rec.Code != http.StatusUnauthorized {
		t.Fatal("old password still works")
	}
	if rec, _ := h.login(t, "admin", "second-password"); rec.Code != http.StatusOK {
		t.Fatal("new password does not work")
	}
}

func TestRequireAdmin(t *testing.T) {
	h := RequireAdmin(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(http.StatusNoContent) }))
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest("GET", "/", nil))
	if rec.Code != http.StatusForbidden {
		t.Fatalf("no session: %d", rec.Code)
	}
}
