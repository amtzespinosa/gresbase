package server

import (
	"bytes"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"testing/fstest"
	"time"

	"github.com/amtzespinosa/gresbase/internal/config"
)

var testUI = fstest.MapFS{
	"index.html":         {Data: []byte("<!doctype html><html><head><title>gresbase</title></head><body></body></html>")},
	"favicon.svg":        {Data: []byte("<svg/>")},
	"assets/index-a1.js": {Data: []byte("console.log(1)")},
}

func newTestServer(t *testing.T, basePath string) (http.Handler, *bytes.Buffer) {
	t.Helper()
	var logs bytes.Buffer
	return New(Options{
		Config:  config.Config{BasePath: basePath, Lang: "es", ReadOnly: true},
		Version: "v-test",
		Logger:  slog.New(slog.NewTextHandler(&logs, nil)),
		UI:      testUI,
	}), &logs
}

func get(h http.Handler, method, path string) *httptest.ResponseRecorder {
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(method, path, nil)
	req.Host = "localhost:8080"
	h.ServeHTTP(rec, req)
	return rec
}

func TestRoutes(t *testing.T) {
	tests := []struct {
		name, base, method, path string
		status                   int
		bodyHas, cache           string
	}{
		{"healthz", "", "GET", "/healthz", 200, `"status":"ok"`, ""},
		{"spa root", "", "GET", "/", 200, `<base href="/">`, "no-cache, no-store, must-revalidate"},
		{"spa deep route", "", "GET", "/tables/public/users", 200, "<title>gresbase</title>", "no-cache, no-store, must-revalidate"},
		{"index.html", "", "GET", "/index.html", 200, "<title>gresbase</title>", "no-cache, no-store, must-revalidate"},
		{"hashed asset", "", "GET", "/assets/index-a1.js", 200, "console.log", "public, max-age=31536000, immutable"},
		{"static file", "", "GET", "/favicon.svg", 200, "<svg/>", "no-cache"},
		{"missing asset", "", "GET", "/assets/nope.js", 404, "", ""},
		{"missing top-level file", "", "GET", "/nope.png", 404, "", ""},
		{"spa route with a dot", "", "GET", "/sql/reports%2Fmonthly.sql", 200, "<title>gresbase</title>", "no-cache, no-store, must-revalidate"},
		{"spa table with a dot", "", "GET", "/tables/public/v1.2", 200, "<title>gresbase</title>", "no-cache, no-store, must-revalidate"},
		{"api not found", "", "GET", "/api/v1/nope", 404, `"code":"not_found"`, ""},
		{"api is not spa", "", "GET", "/api/tables", 404, `"code":"not_found"`, ""},
		{"ui post", "", "POST", "/tables", 405, "", ""},
		{"base healthz", "/gresbase", "GET", "/gresbase/healthz", 200, `"status":"ok"`, ""},
		{"base spa", "/gresbase", "GET", "/gresbase/sql", 200, `<base href="/gresbase/">`, "no-cache, no-store, must-revalidate"},
		{"base asset", "/gresbase", "GET", "/gresbase/assets/index-a1.js", 200, "console.log", "public, max-age=31536000, immutable"},
		{"base config", "/gresbase", "GET", "/gresbase/api/v1/config", 200, `"base_path":"/gresbase"`, ""},
		{"outside base", "/gresbase", "GET", "/healthz", 404, "", ""},
		{"prefix lookalike", "/gresbase", "GET", "/gresbaseX/healthz", 404, "", ""},
		{"base redirect", "/gresbase", "GET", "/gresbase", 301, "", ""},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			h, _ := newTestServer(t, tt.base)
			rec := get(h, tt.method, tt.path)
			if rec.Code != tt.status {
				t.Fatalf("status = %d, want %d (body %q)", rec.Code, tt.status, rec.Body)
			}
			if !strings.Contains(rec.Body.String(), tt.bodyHas) {
				t.Errorf("body %q does not contain %q", rec.Body, tt.bodyHas)
			}
			if got := rec.Header().Get("Cache-Control"); tt.cache != "" && got != tt.cache {
				t.Errorf("Cache-Control = %q, want %q", got, tt.cache)
			}
		})
	}
}

func TestConfigEndpoint(t *testing.T) {
	h, _ := newTestServer(t, "")
	rec := get(h, "GET", "/api/v1/config")
	var got ConfigResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &got); err != nil {
		t.Fatal(err)
	}
	want := ConfigResponse{Version: "v-test", Lang: "es", ReadOnly: true, BasePath: "/", DataLoss: config.LossNotWritable}
	if got != want {
		t.Fatalf("config = %+v, want %+v", got, want)
	}
}

func TestSecurityHeaders(t *testing.T) {
	h, _ := newTestServer(t, "")
	for _, path := range []string{"/", "/healthz", "/api/v1/nope", "/assets/index-a1.js"} {
		rec := get(h, "GET", path)
		hd := rec.Header()
		csp := hd.Get("Content-Security-Policy")
		if !strings.Contains(csp, "default-src 'self'") || !strings.Contains(csp, "frame-ancestors 'none'") ||
			strings.Contains(csp, "http") {
			t.Errorf("%s: CSP = %q", path, csp)
		}
		if hd.Get("X-Content-Type-Options") != "nosniff" || hd.Get("X-Frame-Options") != "DENY" ||
			hd.Get("Referrer-Policy") != "no-referrer" {
			t.Errorf("%s: headers = %v", path, hd)
		}
	}
}

func TestRecoverPanicsHidesDetails(t *testing.T) {
	var logs bytes.Buffer
	h := recoverPanics(slog.New(slog.NewTextHandler(&logs, nil)), http.HandlerFunc(func(http.ResponseWriter, *http.Request) {
		panic("db password is hunter2")
	}))
	rec := get(h, "GET", "/")
	body, _ := io.ReadAll(rec.Body)
	if rec.Code != 500 || !strings.Contains(string(body), `"code":"internal"`) || strings.Contains(string(body), "hunter2") {
		t.Fatalf("status %d body %s", rec.Code, body)
	}
	if !strings.Contains(logs.String(), "panic serving request") {
		t.Fatalf("panic not logged: %s", logs.String())
	}
}

func TestMissingFrontend(t *testing.T) {
	h := New(Options{Logger: slog.New(slog.NewTextHandler(io.Discard, nil)), UI: fstest.MapFS{}})
	if rec := get(h, "GET", "/"); rec.Code != http.StatusServiceUnavailable {
		t.Fatalf("status = %d", rec.Code)
	}
}

func TestAuthWiring(t *testing.T) {
	newServer := func(user string) http.Handler {
		return New(Options{
			Config: config.Config{User: user, Password: config.Secret(user), SessionSecret: "k",
				SessionTTL: time.Hour, AllowedHosts: []string{"gresbase.lan"}},
			Logger: slog.New(slog.NewTextHandler(io.Discard, nil)),
			UI:     testUI,
		})
	}
	tests := []struct {
		name, user, method, path, host, csrf string
		status                               int
	}{
		{"no auth: local host", "", "GET", "/api/v1/auth/session", "localhost:18080", "", 200},
		{"no auth: allowed host", "", "GET", "/", "gresbase.lan", "", 200},
		{"no auth: foreign host", "", "GET", "/api/v1/config", "evil.com", "", 403},
		{"no auth: foreign host healthz", "", "GET", "/healthz", "evil.com", "", 200},
		{"no auth: login disabled", "", "POST", "/api/v1/auth/login", "localhost", "1", 400},
		{"auth: any host", "admin", "GET", "/api/v1/config", "evil.com", "", 200},
		{"auth: spa without session", "admin", "GET", "/login", "evil.com", "", 200},
		{"auth: session required", "admin", "GET", "/api/v1/connection", "evil.com", "", 401},
		{"auth: session endpoint", "admin", "GET", "/api/v1/auth/session", "evil.com", "", 401},
		{"auth: login without csrf", "admin", "POST", "/api/v1/auth/login", "evil.com", "", 403},
		{"auth: login with csrf", "admin", "POST", "/api/v1/auth/login", "evil.com", "1", 400},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			req := httptest.NewRequest(tt.method, tt.path, nil)
			req.Host = tt.host
			if tt.csrf != "" {
				req.Header.Set("X-Gresbase", tt.csrf)
			}
			rec := httptest.NewRecorder()
			newServer(tt.user).ServeHTTP(rec, req)
			if rec.Code != tt.status {
				t.Fatalf("status = %d, want %d (body %q)", rec.Code, tt.status, rec.Body)
			}
		})
	}
}
