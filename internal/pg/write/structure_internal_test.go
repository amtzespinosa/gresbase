package write

import (
	"context"
	"testing"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/amtzespinosa/gresbase/internal/pgtest"
)

// execOne is the last line of defense for the client expressions of checks and partial indexes:
// the server must refuse a second statement.
func TestExecOneRunsOneStatement(t *testing.T) {
	pool := pgtest.PoolFor(t, pgtest.NewDatabase(t))
	ctx := context.Background()
	err := pool.AcquireFunc(ctx, func(c *pgxpool.Conn) error {
		return execOne(ctx, c.Conn(), "CREATE TABLE one (a int); CREATE TABLE two (a int)")
	})
	if err == nil {
		t.Fatal("two statements ran")
	}
	var n int
	if err := pool.QueryRow(ctx, `SELECT count(*) FROM pg_class WHERE relname IN ('one', 'two')`).Scan(&n); err != nil || n != 0 {
		t.Fatalf("tables created: %d %v", n, err)
	}
}
