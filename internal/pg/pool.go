package pg

import (
	"context"
	"errors"
	"log/slog"
	"strconv"
	"time"

	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/amtzespinosa/gresbase/internal/config"
)

// connectWindow is how long Connect keeps retrying before giving up.
const connectWindow = 30 * time.Second

// PoolConfig builds the pool configuration: every connection carries the application name, the
// statement timeout, ISO date and interval output and, in read-only mode, read-only transactions.
func PoolConfig(cfg config.Config) (*pgxpool.Config, error) {
	pc, err := pgxpool.ParseConfig(cfg.DatabaseURL.Reveal())
	if err != nil {
		// pgx redacts the password in parse errors, but we do not echo the input anyway.
		return nil, errors.New("DATABASE_URL is not a valid connection string")
	}
	pc.MaxConns = int32(min(cfg.MaxConns, 1000)) //nolint:gosec // bounded by config validation
	rp := pc.ConnConfig.RuntimeParams
	rp["application_name"] = "gresbase"
	rp["statement_timeout"] = strconv.FormatInt(cfg.StatementTimeout.Milliseconds(), 10)
	rp["DateStyle"] = "ISO"
	rp["IntervalStyle"] = "iso_8601"
	rp["bytea_output"] = "hex"
	if cfg.ReadOnly {
		rp["default_transaction_read_only"] = "on"
	}
	pc.ConnConfig.OnNotice = OnNotice
	return pc, nil
}

const noticeKey = "gresbase.notice"

// OnNotice is the pool notice handler: it passes notices to the handler set on the connection with
// SetNoticeHandler and drops them otherwise.
func OnNotice(c *pgconn.PgConn, n *pgconn.Notice) {
	if f, ok := c.CustomData()[noticeKey].(func(*pgconn.Notice)); ok {
		f(n)
	}
}

// SetNoticeHandler makes the notices of c go to f (nil stops it). Connections need OnNotice.
func SetNoticeHandler(c *pgconn.PgConn, f func(*pgconn.Notice)) {
	if f == nil {
		delete(c.CustomData(), noticeKey)
		return
	}
	c.CustomData()[noticeKey] = f
}

// Connect opens the pool and waits until the database answers, retrying with backoff for up to
// 30 s (or until ctx ends). Permanent failures (credentials, missing database, SSL) stop at once.
// The returned error is a *ConnectError explaining what went wrong.
func Connect(ctx context.Context, cfg config.Config, log *slog.Logger) (*pgxpool.Pool, error) {
	pc, err := PoolConfig(cfg)
	if err != nil {
		return nil, err
	}
	pool, err := pgxpool.NewWithConfig(ctx, pc)
	if err != nil {
		return nil, classify(err)
	}

	ctx, cancel := context.WithTimeout(ctx, connectWindow)
	defer cancel()
	var last error
	for delay := 250 * time.Millisecond; ; delay = min(delay*2, 2*time.Second) {
		err := pool.Ping(ctx)
		if err == nil {
			var version string
			var num int
			err = pool.QueryRow(ctx, `SELECT current_setting('server_version'),
				current_setting('server_version_num')::int`).Scan(&version, &num)
			if err == nil {
				err = checkVersion(version, num)
			}
			if err == nil {
				return pool, nil
			}
			var ce *ConnectError
			if errors.As(err, &ce) {
				pool.Close()
				return nil, ce
			}
		}
		if ctx.Err() == nil || last == nil {
			last = err
		}
		ce := classify(last)
		if ce.permanent() || ctx.Err() != nil {
			pool.Close()
			return nil, ce
		}
		log.Warn("database not ready, retrying", "database", cfg.RedactedDSN(), "reason", ce.Kind, "retry_in", delay)
		select {
		case <-ctx.Done():
		case <-time.After(delay):
		}
	}
}
