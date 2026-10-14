package pg

import (
	"context"
	"errors"
	"net"
	"strings"

	"github.com/jackc/pgx/v5/pgconn"
)

// ErrHostNotAllowed means the server is outside GRESBASE_ALLOWED_DB_HOSTS.
var ErrHostNotAllowed = errors.New("database host not allowed by GRESBASE_ALLOWED_DB_HOSTS")

// AllowedAddrs resolves host and keeps the addresses the list allows. Entries are host names
// (allowing whatever they resolve to), IPs or CIDRs. DNS failures come back as they are.
func AllowedAddrs(ctx context.Context, host string, allowed []string) ([]string, error) {
	name := strings.ToLower(strings.TrimSuffix(host, "."))
	for _, a := range allowed {
		if a == name {
			return net.DefaultResolver.LookupHost(ctx, host)
		}
	}
	addrs := []string{name}
	if net.ParseIP(name) == nil {
		var err error
		if addrs, err = net.DefaultResolver.LookupHost(ctx, host); err != nil {
			return nil, err
		}
	}
	var ok []string
	for _, a := range addrs {
		if ipAllowed(net.ParseIP(a), allowed) {
			ok = append(ok, a)
		}
	}
	if len(ok) == 0 {
		return nil, ErrHostNotAllowed
	}
	return ok, nil
}

func ipAllowed(ip net.IP, allowed []string) bool {
	if ip == nil {
		return false
	}
	for _, a := range allowed {
		if _, n, err := net.ParseCIDR(a); err == nil && n.Contains(ip) {
			return true
		}
		if other := net.ParseIP(a); other != nil && other.Equal(ip) {
			return true
		}
	}
	return false
}

// RestrictHosts makes every connection of cc resolve through AllowedAddrs, so a DNS answer that
// changes after the check cannot point a connection at another server. An empty list allows any.
func RestrictHosts(cc *pgconn.Config, allowed []string) {
	if len(allowed) == 0 {
		return
	}
	cc.LookupFunc = func(ctx context.Context, host string) ([]string, error) {
		return AllowedAddrs(ctx, host, allowed)
	}
}
