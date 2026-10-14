package server

import (
	"context"
	"io/fs"
	"log/slog"
	"net/http"
	"runtime/debug"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"

	"github.com/amtzespinosa/gresbase/internal/api"
	"github.com/amtzespinosa/gresbase/internal/auth"
	"github.com/amtzespinosa/gresbase/internal/config"
	"github.com/amtzespinosa/gresbase/internal/pg/connections"
	"github.com/amtzespinosa/gresbase/internal/snippets"
	"github.com/amtzespinosa/gresbase/internal/ui"
)

// Options are the server dependencies.
type Options struct {
	Config   config.Config
	Version  string
	Logger   *slog.Logger
	UI       fs.FS           // compiled frontend; ui.Dist() in production
	Snippets *snippets.Store // nil only in tests that never touch saved queries
	// Connections are the databases; nil only in tests that never touch one.
	Connections *connections.Manager
	Settings    *config.Store // nil only in tests that never touch settings
}

// contentSecurityPolicy allows nothing outside our own origin. Inline styles are needed by the UI
// libraries (virtualized grid, Radix positioning), inline scripts are not allowed.
const contentSecurityPolicy = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; " +
	"img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; object-src 'none'; " +
	"base-uri 'self'; form-action 'self'; frame-ancestors 'none'"

// New returns the root handler with every route mounted under the configured base path.
func New(o Options) http.Handler {
	cfg := o.Config
	authn := auth.New(cfg, o.Settings)
	conns := o.Connections
	if conns == nil {
		conns = connections.New(cfg, o.Logger)
	}
	if o.Settings != nil {
		conns.SQLMaxRows = func() int { n, _ := strconv.Atoi(o.Settings.Value("sql_max_rows")); return n }
	}
	fm := &free{cfg: cfg, store: o.Settings, conns: conns, authn: authn, log: o.Logger}
	authn.SetFreeMode(fm.on, conns.Owns, conns.RemoveOwned)
	setup := newSetup(cfg, o.Settings, conns, authn, o.Logger)
	r := chi.NewRouter()

	r.Get("/healthz", func(w http.ResponseWriter, r *http.Request) {
		if setup.required() {
			api.WriteJSON(w, http.StatusOK, map[string]string{"status": "setup"})
			return
		}
		if c, release, err := conns.Acquire(r.Context(), connections.EnvID, ""); err == nil {
			defer release()
			ctx, cancel := context.WithTimeout(r.Context(), 2*time.Second)
			defer cancel()
			if err := c.Pool.Ping(ctx); err != nil {
				o.Logger.Warn("healthz: database ping failed", "err", err)
				api.WriteJSON(w, http.StatusServiceUnavailable, map[string]string{"status": "unavailable"})
				return
			}
		}
		api.WriteJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	})

	r.Route("/api", func(r chi.Router) {
		r.Get("/v1/config", func(w http.ResponseWriter, _ *http.Request) {
			bp := cfg.BasePath
			if bp == "" {
				bp = "/"
			}
			lang, loss := cfg.Lang, ""
			if o.Snippets == nil || !o.Snippets.Persistent {
				loss = config.LossNotWritable
			}
			maxRows := cfg.SQLMaxRows
			if o.Settings != nil {
				lang = strings.ToLower(o.Settings.Value("lang"))
				if o.Settings.Loss != "" {
					loss = o.Settings.Loss
				}
				if n, err := strconv.Atoi(o.Settings.Value("sql_max_rows")); err == nil {
					maxRows = n
				}
			}
			api.WriteJSON(w, http.StatusOK, ConfigResponse{
				Version:            o.Version,
				Lang:               lang,
				ReadOnly:           cfg.ReadOnly,
				AuthEnabled:        authn.Enabled(),
				BasePath:           bp,
				DataPersistent:     loss == "",
				DataLoss:           loss,
				StatementTimeoutMS: cfg.StatementTimeout.Milliseconds(),
				SQLMaxRows:         maxRows,
				SetupRequired:      setup.required(),
				FreeMode:           fm.on(),
				DBHost:             cfg.DBHost,
				DBPort:             cfg.DBPort,
				DBName:             cfg.DBName,
				DBUser:             cfg.DBUser,
			})
		})
		r.Post("/v1/auth/login", authn.Login)
		r.Post("/v1/auth/connect", fm.connect)
		r.Get("/v1/setup", setup.status)
		r.Post("/v1/setup", setup.complete)
		r.Post("/v1/setup/verify", setup.verify)
		r.Post("/v1/setup/test", setup.test)

		// Everything else under /api needs a session (the implicit local one when login is off).
		r.Group(func(r chi.Router) {
			r.Use(setup.block, authn.Require)
			r.Get("/v1/auth/session", authn.Session)
			r.Post("/v1/auth/logout", authn.Logout)
			r.Post("/v1/auth/password", authn.ChangePassword)
			// Database routes, on the default connection and on an explicit one (/v1/c/{connection}/…).
			r.Group(func(r chi.Router) { r.Use(withConn(conns)); dbRoutes(r, "/v1") })
			r.Group(func(r chi.Router) { r.Use(withConn(conns)); dbRoutes(r, "/v1/c/{connection}") })
			(&saved{cfg: cfg, store: o.Settings, conns: conns, log: o.Logger}).routes(r)
			if o.Settings != nil {
				st := api.Settings{Store: o.Settings}
				r.With(auth.RequireAdmin).Get("/v1/settings", st.Get)
				r.With(auth.RequireAdmin).Patch("/v1/settings", st.Patch)
			}
			if o.Snippets != nil {
				// Saved queries are shared files for the administrator; every other session (free mode)
				// gets its own private folder, keyed by its user@host:port/database.
				sn := api.Snippets{Store: o.Snippets, Owner: func(r *http.Request) string {
					if s, _ := auth.FromContext(r.Context()); s.Role != config.RoleAdmin {
						return s.User
					}
					return ""
				}}
				r.Get("/v1/snippets", sn.List)
				r.Post("/v1/snippets", sn.Create)
				r.Put("/v1/snippets", sn.Update)
				r.Delete("/v1/snippets", sn.Delete)
				r.Get("/v1/snippets/file", sn.Get)
				r.Post("/v1/snippets:move", sn.Move)
				r.Post("/v1/snippets/folders", sn.CreateFolder)
			}
		})
		r.NotFound(func(w http.ResponseWriter, _ *http.Request) {
			api.Fail(w, http.StatusNotFound, api.CodeNotFound, "no such API endpoint")
		})
		r.MethodNotAllowed(func(w http.ResponseWriter, _ *http.Request) {
			api.Fail(w, http.StatusMethodNotAllowed, api.CodeBadRequest, "method not allowed")
		})
	})

	r.Handle("/*", ui.Handler(o.UI, cfg.BasePath))

	h := auth.CSRF(r)
	// The Host guard applies while there is no account; the setup wizard can create one at runtime.
	open, guarded := h, auth.HostGuard(cfg.AllowedHosts, h)
	h = http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if authn.Enabled() || setup.open(r) {
			open.ServeHTTP(w, r)
			return
		}
		guarded.ServeHTTP(w, r)
	})
	if bp := cfg.BasePath; bp != "" {
		h = withBasePath(bp, h)
	}
	return middleware.RequestID(logRequests(o.Logger, recoverPanics(o.Logger, securityHeaders(h))))
}

func withBasePath(bp string, next http.Handler) http.Handler {
	stripped := http.StripPrefix(bp, next)
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch {
		case r.URL.Path == bp:
			http.Redirect(w, r, bp+"/", http.StatusMovedPermanently)
		case len(r.URL.Path) > len(bp) && r.URL.Path[:len(bp)+1] == bp+"/":
			stripped.ServeHTTP(w, r)
		default:
			http.NotFound(w, r)
		}
	})
}

func securityHeaders(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		h := w.Header()
		h.Set("Content-Security-Policy", contentSecurityPolicy)
		h.Set("X-Content-Type-Options", "nosniff")
		h.Set("Referrer-Policy", "no-referrer")
		h.Set("X-Frame-Options", "DENY")
		next.ServeHTTP(w, r)
	})
}

// recoverPanics logs the panic with its stack and answers a generic 500: no details reach the client.
func recoverPanics(log *slog.Logger, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		defer func() {
			if v := recover(); v != nil {
				if v == http.ErrAbortHandler {
					panic(v)
				}
				log.Error("panic serving request", "request_id", middleware.GetReqID(r.Context()),
					"panic", v, "stack", string(debug.Stack()))
				api.Fail(w, http.StatusInternalServerError, api.CodeInternal, "internal error")
			}
		}()
		next.ServeHTTP(w, r)
	})
}

func logRequests(log *slog.Logger, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		ww := middleware.NewWrapResponseWriter(w, r.ProtoMajor)
		next.ServeHTTP(ww, r)
		log.Info("request", "request_id", middleware.GetReqID(r.Context()), "method", r.Method,
			"path", r.URL.Path, "status", ww.Status(), "bytes", ww.BytesWritten(),
			"duration", time.Since(start))
	})
}
