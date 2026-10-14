package sqlexec_test

import (
	"context"
	"errors"
	"fmt"
	"net/url"
	"strings"
	"testing"
	"time"
	"unicode/utf16"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/amtzespinosa/gresbase/internal/config"
	"github.com/amtzespinosa/gresbase/internal/pg"
	"github.com/amtzespinosa/gresbase/internal/pg/pgvalue"
	"github.com/amtzespinosa/gresbase/internal/pg/sqlexec"
	"github.com/amtzespinosa/gresbase/internal/pgtest"
)

func TestMain(m *testing.M) { pgtest.Main(m) }

// newExecutor opens a pool configured like the app's (notices, ISO output…) on dsn.
func newExecutor(t *testing.T, dsn string, readOnly bool) *sqlexec.Executor {
	t.Helper()
	pc, err := pg.PoolConfig(config.Config{DatabaseURL: config.Secret(dsn), MaxConns: 10,
		StatementTimeout: 30 * time.Second, ReadOnly: readOnly})
	if err != nil {
		t.Fatal(err)
	}
	pool, err := pgxpool.NewWithConfig(context.Background(), pc)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(pool.Close)
	return sqlexec.New(pool, pgvalue.NewTypes(), readOnly, 30*time.Second)
}

func run(t *testing.T, e *sqlexec.Executor, req sqlexec.SQLRequest) *sqlexec.SQLResponse {
	t.Helper()
	res, err := e.Execute(context.Background(), "s", req)
	if err != nil {
		t.Fatalf("Execute(%q): %v", req.SQL, err)
	}
	return res
}

func scalar(t *testing.T, e *sqlexec.Executor, sql string) any {
	t.Helper()
	res := run(t, e, sqlexec.SQLRequest{SQL: sql})
	r := res.Results[len(res.Results)-1]
	if r.Error != nil {
		t.Fatalf("%q: %+v", sql, r.Error)
	}
	return r.Rows[0][0]
}

func TestExecuteResults(t *testing.T) {
	e := newExecutor(t, pgtest.DSN(t), false)
	sql := "SELECT 9007199254740993::int8 AS big, 'x'::text AS t, NULL AS n, '{1,2}'::int[] AS a;\nSELECT generate_series(1, 5) AS g"
	res := run(t, e, sqlexec.SQLRequest{SQL: sql, MaxRows: 3})
	if len(res.Results) != 2 || res.ExecutionID == "" || res.Tx != nil {
		t.Fatalf("response = %+v", res)
	}
	first := res.Results[0]
	if first.Error != nil || first.Columns[0].Name != "big" || first.Columns[0].Type != "bigint" || first.Columns[3].Type != "integer[]" {
		t.Fatalf("first = %+v", first)
	}
	if got := first.Rows[0]; got[0] != "9007199254740993" || got[1] != "x" || got[2] != nil {
		t.Errorf("first row = %#v", got)
	}
	second := res.Results[1]
	if len(second.Rows) != 3 || !second.Truncated || second.CommandTag != "SELECT 5" || second.Statement != 1 {
		t.Errorf("second = %+v", second)
	}
	if second.From != strings.Index(sql, "SELECT gen") || first.From != 0 || first.To != strings.Index(sql, ";") {
		t.Errorf("ranges: first %d-%d, second %d-%d", first.From, first.To, second.From, second.To)
	}
}

func TestExecuteErrorPosition(t *testing.T) {
	e := newExecutor(t, pgtest.DSN(t), false)
	sql := "SELECT 'ñ🐘';\nSELECT nope FROM users;\nSELECT 3"
	res := run(t, e, sqlexec.SQLRequest{SQL: sql})
	if len(res.Results) != 2 {
		t.Fatalf("execution must stop at the error: %d results", len(res.Results))
	}
	er := res.Results[1].Error
	if er == nil || er.Code != "pg_error" || er.PgCode != "42703" {
		t.Fatalf("error = %+v", er)
	}
	u := utf16.Encode([]rune(sql))
	if got := string(utf16.Decode(u[er.Position-1 : er.Position-1+4])); got != "nope" {
		t.Errorf("position %d points at %q", er.Position, got)
	}
}

func TestExecuteTimeoutCancelNotices(t *testing.T) {
	e := newExecutor(t, pgtest.DSN(t), false)

	res := run(t, e, sqlexec.SQLRequest{SQL: "SELECT pg_sleep(5)", TimeoutMS: 100})
	if er := res.Results[0].Error; er == nil || er.Code != "timeout" {
		t.Errorf("timeout error = %+v", er)
	}

	res = run(t, e, sqlexec.SQLRequest{SQL: "DO $$BEGIN RAISE NOTICE 'hello %', 1; END$$"})
	if n := res.Results[0].Notices; len(n) != 1 || n[0].Message != "hello 1" || n[0].Severity != "NOTICE" {
		t.Errorf("notices = %+v", n)
	}

	done := make(chan *sqlexec.SQLResponse)
	start := time.Now()
	go func() {
		r, _ := e.Execute(context.Background(), "s", sqlexec.SQLRequest{SQL: "SELECT pg_sleep(30); SELECT 2", ExecutionID: "slow-1"})
		done <- r
	}()
	for {
		err := e.Cancel(context.Background(), "s", "slow-1")
		if err == nil {
			break
		}
		if !errors.Is(err, sqlexec.ErrNotFound) || time.Since(start) > 10*time.Second {
			t.Fatalf("cancel: %v", err)
		}
		time.Sleep(20 * time.Millisecond)
	}
	r := <-done
	if len(r.Results) != 1 || r.Results[0].Error == nil || r.Results[0].Error.Code != "canceled" || time.Since(start) > 10*time.Second {
		t.Errorf("canceled execution = %+v", r.Results)
	}
	if err := e.Cancel(context.Background(), "other", "slow-1"); !errors.Is(err, sqlexec.ErrNotFound) {
		t.Errorf("cancel of a finished execution: %v", err)
	}
}

func TestExecuteValidation(t *testing.T) {
	e := newExecutor(t, pgtest.DSN(t), false)
	for _, req := range []sqlexec.SQLRequest{
		{SQL: "  -- only a comment"},
		{SQL: "SELECT 1", TimeoutMS: -1},
		{SQL: "SELECT 1", MaxRows: 1_000_000},
		{SQL: "SELECT 1", ExecutionID: "bad id!"},
	} {
		if _, err := e.Execute(context.Background(), "s", req); !errors.Is(err, sqlexec.ErrInvalid) {
			t.Errorf("Execute(%+v) = %v, want ErrInvalid", req, err)
		}
	}
	// Session changes never leak into the next execution: each one gets a fresh connection.
	run(t, e, sqlexec.SQLRequest{SQL: "SET search_path = billing"})
	if got := scalar(t, e, "SHOW search_path"); got != `"$user", public` {
		t.Errorf("search_path leaked: %v", got)
	}
}

func TestDestructiveNeedsConfirmation(t *testing.T) {
	e := newExecutor(t, pgtest.NewDatabase(t), false)
	_, err := e.Execute(context.Background(), "s", sqlexec.SQLRequest{SQL: "SELECT 1; DELETE FROM sessions"})
	var ce *sqlexec.ConfirmationError
	if !errors.As(err, &ce) || len(ce.Analysis.Findings) != 1 || ce.Analysis.Findings[0].Statement != 1 {
		t.Fatalf("err = %v", err)
	}
	if got := scalar(t, e, "SELECT count(*) > 0 FROM sessions"); got != true {
		t.Fatal("nothing must run without confirmation")
	}
	res := run(t, e, sqlexec.SQLRequest{SQL: "DELETE FROM sessions", ConfirmDestructive: true})
	if r := res.Results[0]; r.Error != nil || r.RowsAffected == 0 || !strings.HasPrefix(r.CommandTag, "DELETE") {
		t.Errorf("confirmed delete = %+v", r)
	}
	// A WHERE makes it a mere warning: no confirmation needed.
	run(t, e, sqlexec.SQLRequest{SQL: "DELETE FROM audit_log WHERE false"})
}

func TestTransactions(t *testing.T) {
	ctx := context.Background()
	e := newExecutor(t, pgtest.NewDatabase(t), false)
	name := func() any { return scalar(t, e, "SELECT name FROM orgs WHERE id = 1") }
	before := name()

	tx, err := e.Begin(ctx, "s")
	if err != nil {
		t.Fatal(err)
	}
	res := run(t, e, sqlexec.SQLRequest{SQL: "UPDATE orgs SET name = 'changed' WHERE id = 1; DELETE FROM sessions", TxID: tx.ID})
	if res.Tx == nil || res.Tx.Status != "active" || len(res.Tx.Statements) != 2 || res.Tx.Statements[1].Kind != "delete_all" || res.Tx.RowsAffected < 2 {
		t.Fatalf("tx after execute = %+v", res.Tx)
	}
	if name() != before {
		t.Error("uncommitted changes must not be visible outside the transaction")
	}
	if _, err := e.Execute(ctx, "s", sqlexec.SQLRequest{SQL: "COMMIT", TxID: tx.ID}); !errors.Is(err, sqlexec.ErrInvalid) {
		t.Errorf("COMMIT inside the transaction mode: %v", err)
	}
	if _, err := e.Tx("other", tx.ID); !errors.Is(err, sqlexec.ErrNotFound) {
		t.Errorf("another session must not see the transaction: %v", err)
	}
	if r, err := e.Rollback(ctx, "s", tx.ID); err != nil || r.Committed {
		t.Fatalf("rollback = %+v, %v", r, err)
	}
	if name() != before {
		t.Error("rollback did not undo the update")
	}
	if _, err := e.Tx("s", tx.ID); !errors.Is(err, sqlexec.ErrNotFound) {
		t.Errorf("closed transaction: %v", err)
	}

	tx, _ = e.Begin(ctx, "s")
	run(t, e, sqlexec.SQLRequest{SQL: "UPDATE orgs SET name = 'committed' WHERE id = 1", TxID: tx.ID})
	if r, err := e.Commit(ctx, "s", tx.ID); err != nil || !r.Committed {
		t.Fatalf("commit = %+v, %v", r, err)
	}
	if name() != "committed" {
		t.Error("commit did not persist the update")
	}

	// After an error the transaction is failed and COMMIT rolls back.
	tx, _ = e.Begin(ctx, "s")
	res = run(t, e, sqlexec.SQLRequest{SQL: "UPDATE orgs SET name = 'lost' WHERE id = 1; SELECT 1/0", TxID: tx.ID})
	if res.Tx.Status != "failed" {
		t.Errorf("status after error = %q", res.Tx.Status)
	}
	if r, err := e.Commit(ctx, "s", tx.ID); err != nil || r.Committed {
		t.Errorf("commit of a failed transaction = %+v, %v", r, err)
	}
	if name() != "committed" {
		t.Error("a failed transaction must not commit")
	}
}

func TestTransactionLimitAndExpiry(t *testing.T) {
	ctx := context.Background()
	e := newExecutor(t, pgtest.NewDatabase(t), false)
	var ids []string
	for range sqlexec.MaxTxPerSession {
		tx, err := e.Begin(ctx, "s")
		if err != nil {
			t.Fatal(err)
		}
		ids = append(ids, tx.ID)
	}
	if _, err := e.Begin(ctx, "s"); !errors.Is(err, sqlexec.ErrTooManyTx) {
		t.Errorf("fourth transaction: %v", err)
	}
	other, err := e.Begin(ctx, "other")
	if err != nil {
		t.Fatalf("other session: %v", err)
	}
	if got := e.Txs("s"); len(got) != len(ids) || got[0].ID != ids[len(ids)-1] {
		t.Errorf("Txs(s) = %+v, want %d newest first", got, len(ids))
	}
	if got := e.Txs("other"); len(got) != 1 || got[0].ID != other.ID {
		t.Errorf("Txs(other) = %+v", got)
	}
	for _, id := range append(ids, other.ID) {
		sess := "s"
		if id == other.ID {
			sess = "other"
		}
		if _, err := e.Rollback(ctx, sess, id); err != nil {
			t.Fatal(err)
		}
	}

	e.TxIdle = 300 * time.Millisecond
	tx, _ := e.Begin(ctx, "s")
	run(t, e, sqlexec.SQLRequest{SQL: "UPDATE orgs SET name = 'expired' WHERE id = 1", TxID: tx.ID})
	time.Sleep(time.Second)
	if _, err := e.Tx("s", tx.ID); !errors.Is(err, sqlexec.ErrNotFound) {
		t.Fatalf("idle transaction still open: %v", err)
	}
	if got := scalar(t, e, "SELECT name FROM orgs WHERE id = 1"); got == "expired" {
		t.Error("expiry must roll back")
	}
}

func TestReadOnly(t *testing.T) {
	ctx := context.Background()
	e := newExecutor(t, pgtest.DSN(t), true)
	for _, sql := range []string{
		"INSERT INTO orgs (name) VALUES ('ro')",
		"SET TRANSACTION READ WRITE; INSERT INTO orgs (name) VALUES ('ro')",
		"DELETE FROM sessions", // no confirmation in read-only: nothing can be destroyed
	} {
		res := run(t, e, sqlexec.SQLRequest{SQL: sql})
		last := res.Results[len(res.Results)-1]
		if last.Error == nil || (last.Error.Code != "read_only" && last.Error.PgCode != "25001") {
			t.Errorf("%q: %+v", sql, last.Error)
		}
	}
	for _, sql := range []string{"COMMIT; INSERT INTO orgs (name) VALUES ('ro')", "ROLLBACK", "BEGIN READ WRITE"} {
		if _, err := e.Execute(ctx, "s", sqlexec.SQLRequest{SQL: sql}); !errors.Is(err, sqlexec.ErrInvalid) {
			t.Errorf("%q: %v", sql, err)
		}
	}
	if _, err := e.Begin(ctx, "s"); !errors.Is(err, sqlexec.ErrReadOnly) {
		t.Errorf("Begin in read-only: %v", err)
	}
	if got := scalar(t, e, "SELECT count(*) FROM orgs WHERE name = 'ro'"); got != "0" {
		t.Errorf("read-only wrote: %v", got)
	}
}

// A cancel that arrives while the execution still waits for a connection stops it before its first
// statement (the editor shows Cancel as soon as it sends the request).
func TestCancelWhileWaitingForConnection(t *testing.T) {
	pc, err := pg.PoolConfig(config.Config{DatabaseURL: config.Secret(pgtest.DSN(t)), MaxConns: 1,
		StatementTimeout: 30 * time.Second})
	if err != nil {
		t.Fatal(err)
	}
	pool, err := pgxpool.NewWithConfig(context.Background(), pc)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(pool.Close)
	e := sqlexec.New(pool, pgvalue.NewTypes(), false, 30*time.Second)
	held, err := pool.Acquire(context.Background()) // the only connection: Execute has to wait
	if err != nil {
		t.Fatal(err)
	}

	done := make(chan *sqlexec.SQLResponse)
	go func() {
		r, _ := e.Execute(context.Background(), "s", sqlexec.SQLRequest{SQL: "SELECT pg_sleep(30)", ExecutionID: "waiting-1"})
		done <- r
	}()
	deadline := time.Now().Add(5 * time.Second)
	for err := e.Cancel(context.Background(), "s", "waiting-1"); err != nil; err = e.Cancel(context.Background(), "s", "waiting-1") {
		if !errors.Is(err, sqlexec.ErrNotFound) || time.Now().After(deadline) {
			t.Fatalf("cancel: %v", err)
		}
		time.Sleep(5 * time.Millisecond)
	}
	start := time.Now()
	held.Release()
	r := <-done
	if r == nil || r.Results[0].Error == nil || r.Results[0].Error.Code != "canceled" || time.Since(start) > 5*time.Second {
		t.Fatalf("result = %+v after %s", r, time.Since(start))
	}
}

func TestExecuteParams(t *testing.T) {
	e := newExecutor(t, pgtest.NewDatabase(t), false)
	run(t, e, sqlexec.SQLRequest{SQL: "CREATE TABLE victim (id int8 PRIMARY KEY, name text); INSERT INTO victim VALUES (1, 'ada'), (2, 'bob')"})

	// Values are bound, typed by the server (int8 here), reused by name, one numbering per statement.
	res := run(t, e, sqlexec.SQLRequest{
		SQL:    "SELECT name FROM victim WHERE id = :id OR id = :id + 0;\nSELECT :name::text AS echo, 'a :quoted' AS s, 1::int AS cast -- :comment",
		Params: map[string]string{"id": "2", "name": "x"},
	})
	if r := res.Results[0]; r.Error != nil || len(r.Rows) != 1 || r.Rows[0][0] != "bob" {
		t.Fatalf("first statement: %+v", r)
	}
	if r := res.Results[1]; r.Error != nil || r.Rows[0][0] != "x" || r.Rows[0][1] != "a :quoted" {
		t.Fatalf("second statement: %+v", r)
	}

	// Hostile values stay values: nothing they contain runs.
	for _, v := range []string{"1; DROP TABLE victim; --", "1') OR ('1'='1", "x' OR '1'='1"} {
		res := run(t, e, sqlexec.SQLRequest{SQL: "SELECT count(*) FROM victim WHERE name = :v", Params: map[string]string{"v": v}})
		if r := res.Results[0]; r.Error != nil || r.Rows[0][0] != "0" {
			t.Fatalf("%q: %+v", v, r)
		}
	}
	res = run(t, e, sqlexec.SQLRequest{SQL: "SELECT * FROM victim WHERE id = :id", Params: map[string]string{"id": "1; DROP TABLE victim"}})
	if r := res.Results[0]; r.Error == nil || r.Error.PgCode != "22P02" {
		t.Fatalf("bad int8 should fail as a value: %+v", r)
	}
	if got := scalar(t, e, "SELECT count(*) FROM victim"); got != "2" {
		t.Fatalf("victim has %v rows", got)
	}

	// The error position points into the submitted text, past the placeholder.
	sql := "SELECT :a, :bbbbbb + nope"
	res = run(t, e, sqlexec.SQLRequest{SQL: sql, Params: map[string]string{"a": "1", "bbbbbb": "2"}})
	if r := res.Results[0]; r.Error == nil || r.Error.Position != strings.Index(sql, "nope")+1 {
		t.Fatalf("position: %+v", r.Error)
	}

	// A parameter without a value is rejected before anything runs; no params means no binding.
	if _, err := e.Execute(context.Background(), "s", sqlexec.SQLRequest{SQL: "SELECT :missing", Params: map[string]string{}}); !errors.Is(err, sqlexec.ErrInvalid) {
		t.Fatalf("missing value: %v", err)
	}
	res = run(t, e, sqlexec.SQLRequest{SQL: "SELECT ((ARRAY[1,2,3])[1:2])::text"})
	if r := res.Results[0]; r.Error != nil || r.Rows[0][0] != "{1,2}" {
		t.Fatalf("slice: %+v", r)
	}
}

// A role with default_transaction_read_only = on (and every privilege, so only read-only stops the
// writes) gets the same treatment as GRESBASE_READ_ONLY: the editor can't lift it.
func TestReadOnlyRole(t *testing.T) {
	ctx := context.Background()
	dsn := pgtest.NewDatabase(t)
	admin, err := pgx.Connect(ctx, dsn)
	if err != nil {
		t.Fatal(err)
	}
	defer admin.Close(ctx)
	role := fmt.Sprintf("ro_%d", time.Now().UnixNano())
	for _, sql := range []string{
		"CREATE ROLE " + role + " LOGIN PASSWORD 'ro-pass'",
		"GRANT ALL ON ALL TABLES IN SCHEMA public TO " + role,
		"GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO " + role,
		"ALTER ROLE " + role + " SET default_transaction_read_only = on",
	} {
		if _, err := admin.Exec(ctx, sql); err != nil {
			t.Fatalf("%s: %v", sql, err)
		}
	}
	t.Cleanup(func() {
		c, err := pgx.Connect(context.Background(), dsn)
		if err == nil {
			_, _ = c.Exec(context.Background(), "DROP OWNED BY "+role+"; DROP ROLE "+role)
			_ = c.Close(context.Background())
		}
	})
	u, err := url.Parse(dsn)
	if err != nil {
		t.Fatal(err)
	}
	u.User = url.UserPassword(role, "ro-pass")

	e := newExecutor(t, u.String(), false)
	for _, sql := range []string{
		"INSERT INTO orgs (name) VALUES ('ro')",
		"SET default_transaction_read_only = off; INSERT INTO orgs (name) VALUES ('ro')",
		"SET SESSION CHARACTERISTICS AS TRANSACTION READ WRITE; INSERT INTO orgs (name) VALUES ('ro')",
		"SET TRANSACTION READ WRITE; INSERT INTO orgs (name) VALUES ('ro')",
		"SET transaction_read_only = off; INSERT INTO orgs (name) VALUES ('ro')",
		"DELETE FROM sessions",
	} {
		res := run(t, e, sqlexec.SQLRequest{SQL: sql})
		last := res.Results[len(res.Results)-1]
		if last.Error == nil || (last.Error.Code != "read_only" && last.Error.PgCode != "25001") {
			t.Errorf("%q: %+v", sql, last.Error)
		}
	}
	for _, sql := range []string{"COMMIT; INSERT INTO orgs (name) VALUES ('ro')", "BEGIN READ WRITE", "START TRANSACTION READ WRITE"} {
		if _, err := e.Execute(ctx, "s", sqlexec.SQLRequest{SQL: sql}); !errors.Is(err, sqlexec.ErrInvalid) {
			t.Errorf("%q: %v", sql, err)
		}
	}
	if _, err := e.Begin(ctx, "s"); !errors.Is(err, sqlexec.ErrReadOnly) {
		t.Errorf("Begin with a read-only role: %v", err)
	}
	var n int
	if err := admin.QueryRow(ctx, "SELECT count(*) FROM orgs WHERE name = 'ro'").Scan(&n); err != nil || n != 0 {
		t.Errorf("read-only role wrote: %d %v", n, err)
	}
	// Reading still works.
	if got := scalar(t, e, "SELECT count(*) > 0 FROM orgs"); got != true {
		t.Errorf("read = %v", got)
	}
}
