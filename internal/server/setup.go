package server

import (
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/hex"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"os"
	"slices"
	"strings"
	"sync"

	"github.com/amtzespinosa/gresbase/internal/api"
	"github.com/amtzespinosa/gresbase/internal/auth"
	"github.com/amtzespinosa/gresbase/internal/config"
	"github.com/amtzespinosa/gresbase/internal/pg"
	"github.com/amtzespinosa/gresbase/internal/pg/connections"
)

// SetupTokenHeader carries the setup token of the wizard on non-local requests.
const SetupTokenHeader = "X-Gresbase-Setup-Token" //nolint:gosec // G101: a header name, not a credential

// setup is the first-run wizard: while Gresbase has no connection and setup was never completed,
// it is the only thing the app does.
type setup struct {
	cfg   config.Config
	store *config.Store
	conns *connections.Manager
	authn *auth.Auth
	log   *slog.Logger
	token string
	mu    sync.Mutex // one completion at a time
}

func newSetup(cfg config.Config, store *config.Store, conns *connections.Manager, authn *auth.Auth, log *slog.Logger) *setup {
	s := &setup{cfg: cfg, store: store, conns: conns, authn: authn, log: log, token: cfg.SetupToken.Reveal()}
	if s.token == "" {
		b := make([]byte, 16)
		_, _ = rand.Read(b)
		s.token = hex.EncodeToString(b)
	}
	if s.required() {
		attrs := []any{"path", cfg.BasePath + "/setup"}
		if cfg.SetupToken == "" {
			// Printed on purpose: whoever can read the logs owns the server anyway. The link carries
			// the token after "#", which browsers never send, so it stays out of proxy logs.
			attrs = []any{"path", cfg.BasePath + "/setup#token=" + s.token, "setup_token", s.token}
			if err := writeTokenFile(s.token); err != nil {
				log.Warn("could not write the setup token file", "err", err)
			}
		}
		log.Warn("SETUP MODE: no database configured. Open Gresbase in a browser to set it up; "+
			"requests from other machines need the setup token", attrs...)
	}
	return s
}

// writeTokenFile leaves the token where `gresbase setup-token` finds it. The file is created anew
// (O_EXCL) so a link planted at that path in a shared /tmp is never followed.
func writeTokenFile(token string) error {
	p := config.SetupTokenFile()
	_ = os.Remove(p)
	f, err := os.OpenFile(p, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0o600) //nolint:gosec // G304: a fixed path in the temp dir
	if err != nil {
		return err
	}
	_, err = f.WriteString(token + "\n")
	return errors.Join(err, f.Close())
}

// required reports whether the app is in setup mode: no connection at all (no DATABASE_URL, no
// saved one) and the wizard never completed.
func (s *setup) required() bool {
	return s.store != nil && !s.cfg.ModeFree && s.store.Mode() == "" && s.conns.DefaultID("") == ""
}

// tokenOK: local requests need no token; the others must send it.
func (s *setup) tokenOK(r *http.Request) bool {
	if auth.Local(r) {
		return true
	}
	g, w := sha256.Sum256([]byte(r.Header.Get(SetupTokenHeader))), sha256.Sum256([]byte(s.token))
	return subtle.ConstantTimeCompare(g[:], w[:]) == 1
}

// open lets through what the wizard needs (the SPA, /api/v1/config and /api/v1/setup*) from any
// Host while in setup mode; the setup endpoints check the token themselves.
func (s *setup) open(r *http.Request) bool {
	p := r.URL.Path
	return s.required() && (!strings.HasPrefix(p, "/api/") || p == "/api/v1/config" ||
		p == "/api/v1/setup" || strings.HasPrefix(p, "/api/v1/setup/"))
}

// block answers 409 setup_required on every session route while in setup mode.
func (s *setup) block(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if s.required() {
			api.Fail(w, http.StatusConflict, api.CodeSetupRequired, "Gresbase is not set up yet")
			return
		}
		next.ServeHTTP(w, r)
	})
}

func (s *setup) status(w http.ResponseWriter, r *http.Request) {
	res := SetupStatus{Required: s.required()}
	if res.Required {
		res.TokenRequired = !auth.Local(r)
		if res.TokenRequired && s.cfg.SetupToken == "" && config.InContainer() {
			res.Container, _ = os.Hostname()
		}
		res.DataPersistent, res.DataLoss = s.store.Loss == "", s.store.Loss
		for _, st := range s.store.Settings() {
			if st.Key == "lang" {
				res.LangLocked = st.Locked
			}
		}
		res.AccountLocked = s.cfg.AuthEnabled()
		if res.AccountLocked {
			res.AccountUsername = s.cfg.User
		}
		res.DBHost, res.DBPort, res.DBName, res.DBUser = s.cfg.DBHost, s.cfg.DBPort, s.cfg.DBName, s.cfg.DBUser
	}
	api.WriteJSON(w, http.StatusOK, res)
}

// guard runs the common checks of the setup POST endpoints: setup mode, rate limit and token.
func (s *setup) guard(w http.ResponseWriter, r *http.Request) bool {
	switch {
	case !s.required():
		api.Fail(w, http.StatusNotFound, api.CodeNotFound, "setup is already completed")
	case !s.authn.Limit(w, r):
	case !s.tokenOK(r):
		s.authn.Failed(r)
		api.Fail(w, http.StatusForbidden, api.CodeSetupToken, "a valid setup token is required")
	default:
		return true
	}
	return false
}

// verify checks the setup token alone (the wizard asks for it first).
func (s *setup) verify(w http.ResponseWriter, r *http.Request) {
	if s.guard(w, r) {
		w.WriteHeader(http.StatusNoContent)
	}
}

func (s *setup) test(w http.ResponseWriter, r *http.Request) {
	if !s.guard(w, r) {
		return
	}
	var in ConnectionInput
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 8192)).Decode(&in); err != nil {
		api.Fail(w, http.StatusBadRequest, api.CodeBadRequest, "invalid body")
		return
	}
	conn, password, err := normalizeConnection(in, s.cfg)
	if err != nil {
		api.Fail(w, http.StatusBadRequest, api.CodeBadRequest, err.Error())
		return
	}
	info, ok := probeDSN(w, r, s.cfg, conn.DSN(password), nil)
	if ok {
		api.WriteJSON(w, http.StatusOK, info)
	}
}

// probeDSN connects once and answers the failure itself (422 connection_failed with the reason, or
// unsupported_version).
func probeDSN(w http.ResponseWriter, r *http.Request, cfg config.Config, dsn config.Secret, allowed []string) (ConnectionTest, bool) {
	cfg.DatabaseURL = dsn
	info, err := pg.Probe(r.Context(), cfg, allowed)
	var ce *pg.ConnectError
	switch {
	case errors.As(err, &ce) && ce.Kind == pg.KindUnsupported:
		api.Fail(w, http.StatusUnprocessableEntity, api.CodeUnsupportedVersion, ce.Err.Error())
		return ConnectionTest{}, false
	case errors.As(err, &ce):
		// The pgconn message names host, user and database but never the password.
		api.WriteError(w, http.StatusUnprocessableEntity, api.Error{Code: api.CodeConnectionFailed,
			Message: ce.Err.Error(), Reason: ce.Kind})
		return ConnectionTest{}, false
	case err != nil:
		api.Fail(w, http.StatusInternalServerError, api.CodeInternal, "connection test failed")
		return ConnectionTest{}, false
	}
	return ConnectionTest{ServerVersion: info.ServerVersion, ServerVersionNum: info.ServerVersionNum,
		SupportLevel: string(info.SupportLevel)}, true
}

func (s *setup) complete(w http.ResponseWriter, r *http.Request) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if !s.guard(w, r) {
		return
	}
	var req SetupRequest
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 16384)).Decode(&req); err != nil {
		api.Fail(w, http.StatusBadRequest, api.CodeBadRequest, "invalid body")
		return
	}
	if req.Lang != "" && req.Lang != "en" && req.Lang != "es" {
		api.Fail(w, http.StatusBadRequest, api.CodeBadRequest, "lang must be en or es")
		return
	}
	var (
		admin    *config.User
		conn     *config.SavedConnection
		password string
	)
	switch req.Mode {
	case config.ModeFree:
	case config.ModeSaved:
		if !s.cfg.AuthEnabled() {
			if req.Admin == nil || strings.TrimSpace(req.Admin.Username) == "" {
				api.Fail(w, http.StatusBadRequest, api.CodeBadRequest, "an administrator is required")
				return
			}
			if err := auth.ValidatePassword(req.Admin.Password); err != nil {
				api.Fail(w, http.StatusBadRequest, api.CodeBadRequest, err.Error())
				return
			}
			hash, err := auth.HashPassword(req.Admin.Password)
			if err != nil {
				api.Fail(w, http.StatusInternalServerError, api.CodeInternal, "could not hash the password")
				return
			}
			admin = &config.User{Username: strings.TrimSpace(req.Admin.Username), PasswordHash: hash}
		}
		if req.Connection == nil {
			api.Fail(w, http.StatusBadRequest, api.CodeBadRequest, "a connection is required")
			return
		}
		c, pw, err := normalizeConnection(*req.Connection, s.cfg)
		if err != nil {
			api.Fail(w, http.StatusBadRequest, api.CodeBadRequest, err.Error())
			return
		}
		if _, ok := probeDSN(w, r, s.cfg, c.DSN(pw), nil); !ok {
			return
		}
		c.ID = "c" + randomHex(4)
		conn, password = &c, pw
	default:
		api.Fail(w, http.StatusBadRequest, api.CodeBadRequest, "mode must be saved or free")
		return
	}
	if err := s.store.CompleteSetup(req.Mode, req.Lang, admin, conn, password); err != nil {
		s.log.Error("complete setup", "err", err)
		api.Fail(w, http.StatusInternalServerError, api.CodeInternal, "could not save the configuration")
		return
	}
	if conn != nil {
		s.conns.Add(connections.Connection{ID: conn.ID, Source: connections.Saved, DSN: conn.DSN(password),
			ReadOnly: conn.ReadOnly})
	}
	if s.cfg.SetupToken == "" {
		_ = os.Remove(config.SetupTokenFile())
	}
	s.log.Info("setup completed", "mode", req.Mode)
	api.WriteJSON(w, http.StatusOK, SetupResult{SignedIn: s.authn.SignIn(w, r)})
}

// SSL modes accepted in connection forms.
var sslModes = []string{"disable", "prefer", "require", "verify-ca", "verify-full"}

// normalizeConnection validates a connection form and applies GRESBASE_DB_HOST/PORT/NAME/USER,
// which fix those fields whatever the form says.
func normalizeConnection(in ConnectionInput, cfg config.Config) (config.SavedConnection, string, error) {
	c := config.SavedConnection{
		Host: strings.TrimSpace(in.Host), Port: in.Port, Database: strings.TrimSpace(in.Database),
		User: strings.TrimSpace(in.User), SSLMode: in.SSLMode, ReadOnly: in.ReadOnly,
	}
	if cfg.DBHost != "" {
		c.Host = cfg.DBHost
	}
	if cfg.DBPort != 0 {
		c.Port = cfg.DBPort
	}
	if cfg.DBName != "" {
		c.Database = cfg.DBName
	}
	if cfg.DBUser != "" {
		c.User = cfg.DBUser
	}
	if c.Port == 0 {
		c.Port = 5432
	}
	if c.SSLMode == "" {
		c.SSLMode = "prefer"
	}
	switch {
	case c.Host == "" || strings.ContainsAny(c.Host, "/ \t\r\n@?#"):
		return c, "", errors.New("host must be a host name or an IP address")
	case c.Port < 1 || c.Port > 65535:
		return c, "", errors.New("port must be between 1 and 65535")
	case c.User == "":
		return c, "", errors.New("user is required")
	case !slices.Contains(sslModes, c.SSLMode):
		return c, "", errors.New("sslmode must be one of " + strings.Join(sslModes, ", "))
	}
	c.Name = c.Database
	if c.Name == "" {
		c.Name = c.User
	}
	return c, in.Password, nil
}

func randomHex(n int) string {
	b := make([]byte, n)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}
