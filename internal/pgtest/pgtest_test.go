package pgtest

import (
	"context"
	"testing"

	"github.com/jackc/pgx/v5"
)

func TestMain(m *testing.M) { Main(m) }

func TestNewDatabaseIsAnIsolatedCopy(t *testing.T) {
	ctx := context.Background()
	count := func(dsn string) int {
		conn, err := pgx.Connect(ctx, dsn)
		if err != nil {
			t.Fatal(err)
		}
		defer func() { _ = conn.Close(ctx) }()
		var n int
		if err := conn.QueryRow(ctx, "SELECT count(*) FROM orgs").Scan(&n); err != nil {
			t.Fatal(err)
		}
		return n
	}

	before := count(DSN(t))
	fresh := NewDatabase(t)
	if got := count(fresh); got != before || before == 0 {
		t.Fatalf("copy has %d orgs, seed has %d", got, before)
	}
	conn, err := pgx.Connect(ctx, fresh)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := conn.Exec(ctx, "INSERT INTO orgs (name) VALUES ('pgtest-isolation')"); err != nil {
		t.Fatal(err)
	}
	_ = conn.Close(ctx)
	if _, err := Pool(t).Exec(ctx, "SELECT 1"); err != nil {
		t.Fatal(err)
	}
	if got := count(DSN(t)); got != before {
		t.Fatalf("shared database changed: %d orgs, want %d", got, before)
	}
}
