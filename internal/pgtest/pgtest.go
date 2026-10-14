// Package pgtest starts a seeded Postgres in a container for integration tests.
//
// One container per test binary (package), shared by every test in it:
//
//	func TestMain(m *testing.M) { pgtest.Main(m) }
//
//	pool := pgtest.Pool(t)        // read-only use of the shared seeded database "app"
//	dsn := pgtest.NewDatabase(t)  // fresh copy of the seed for tests that write
//
// The image is postgres:${PG_VERSION:-17}. Without Docker the tests are skipped, never passed.
package pgtest

import (
	"context"
	"fmt"
	"net/url"
	"os"
	"path/filepath"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/testcontainers/testcontainers-go"
	"github.com/testcontainers/testcontainers-go/modules/postgres"
)

// User is the role of the test server.
const User = "gresbase"

// Password of the test server. It is distinctive so leak tests can grep for it.
const Password = "pgtest-S3cret-pw" //nolint:gosec // throwaway test container credential

const template = "gresbase_seed"

// shared is the per-binary container; tests only reach it through the functions below.
var shared struct {
	once sync.Once
	ctr  *postgres.PostgresContainer
	dsn  string // to the seeded database "app"
	err  error
	mu   sync.Mutex
	pool *pgxpool.Pool
	seq  atomic.Int64
}

// Main runs the tests and removes the container afterwards. Use it from TestMain.
func Main(m *testing.M) {
	code := m.Run()
	if shared.pool != nil {
		shared.pool.Close()
	}
	if shared.ctr != nil {
		_ = testcontainers.TerminateContainer(shared.ctr)
	}
	os.Exit(code)
}

// DSN returns the URL of the shared seeded database, starting the container if needed.
// Do not write through it: use NewDatabase.
func DSN(t *testing.T) string {
	t.Helper()
	testcontainers.SkipIfProviderIsNotHealthy(t)
	shared.once.Do(start)
	if shared.err != nil {
		t.Fatalf("pgtest: %v", shared.err)
	}
	return shared.dsn
}

// Pool returns a pool to the shared seeded database.
func Pool(t *testing.T) *pgxpool.Pool {
	t.Helper()
	dsn := DSN(t)
	shared.mu.Lock()
	defer shared.mu.Unlock()
	if shared.pool == nil {
		p, err := pgxpool.New(context.Background(), dsn)
		if err != nil {
			t.Fatalf("pgtest: pool: %v", err)
		}
		shared.pool = p
	}
	return shared.pool
}

// NewDatabase creates a fresh copy of the seed (CREATE DATABASE … TEMPLATE) and returns its URL.
// The database is dropped when the test ends.
func NewDatabase(t *testing.T) string {
	t.Helper()
	dsn := DSN(t)
	name := fmt.Sprintf("t%d_%d", time.Now().UnixNano(), shared.seq.Add(1))
	exec(t, dsn, "CREATE DATABASE "+name+" TEMPLATE "+template)
	// DROP DATABASE … WITH (FORCE) is 13+: terminate leftover sessions first so this works on 12 too.
	t.Cleanup(func() {
		exec(t, dsn, "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '"+name+"'")
		exec(t, dsn, "DROP DATABASE IF EXISTS "+name)
	})
	return withDatabase(dsn, name)
}

func start() {
	ctx := context.Background()
	img := "postgres:" + envOr("PG_VERSION", "17")
	seed, err := seedFiles()
	if err != nil {
		shared.err = err
		return
	}
	shared.ctr, err = postgres.Run(ctx, img,
		postgres.WithDatabase("app"), postgres.WithUsername(User), postgres.WithPassword(Password),
		postgres.WithOrderedInitScripts(seed...), postgres.BasicWaitStrategies(),
		// The data directory lives in RAM and initdb skips its final fsync: startup (initdb, seed,
		// restart) no longer depends on the disk, which under I/O pressure (image builds, several
		// containers seeding at once) stretched it past the wait timeout. The module already runs the
		// server with fsync=off. A path of our own: the image's default PGDATA moved in 18, and 18+
		// refuses to start with a mount at the old one.
		testcontainers.WithTmpfs(map[string]string{"/pgdata": "rw"}),
		testcontainers.WithEnv(map[string]string{"PGDATA": "/pgdata/data", "POSTGRES_INITDB_ARGS": "--no-sync"}))
	if err != nil {
		shared.err = fmt.Errorf("start %s: %w", img, err)
		return
	}
	if shared.dsn, err = shared.ctr.ConnectionString(ctx, "sslmode=disable"); err != nil {
		shared.err = err
		return
	}
	// Nobody connects to the template, so CREATE DATABASE … TEMPLATE never finds it busy.
	shared.err = execErr(shared.dsn, "CREATE DATABASE "+template+" TEMPLATE app")
}

func exec(t *testing.T, dsn, sql string) {
	t.Helper()
	if err := execErr(dsn, sql); err != nil {
		t.Fatalf("pgtest: %s: %v", sql, err)
	}
}

// execErr runs a statement from the maintenance database "postgres".
func execErr(dsn, sql string) error {
	ctx, cancel := context.WithTimeout(context.Background(), time.Minute)
	defer cancel()
	conn, err := pgx.Connect(ctx, withDatabase(dsn, "postgres"))
	if err != nil {
		return err
	}
	defer func() { _ = conn.Close(ctx) }()
	_, err = conn.Exec(ctx, sql)
	return err
}

func withDatabase(dsn, db string) string {
	u, _ := url.Parse(dsn)
	u.Path = "/" + db
	return u.String()
}

// seedFiles returns deploy/seed/*.sql, found by walking up to the module root.
func seedFiles() ([]string, error) {
	dir, err := os.Getwd()
	if err != nil {
		return nil, err
	}
	for {
		if _, err := os.Stat(filepath.Join(dir, "go.mod")); err == nil {
			return filepath.Glob(filepath.Join(dir, "deploy", "seed", "*.sql"))
		}
		parent := filepath.Dir(dir)
		if parent == dir {
			return nil, fmt.Errorf("go.mod not found above the working directory")
		}
		dir = parent
	}
}

func envOr(k, def string) string {
	if v := os.Getenv(k); v != "" {
		return v
	}
	return def
}

// PoolFor opens a pool to dsn (e.g. from NewDatabase) and closes it when the test ends.
func PoolFor(t *testing.T, dsn string) *pgxpool.Pool {
	t.Helper()
	p, err := pgxpool.New(context.Background(), dsn)
	if err != nil {
		t.Fatalf("pgtest: pool: %v", err)
	}
	t.Cleanup(p.Close)
	return p
}
