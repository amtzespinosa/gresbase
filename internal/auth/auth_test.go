package auth

import (
	"net/http"
	"net/http/httptest"
	"net/netip"
	"strings"
	"testing"
	"time"

	"github.com/amtzespinosa/gresbase/internal/config"
)

func TestHostAllowed(t *testing.T) {
	tests := []struct {
		host    string
		allowed []string
		want    bool
	}{
		{"localhost", nil, true},
		{"localhost:18080", nil, true},
		{"LOCALHOST:8080", nil, true},
		{"127.0.0.1", nil, true},
		{"127.0.0.1:8080", nil, true},
		{"[::1]", nil, true},
		{"[::1]:8080", nil, true},
		{"", nil, false},
		{"example.com", nil, false},
		{"localhost.evil.com", nil, false},
		{"127.0.0.1.nip.io:8080", nil, false},
		{"192.168.1.10:8080", nil, false},
		{"gresbase.lan", []string{"gresbase.lan"}, true},
		{"gresbase.lan:8080", []string{"gresbase.lan"}, true},
		{"gresbase.lan:9090", []string{"gresbase.lan:8080"}, false},
		{"gresbase.lan:8080", []string{"gresbase.lan:8080"}, true},
		{"other.lan", []string{"gresbase.lan"}, false},
		{"[fd00::1]:8080", []string{"[fd00::1]"}, true},
	}
	for _, tt := range tests {
		if got := HostAllowed(tt.host, tt.allowed); got != tt.want {
			t.Errorf("HostAllowed(%q, %v) = %v, want %v", tt.host, tt.allowed, got, tt.want)
		}
	}
}

func TestHostGuard(t *testing.T) {
	ok := http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(http.StatusTeapot) })
	h := HostGuard([]string{"gresbase.lan"}, ok)
	tests := []struct {
		host, path string
		status     int
		bodyHas    string
	}{
		{"localhost:8080", "/api/v1/config", http.StatusTeapot, ""},
		{"gresbase.lan", "/tables", http.StatusTeapot, ""},
		{"evil.com", "/api/v1/config", http.StatusForbidden, `"code":"forbidden"`},
		{"evil.com", "/tables", http.StatusForbidden, "GRESBASE_ALLOWED_HOSTS"},
		{"evil.com", "/healthz", http.StatusTeapot, ""},
	}
	for _, tt := range tests {
		req := httptest.NewRequest("GET", tt.path, nil)
		req.Host = tt.host
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, req)
		if rec.Code != tt.status || !strings.Contains(rec.Body.String(), tt.bodyHas) {
			t.Errorf("%s %s: status %d body %q", tt.host, tt.path, rec.Code, rec.Body)
		}
	}
}

func TestCSRF(t *testing.T) {
	h := CSRF(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(http.StatusTeapot) }))
	tests := []struct {
		method, path, header string
		status               int
	}{
		{"GET", "/api/v1/config", "", http.StatusTeapot},
		{"POST", "/api/v1/auth/login", "", http.StatusForbidden},
		{"POST", "/api/v1/auth/login", "0", http.StatusForbidden},
		{"POST", "/api/v1/auth/login", "1", http.StatusTeapot},
		{"DELETE", "/api/v1/tables/public/x", "", http.StatusForbidden},
		{"PUT", "/api/v1/x", "1", http.StatusTeapot},
	}
	for _, tt := range tests {
		req := httptest.NewRequest(tt.method, tt.path, nil)
		if tt.header != "" {
			req.Header.Set("X-Gresbase", tt.header)
		}
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, req)
		if rec.Code != tt.status {
			t.Errorf("%s %s X-Gresbase=%q: status %d, want %d", tt.method, tt.path, tt.header, rec.Code, tt.status)
		}
	}
}

// harness wires login/logout/session like the server does, with a controllable clock.
type harness struct {
	a   *Auth
	now time.Time
	mux *http.ServeMux
}

func newHarness(t *testing.T) *harness {
	t.Helper()
	cfg := config.Config{
		User: "admin", Password: "s3cret", SessionSecret: config.Secret(strings.Repeat("k", 32)),
		SessionTTL: time.Hour, BasePath: "/gb",
	}
	h := &harness{a: New(cfg, nil), now: time.Date(2026, 1, 1, 12, 0, 0, 0, time.UTC), mux: http.NewServeMux()}
	h.a.now = func() time.Time { return h.now }
	h.mux.HandleFunc("POST /login", h.a.Login)
	h.mux.Handle("POST /logout", h.a.Require(http.HandlerFunc(h.a.Logout)))
	h.mux.Handle("GET /session", h.a.Require(http.HandlerFunc(h.a.Session)))
	return h
}

func (h *harness) do(method, path, body string, cookie *http.Cookie, mutate func(*http.Request)) *httptest.ResponseRecorder {
	req := httptest.NewRequest(method, path, strings.NewReader(body))
	req.RemoteAddr = "10.0.0.1:5555"
	if cookie != nil {
		req.AddCookie(cookie)
	}
	if mutate != nil {
		mutate(req)
	}
	rec := httptest.NewRecorder()
	h.mux.ServeHTTP(rec, req)
	return rec
}

func (h *harness) login(t *testing.T, user, pass string) (*httptest.ResponseRecorder, *http.Cookie) {
	t.Helper()
	rec := h.do("POST", "/login", `{"username":"`+user+`","password":"`+pass+`"}`, nil, nil)
	for _, c := range rec.Result().Cookies() {
		if c.Name == CookieName {
			return rec, c
		}
	}
	return rec, nil
}

func TestLoginFlow(t *testing.T) {
	h := newHarness(t)

	if rec, c := h.login(t, "admin", "wrong"); rec.Code != http.StatusUnauthorized || c != nil ||
		!strings.Contains(rec.Body.String(), `"code":"unauthorized"`) {
		t.Fatalf("wrong password: %d %s", rec.Code, rec.Body)
	}
	if rec, _ := h.login(t, "Admin", "s3cret"); rec.Code != http.StatusUnauthorized {
		t.Fatalf("wrong user: %d", rec.Code)
	}
	if rec := h.do("GET", "/session", "", nil, nil); rec.Code != http.StatusUnauthorized {
		t.Fatalf("no cookie: %d", rec.Code)
	}

	rec, c := h.login(t, "admin", "s3cret")
	if rec.Code != http.StatusOK || c == nil {
		t.Fatalf("login: %d %s", rec.Code, rec.Body)
	}
	if !c.HttpOnly || c.SameSite != http.SameSiteStrictMode || c.Secure || c.Path != "/gb/" || c.MaxAge != 3600 {
		t.Fatalf("cookie flags: %+v", c)
	}
	if strings.Contains(c.Value, "s3cret") {
		t.Fatal("cookie contains the password")
	}
	if rec := h.do("GET", "/session", "", c, nil); rec.Code != http.StatusOK ||
		!strings.Contains(rec.Body.String(), `"username":"admin"`) {
		t.Fatalf("session: %d %s", rec.Code, rec.Body)
	}

	// Tampered cookie.
	bad := *c
	bad.Value = strings.Replace(c.Value, c.Value[:4], "AAAA", 1)
	if rec := h.do("GET", "/session", "", &bad, nil); rec.Code != http.StatusUnauthorized {
		t.Fatalf("tampered cookie accepted: %d", rec.Code)
	}

	// Logout revokes the cookie even if the browser keeps it.
	if rec := h.do("POST", "/logout", "", c, nil); rec.Code != http.StatusNoContent ||
		!strings.Contains(rec.Header().Get("Set-Cookie"), "Max-Age=0") {
		t.Fatalf("logout: %d %v", rec.Code, rec.Header())
	}
	if rec := h.do("GET", "/session", "", c, nil); rec.Code != http.StatusUnauthorized {
		t.Fatalf("revoked cookie accepted: %d", rec.Code)
	}
}

func TestSessionExpires(t *testing.T) {
	h := newHarness(t)
	_, c := h.login(t, "admin", "s3cret")
	h.now = h.now.Add(59 * time.Minute)
	if rec := h.do("GET", "/session", "", c, nil); rec.Code != http.StatusOK {
		t.Fatalf("before expiry: %d", rec.Code)
	}
	h.now = h.now.Add(time.Minute)
	if rec := h.do("GET", "/session", "", c, nil); rec.Code != http.StatusUnauthorized {
		t.Fatalf("after expiry: %d", rec.Code)
	}
}

func TestSecureCookieBehindHTTPSProxy(t *testing.T) {
	h := newHarness(t)
	rec := h.do("POST", "/login", `{"username":"admin","password":"s3cret"}`, nil, func(r *http.Request) {
		r.Header.Set("X-Forwarded-Proto", "https")
	})
	if !strings.Contains(rec.Header().Get("Set-Cookie"), "Secure") {
		t.Fatalf("cookie not Secure: %q", rec.Header().Get("Set-Cookie"))
	}
}

func TestLoginRateLimit(t *testing.T) {
	h := newHarness(t)
	for i := range loginAttempts {
		if rec, _ := h.login(t, "admin", "nope"); rec.Code != http.StatusUnauthorized {
			t.Fatalf("attempt %d: %d", i+1, rec.Code)
		}
	}
	rec, _ := h.login(t, "admin", "s3cret") // even correct credentials are refused now
	if rec.Code != http.StatusTooManyRequests || rec.Header().Get("Retry-After") != "60" ||
		!strings.Contains(rec.Body.String(), `"code":"rate_limited"`) {
		t.Fatalf("6th attempt: %d %v %s", rec.Code, rec.Header(), rec.Body)
	}

	// X-Forwarded-For does not bypass the limit.
	spoofed := h.do("POST", "/login", `{"username":"admin","password":"s3cret"}`, nil, func(r *http.Request) {
		r.Header.Set("X-Forwarded-For", "1.2.3.4")
	})
	if spoofed.Code != http.StatusTooManyRequests {
		t.Fatalf("X-Forwarded-For bypassed the limit: %d", spoofed.Code)
	}

	// Another IP is not affected; the window resets after a minute.
	other := h.do("POST", "/login", `{"username":"admin","password":"s3cret"}`, nil, func(r *http.Request) {
		r.RemoteAddr = "10.0.0.2:1"
	})
	if other.Code != http.StatusOK {
		t.Fatalf("other IP: %d", other.Code)
	}
	h.now = h.now.Add(loginWindow)
	if rec, _ := h.login(t, "admin", "s3cret"); rec.Code != http.StatusOK {
		t.Fatalf("after window: %d", rec.Code)
	}
}

func TestRequireWithoutLogin(t *testing.T) {
	a := New(config.Config{SessionSecret: "x"}, nil)
	var got string
	h := a.Require(http.HandlerFunc(func(_ http.ResponseWriter, r *http.Request) { got = SessionID(r.Context()) }))
	h.ServeHTTP(httptest.NewRecorder(), httptest.NewRequest("GET", "/", nil))
	if got != LocalSessionID {
		t.Fatalf("session id = %q", got)
	}
}

func TestOnlyFailedAttemptsCount(t *testing.T) {
	h := newHarness(t)
	for i := range 3 * loginAttempts {
		if rec, _ := h.login(t, "admin", "s3cret"); rec.Code != http.StatusOK {
			t.Fatalf("good login %d: %d", i+1, rec.Code)
		}
	}
	for i := range loginAttempts - 1 {
		if rec, _ := h.login(t, "admin", "nope"); rec.Code != http.StatusUnauthorized {
			t.Fatalf("failure %d: %d", i+1, rec.Code)
		}
	}
	if rec, _ := h.login(t, "admin", "s3cret"); rec.Code != http.StatusOK {
		t.Fatalf("one failure left, good login: %d", rec.Code)
	}
	h.login(t, "admin", "nope")
	if rec, _ := h.login(t, "admin", "s3cret"); rec.Code != http.StatusTooManyRequests {
		t.Fatalf("after %d failures: %d", loginAttempts, rec.Code)
	}
}

func TestTrustedProxyClientIP(t *testing.T) {
	a := New(config.Config{TrustedProxies: []netip.Prefix{
		netip.MustParsePrefix("10.0.0.1/32"), netip.MustParsePrefix("172.16.0.0/12"),
	}}, nil)
	for _, tc := range []struct {
		peer string
		xff  []string
		want string
	}{
		{"203.0.113.9:1", []string{"1.2.3.4"}, "203.0.113.9"},                  // not a trusted proxy: header ignored
		{"10.0.0.1:1", nil, "10.0.0.1"},                                        // trusted, no header
		{"10.0.0.1:1", []string{"198.51.100.7"}, "198.51.100.7"},               // one proxy
		{"10.0.0.1:1", []string{"1.2.3.4, 198.51.100.7"}, "198.51.100.7"},      // forged left part ignored
		{"10.0.0.1:1", []string{"198.51.100.7, 172.16.3.4"}, "198.51.100.7"},   // two trusted hops
		{"10.0.0.1:1", []string{"198.51.100.7", "172.16.3.4"}, "198.51.100.7"}, // repeated headers
		{"10.0.0.1:1", []string{"nonsense, 172.16.3.4"}, "172.16.3.4"},         // garbage: stop at the last trusted
		{"[::ffff:10.0.0.1]:1", []string{"198.51.100.7"}, "198.51.100.7"},      // IPv4-mapped peer
	} {
		r := httptest.NewRequest("POST", "/login", nil)
		r.RemoteAddr = tc.peer
		for _, v := range tc.xff {
			r.Header.Add("X-Forwarded-For", v)
		}
		if got := a.clientIP(r); got != tc.want {
			t.Errorf("%s %v = %s, want %s", tc.peer, tc.xff, got, tc.want)
		}
	}
}

// Behind a trusted proxy, each client has its own limit: one locked out doesn't lock out the rest.
func TestRateLimitBehindTrustedProxy(t *testing.T) {
	h := newHarness(t)
	h.a.trusted = []netip.Prefix{netip.MustParsePrefix("10.0.0.1/32")} // the harness peer
	via := func(client string) func(*http.Request) {
		return func(r *http.Request) { r.Header.Set("X-Forwarded-For", client) }
	}
	for range loginAttempts {
		h.do("POST", "/login", `{"username":"admin","password":"nope"}`, nil, via("198.51.100.7"))
	}
	if rec := h.do("POST", "/login", `{"username":"admin","password":"s3cret"}`, nil, via("198.51.100.7")); rec.Code != http.StatusTooManyRequests {
		t.Fatalf("locked client: %d", rec.Code)
	}
	if rec := h.do("POST", "/login", `{"username":"admin","password":"s3cret"}`, nil, via("198.51.100.8")); rec.Code != http.StatusOK {
		t.Fatalf("another client behind the same proxy: %d", rec.Code)
	}
}
