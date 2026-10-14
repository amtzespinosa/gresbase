// Command gresbase is a web manager for PostgreSQL.
package main

import (
	"context"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net"
	"net/http"
	"os"
	"os/signal"
	"strconv"
	"strings"
	"syscall"
	"time"

	"github.com/amtzespinosa/gresbase/internal/config"
	"github.com/amtzespinosa/gresbase/internal/pg"
	"github.com/amtzespinosa/gresbase/internal/pg/connections"
	"github.com/amtzespinosa/gresbase/internal/server"
	"github.com/amtzespinosa/gresbase/internal/snippets"
	"github.com/amtzespinosa/gresbase/internal/ui"
)

// version is set at build time with -ldflags "-X main.version=…".
var version = "dev"

const shutdownTimeout = 10 * time.Second

func main() {
	os.Exit(run(os.Args[1:], os.Stdout, os.Stderr, os.Getenv))
}

func run(args []string, stdout, stderr io.Writer, getenv func(string) string) int {
	cmd := ""
	if len(args) > 0 {
		cmd = args[0]
	}
	switch cmd {
	case "version", "-version", "--version":
		fmt.Fprintf(stdout, "gresbase %s\n", version)
		return 0
	case "healthcheck":
		if err := healthcheck(getenv); err != nil {
			fmt.Fprintf(stderr, "unhealthy: %v\n", err)
			return 1
		}
		return 0
	case "setup-token":
		token, err := setupToken(getenv)
		if err != nil {
			fmt.Fprintf(stderr, "gresbase: %v\n", err)
			return 1
		}
		fmt.Fprintln(stdout, token)
		return 0
	case "":
		ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
		defer stop()
		if err := serve(ctx, getenv, stderr, nil); err != nil {
			fmt.Fprintf(stderr, "gresbase: %v\n", err)
			return 1
		}
		return 0
	default:
		fmt.Fprintf(stderr, "unknown command %q (use: gresbase [version|healthcheck|setup-token])\n", cmd)
		return 2
	}
}

// serve runs the HTTP server until ctx is canceled. ln is optional (tests pass their own).
func serve(ctx context.Context, getenv func(string) string, logOut io.Writer, ln net.Listener) error {
	settings, cfg, err := config.Open(getenv)
	if err != nil {
		return fmt.Errorf("invalid configuration:\n%w", err)
	}
	log := newLogger(cfg, logOut)
	slog.SetDefault(log)

	conns := connections.New(cfg, log)
	if cfg.DatabaseURL != "" {
		pool, err := pg.Connect(ctx, cfg, log)
		if err != nil {
			return err
		}
		defer pool.Close()
		conns.AddEnv(pool)
	}
	for _, c := range settings.Connections() {
		conns.Add(connections.Connection{ID: c.ID, Source: connections.Saved, DSN: settings.ConnectionDSN(c),
			ReadOnly: c.ReadOnly})
	}
	defer conns.Close()
	go conns.Run(ctx)

	if ln == nil {
		if ln, err = net.Listen("tcp", ":"+strconv.Itoa(cfg.Port)); err != nil {
			return fmt.Errorf("listen: %w", err)
		}
	}

	store, err := snippets.Open(cfg.DataDir)
	if err != nil {
		return err
	}
	defer func() { _ = store.Close() }()
	srv := &http.Server{
		Handler: server.New(server.Options{
			Config: cfg, Version: version, Logger: log, UI: ui.Dist(), Snippets: store,
			Connections: conns,
			Settings:    settings,
		}),
		ReadHeaderTimeout: 10 * time.Second,
		ErrorLog:          slog.NewLogLogger(log.Handler(), slog.LevelWarn),
	}

	log.Info("starting gresbase", "version", version, "addr", ln.Addr().String(), "config", cfg)
	if _, admin := settings.Admin(); !cfg.AuthEnabled() && !admin {
		log.Warn("LOGIN DISABLED: only requests with a local Host (localhost, 127.0.0.1, [::1]) or "+
			"GRESBASE_ALLOWED_HOSTS are accepted. Set GRESBASE_USER and GRESBASE_PASSWORD before exposing "+
			"Gresbase beyond this machine.", "allowed_hosts", cfg.AllowedHosts)
	}
	if msg, ok := map[string]string{
		config.LossNotWritable:     "data dir is not writable: saved queries and settings live in memory and are lost on every restart",
		config.LossTmpfs:           "data dir is a tmpfs: saved queries and settings are lost on every restart",
		config.LossAnonymousVolume: "data dir is an anonymous volume: saved queries and settings are lost when the container is removed. Mount a named volume on it",
		config.LossContainerLayer:  "data dir is inside the container: saved queries and settings are lost when the container is removed. Mount a named volume on it",
	}[settings.Loss]; ok {
		log.Warn(msg, "data_dir", cfg.DataDir)
	}

	errc := make(chan error, 1)
	go func() { errc <- srv.Serve(ln) }()

	select {
	case err := <-errc:
		return err
	case <-ctx.Done():
	}
	log.Info("shutting down")
	sctx, cancel := context.WithTimeout(context.Background(), shutdownTimeout)
	defer cancel()
	if err := srv.Shutdown(sctx); err != nil {
		return fmt.Errorf("shutdown: %w", err)
	}
	if err := <-errc; !errors.Is(err, http.ErrServerClosed) {
		return err
	}
	return nil
}

func newLogger(cfg config.Config, out io.Writer) *slog.Logger {
	opts := &slog.HandlerOptions{Level: cfg.LogLevel}
	if cfg.LogFormat == "json" {
		return slog.New(slog.NewJSONHandler(out, opts))
	}
	return slog.New(slog.NewTextHandler(out, opts))
}

// setupToken returns the setup token of the server running beside it (docker exec): the one fixed
// by GRESBASE_SETUP_TOKEN or the one it generated.
func setupToken(getenv func(string) string) (string, error) {
	if t := getenv("GRESBASE_SETUP_TOKEN"); t != "" {
		return t, nil
	}
	b, err := os.ReadFile(config.SetupTokenFile())
	if err != nil {
		return "", errors.New("no setup token: Gresbase is not waiting to be set up")
	}
	return strings.TrimSpace(string(b)), nil
}

// healthcheck GETs the local /healthz. It only reads the port and base path, so it works in images
// without a shell even when the rest of the configuration is missing.
func healthcheck(getenv func(string) string) error {
	port := getenv("GRESBASE_PORT")
	if port == "" {
		port = "8080"
	}
	base := strings.TrimRight(getenv("GRESBASE_BASE_PATH"), "/")
	client := http.Client{Timeout: 3 * time.Second}
	resp, err := client.Get("http://127.0.0.1:" + port + base + "/healthz")
	if err != nil {
		return err
	}
	_ = resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("/healthz returned %s", resp.Status)
	}
	return nil
}
