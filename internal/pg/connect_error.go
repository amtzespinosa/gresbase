package pg

import (
	"context"
	"errors"
	"fmt"
	"net"
	"strings"
	"syscall"
	"time"

	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/amtzespinosa/gresbase/internal/config"

	"github.com/amtzespinosa/gresbase/internal/pg/capabilities"
)

// Kinds of connection failure.
const (
	KindDNS         = "dns"
	KindRefused     = "connection_refused"
	KindAuth        = "authentication"
	KindSSL         = "ssl"
	KindDatabase    = "database_not_found"
	KindTimeout     = "timeout"
	KindOther       = "other"
	KindUnsupported = "unsupported_version"
	KindNotAllowed  = "host_not_allowed"
)

var connectHints = map[string]string{
	KindDNS:         "the host name in DATABASE_URL does not resolve; check it and that both containers share a network",
	KindRefused:     "nothing is listening at that host and port; check that Postgres is running and the port is right",
	KindAuth:        "Postgres rejected the user or password in DATABASE_URL (or pg_hba.conf does not allow this client)",
	KindSSL:         "the SSL negotiation failed; adjust sslmode in DATABASE_URL (disable, prefer, require, verify-full)",
	KindDatabase:    "the database in DATABASE_URL does not exist; create it or fix the name",
	KindTimeout:     "the server did not answer in time; check the host, the network and firewalls",
	KindOther:       "see the error above",
	KindUnsupported: "Gresbase needs PostgreSQL 12 or newer; upgrade the server or use an older tool",
	KindNotAllowed:  "the server is not in GRESBASE_ALLOWED_DB_HOSTS",
}

// ConnectError explains why Gresbase could not reach the database.
type ConnectError struct {
	Kind string
	Hint string
	Err  error
}

func (e *ConnectError) Error() string {
	return fmt.Sprintf("cannot connect to PostgreSQL (%s): %v\nhint: %s", e.Kind, e.Err, e.Hint)
}

func (e *ConnectError) Unwrap() error { return e.Err }

// permanent failures will not fix themselves by retrying.
func (e *ConnectError) permanent() bool {
	return e.Kind == KindAuth || e.Kind == KindDatabase || e.Kind == KindSSL || e.Kind == KindUnsupported
}

func classify(err error) *ConnectError {
	kind := KindOther
	var pgErr *pgconn.PgError
	var dnsErr *net.DNSError
	var netErr net.Error
	switch {
	case errors.Is(err, ErrHostNotAllowed):
		kind = KindNotAllowed
	case errors.As(err, &pgErr) && (pgErr.Code == "28P01" || pgErr.Code == "28000"):
		kind = KindAuth
	case errors.As(err, &pgErr) && pgErr.Code == "3D000":
		kind = KindDatabase
	case errors.As(err, &dnsErr):
		kind = KindDNS
	case errors.Is(err, syscall.ECONNREFUSED):
		kind = KindRefused
	case isTLS(err):
		kind = KindSSL
	case errors.Is(err, context.DeadlineExceeded) || (errors.As(err, &netErr) && netErr.Timeout()):
		kind = KindTimeout
	}
	return &ConnectError{Kind: kind, Hint: connectHints[kind], Err: err}
}

// isTLS spots TLS failures. pgconn reports them as plain strings, so we match on the text.
// ponytail: string match; switch to typed errors if pgx ever exposes them.
func isTLS(err error) bool {
	msg := err.Error()
	for _, s := range []string{"TLS", "tls:", "SSL", "x509:"} {
		if strings.Contains(msg, s) {
			return true
		}
	}
	return false
}

// checkVersion refuses servers older than PostgreSQL 12.
func checkVersion(version string, versionNum int) error {
	if versionNum >= capabilities.MinVersion {
		return nil
	}
	return &ConnectError{Kind: KindUnsupported, Hint: connectHints[KindUnsupported],
		Err: fmt.Errorf("server is PostgreSQL %s; Gresbase needs PostgreSQL 12 or newer", version)}
}

// probeTimeout bounds a Probe: a form waits for it.
const probeTimeout = 10 * time.Second

// Probe connects once (no retries) with cfg.DatabaseURL, to the allowed hosts only (empty: any),
// and describes the server. Failures are a
// *ConnectError; servers older than PostgreSQL 12 are refused with KindUnsupported.
func Probe(ctx context.Context, cfg config.Config, allowed []string) (ConnectionInfo, error) {
	pc, err := PoolConfig(cfg)
	if err != nil {
		return ConnectionInfo{}, &ConnectError{Kind: KindOther, Err: err}
	}
	pc.MaxConns = 1
	RestrictHosts(&pc.ConnConfig.Config, allowed)
	ctx, cancel := context.WithTimeout(ctx, probeTimeout)
	defer cancel()
	pool, err := pgxpool.NewWithConfig(ctx, pc)
	if err != nil {
		return ConnectionInfo{}, classify(err)
	}
	defer pool.Close()
	info, err := Info(ctx, pool)
	if err != nil {
		return ConnectionInfo{}, classify(err)
	}
	if err := checkVersion(info.ServerVersion, info.ServerVersionNum); err != nil {
		return ConnectionInfo{}, err
	}
	return info, nil
}
