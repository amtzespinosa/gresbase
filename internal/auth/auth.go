package auth

import (
	"context"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"log/slog"
	"math"
	"net"
	"net/http"
	"net/netip"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/amtzespinosa/gresbase/internal/api"
	"github.com/amtzespinosa/gresbase/internal/config"
)

// CookieName is the session cookie.
const CookieName = "gresbase_session"

// Failed attempts allowed per client IP and window (successful ones don't count).
const (
	loginAttempts = 5
	loginWindow   = time.Minute
)

// LocalSessionID identifies the single implicit session when login is disabled.
const LocalSessionID = "local"

// Session is the authenticated session attached to each request context.
type Session struct {
	ID      string // stable per login; per-session state (changesets, SQL transactions) keys on it
	User    string
	Role    string // config.RoleAdmin for the administrator and for the local session without login
	Expires time.Time
}

type ctxKey struct{}

// FromContext returns the request's session. Every handler behind Require has one.
func FromContext(ctx context.Context) (Session, bool) {
	s, ok := ctx.Value(ctxKey{}).(Session)
	return s, ok
}

// SessionID returns the session id of the request, or LocalSessionID when there is none.
func SessionID(ctx context.Context) string {
	if s, ok := FromContext(ctx); ok {
		return s.ID
	}
	return LocalSessionID
}

// Auth holds the account sources, the signing key, revoked sessions and the login rate limiter.
type Auth struct {
	envUser     string // GRESBASE_USER/GRESBASE_PASSWORD: when set, they win over the stored account
	envPassword config.Secret
	store       *config.Store // the administrator stored in gresbase.json; nil in some tests
	key         []byte
	ttl         time.Duration
	cookie      string // cookie path
	now         func() time.Time

	mu      sync.Mutex
	revoked map[string]time.Time // session id → expiry, until the cookie would expire anyway
	tries   map[string]window
	trusted []netip.Prefix // GRESBASE_TRUSTED_PROXIES

	free  func() bool
	alive func(session string) bool
	ended func(session string)
}

type window struct {
	start time.Time
	n     int
}

// New builds the authenticator from the configuration and the settings store (may be nil).
func New(cfg config.Config, store *config.Store) *Auth {
	path := cfg.BasePath + "/"
	a := &Auth{
		store:   store,
		key:     []byte(cfg.SessionSecret.Reveal()),
		ttl:     cfg.SessionTTL,
		cookie:  path,
		now:     time.Now,
		revoked: map[string]time.Time{},
		tries:   map[string]window{},
		trusted: cfg.TrustedProxies,
	}
	if cfg.AuthEnabled() {
		a.envUser, a.envPassword = cfg.User, cfg.Password
	}
	return a
}

// account is the administrator that can sign in: from the environment (locked) or from the file.
type account struct {
	user   string
	fp     string // fingerprint of the credential: changes with the password, ending other sessions
	locked bool
	check  func(password string) bool
}

func (a *Auth) account() (account, bool) {
	if a.envUser != "" {
		pw := a.envPassword.Reveal()
		return account{user: a.envUser, fp: fingerprint("env:" + pw), locked: true,
			check: func(p string) bool { return equal(p, pw) }}, true
	}
	if a.store != nil {
		if u, ok := a.store.Admin(); ok {
			return account{user: u.Username, fp: fingerprint(u.PasswordHash),
				check: func(p string) bool { return VerifyPassword(u.PasswordHash, p) }}, true
		}
	}
	return account{}, false
}

// Enabled reports whether login is required: there is an account in the environment or the file.
// It can change at runtime (the setup wizard creates the account).
func (a *Auth) Enabled() bool {
	_, ok := a.account()
	return ok || a.Free()
}

// freeFP is the credential fingerprint of free mode sessions: they are tied to their connection,
// not to an account.
const freeFP = "free"

// SetFreeMode makes Postgres credentials the login (free mode): free reports whether it is on,
// alive whether a session still has its connection and ended is called when a session signs out.
func (a *Auth) SetFreeMode(free func() bool, alive func(session string) bool, ended func(session string)) {
	a.free, a.alive, a.ended = free, alive, ended
}

// Free reports whether free mode is on.
func (a *Auth) Free() bool { return a.free != nil && a.free() }

// Require rejects requests without a valid session with 401. With login disabled it attaches the
// local session.
func (a *Auth) Require(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		s, ok := Session{ID: LocalSessionID, Role: config.RoleAdmin}, true
		if a.Free() {
			s, ok = a.session(r, func(_, fp string) bool { return fp == freeFP })
			ok = ok && a.alive(s.ID)
			s.Role = config.RoleUser
		} else if acc, enabled := a.account(); enabled {
			s, ok = a.session(r, func(user, fp string) bool { return user == acc.user && fp == acc.fp })
		}
		if !ok {
			api.Fail(w, http.StatusUnauthorized, api.CodeUnauthorized, "sign in required")
			return
		}
		next.ServeHTTP(w, r.WithContext(context.WithValue(r.Context(), ctxKey{}, s)))
	})
}

// SignInFree starts the free mode session id, labeled with the Postgres user and server, and
// returns its expiry.
func (a *Auth) SignInFree(w http.ResponseWriter, r *http.Request, id, label string) time.Time {
	return a.setCookie(w, r, id, account{user: label, fp: freeFP})
}

// FreeSessionID returns the session of the request's cookie, if it is a valid free mode one.
func (a *Auth) FreeSessionID(r *http.Request) (string, bool) {
	s, ok := a.session(r, func(_, fp string) bool { return fp == freeFP })
	return s.ID, ok
}

// TTL is the session lifetime.
func (a *Auth) TTL() time.Duration { return a.ttl }

// RequireAdmin answers 403 unless the session (behind Require) is an administrator's.
func RequireAdmin(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if s, ok := FromContext(r.Context()); !ok || s.Role != config.RoleAdmin {
			api.Fail(w, http.StatusForbidden, api.CodeForbidden, "administrators only")
			return
		}
		next.ServeHTTP(w, r)
	})
}

// Login checks the credentials (rate limited per IP) and sets the session cookie.
func (a *Auth) Login(w http.ResponseWriter, r *http.Request) {
	if !a.Limit(w, r) {
		return
	}
	acc, enabled := a.account()
	if !enabled || a.Free() {
		api.Fail(w, http.StatusBadRequest, api.CodeBadRequest, "login is disabled")
		return
	}
	var req LoginRequest
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 4096)).Decode(&req); err != nil {
		api.Fail(w, http.StatusBadRequest, api.CodeBadRequest, "invalid login body")
		return
	}
	// Check the password even for a wrong username, so both take the same time.
	userOK, passOK := equal(req.Username, acc.user), acc.check(req.Password)
	if !userOK || !passOK {
		a.Failed(r)
		api.Fail(w, http.StatusUnauthorized, api.CodeUnauthorized, "invalid username or password")
		return
	}
	exp := a.setCookie(w, r, randomID(), acc)
	api.WriteJSON(w, http.StatusOK, SessionResponse{AuthEnabled: true, Username: acc.user, Role: config.RoleAdmin,
		AccountLocked: acc.locked, ExpiresAt: &exp})
}

// setCookie issues the session cookie for session id and returns its expiry.
func (a *Auth) setCookie(w http.ResponseWriter, r *http.Request, id string, acc account) time.Time {
	exp := a.now().Add(a.ttl)
	// Secure follows the request scheme: plain HTTP on localhost must keep working.
	http.SetCookie(w, &http.Cookie{ //nolint:gosec // G124: Secure is set whenever the request is HTTPS
		Name:     CookieName,
		Value:    a.sign(exp, id, acc.user, acc.fp),
		Path:     a.cookie,
		Expires:  exp,
		MaxAge:   int(a.ttl.Seconds()),
		HttpOnly: true,
		Secure:   isHTTPS(r),
		SameSite: http.SameSiteStrictMode,
	})
	return exp
}

// ChangePassword replaces the password of the stored administrator (behind Require). It needs the
// current password, ends every other session and renews the cookie of this one.
func (a *Auth) ChangePassword(w http.ResponseWriter, r *http.Request) {
	if !a.Limit(w, r) {
		return
	}
	acc, enabled := a.account()
	switch {
	case !enabled:
		api.Fail(w, http.StatusBadRequest, api.CodeBadRequest, "login is disabled")
		return
	case acc.locked:
		api.Fail(w, http.StatusConflict, api.CodeLockedByEnv, "the account is defined by GRESBASE_USER/GRESBASE_PASSWORD")
		return
	}
	var req PasswordChange
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 4096)).Decode(&req); err != nil {
		api.Fail(w, http.StatusBadRequest, api.CodeBadRequest, "invalid body")
		return
	}
	// 403, not 401: the session is fine, only the confirmation failed.
	if !acc.check(req.CurrentPassword) {
		a.Failed(r)
		api.Fail(w, http.StatusForbidden, api.CodeForbidden, "the current password is incorrect")
		return
	}
	if err := ValidatePassword(req.NewPassword); err != nil {
		api.Fail(w, http.StatusBadRequest, api.CodeBadRequest, err.Error())
		return
	}
	hash, err := HashPassword(req.NewPassword)
	if err == nil {
		err = a.store.SetAdmin(config.User{Username: acc.user, PasswordHash: hash})
	}
	if err != nil {
		slog.Error("change password", "err", err)
		api.Fail(w, http.StatusInternalServerError, api.CodeInternal, "could not save the new password")
		return
	}
	acc.fp = fingerprint(hash)
	s, _ := FromContext(r.Context())
	a.setCookie(w, r, s.ID, acc)
	w.WriteHeader(http.StatusNoContent)
}

// Logout revokes the current session and clears the cookie.
func (a *Auth) Logout(w http.ResponseWriter, r *http.Request) {
	if s, ok := FromContext(r.Context()); ok && s.ID != LocalSessionID {
		a.mu.Lock()
		a.revoked[s.ID] = s.Expires
		a.mu.Unlock()
		if a.Free() {
			a.ended(s.ID) // closes its connection: the password leaves memory
		}
	}
	// Secure follows the request scheme: plain HTTP on localhost must keep working.
	http.SetCookie(w, &http.Cookie{ //nolint:gosec // G124: Secure is set whenever the request is HTTPS
		Name: CookieName, Value: "", Path: a.cookie, MaxAge: -1,
		HttpOnly: true, Secure: isHTTPS(r), SameSite: http.SameSiteStrictMode,
	})
	w.WriteHeader(http.StatusNoContent)
}

// Session returns the current session (behind Require).
func (a *Auth) Session(w http.ResponseWriter, r *http.Request) {
	s, _ := FromContext(r.Context())
	acc, _ := a.account()
	enabled := a.Enabled()
	res := SessionResponse{AuthEnabled: enabled, Username: s.User, Role: s.Role, AccountLocked: acc.locked && !a.Free()}
	if enabled {
		res.ExpiresAt = &s.Expires
	}
	api.WriteJSON(w, http.StatusOK, res)
}

// Cookie value: base64url("<unix expiry>|<session id>|<user>|<credential fingerprint>") + "." +
// base64url(HMAC-SHA256).
func (a *Auth) sign(exp time.Time, id, user, fp string) string {
	payload := base64.RawURLEncoding.EncodeToString([]byte(strconv.FormatInt(exp.Unix(), 10) + "|" + id + "|" + fp + "|" + user))
	return payload + "." + base64.RawURLEncoding.EncodeToString(a.mac(payload))
}

func (a *Auth) mac(payload string) []byte {
	m := hmac.New(sha256.New, a.key)
	m.Write([]byte(payload))
	return m.Sum(nil)
}

func (a *Auth) session(r *http.Request, accept func(user, fp string) bool) (Session, bool) {
	c, err := r.Cookie(CookieName)
	if err != nil {
		return Session{}, false
	}
	payload, sig, ok := strings.Cut(c.Value, ".")
	if !ok {
		return Session{}, false
	}
	got, err := base64.RawURLEncoding.DecodeString(sig)
	if err != nil || !hmac.Equal(got, a.mac(payload)) {
		return Session{}, false
	}
	raw, err := base64.RawURLEncoding.DecodeString(payload)
	if err != nil {
		return Session{}, false
	}
	parts := strings.SplitN(string(raw), "|", 4)
	if len(parts) != 4 {
		return Session{}, false
	}
	unix, err := strconv.ParseInt(parts[0], 10, 64)
	if err != nil {
		return Session{}, false
	}
	s := Session{ID: parts[1], User: parts[3], Role: config.RoleAdmin, Expires: time.Unix(unix, 0)}
	now := a.now()
	if !now.Before(s.Expires) || !accept(s.User, parts[2]) {
		return Session{}, false
	}
	a.mu.Lock()
	defer a.mu.Unlock()
	if _, gone := a.revoked[s.ID]; gone {
		return Session{}, false
	}
	for id, exp := range a.revoked { // ponytail: linear prune; logouts are rare
		if !now.Before(exp) {
			delete(a.revoked, id)
		}
	}
	return s, true
}

// blocked reports whether ip used its loginAttempts failures of the current window, and how long
// until the window ends.
func (a *Auth) blocked(ip string) (bool, time.Duration) {
	now := a.now()
	a.mu.Lock()
	defer a.mu.Unlock()
	w := a.tries[ip]
	if now.Sub(w.start) >= loginWindow || w.n < loginAttempts {
		return false, 0
	}
	return true, loginWindow - now.Sub(w.start)
}

// fail counts a failed attempt of ip, in a fixed window of loginWindow.
func (a *Auth) fail(ip string) {
	now := a.now()
	a.mu.Lock()
	defer a.mu.Unlock()
	w := a.tries[ip]
	if now.Sub(w.start) >= loginWindow {
		w = window{start: now}
	}
	w.n++
	a.tries[ip] = w
	if len(a.tries) > 10_000 {
		for k, v := range a.tries {
			if now.Sub(v.start) >= loginWindow {
				delete(a.tries, k)
			}
		}
	}
}

// equal compares in constant time, also hiding the length of the expected value.
func equal(got, want string) bool {
	g, w := sha256.Sum256([]byte(got)), sha256.Sum256([]byte(want))
	return subtle.ConstantTimeCompare(g[:], w[:]) == 1
}

func randomID() string {
	b := make([]byte, 16)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}

// peerIP is the direct peer of the connection.
func peerIP(r *http.Request) string {
	if host, _, err := net.SplitHostPort(r.RemoteAddr); err == nil {
		return host
	}
	return r.RemoteAddr
}

// clientIP is the client the rate limit counts. It is the direct peer, unless the peer is one of
// GRESBASE_TRUSTED_PROXIES: then X-Forwarded-For is read from the right (each proxy appends the
// address it saw) and the first address that is not a trusted proxy is the client. Anything to its
// left came from the client and could be forged, so it is never used.
func (a *Auth) clientIP(r *http.Request) string {
	peer := peerIP(r)
	if !a.isTrusted(peer) {
		return peer
	}
	hops := strings.Split(strings.Join(r.Header.Values("X-Forwarded-For"), ","), ",")
	for i := len(hops) - 1; i >= 0; i-- {
		hop := strings.TrimSpace(hops[i])
		if _, err := netip.ParseAddr(hop); err != nil {
			break // garbage: stop at the last address we can trust
		}
		if !a.isTrusted(hop) {
			return hop
		}
		peer = hop
	}
	return peer
}

func (a *Auth) isTrusted(ip string) bool {
	addr, err := netip.ParseAddr(ip)
	if err != nil {
		return false
	}
	addr = addr.Unmap()
	for _, p := range a.trusted {
		if p.Contains(addr) {
			return true
		}
	}
	return false
}

func isHTTPS(r *http.Request) bool {
	return r.TLS != nil || strings.EqualFold(r.Header.Get("X-Forwarded-Proto"), "https")
}

// CSRF rejects state-changing API requests without the X-Gresbase: 1 header. Browsers cannot send
// custom headers cross-site without a CORS preflight, which we never allow.
func CSRF(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodGet, http.MethodHead, http.MethodOptions:
		default:
			if strings.HasPrefix(r.URL.Path, "/api/") && r.Header.Get("X-Gresbase") != "1" {
				api.Fail(w, http.StatusForbidden, api.CodeForbidden, "missing X-Gresbase header")
				return
			}
		}
		next.ServeHTTP(w, r)
	})
}

// HostGuard is used when login is disabled: it only lets through requests whose Host is local or listed
// in GRESBASE_ALLOWED_HOSTS. It blocks accidental exposure and DNS rebinding. /healthz stays open so
// container healthchecks work from any address.
func HostGuard(allowed []string, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/healthz" || HostAllowed(r.Host, allowed) {
			next.ServeHTTP(w, r)
			return
		}
		if strings.HasPrefix(r.URL.Path, "/api/") {
			api.Fail(w, http.StatusForbidden, api.CodeForbidden, "host not allowed without login")
			return
		}
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		w.WriteHeader(http.StatusForbidden)
		_, _ = w.Write([]byte(hostPage))
	})
}

// HostAllowed reports whether host (as in the Host header, with or without port) is local or listed.
func HostAllowed(host string, allowed []string) bool {
	h := strings.ToLower(host)
	name := h
	if n, _, err := net.SplitHostPort(h); err == nil {
		name = n
	}
	name = strings.TrimSuffix(strings.TrimPrefix(name, "["), "]")
	switch name {
	case "localhost", "127.0.0.1", "::1":
		return true
	}
	for _, a := range allowed {
		if a == h || strings.TrimSuffix(strings.TrimPrefix(a, "["), "]") == name {
			return true
		}
	}
	return false
}

const hostPage = `<!doctype html><html><head><meta charset="utf-8"><title>gresbase</title>
<style>body{font:15px/1.5 system-ui,sans-serif;max-width:560px;margin:15vh auto;padding:0 16px;color:#1C1A17;background:#F4F3F0}code{font-size:13px}</style>
</head><body><h1>Access blocked</h1>
<p>Gresbase has no login configured, so it only answers on <code>localhost</code>.
Set <code>GRESBASE_USER</code> and <code>GRESBASE_PASSWORD</code> to enable login, or add this host to
<code>GRESBASE_ALLOWED_HOSTS</code>.</p>
<h1>Acceso bloqueado</h1>
<p>Gresbase no tiene login configurado, así que solo responde en <code>localhost</code>.
Define <code>GRESBASE_USER</code> y <code>GRESBASE_PASSWORD</code> para activar el login, o añade este host a
<code>GRESBASE_ALLOWED_HOSTS</code>.</p></body></html>`

// Limit applies the login rate limit (per client IP) to a sensitive endpoint: it answers 429 and
// returns false once the client has used its failed attempts. The endpoint reports each failure
// with Failed.
func (a *Auth) Limit(w http.ResponseWriter, r *http.Request) bool {
	if blocked, wait := a.blocked(a.clientIP(r)); blocked {
		w.Header().Set("Retry-After", strconv.Itoa(int(math.Ceil(wait.Seconds()))))
		api.Fail(w, http.StatusTooManyRequests, api.CodeRateLimited, "too many attempts")
		return false
	}
	return true
}

// Failed counts a failed attempt (wrong password, connection or token) against the client.
func (a *Auth) Failed(r *http.Request) { a.fail(a.clientIP(r)) }

// SignIn starts a session for the stored administrator, right after the setup wizard created it.
// It does nothing (false) when the account comes from the environment or there is none.
func (a *Auth) SignIn(w http.ResponseWriter, r *http.Request) bool {
	acc, ok := a.account()
	if !ok || acc.locked {
		return false
	}
	a.setCookie(w, r, randomID(), acc)
	return true
}

// Local reports whether the request comes from this machine: a loopback peer and a local Host
// (a DNS-rebinding page has a loopback peer but its own Host).
func Local(r *http.Request) bool {
	ip := net.ParseIP(peerIP(r))
	return ip != nil && ip.IsLoopback() && HostAllowed(r.Host, nil)
}
