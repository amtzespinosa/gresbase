// Package sqlexec runs the SQL of the editor: a script split into statements and run in order on
// one dedicated connection, with a per-execution timeout, row cap, cancellation, explicit
// transactions that outlive the request, and a confirmation gate for destructive statements.
package sqlexec

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"log/slog"
	"regexp"
	"slices"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"time"
	"unicode/utf8"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/amtzespinosa/gresbase/internal/pg"
	"github.com/amtzespinosa/gresbase/internal/pg/pgvalue"
	"github.com/amtzespinosa/gresbase/internal/pg/rows"
	"github.com/amtzespinosa/gresbase/internal/pg/sqlguard"
)

// Limits and defaults.
const (
	DefaultMaxRows = 1000
	maxMaxRows     = 100_000
	maxTimeout     = time.Hour
	// MaxTxPerSession is how many transactions one session may keep open.
	MaxTxPerSession = 3
	// DefaultTxIdle is how long a transaction may sit unused before it is rolled back.
	DefaultTxIdle = 5 * time.Minute
)

// Errors of the executor. Statement errors are not Go errors: they travel in Result.Error.
var (
	ErrInvalid    = errors.New("invalid request")
	ErrNotFound   = errors.New("not found")
	ErrBusy       = errors.New("the transaction is running another statement")
	ErrTooManyTx  = fmt.Errorf("at most %d open transactions per session", MaxTxPerSession)
	ErrReadOnly   = errors.New("read-only mode: writes are disabled")
	errTxControlf = "%w: transaction control statements (%s) are not allowed here; use the transaction mode"
)

// ConfirmationError is returned when a script has destructive statements and the request did
// not confirm them.
type ConfirmationError struct{ Analysis sqlguard.Analysis }

func (e *ConfirmationError) Error() string {
	return "the script has destructive statements: confirm to run it"
}

// Executor runs SQL. Safe for concurrent use.
type Executor struct {
	pool     *pgxpool.Pool
	types    *pgvalue.Types
	readOnly bool
	timeout  time.Duration // default statement_timeout
	// TxIdle is how long an unused transaction lives (DefaultTxIdle); tests shorten it.
	TxIdle time.Duration
	// MaxRows gives the default row limit of a result (DefaultMaxRows when nil or not positive); it
	// is read on every execution so the setting applies live.
	MaxRows func() int

	running sync.Map // session+"\x00"+execution id → *execution

	mu  sync.Mutex
	txs map[string]*tx // id → transaction
}

// New returns an executor. timeout is the default statement_timeout of an execution.
func New(pool *pgxpool.Pool, types *pgvalue.Types, readOnly bool, timeout time.Duration) *Executor {
	return &Executor{pool: pool, types: types, readOnly: readOnly, timeout: timeout, TxIdle: DefaultTxIdle,
		txs: map[string]*tx{}}
}

type execution struct {
	pg       atomic.Pointer[pgconn.PgConn] // nil until the execution has its connection
	canceled atomic.Bool
}

type tx struct {
	id, session string
	conn        *pgxpool.Conn
	mu          sync.Mutex // held while a statement, commit or rollback runs
	created     time.Time
	used        time.Time // guarded by Executor.mu
	timer       *time.Timer
	failed      bool
	statements  []TxStatement
}

var executionID = regexp.MustCompile(`^[A-Za-z0-9_-]{1,64}$`)

// Execute runs the statements of req.SQL in order and stops at the first error.
func (e *Executor) Execute(ctx context.Context, session string, req SQLRequest) (*SQLResponse, error) {
	stmts := sqlguard.Split(req.SQL)
	if len(stmts) == 0 {
		return nil, fmt.Errorf("%w: there is no statement to run", ErrInvalid)
	}
	timeout, maxRows, err := e.limits(req)
	if err != nil {
		return nil, err
	}
	binds := make([]*bound, len(stmts))
	if req.Params != nil {
		for i, st := range stmts {
			if binds[i], err = bind(req.SQL, st, req.Params); err != nil {
				return nil, err
			}
		}
	}
	if req.ExecutionID == "" {
		req.ExecutionID = newID()
	} else if !executionID.MatchString(req.ExecutionID) {
		return nil, fmt.Errorf("%w: execution_id must be 1-64 letters, digits, - or _", ErrInvalid)
	}

	// Registered before waiting for a connection: the editor offers Cancel as soon as it sends.
	key := session + "\x00" + req.ExecutionID
	ex := &execution{}
	if _, dup := e.running.LoadOrStore(key, ex); dup {
		return nil, fmt.Errorf("%w: execution %s is already running", ErrInvalid, req.ExecutionID)
	}
	defer e.running.Delete(key)

	var conn *pgx.Conn
	var t *tx
	if req.TxID != "" {
		if t, err = e.lockTx(session, req.TxID); err != nil {
			return nil, err
		}
		defer e.unlockTx(t)
		if err := rejectTxControl(req.SQL, stmts); err != nil {
			return nil, err
		}
		// The transaction outlives the request: a client that goes away must not kill it.
		ctx = context.WithoutCancel(ctx)
		conn = t.conn.Conn()
	} else {
		c, err := e.pool.Acquire(ctx)
		if err != nil {
			return nil, err
		}
		// Statements may change the session (SET, SET ROLE, temp tables, an open BEGIN…): the
		// connection is closed afterwards so none of it reaches other requests.
		defer func() {
			_ = c.Conn().Close(context.Background())
			c.Release()
		}()
		conn = c.Conn()
		readOnly, err := e.readOnlyOn(ctx, conn)
		if err != nil {
			return nil, err
		}
		if readOnly {
			if err := rejectTxControl(req.SQL, stmts); err != nil {
				return nil, err
			}
		} else if a := sqlguard.Analyze(req.SQL); a.RequiresConfirmation && !req.ConfirmDestructive {
			return nil, &ConfirmationError{a}
		}
		if readOnly {
			// A read-only transaction whose snapshot is already taken cannot be made read-write.
			if _, err := conn.Exec(ctx, "BEGIN READ ONLY; SELECT 1", pgx.QueryExecModeSimpleProtocol); err != nil {
				return nil, err
			}
		}
	}

	// Cancel reaches the server from now on; one that came while waiting for the connection stops
	// the execution before its first statement.
	ex.pg.Store(conn.PgConn())

	if _, err := conn.Exec(ctx, "SET statement_timeout = "+strconv.FormatInt(timeout.Milliseconds(), 10), pgx.QueryExecModeSimpleProtocol); err != nil {
		if t == nil {
			return nil, err
		}
		// A failed transaction refuses even SET: run anyway, the statement reports the state.
	}
	res := &SQLResponse{ExecutionID: req.ExecutionID, Results: []StatementResult{}}
	var done []TxStatement
	for i, st := range stmts {
		var r StatementResult
		if ex.canceled.Load() { // canceled between two statements
			r = StatementResult{From: st.From, To: st.To, Columns: []rows.ResultColumn{}, Rows: [][]any{}, Notices: []Notice{},
				Error: &StatementError{Code: "canceled", Message: "the query was canceled"}}
		} else {
			r = e.run(ctx, conn, ex, req.SQL, st, binds[i], maxRows)
		}
		r.Statement = i
		res.Results = append(res.Results, r)
		if r.Error != nil {
			break
		}
		kind, level := sqlguard.Classify(req.SQL, st.Tokens)
		done = append(done, TxStatement{SQL: st.Text, CommandTag: r.CommandTag, RowsAffected: r.RowsAffected,
			Kind: kind, Level: level})
	}
	if t != nil {
		_, _ = conn.Exec(ctx, "RESET statement_timeout", pgx.QueryExecModeSimpleProtocol) // fails harmlessly in a failed transaction
		e.mu.Lock()
		t.statements = append(t.statements, done...)
		t.failed = conn.PgConn().TxStatus() == 'E'
		t.used = time.Now()
		info := e.infoLocked(t)
		e.mu.Unlock()
		res.Tx = &info
	}
	return res, nil
}

func (e *Executor) limits(req SQLRequest) (time.Duration, int, error) {
	timeout, maxRows := e.timeout, DefaultMaxRows
	if e.MaxRows != nil {
		if n := e.MaxRows(); n > 0 {
			maxRows = n
		}
	}
	switch {
	case req.TimeoutMS < 0 || time.Duration(req.TimeoutMS)*time.Millisecond > maxTimeout:
		return 0, 0, fmt.Errorf("%w: timeout_ms must be between 1 and %d", ErrInvalid, maxTimeout.Milliseconds())
	case req.TimeoutMS > 0:
		timeout = time.Duration(req.TimeoutMS) * time.Millisecond
	}
	switch {
	case req.MaxRows < 0 || req.MaxRows > maxMaxRows:
		return 0, 0, fmt.Errorf("%w: max_rows must be between 1 and %d", ErrInvalid, maxMaxRows)
	case req.MaxRows > 0:
		maxRows = req.MaxRows
	}
	return timeout, maxRows, nil
}

// rejectTxControl refuses BEGIN, COMMIT, ROLLBACK and friends where the server owns the
// transaction (transaction mode, read-only mode). Savepoints stay allowed.
// readOnlyOn reports whether conn must run read-only: GRESBASE_READ_ONLY (or the connection's own
// flag), or a role or database whose default_transaction_read_only is on (ALTER ROLE … SET). The
// latter is only a default, which SET or BEGIN READ WRITE would lift: it gets the same treatment.
func (e *Executor) readOnlyOn(ctx context.Context, conn *pgx.Conn) (bool, error) {
	if e.readOnly {
		return true, nil
	}
	var v string
	err := conn.QueryRow(ctx, "SELECT current_setting('default_transaction_read_only')",
		pgx.QueryExecModeSimpleProtocol).Scan(&v)
	if err != nil {
		return false, fmt.Errorf("read default_transaction_read_only: %w", err)
	}
	return v == "on", nil
}

func rejectTxControl(sql string, stmts []sqlguard.Statement) error {
	for _, st := range stmts {
		t := st.Tokens[0]
		switch w := strings.ToLower(sql[t.Start:t.End]); w {
		case "begin", "start", "commit", "end", "abort", "prepare":
			if w == "prepare" && (len(st.Tokens) < 2 || !strings.EqualFold(sql[st.Tokens[1].Start:st.Tokens[1].End], "transaction")) {
				continue
			}
			return fmt.Errorf(errTxControlf, ErrInvalid, strings.ToUpper(w))
		case "rollback":
			if len(st.Tokens) > 1 && hasWord(sql, st.Tokens, "to") {
				continue // ROLLBACK TO SAVEPOINT
			}
			return fmt.Errorf(errTxControlf, ErrInvalid, "ROLLBACK")
		}
	}
	return nil
}

func hasWord(sql string, toks []sqlguard.Token, w string) bool {
	for _, t := range toks {
		if t.Kind == sqlguard.Word && strings.EqualFold(sql[t.Start:t.End], w) {
			return true
		}
	}
	return false
}

// run executes one statement and reads at most maxRows rows. Without parameters it uses the simple
// protocol (results arrive as text, any statement is accepted); a bound statement goes through the
// extended protocol with its values as untyped text parameters, so the server infers their types.
func (e *Executor) run(ctx context.Context, conn *pgx.Conn, ex *execution, sql string, st sqlguard.Statement, b *bound, maxRows int) StatementResult {
	res := StatementResult{From: st.From, To: st.To, Columns: []rows.ResultColumn{}, Rows: [][]any{}, Notices: []Notice{}}
	pg.SetNoticeHandler(conn.PgConn(), func(n *pgconn.Notice) {
		res.Notices = append(res.Notices, Notice{Severity: n.Severity, Message: n.Message, Detail: n.Detail, Hint: n.Hint, Code: n.Code})
	})
	defer pg.SetNoticeHandler(conn.PgConn(), nil)

	start := time.Now()
	var raw [][][]byte
	var oids []uint32
	var rs resultRows
	var err error
	if b != nil {
		rs = &readerRows{rr: conn.PgConn().ExecParams(ctx, b.text, b.args, nil, nil, nil)}
	} else {
		rs, err = conn.Query(ctx, st.Text, pgx.QueryExecModeSimpleProtocol)
	}
	if err == nil {
		fds := rs.FieldDescriptions()
		for _, fd := range fds {
			oids = append(oids, fd.DataTypeOID)
			res.Columns = append(res.Columns, rows.ResultColumn{Name: fd.Name})
		}
		for rs.Next() {
			if len(raw) == maxRows {
				// ponytail: Close drains the rest from the network without keeping it; cancelling
				// instead would abort an explicit transaction.
				res.Truncated = true
				break
			}
			row := make([][]byte, len(fds))
			for i, v := range rs.RawValues() {
				if v != nil {
					row[i] = append([]byte{}, v...)
				}
			}
			raw = append(raw, row)
		}
		rs.Close()
		err = rs.Err()
		res.CommandTag = rs.CommandTag().String()
		res.RowsAffected = rs.CommandTag().RowsAffected()
	}
	res.DurationMS = float64(time.Since(start).Microseconds()) / 1000
	if err != nil {
		text, orig := st.Text, func(off int) int { return st.Offset + off }
		if b != nil {
			text, orig = b.text, b.orig
		}
		res.Error = statementError(err, ex.canceled.Load(), sql, text, orig)
		res.Columns, res.CommandTag = []rows.ResultColumn{}, ""
		return res
	}
	if len(oids) > 0 {
		if err := e.types.Resolve(ctx, conn, oids); err != nil {
			slog.Warn("sql: resolving result types", "err", err) // values still go out, as text
		}
	}
	for i := range res.Columns {
		res.Columns[i].Type = e.types.Name(oids[i])
	}
	for _, r := range raw {
		out := make([]any, len(r))
		for i, v := range r {
			out[i] = e.types.Encode(oids[i], v, 0)
		}
		res.Rows = append(res.Rows, out)
	}
	return res
}

// statementError converts err into the API error shape, with the Postgres position moved from the
// executed text to the submitted one (UTF-16, 1-based); orig maps a byte offset of text to sql.
func statementError(err error, canceled bool, sql, text string, orig func(int) int) *StatementError {
	var pgErr *pgconn.PgError
	switch {
	case errors.As(err, &pgErr):
		e := &StatementError{Code: "pg_error", Message: pgErr.Message, Detail: pgErr.Detail, Hint: pgErr.Hint, PgCode: pgErr.Code}
		switch pgErr.Code {
		case "25006":
			e.Code = "read_only"
		case "57014":
			e.Code = "timeout"
			if canceled {
				e.Code = "canceled"
			}
		}
		if p := int(pgErr.Position); p > 0 {
			off := 0
			for i := 1; i < p && off < len(text); i++ {
				_, size := utf8.DecodeRuneInString(text[off:])
				off += size
			}
			e.Position = sqlguard.UTF16(sql, orig(off)) + 1
		}
		return e
	case canceled || errors.Is(err, context.Canceled):
		return &StatementError{Code: "canceled", Message: "the query was canceled"}
	case errors.Is(err, context.DeadlineExceeded):
		return &StatementError{Code: "timeout", Message: "the query did not finish in time"}
	default:
		slog.Error("sql: statement failed", "err", err)
		return &StatementError{Code: "internal", Message: "the connection to the database failed"}
	}
}

// Cancel cancels the running execution id of session.
func (e *Executor) Cancel(ctx context.Context, session, id string) error {
	v, ok := e.running.Load(session + "\x00" + id)
	if !ok {
		return fmt.Errorf("%w: execution %s is not running", ErrNotFound, id)
	}
	ex := v.(*execution)
	ex.canceled.Store(true)
	if c := ex.pg.Load(); c != nil {
		return c.CancelRequest(ctx)
	}
	return nil // still waiting for its connection: it stops before the first statement
}

// Begin opens a transaction on a connection kept for it until commit, rollback or expiry.
func (e *Executor) Begin(ctx context.Context, session string) (*TxInfo, error) {
	if e.readOnly {
		return nil, ErrReadOnly
	}
	if e.openTx(session) >= MaxTxPerSession {
		return nil, ErrTooManyTx
	}
	c, err := e.pool.Acquire(ctx)
	if err != nil {
		return nil, err
	}
	// A read-only role would let the transaction's first statement lift it (SET TRANSACTION READ
	// WRITE): no transaction mode, as with GRESBASE_READ_ONLY.
	if ro, err := e.readOnlyOn(ctx, c.Conn()); err != nil || ro {
		c.Release()
		if err != nil {
			return nil, err
		}
		return nil, ErrReadOnly
	}
	if _, err := c.Exec(ctx, "BEGIN"); err != nil {
		c.Release()
		return nil, err
	}
	now := time.Now()
	t := &tx{id: newID(), session: session, conn: c, created: now, used: now}
	e.mu.Lock()
	if e.openTxLocked(session) >= MaxTxPerSession { // another Begin won the race
		e.mu.Unlock()
		_ = c.Conn().Close(ctx)
		c.Release()
		return nil, ErrTooManyTx
	}
	e.txs[t.id] = t
	t.timer = time.AfterFunc(e.TxIdle, func() { e.expire(t) })
	info := e.infoLocked(t)
	e.mu.Unlock()
	return &info, nil
}

// Tx describes the open transaction id of session.
func (e *Executor) Tx(session, id string) (*TxInfo, error) {
	e.mu.Lock()
	defer e.mu.Unlock()
	t, ok := e.txs[id]
	if !ok || t.session != session {
		return nil, txNotFound(id)
	}
	info := e.infoLocked(t)
	return &info, nil
}

// Txs describes the open transactions of session, newest first: the editor offers to resume or
// roll back the ones a closed or reloaded page left behind.
func (e *Executor) Txs(session string) []TxInfo {
	e.mu.Lock()
	defer e.mu.Unlock()
	out := []TxInfo{}
	for _, t := range e.txs {
		if t.session == session {
			out = append(out, e.infoLocked(t))
		}
	}
	slices.SortFunc(out, func(a, b TxInfo) int { return b.CreatedAt.Compare(a.CreatedAt) })
	return out
}

// OpenTxs is the number of open transactions of every session: a pool with any cannot be closed.
func (e *Executor) OpenTxs() int {
	e.mu.Lock()
	defer e.mu.Unlock()
	return len(e.txs)
}

// Commit commits the transaction id of session and closes it.
func (e *Executor) Commit(ctx context.Context, session, id string) (*TxResult, error) {
	return e.finish(ctx, session, id, "COMMIT")
}

// Rollback rolls back the transaction id of session and closes it.
func (e *Executor) Rollback(ctx context.Context, session, id string) (*TxResult, error) {
	return e.finish(ctx, session, id, "ROLLBACK")
}

func (e *Executor) finish(ctx context.Context, session, id, cmd string) (*TxResult, error) {
	t, err := e.lockTx(session, id)
	if err != nil {
		return nil, err
	}
	defer t.mu.Unlock()
	tag, err := t.conn.Exec(context.WithoutCancel(ctx), cmd)
	e.close(t)
	if err != nil {
		return nil, err
	}
	// COMMIT of a failed transaction answers ROLLBACK.
	return &TxResult{Committed: cmd == "COMMIT" && tag.String() == "COMMIT"}, nil
}

// lockTx finds the transaction and takes it for one operation: it never waits for another one.
func (e *Executor) lockTx(session, id string) (*tx, error) {
	e.mu.Lock()
	defer e.mu.Unlock()
	t, ok := e.txs[id]
	if !ok || t.session != session {
		return nil, txNotFound(id)
	}
	if !t.mu.TryLock() {
		return nil, ErrBusy
	}
	return t, nil
}

func (e *Executor) unlockTx(t *tx) {
	e.mu.Lock()
	t.used = time.Now()
	t.timer.Reset(e.TxIdle)
	e.mu.Unlock()
	t.mu.Unlock()
}

// expire rolls back a transaction left unused for TxIdle (the connection is closed, which rolls
// back). A transaction that is busy right now gets another period.
func (e *Executor) expire(t *tx) {
	if !t.mu.TryLock() {
		e.mu.Lock()
		t.timer.Reset(e.TxIdle)
		e.mu.Unlock()
		return
	}
	defer t.mu.Unlock()
	e.mu.Lock()
	_, open := e.txs[t.id]
	idle := time.Since(t.used) >= e.TxIdle
	e.mu.Unlock()
	if open && idle {
		slog.Info("sql: transaction expired, rolling back", "tx", t.id)
		e.close(t)
	}
}

// close forgets the transaction and closes its connection (ending the transaction if still open).
func (e *Executor) close(t *tx) {
	e.mu.Lock()
	delete(e.txs, t.id)
	t.timer.Stop()
	e.mu.Unlock()
	_ = t.conn.Conn().Close(context.Background())
	t.conn.Release()
}

func (e *Executor) openTx(session string) int {
	e.mu.Lock()
	defer e.mu.Unlock()
	return e.openTxLocked(session)
}

func (e *Executor) openTxLocked(session string) int {
	n := 0
	for _, t := range e.txs {
		if t.session == session {
			n++
		}
	}
	return n
}

func (e *Executor) infoLocked(t *tx) TxInfo {
	info := TxInfo{ID: t.id, Status: "active", CreatedAt: t.created, ExpiresAt: t.used.Add(e.TxIdle),
		Statements: append([]TxStatement{}, t.statements...)}
	if t.failed {
		info.Status = "failed"
	}
	for _, s := range t.statements {
		info.RowsAffected += s.RowsAffected
	}
	return info
}

func txNotFound(id string) error {
	return fmt.Errorf("%w: transaction %s is not open (it may have expired)", ErrNotFound, id)
}

func newID() string {
	b := make([]byte, 12)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}
