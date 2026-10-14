package connections_test

import (
	"context"
	"errors"
	"io"
	"log/slog"
	"testing"
	"time"

	"github.com/amtzespinosa/gresbase/internal/config"
	"github.com/amtzespinosa/gresbase/internal/pg/connections"
	"github.com/amtzespinosa/gresbase/internal/pgtest"
)

func TestMain(m *testing.M) { pgtest.Main(m) }

func newManager(t *testing.T, maxPools int, idle time.Duration) *connections.Manager {
	t.Helper()
	m := connections.New(config.Config{MaxConns: 2, MaxPools: maxPools, PoolIdleTimeout: idle,
		StatementTimeout: 30 * time.Second}, slog.New(slog.NewTextHandler(io.Discard, nil)))
	t.Cleanup(m.Close)
	return m
}

func ping(t *testing.T, c *connections.Conn) {
	t.Helper()
	if err := c.Pool.Ping(context.Background()); err != nil {
		t.Fatal(err)
	}
}

func TestIdlePoolsClose(t *testing.T) {
	ctx := context.Background()
	m := newManager(t, 10, 50*time.Millisecond)
	m.AddEnv(pgtest.PoolFor(t, pgtest.DSN(t)))
	dsn := config.Secret(pgtest.DSN(t))
	m.Add(connections.Connection{ID: "idle", Source: connections.Saved, DSN: dsn})
	m.Add(connections.Connection{ID: "busy", Source: connections.Saved, DSN: dsn})
	m.Add(connections.Connection{ID: "tx", Source: connections.Saved, DSN: dsn})

	var txConn *connections.Conn
	var txID string
	for _, id := range []string{connections.EnvID, "idle", "tx"} {
		c, release, err := m.Acquire(ctx, id, "s")
		if err != nil {
			t.Fatal(err)
		}
		ping(t, c)
		if id == "tx" {
			info, err := c.SQL.Begin(ctx, "s")
			if err != nil {
				t.Fatal(err)
			}
			txConn, txID = c, info.ID
		}
		release()
	}
	busy, releaseBusy, err := m.Acquire(ctx, "busy", "s")
	if err != nil {
		t.Fatal(err)
	}
	time.Sleep(100 * time.Millisecond)
	m.Sweep()
	// Closed: "idle". Kept: DATABASE_URL (never), "busy" (a request holds it), "tx" (open transaction).
	if n := m.Open(); n != 3 {
		t.Fatalf("open pools after sweep = %d, want 3", n)
	}
	ping(t, busy)
	releaseBusy()
	if _, err := txConn.SQL.Rollback(ctx, "s", txID); err != nil {
		t.Fatal(err)
	}

	// Reopened lazily on next use, with fresh state.
	c, release, err := m.Acquire(ctx, "idle", "s")
	if err != nil {
		t.Fatal(err)
	}
	defer release()
	ping(t, c)
}

func TestMaxPools(t *testing.T) {
	ctx := context.Background()
	m := newManager(t, 1, time.Hour)
	dsn := config.Secret(pgtest.DSN(t))
	m.Add(connections.Connection{ID: "a", Source: connections.Saved, DSN: dsn})
	m.Add(connections.Connection{ID: "b", Source: connections.Saved, DSN: dsn})

	_, releaseA, err := m.Acquire(ctx, "a", "s")
	if err != nil {
		t.Fatal(err)
	}
	if _, _, err := m.Acquire(ctx, "b", "s"); !errors.Is(err, connections.ErrTooMany) {
		t.Fatalf("second pool while the first is in use: err = %v, want ErrTooMany", err)
	}
	releaseA()
	// a is idle now: b takes its place.
	_, releaseB, err := m.Acquire(ctx, "b", "s")
	if err != nil {
		t.Fatalf("second pool after releasing the first: %v", err)
	}
	releaseB()
	if n := m.Open(); n != 1 {
		t.Errorf("open pools = %d, want 1", n)
	}
}

func TestAdhocOwner(t *testing.T) {
	m := newManager(t, 10, time.Hour)
	m.Add(connections.Connection{ID: "mine", Source: connections.Adhoc, Owner: "s1", DSN: config.Secret(pgtest.DSN(t))})
	if _, _, err := m.Acquire(context.Background(), "mine", "s2"); !errors.Is(err, connections.ErrNotFound) {
		t.Errorf("another session: err = %v, want ErrNotFound", err)
	}
	_, release, err := m.Acquire(context.Background(), "mine", "s1")
	if err != nil {
		t.Fatalf("owner: %v", err)
	}
	release()
	m.Remove("mine")
	if _, _, err := m.Acquire(context.Background(), "mine", "s1"); !errors.Is(err, connections.ErrNotFound) {
		t.Errorf("after Remove: err = %v, want ErrNotFound", err)
	}
}

func TestAdhocExpiry(t *testing.T) {
	cfg := config.Config{MaxPools: 5, PoolIdleTimeout: time.Hour, MaxConns: 1}
	m := connections.New(cfg, slog.New(slog.NewTextHandler(io.Discard, nil)))
	m.Add(connections.Connection{ID: "live", Source: connections.Adhoc, Owner: "s1", Expires: time.Now().Add(time.Hour)})
	m.Add(connections.Connection{ID: "gone", Source: connections.Adhoc, Owner: "s2", Expires: time.Now().Add(-time.Second)})
	if m.Adhoc() != 1 || !m.Owns("s1") || m.Owns("s2") {
		t.Fatalf("adhoc = %d, owns s1 %t s2 %t", m.Adhoc(), m.Owns("s1"), m.Owns("s2"))
	}
	m.Sweep()
	if _, _, err := m.Acquire(context.Background(), "gone", "s2"); !errors.Is(err, connections.ErrNotFound) {
		t.Errorf("expired connection still there: %v", err)
	}
	m.RemoveOwned("s1")
	if m.Adhoc() != 0 || m.DefaultID("s1") != "" {
		t.Errorf("RemoveOwned left %d", m.Adhoc())
	}
}
