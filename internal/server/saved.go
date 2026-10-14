package server

import (
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"slices"
	"strings"
	"unicode/utf8"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgconn"

	"github.com/amtzespinosa/gresbase/internal/api"
	"github.com/amtzespinosa/gresbase/internal/auth"
	"github.com/amtzespinosa/gresbase/internal/config"
	"github.com/amtzespinosa/gresbase/internal/pg/connections"
)

// saved serves the saved connections: the list for the selector and, for the administrator, their
// management. Passwords go into the store sealed and never come back out of the API.
type saved struct {
	cfg   config.Config
	store *config.Store
	conns *connections.Manager
	log   *slog.Logger
}

func (s *saved) routes(r chi.Router) {
	r.Get("/v1/connections", s.list)
	a := r.With(auth.RequireAdmin)
	a.Post("/v1/connections", s.create)
	a.Post("/v1/connections:test", s.test)
	a.Put("/v1/connections/{id}", s.update)
	a.Delete("/v1/connections/{id}", s.delete)
}

func (s *saved) list(w http.ResponseWriter, r *http.Request) {
	session, _ := auth.FromContext(r.Context())
	res := ConnectionList{DefaultID: s.conns.DefaultID(auth.SessionID(r.Context())), Connections: []ConnectionEntry{}}
	if session.Role != config.RoleAdmin {
		api.WriteJSON(w, http.StatusOK, res)
		return
	}
	if s.cfg.DatabaseURL != "" {
		e := ConnectionEntry{ID: connections.EnvID, Source: string(connections.Env), Color: "gray",
			ReadOnly: s.cfg.ReadOnly, Locked: true}
		if pc, err := pgconn.ParseConfig(s.cfg.DatabaseURL.Reveal()); err == nil {
			e.Host, e.Port, e.Database, e.User = pc.Host, int(pc.Port), pc.Database, pc.User
		}
		e.Name = e.Database
		res.Connections = append(res.Connections, e)
	}
	if s.store != nil {
		for _, c := range s.store.Connections() {
			res.Connections = append(res.Connections, entry(c, s.cfg.ReadOnly))
		}
	}
	api.WriteJSON(w, http.StatusOK, res)
}

func entry(c config.SavedConnection, globalRO bool) ConnectionEntry {
	color := c.Color
	if color == "" {
		color = "gray"
	}
	return ConnectionEntry{ID: c.ID, Source: string(connections.Saved), Name: c.Name, Color: color,
		Host: c.Host, Port: c.Port, Database: c.Database, User: c.User, SSLMode: c.SSLMode,
		ReadOnly: c.ReadOnly || globalRO}
}

// input validates a connection form with its name and color.
func (s *saved) input(w http.ResponseWriter, r *http.Request) (config.SavedConnection, string, bool) {
	var in SavedConnectionInput
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 8192)).Decode(&in); err != nil {
		api.Fail(w, http.StatusBadRequest, api.CodeBadRequest, "invalid body")
		return config.SavedConnection{}, "", false
	}
	c, password, err := normalizeConnection(in.Connection, s.cfg)
	if err == nil {
		if name := strings.TrimSpace(in.Name); name != "" {
			c.Name = name
		}
		c.Color = in.Color
		switch {
		case utf8.RuneCountInString(c.Name) > 100:
			err = errors.New("name must be at most 100 characters")
		case c.Color != "" && !slices.Contains(config.LabelColors, c.Color):
			err = errors.New("color must be one of " + strings.Join(config.LabelColors, ", "))
		}
	}
	if err != nil {
		api.Fail(w, http.StatusBadRequest, api.CodeBadRequest, err.Error())
		return config.SavedConnection{}, "", false
	}
	return c, password, true
}

func (s *saved) create(w http.ResponseWriter, r *http.Request) {
	if !s.writable(w) {
		return
	}
	c, password, ok := s.input(w, r)
	if !ok {
		return
	}
	c.ID = "c" + randomHex(4)
	if err := s.store.PutConnection(c, &password); err != nil {
		s.fail(w, err)
		return
	}
	s.conns.Add(connections.Connection{ID: c.ID, Source: connections.Saved, DSN: c.DSN(password), ReadOnly: c.ReadOnly})
	s.log.Info("connection saved", "connection", c.ID)
	api.WriteJSON(w, http.StatusCreated, entry(c, s.cfg.ReadOnly))
}

func (s *saved) update(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if !s.writable(w) || !s.exists(w, id) {
		return
	}
	c, password, ok := s.input(w, r)
	if !ok {
		return
	}
	c.ID = id
	var pw *string // empty: keep the stored password
	if password != "" {
		pw = &password
	}
	if err := s.store.PutConnection(c, pw); err != nil {
		s.fail(w, err)
		return
	}
	// Replaces (and closes) the open pool: the next request connects with the new settings.
	s.conns.Add(connections.Connection{ID: id, Source: connections.Saved, DSN: s.store.ConnectionDSN(c), ReadOnly: c.ReadOnly})
	s.log.Info("connection updated", "connection", id)
	api.WriteJSON(w, http.StatusOK, entry(c, s.cfg.ReadOnly))
}

func (s *saved) delete(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if !s.writable(w) || !s.exists(w, id) {
		return
	}
	if err := s.store.DeleteConnection(id); err != nil {
		s.fail(w, err)
		return
	}
	s.conns.Remove(id)
	s.log.Info("connection deleted", "connection", id)
	w.WriteHeader(http.StatusNoContent)
}

func (s *saved) test(w http.ResponseWriter, r *http.Request) {
	var in ConnectionTestRequest
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 8192)).Decode(&in); err != nil {
		api.Fail(w, http.StatusBadRequest, api.CodeBadRequest, "invalid body")
		return
	}
	c, password, err := normalizeConnection(in.Connection, s.cfg)
	if err != nil {
		api.Fail(w, http.StatusBadRequest, api.CodeBadRequest, err.Error())
		return
	}
	dsn := c.DSN(password)
	if password == "" && in.ID != "" && s.store != nil {
		if _, ok := s.store.Connection(in.ID); ok {
			c.ID = in.ID // the form's fields with the stored password
			dsn = s.store.ConnectionDSN(c)
		}
	}
	if info, ok := probeDSN(w, r, s.cfg, dsn, nil); ok {
		api.WriteJSON(w, http.StatusOK, info)
	}
}

// writable: the env connection and free mode have nothing to manage; without a store, no saving.
func (s *saved) writable(w http.ResponseWriter) bool {
	if s.store == nil || s.cfg.ModeFree || s.store.Mode() == config.ModeFree {
		api.Fail(w, http.StatusNotFound, api.CodeNotFound, "saved connections are not available")
		return false
	}
	return true
}

func (s *saved) exists(w http.ResponseWriter, id string) bool {
	if id == connections.EnvID {
		api.Fail(w, http.StatusConflict, api.CodeLockedByEnv, "the DATABASE_URL connection cannot be changed")
		return false
	}
	if _, ok := s.store.Connection(id); !ok {
		api.Fail(w, http.StatusNotFound, api.CodeNotFound, "no such connection")
		return false
	}
	return true
}

func (s *saved) fail(w http.ResponseWriter, err error) {
	s.log.Error("save connection", "err", err)
	api.Fail(w, http.StatusInternalServerError, api.CodeInternal, "could not save the configuration")
}
