package server

import (
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net/http"

	"github.com/amtzespinosa/gresbase/internal/api"
	"github.com/amtzespinosa/gresbase/internal/auth"
	"github.com/amtzespinosa/gresbase/internal/config"
	"github.com/amtzespinosa/gresbase/internal/pg"
	"github.com/amtzespinosa/gresbase/internal/pg/connections"
)

// freePoolSize is the pool of each free mode session.
const freePoolSize = 3

// free is free mode, like Adminer: Postgres credentials are the login and each session gets its
// own adhoc connection. The password lives only in that connection, in server memory.
type free struct {
	cfg   config.Config
	store *config.Store
	conns *connections.Manager
	authn *auth.Auth
	log   *slog.Logger
}

// on reports whether free mode is active: forced by GRESBASE_MODE_FREE or chosen in the wizard
// (and DATABASE_URL has not been added since).
func (f *free) on() bool {
	return f.cfg.ModeFree || (f.store != nil && f.store.Mode() == config.ModeFree && f.cfg.DatabaseURL == "")
}

// connect checks the credentials by connecting and starts a session with its own connection. A
// session that connects again (switch connection) leaves its previous connection.
func (f *free) connect(w http.ResponseWriter, r *http.Request) {
	if !f.on() {
		api.Fail(w, http.StatusNotFound, api.CodeNotFound, "free mode is off")
		return
	}
	if !f.authn.Limit(w, r) {
		return
	}
	var in ConnectionInput
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 8192)).Decode(&in); err != nil {
		api.Fail(w, http.StatusBadRequest, api.CodeBadRequest, "invalid body")
		return
	}
	in.ReadOnly = false
	c, password, err := normalizeConnection(in, f.cfg)
	if err != nil {
		api.Fail(w, http.StatusBadRequest, api.CodeBadRequest, err.Error())
		return
	}
	if len(f.cfg.AllowedDBHosts) > 0 {
		if _, err := pg.AllowedAddrs(r.Context(), c.Host, f.cfg.AllowedDBHosts); errors.Is(err, pg.ErrHostNotAllowed) {
			api.Fail(w, http.StatusForbidden, api.CodeDBHostNotAllowed, "this server is not in GRESBASE_ALLOWED_DB_HOSTS")
			return
		}
	}
	prev, hadPrev := f.authn.FreeSessionID(r)
	if hadPrev && !f.conns.Owns(prev) {
		hadPrev = false
	}
	if n := f.conns.Adhoc(); n >= f.cfg.MaxSessions && !hadPrev {
		api.Fail(w, http.StatusServiceUnavailable, api.CodeTooManySessions, "too many free mode sessions")
		return
	}
	dsn := c.DSN(password)
	if _, ok := probeDSN(w, r, f.cfg, dsn, f.cfg.AllowedDBHosts); !ok {
		f.authn.Failed(r)
		return
	}
	if hadPrev {
		f.conns.RemoveOwned(prev)
	}
	id := randomHex(16)
	// Also the key of the session's private saved queries, so it names the server fully.
	label := fmt.Sprintf("%s@%s:%d/%s", c.User, c.Host, c.Port, c.Name)
	exp := f.authn.SignInFree(w, r, id, label)
	f.conns.Add(connections.Connection{ID: "s" + randomHex(8), Source: connections.Adhoc, DSN: dsn, Owner: id,
		MaxConns: freePoolSize, AllowedHosts: f.cfg.AllowedDBHosts, Expires: exp})
	f.log.Info("free mode session started", "database", config.RedactDSN(dsn.Reveal()))
	api.WriteJSON(w, http.StatusOK, auth.SessionResponse{AuthEnabled: true, Username: label, Role: config.RoleUser,
		ExpiresAt: &exp})
}
