package main

import (
	"bytes"
	"context"
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/amtzespinosa/gresbase/internal/config"
	"github.com/amtzespinosa/gresbase/internal/pgtest"
)

func TestMain(m *testing.M) { pgtest.Main(m) }

func TestRunPrintsVersion(t *testing.T) {
	var out bytes.Buffer
	if code := run([]string{"version"}, &out, io.Discard, nil); code != 0 {
		t.Fatalf("exit code = %d, want 0", code)
	}
	if got, want := out.String(), "gresbase dev\n"; got != want {
		t.Fatalf("output = %q, want %q", got, want)
	}
}

func TestSetupTokenCommand(t *testing.T) {
	t.Setenv("TMPDIR", t.TempDir())
	token := func(env map[string]string) (string, int) {
		var out bytes.Buffer
		code := run([]string{"setup-token"}, &out, io.Discard, func(k string) string { return env[k] })
		return out.String(), code
	}
	if out, code := token(nil); code != 1 || out != "" {
		t.Errorf("not in setup mode = %q %d", out, code)
	}
	if out, code := token(map[string]string{"GRESBASE_SETUP_TOKEN": "from-the-environment"}); code != 0 || out != "from-the-environment\n" {
		t.Errorf("env token = %q %d", out, code)
	}
	if err := os.WriteFile(config.SetupTokenFile(), []byte("0123abcd\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	if out, code := token(nil); code != 0 || out != "0123abcd\n" {
		t.Errorf("generated token = %q %d", out, code)
	}
}

func TestRunRejectsBadConfig(t *testing.T) {
	var errOut bytes.Buffer
	code := run(nil, io.Discard, &errOut, func(k string) string {
		if k == "GRESBASE_PORT" {
			return "http"
		}
		return ""
	})
	if code != 1 || !strings.Contains(errOut.String(), "GRESBASE_PORT") {
		t.Fatalf("code %d, stderr %q", code, errOut.String())
	}
}

// syncBuffer lets the server goroutine write logs while the test reads them.
type syncBuffer struct {
	mu sync.Mutex
	b  bytes.Buffer
}

func (s *syncBuffer) Write(p []byte) (int, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.b.Write(p)
}

func (s *syncBuffer) String() string {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.b.String()
}

func TestServeNeverLeaksPassword(t *testing.T) {
	password := pgtest.Password
	env := map[string]string{
		"DATABASE_URL":       pgtest.DSN(t),
		"GRESBASE_LOG_LEVEL": "debug",
		"GRESBASE_DATA_DIR":  t.TempDir(),
	}
	for _, format := range []string{"text", "json"} {
		t.Run(format, func(t *testing.T) {
			env["GRESBASE_LOG_FORMAT"] = format
			ln, err := net.Listen("tcp", "127.0.0.1:0")
			if err != nil {
				t.Fatal(err)
			}
			var logs syncBuffer
			ctx, cancel := context.WithCancel(context.Background())
			done := make(chan error, 1)
			go func() { done <- serve(ctx, func(k string) string { return env[k] }, &logs, ln) }()

			base := "http://" + ln.Addr().String()
			var bodies strings.Builder
			for _, p := range []string{"/api/v1/config", "/api/v1/connection", "/healthz", "/api/v1/nope", "/tables"} {
				resp, err := http.Get(base + p)
				if err != nil {
					t.Fatal(err)
				}
				b, _ := io.ReadAll(resp.Body)
				_ = resp.Body.Close()
				bodies.Write(b)
			}
			cancel()
			if err := <-done; err != nil {
				t.Fatalf("serve: %v", err)
			}

			all := logs.String() + bodies.String()
			if strings.Contains(all, password) {
				t.Fatalf("password leaked:\n%s", all)
			}
			if !strings.Contains(logs.String(), pgtest.User+":****@") || !strings.Contains(bodies.String(), `"version":"dev"`) ||
				!strings.Contains(bodies.String(), `"database":"app"`) {
				t.Fatalf("unexpected output:\n%s", all)
			}
		})
	}
}

func TestHealthcheck(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/gb/healthz" {
			w.WriteHeader(http.StatusOK)
			return
		}
		w.WriteHeader(http.StatusServiceUnavailable)
	}))
	u, _ := url.Parse(srv.URL)
	tests := []struct {
		name string
		env  map[string]string
		want int
	}{
		{"healthy", map[string]string{"GRESBASE_PORT": u.Port(), "GRESBASE_BASE_PATH": "/gb/"}, 0},
		{"unhealthy status", map[string]string{"GRESBASE_PORT": u.Port()}, 1},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := run([]string{"healthcheck"}, io.Discard, io.Discard, func(k string) string { return tt.env[k] }); got != tt.want {
				t.Fatalf("exit = %d, want %d", got, tt.want)
			}
		})
	}
	srv.Close()
	start := time.Now()
	if got := run([]string{"healthcheck"}, io.Discard, io.Discard, func(k string) string {
		return map[string]string{"GRESBASE_PORT": u.Port()}[k]
	}); got != 1 || time.Since(start) > 5*time.Second {
		t.Fatalf("down server: exit = %d", got)
	}
}

func TestServeExplainsUnreachableDatabase(t *testing.T) {
	const password = "Unreachable-PW-42"
	env := map[string]string{
		"DATABASE_URL":      "postgres://app:" + password + "@127.0.0.1:1/app?sslmode=disable",
		"GRESBASE_DATA_DIR": t.TempDir(),
	}
	ctx, cancel := context.WithTimeout(context.Background(), 1500*time.Millisecond)
	defer cancel()
	var logs syncBuffer
	err := serve(ctx, func(k string) string { return env[k] }, &logs, nil)
	if err == nil || !strings.Contains(err.Error(), "connection_refused") || !strings.Contains(err.Error(), "hint:") {
		t.Fatalf("err = %v", err)
	}
	if all := err.Error() + logs.String(); strings.Contains(all, password) {
		t.Fatalf("password leaked:\n%s", all)
	}
}
