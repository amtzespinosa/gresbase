package pg

import (
	"context"
	"errors"
	"io"
	"log/slog"
	"net/url"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/amtzespinosa/gresbase/internal/config"
	"github.com/amtzespinosa/gresbase/internal/pg/capabilities"
	"github.com/amtzespinosa/gresbase/internal/pgtest"
)

func TestMain(m *testing.M) { pgtest.Main(m) }

var discard = slog.New(slog.NewTextHandler(io.Discard, nil))

func testConfig(t *testing.T, dsn string, env map[string]string) config.Config {
	t.Helper()
	env["DATABASE_URL"] = dsn
	cfg, err := config.Load(func(k string) string { return env[k] })
	if err != nil {
		t.Fatal(err)
	}
	return cfg
}

func connect(t *testing.T, env map[string]string) *pgxpool.Pool {
	t.Helper()
	pool, err := Connect(context.Background(), testConfig(t, pgtest.DSN(t), env), discard)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(pool.Close)
	return pool
}

func pgCode(err error) string {
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) {
		return pgErr.Code
	}
	return ""
}

func TestInfo(t *testing.T) {
	info, err := Info(context.Background(), connect(t, map[string]string{}))
	if err != nil {
		t.Fatal(err)
	}
	if info.Database != "app" || info.User != pgtest.User || info.Host == "" || info.Port == 0 ||
		info.ServerVersionNum < 120000 || info.ServerVersion == "" || info.ReadOnly {
		t.Fatalf("unexpected info: %+v", info)
	}
	want := capabilities.SupportLevel(info.ServerVersion, info.ServerVersionNum)
	if info.SupportLevel != want || info.SupportLevel == capabilities.Unsupported {
		t.Errorf("support level %s, want %s", info.SupportLevel, want)
	}
	if got, want := info.Capabilities.Has(capabilities.Merge), info.ServerVersionNum >= 150000; got != want {
		t.Errorf("merge = %v on %d", got, info.ServerVersionNum)
	}
}

func TestSessionSettings(t *testing.T) {
	var app, dateStyle, intervalStyle, timeout string
	err := connect(t, map[string]string{"GRESBASE_STATEMENT_TIMEOUT": "45s"}).QueryRow(context.Background(),
		`SELECT current_setting('application_name'), current_setting('DateStyle'),
			current_setting('IntervalStyle'), current_setting('statement_timeout')`).
		Scan(&app, &dateStyle, &intervalStyle, &timeout)
	if err != nil {
		t.Fatal(err)
	}
	if app != "gresbase" || dateStyle != "ISO, MDY" || intervalStyle != "iso_8601" || timeout != "45s" {
		t.Fatalf("got %s / %s / %s / %s", app, dateStyle, intervalStyle, timeout)
	}
}

func TestReadOnlyRejectsWrites(t *testing.T) {
	pool := connect(t, map[string]string{"GRESBASE_READ_ONLY": "true"})
	_, err := pool.Exec(context.Background(), "INSERT INTO orgs (name) VALUES ('nope')")
	if pgCode(err) != "25006" {
		t.Fatalf("err = %v, want SQLSTATE 25006", err)
	}
	info, err := Info(context.Background(), pool)
	if err != nil || !info.ReadOnly {
		t.Fatalf("read_only = %v, err %v", info.ReadOnly, err)
	}
}

func TestStatementTimeout(t *testing.T) {
	pool := connect(t, map[string]string{"GRESBASE_STATEMENT_TIMEOUT": "100ms"})
	_, err := pool.Exec(context.Background(), "SELECT pg_sleep(2)")
	if pgCode(err) != "57014" {
		t.Fatalf("err = %v, want SQLSTATE 57014", err)
	}
}

func TestConnectFailures(t *testing.T) {
	good, err := url.Parse(pgtest.DSN(t))
	if err != nil {
		t.Fatal(err)
	}
	badPassword := *good
	badPassword.User = url.UserPassword(pgtest.User, "wrong")
	missingDB := *good
	missingDB.Path = "/nope"
	sslRequired := *good
	sslRequired.RawQuery = "sslmode=require"

	tests := []struct {
		name, dsn, want string
	}{
		{"bad password", badPassword.String(), KindAuth},
		{"missing database", missingDB.String(), KindDatabase},
		{"refused", "postgres://u:p@127.0.0.1:1/app?sslmode=disable", KindRefused},
		{"ssl required", sslRequired.String(), KindSSL},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
			defer cancel()
			_, err := Connect(ctx, testConfig(t, tt.dsn, map[string]string{}), discard)
			var ce *ConnectError
			if !errors.As(err, &ce) || ce.Kind != tt.want {
				t.Fatalf("err = %v, want kind %s", err, tt.want)
			}
		})
	}
}
