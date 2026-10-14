package config

import (
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"log/slog"
	"net"
	"net/netip"
	"net/url"
	"regexp"
	"strconv"
	"strings"
	"time"
)

// Secret is a string that never prints its value: fmt, slog and JSON all see "****".
type Secret string

const redacted = "****"

func (s Secret) String() string { return redacted }

// GoString keeps %#v from leaking the value.
func (s Secret) GoString() string { return redacted }

// LogValue implements slog.LogValuer.
func (s Secret) LogValue() slog.Value { return slog.StringValue(redacted) }

// MarshalText keeps JSON and other encoders from leaking the value.
func (s Secret) MarshalText() ([]byte, error) { return []byte(redacted), nil }

// Reveal returns the raw value. Use it only where the secret is consumed.
func (s Secret) Reveal() string { return string(s) }

// Config holds every GRESBASE_* setting plus DATABASE_URL.
type Config struct {
	DatabaseURL      Secret
	Port             int
	BasePath         string // "" for root, otherwise "/prefix" without trailing slash
	User             string
	Password         Secret
	SessionSecret    Secret
	SessionTTL       time.Duration
	AllowedHosts     []string
	ReadOnly         bool
	StatementTimeout time.Duration
	ImportTimeout    time.Duration // statement and overall limit of a CSV import
	SQLMaxRows       int           // default row limit of a SQL editor result
	MaxConns         int           // connections per pool
	MaxPools         int           // open pools across every connection
	PoolIdleTimeout  time.Duration // an unused pool (other than DATABASE_URL's) closes after this
	DataDir          string
	// DBHost, DBPort, DBName and DBUser fix those fields of the connection forms (setup wizard,
	// saved connections, free mode); with all of them, free mode only asks for the password.
	DBHost string
	DBPort int // 0 when not fixed
	DBName string
	DBUser string
	// ModeFree forces free mode: sign in with Postgres credentials, nothing saved.
	ModeFree bool
	// AllowedDBHosts limits the servers of free mode (host names, IPs or CIDRs); empty allows any.
	AllowedDBHosts []string
	MaxSessions    int // simultaneous free mode sessions
	// TrustedProxies are the reverse proxies (IPs or CIDRs) whose X-Forwarded-For names the real
	// client for the login rate limit; empty trusts no header.
	TrustedProxies []netip.Prefix
	// SetupToken unlocks the setup wizard for non-local requests; random and logged when empty.
	SetupToken Secret
	Lang       string
	LogLevel   slog.Level
	LogFormat  string
}

// AuthEnabled reports whether login is required (both user and password set).
func (c Config) AuthEnabled() bool { return c.User != "" && c.Password != "" }

// RedactedDSN returns DATABASE_URL with the password replaced by "****".
func (c Config) RedactedDSN() string { return RedactDSN(c.DatabaseURL.Reveal()) }

// RedactDSN replaces the password of a postgres URL (userinfo or ?password=) with "****".
// Unparseable input is fully redacted, since we cannot know where the password is.
func RedactDSN(dsn string) string {
	u, err := url.Parse(dsn)
	if err != nil {
		return redacted
	}
	if _, ok := u.User.Password(); ok {
		u.User = url.UserPassword(u.User.Username(), redacted)
	}
	if q := u.Query(); q.Has("password") {
		q.Set("password", redacted)
		u.RawQuery = q.Encode()
	}
	return strings.ReplaceAll(u.String(), url.QueryEscape(redacted), redacted)
}

// String never includes secrets.
func (c Config) String() string {
	return fmt.Sprintf("Config{database=%s port=%d base_path=%q auth=%t read_only=%t lang=%s}",
		c.RedactedDSN(), c.Port, c.BasePath, c.AuthEnabled(), c.ReadOnly, c.Lang)
}

// LogValue implements slog.LogValuer without secrets.
func (c Config) LogValue() slog.Value {
	return slog.GroupValue(
		slog.String("database", c.RedactedDSN()),
		slog.Int("port", c.Port),
		slog.String("base_path", c.BasePath),
		slog.Bool("auth_enabled", c.AuthEnabled()),
		slog.Any("allowed_hosts", c.AllowedHosts),
		slog.Bool("read_only", c.ReadOnly),
		slog.Duration("statement_timeout", c.StatementTimeout),
		slog.Duration("import_timeout", c.ImportTimeout),
		slog.Int("sql_max_rows", c.SQLMaxRows),
		slog.Int("max_conns", c.MaxConns),
		slog.Int("max_pools", c.MaxPools),
		slog.Duration("pool_idle_timeout", c.PoolIdleTimeout),
		slog.String("data_dir", c.DataDir),
		slog.String("lang", c.Lang),
		slog.String("log_level", c.LogLevel.String()),
		slog.String("log_format", c.LogFormat),
	)
}

var basePathRe = regexp.MustCompile(`^(/[A-Za-z0-9._~-]+)+$`)

// Load reads the configuration through getenv (os.Getenv in production) and returns every
// validation error at once.
func Load(getenv func(string) string) (Config, error) {
	var errs []error
	fail := func(name, format string, args ...any) {
		errs = append(errs, fmt.Errorf("%s: "+format, append([]any{name}, args...)...))
	}
	get := func(name, def string) string {
		if v := strings.TrimSpace(getenv(name)); v != "" {
			return v
		}
		return def
	}
	duration := func(name, def string) time.Duration {
		v := get(name, def)
		d, err := time.ParseDuration(v)
		if err != nil || d <= 0 {
			fail(name, "must be a positive duration like 30s or 12h (got %q)", v)
		}
		return d
	}
	integer := func(name, def string, lo, hi int) int {
		v := get(name, def)
		n, err := strconv.Atoi(v)
		if err != nil || n < lo || n > hi {
			fail(name, "must be an integer between %d and %d (got %q)", lo, hi, v)
		}
		return n
	}
	oneOf := func(name, def string, allowed ...string) string {
		v := strings.ToLower(get(name, def))
		for _, a := range allowed {
			if v == a {
				return v
			}
		}
		fail(name, "must be one of %s (got %q)", strings.Join(allowed, ", "), v)
		return v
	}

	c := Config{
		Port:             integer("GRESBASE_PORT", "8080", 1, 65535),
		User:             get("GRESBASE_USER", ""),
		Password:         Secret(get("GRESBASE_PASSWORD", "")),
		SessionTTL:       duration("GRESBASE_SESSION_TTL", "12h"),
		StatementTimeout: duration("GRESBASE_STATEMENT_TIMEOUT", "30s"),
		ImportTimeout:    duration("GRESBASE_IMPORT_TIMEOUT", "10m"),
		SQLMaxRows:       integer("GRESBASE_SQL_MAX_ROWS", "1000", 1, 100000),
		MaxConns:         integer("GRESBASE_MAX_CONNS", "10", 1, 1000),
		MaxPools:         integer("GRESBASE_MAX_POOLS", "20", 1, 1000),
		PoolIdleTimeout:  duration("GRESBASE_POOL_IDLE_TIMEOUT", "10m"),
		DataDir:          get("GRESBASE_DATA_DIR", "/data"),
		Lang:             oneOf("GRESBASE_LANG", "en", "en", "es"),
		LogFormat:        oneOf("GRESBASE_LOG_FORMAT", "text", "text", "json"),
	}

	dsn := get("DATABASE_URL", "")
	// Optional since v0.2: without it Gresbase starts the setup wizard or uses saved connections.
	if u, err := url.Parse(dsn); dsn != "" && (err != nil || (u.Scheme != "postgres" && u.Scheme != "postgresql")) {
		// Never echo the value: it contains the password.
		fail("DATABASE_URL", "must be a postgres:// or postgresql:// URL")
	}
	c.DatabaseURL = Secret(dsn)

	c.DBHost = get("GRESBASE_DB_HOST", "")
	c.DBName = get("GRESBASE_DB_NAME", "")
	c.DBUser = get("GRESBASE_DB_USER", "")
	c.MaxSessions = integer("GRESBASE_MAX_SESSIONS", "10", 1, 1000)
	for _, h := range strings.Split(get("GRESBASE_ALLOWED_DB_HOSTS", ""), ",") {
		if h = strings.ToLower(strings.TrimSpace(h)); h == "" {
			continue
		}
		if strings.Contains(h, "/") {
			if _, _, err := net.ParseCIDR(h); err != nil {
				fail("GRESBASE_ALLOWED_DB_HOSTS", "%q is not a valid CIDR", h)
			}
		}
		c.AllowedDBHosts = append(c.AllowedDBHosts, h)
	}
	for _, p := range strings.Split(get("GRESBASE_TRUSTED_PROXIES", ""), ",") {
		if p = strings.TrimSpace(p); p == "" {
			continue
		}
		prefix, err := netip.ParsePrefix(p)
		if err != nil {
			addr, aerr := netip.ParseAddr(p)
			if aerr != nil {
				fail("GRESBASE_TRUSTED_PROXIES", "%q is not an IP address or a CIDR", p)
				continue
			}
			prefix = netip.PrefixFrom(addr, addr.BitLen())
		}
		c.TrustedProxies = append(c.TrustedProxies, prefix.Masked())
	}
	if v := get("GRESBASE_MODE_FREE", "false"); v != "" {
		b, err := strconv.ParseBool(v)
		if err != nil {
			fail("GRESBASE_MODE_FREE", "must be true or false (got %q)", v)
		}
		c.ModeFree = b
	}
	if c.ModeFree && (dsn != "" || c.User != "") {
		fail("GRESBASE_MODE_FREE", "cannot be combined with DATABASE_URL or GRESBASE_USER: in free mode Postgres credentials are the login")
	}
	if v := get("GRESBASE_DB_PORT", ""); v != "" {
		c.DBPort = integer("GRESBASE_DB_PORT", v, 1, 65535)
	}
	if s := get("GRESBASE_SETUP_TOKEN", ""); s != "" {
		if len(s) < 16 {
			fail("GRESBASE_SETUP_TOKEN", "must be at least 16 characters")
		}
		c.SetupToken = Secret(s)
	}

	if bp := strings.TrimRight(get("GRESBASE_BASE_PATH", "/"), "/"); bp != "" && !basePathRe.MatchString(bp) {
		fail("GRESBASE_BASE_PATH", "must be a path like /gresbase (got %q)", bp)
	} else {
		c.BasePath = bp
	}

	if (c.User == "") != (c.Password == "") {
		fail("GRESBASE_USER/GRESBASE_PASSWORD", "set both to enable login, or neither")
	}

	if s := get("GRESBASE_SESSION_SECRET", ""); s != "" {
		if len(s) < 32 {
			fail("GRESBASE_SESSION_SECRET", "must be at least 32 characters")
		}
		c.SessionSecret = Secret(s)
	} else {
		b := make([]byte, 32)
		_, _ = rand.Read(b) // crypto/rand.Read never fails on supported platforms
		c.SessionSecret = Secret(hex.EncodeToString(b))
	}

	for _, h := range strings.Split(get("GRESBASE_ALLOWED_HOSTS", ""), ",") {
		if h = strings.ToLower(strings.TrimSpace(h)); h != "" {
			c.AllowedHosts = append(c.AllowedHosts, h)
		}
	}

	if v := get("GRESBASE_READ_ONLY", "false"); v != "" {
		b, err := strconv.ParseBool(v)
		if err != nil {
			fail("GRESBASE_READ_ONLY", "must be true or false (got %q)", v)
		}
		c.ReadOnly = b
	}

	if err := c.LogLevel.UnmarshalText([]byte(oneOf("GRESBASE_LOG_LEVEL", "info", "debug", "info", "warn", "error"))); err != nil {
		c.LogLevel = slog.LevelInfo
	}

	return c, errors.Join(errs...)
}
