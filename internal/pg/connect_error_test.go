package pg

import (
	"context"
	"errors"
	"fmt"
	"net"
	"strings"
	"syscall"
	"testing"

	"github.com/jackc/pgx/v5/pgconn"
)

func TestClassify(t *testing.T) {
	tests := []struct {
		name string
		err  error
		want string
	}{
		{"dns", fmt.Errorf("dial: %w", &net.DNSError{Err: "no such host", Name: "db"}), KindDNS},
		{"refused", fmt.Errorf("dial tcp: %w", syscall.ECONNREFUSED), KindRefused},
		{"bad password", &pgconn.PgError{Code: "28P01"}, KindAuth},
		{"pg_hba", &pgconn.PgError{Code: "28000", Message: "no pg_hba.conf entry, SSL off"}, KindAuth},
		{"no database", fmt.Errorf("connect: %w", &pgconn.PgError{Code: "3D000"}), KindDatabase},
		{"tls refused", errors.New("server refused TLS connection"), KindSSL},
		{"bad cert", errors.New("tls: failed to verify certificate: x509: unknown authority"), KindSSL},
		{"deadline", fmt.Errorf("ping: %w", context.DeadlineExceeded), KindTimeout},
		{"net timeout", &net.OpError{Op: "dial", Err: timeoutErr{}}, KindTimeout},
		{"other", errors.New("boom"), KindOther},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			ce := classify(tt.err)
			if ce.Kind != tt.want {
				t.Fatalf("kind = %s, want %s", ce.Kind, tt.want)
			}
			if ce.Hint == "" || !errors.Is(ce, tt.err) {
				t.Fatalf("missing hint or unwrap: %+v", ce)
			}
		})
	}
}

type timeoutErr struct{}

func (timeoutErr) Error() string   { return "i/o timeout" }
func (timeoutErr) Timeout() bool   { return true }
func (timeoutErr) Temporary() bool { return true }

func TestCheckVersion(t *testing.T) {
	tests := []struct {
		version string
		num     int
		ok      bool
	}{
		{"11.22 (Debian 11.22-1.pgdg120+1)", 110022, false},
		{"9.6.24", 90624, false},
		{"12.22", 120022, true},
		{"19beta4", 190000, true},
	}
	for _, tt := range tests {
		err := checkVersion(tt.version, tt.num)
		if (err == nil) != tt.ok {
			t.Fatalf("%s: err = %v", tt.version, err)
		}
		if err == nil {
			continue
		}
		var ce *ConnectError
		if !errors.As(err, &ce) || ce.Kind != KindUnsupported || !ce.permanent() ||
			!strings.Contains(err.Error(), "PostgreSQL 12 or newer") || !strings.Contains(err.Error(), tt.version) {
			t.Fatalf("%s: unexpected error %v", tt.version, err)
		}
	}
}
