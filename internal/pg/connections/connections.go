// Package connections keeps the databases Gresbase can talk to and, for each, a lazily opened pool
// with the state that must never mix between databases: introspection cache, value types, SQL
// transactions and the undo history.
package connections

import (
	"context"
	"errors"
	"log/slog"
	"slices"
	"sync"
	"sync/atomic"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/amtzespinosa/gresbase/internal/config"
	"github.com/amtzespinosa/gresbase/internal/pg"
	"github.com/amtzespinosa/gresbase/internal/pg/introspect"
	"github.com/amtzespinosa/gresbase/internal/pg/pgvalue"
	"github.com/amtzespinosa/gresbase/internal/pg/sqlexec"
	"github.com/amtzespinosa/gresbase/internal/pg/write"
)

// Source says where a connection comes from.
type Source string

// Connection sources.
const (
	Env   Source = "env"   // DATABASE_URL: locked, its pool never closes for inactivity
	Saved Source = "saved" // saved in the settings file
	Adhoc Source = "adhoc" // typed at login in free mode, lives with its session
)

// EnvID is the id of the DATABASE_URL connection.
const EnvID = "env"

// Connection describes a database. DSN carries the password: it is a config.Secret, so it never
// prints, logs or serializes.
type Connection struct {
	ID       string
	Source   Source
	DSN      config.Secret
	ReadOnly bool   // on top of GRESBASE_READ_ONLY, which applies to every connection
	Owner    string // the only session that may use it (adhoc); "" for every session
	// Adhoc connections only: pool size (0: GRESBASE_MAX_CONNS), allowed servers and expiry.
	MaxConns     int
	AllowedHosts []string
	Expires      time.Time
}

// Conn is an open connection: its pool and its per-database state.
type Conn struct {
	Connection
	ReadOnly bool // effective: GRESBASE_READ_ONLY or the connection's own flag
	Pool     *pgxpool.Pool
	Catalog  *introspect.Catalog
	Types    *pgvalue.Types
	Writer   *write.Writer
	SQL      *sqlexec.Executor

	users atomic.Int64 // requests holding it
	used  atomic.Int64 // Manager.clock() of the last release
}

// Errors of Acquire.
var (
	ErrNotFound = errors.New("no such connection")
	ErrTooMany  = errors.New("too many open database pools")
)

// Manager is the registry of connections. Safe for concurrent use.
type Manager struct {
	// SQLMaxRows gives the live default row limit of SQL results (the sql_max_rows setting); set it
	// before serving. nil uses GRESBASE_SQL_MAX_ROWS.
	SQLMaxRows func() int

	cfg config.Config
	log *slog.Logger

	mu    sync.Mutex
	defs  map[string]Connection
	order []string // ids in registration order
	open  map[string]*Conn
	start time.Time // origin of clock
}

// New returns an empty manager. cfg gives the limits (MaxPools, PoolIdleTimeout) and the settings
// every pool shares (statement timeout, connections per pool, read-only, import timeout).
func New(cfg config.Config, log *slog.Logger) *Manager {
	return &Manager{cfg: cfg, log: log, defs: map[string]Connection{}, open: map[string]*Conn{}, start: time.Now()}
}

// clock is monotonic nanoseconds since New. Idle times never use the wall clock: a clock step (NTP,
// a VM resuming) would close busy pools or keep idle ones open.
func (m *Manager) clock() int64 { return int64(time.Since(m.start)) }

// Add registers c, replacing (and closing) a connection with the same id.
func (m *Manager) Add(c Connection) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.closeLocked(c.ID)
	if _, ok := m.defs[c.ID]; !ok {
		m.order = append(m.order, c.ID)
	}
	m.defs[c.ID] = c
}

// AddEnv registers the DATABASE_URL connection with the pool opened (and checked) at startup.
func (m *Manager) AddEnv(pool *pgxpool.Pool) {
	m.mu.Lock()
	defer m.mu.Unlock()
	c := Connection{ID: EnvID, Source: Env, DSN: m.cfg.DatabaseURL}
	if _, ok := m.defs[EnvID]; !ok {
		m.order = append(m.order, EnvID)
	}
	m.defs[EnvID] = c
	m.open[EnvID] = m.build(c, pool)
}

// Remove closes and forgets the connection id.
func (m *Manager) Remove(id string) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.removeLocked(id)
}

func (m *Manager) removeLocked(id string) {
	m.closeLocked(id)
	delete(m.defs, id)
	m.order = slices.DeleteFunc(m.order, func(o string) bool { return o == id })
}

// RemoveOwned closes and forgets the adhoc connections of session (sign out, switch connection).
func (m *Manager) RemoveOwned(session string) {
	m.mu.Lock()
	defer m.mu.Unlock()
	for _, id := range slices.Clone(m.order) {
		if d := m.defs[id]; d.Source == Adhoc && d.Owner == session {
			m.removeLocked(id)
		}
	}
}

// Owns reports whether session still has an adhoc connection: a free mode session lives with it.
func (m *Manager) Owns(session string) bool {
	m.mu.Lock()
	defer m.mu.Unlock()
	for _, d := range m.defs {
		if d.Source == Adhoc && d.Owner == session && (d.Expires.IsZero() || time.Now().Before(d.Expires)) {
			return true
		}
	}
	return false
}

// Adhoc is the number of live adhoc connections (free mode sessions).
func (m *Manager) Adhoc() int {
	m.mu.Lock()
	defer m.mu.Unlock()
	n, now := 0, time.Now()
	for _, d := range m.defs {
		if d.Source == Adhoc && (d.Expires.IsZero() || now.Before(d.Expires)) {
			n++
		}
	}
	return n
}

// DefaultID is the connection of the routes without one: the session's own adhoc connection, else
// DATABASE_URL's, else the first saved one; "" when there is none.
func (m *Manager) DefaultID(session string) string {
	m.mu.Lock()
	defer m.mu.Unlock()
	env, saved := "", ""
	for _, id := range m.order {
		switch d := m.defs[id]; {
		case d.Source == Adhoc && d.Owner == session:
			return id
		case d.Source == Env:
			env = id
		case d.Source == Saved && saved == "":
			saved = id
		}
	}
	if env != "" {
		return env
	}
	return saved
}

// Acquire returns the open connection id for session, opening its pool on first use. Call release
// when the request is done with it (after streaming, for exports).
func (m *Manager) Acquire(ctx context.Context, id, session string) (c *Conn, release func(), err error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	def, ok := m.defs[id]
	if !ok || (def.Owner != "" && def.Owner != session) {
		return nil, nil, ErrNotFound
	}
	if c = m.open[id]; c == nil {
		if len(m.open) >= m.cfg.MaxPools && !m.evictLocked(func(*Conn) bool { return true }) {
			return nil, nil, ErrTooMany
		}
		cfg := m.cfg
		cfg.DatabaseURL, cfg.ReadOnly = def.DSN, cfg.ReadOnly || def.ReadOnly
		if def.MaxConns > 0 {
			cfg.MaxConns = def.MaxConns
		}
		pc, err := pg.PoolConfig(cfg)
		if err != nil {
			return nil, nil, err
		}
		pg.RestrictHosts(&pc.ConnConfig.Config, def.AllowedHosts)
		// No round trip here: pgxpool connects on first query.
		pool, err := pgxpool.NewWithConfig(ctx, pc)
		if err != nil {
			return nil, nil, err
		}
		c = m.build(def, pool)
		m.open[id] = c
		m.log.Info("database pool opened", "connection", id, "source", def.Source, "database", config.RedactDSN(def.DSN.Reveal()))
	}
	c.users.Add(1)
	var once sync.Once
	return c, func() {
		once.Do(func() {
			c.used.Store(m.clock())
			c.users.Add(-1)
		})
	}, nil
}

func (m *Manager) build(def Connection, pool *pgxpool.Pool) *Conn {
	c := &Conn{Connection: def, ReadOnly: m.cfg.ReadOnly || def.ReadOnly, Pool: pool,
		Catalog: introspect.New(pool), Types: pgvalue.NewTypes()}
	c.Writer = write.New(pool, c.Types, c.Catalog, nil)
	if m.cfg.ImportTimeout > 0 {
		c.Writer.ImportTimeout = m.cfg.ImportTimeout
	}
	c.SQL = sqlexec.New(pool, c.Types, c.ReadOnly, m.cfg.StatementTimeout)
	c.SQL.MaxRows = m.maxRows
	c.used.Store(m.clock())
	return c
}

// idle reports whether nothing uses c: no request holds it and it has no open SQL transaction.
func idle(c *Conn) bool { return c.users.Load() == 0 && c.SQL.OpenTxs() == 0 }

// evictLocked closes the least recently used idle pool that pick accepts. The DATABASE_URL pool
// is never evicted.
func (m *Manager) evictLocked(pick func(*Conn) bool) bool {
	var lru *Conn
	for _, c := range m.open {
		if c.Source != Env && idle(c) && pick(c) && (lru == nil || c.used.Load() < lru.used.Load()) {
			lru = c
		}
	}
	if lru == nil {
		return false
	}
	m.closeLocked(lru.ID)
	return true
}

func (m *Manager) closeLocked(id string) {
	if c := m.open[id]; c != nil {
		delete(m.open, id)
		// ponytail: a removed connection with requests or transactions in flight cuts them off;
		// B07 disconnects adhoc sessions this way on purpose.
		go c.Pool.Close() // Close waits for acquired connections; never under m.mu
		m.log.Info("database pool closed", "connection", id)
	}
}

// Sweep forgets expired adhoc connections (their session ended) and closes the pools idle for
// longer than PoolIdleTimeout.
func (m *Manager) Sweep() {
	m.mu.Lock()
	defer m.mu.Unlock()
	now := time.Now()
	for _, id := range slices.Clone(m.order) {
		if d := m.defs[id]; d.Source == Adhoc && !d.Expires.IsZero() && now.After(d.Expires) {
			m.removeLocked(id)
		}
	}
	cutoff := m.clock() - int64(m.cfg.PoolIdleTimeout)
	for m.evictLocked(func(c *Conn) bool { return c.used.Load() < cutoff }) {
	}
}

// Run sweeps idle pools until ctx ends. It leaves them open: call Close once requests are done.
func (m *Manager) Run(ctx context.Context) {
	t := time.NewTicker(min(m.cfg.PoolIdleTimeout/2, time.Minute))
	defer t.Stop()
	for {
		select {
		case <-t.C:
			m.Sweep()
		case <-ctx.Done():
			return
		}
	}
}

// Close closes every pool it opened and waits for them. The DATABASE_URL pool belongs to whoever
// passed it to AddEnv.
func (m *Manager) Close() {
	m.mu.Lock()
	var pools []*pgxpool.Pool
	for id, c := range m.open {
		if c.Source != Env {
			pools = append(pools, c.Pool)
			delete(m.open, id)
		}
	}
	m.mu.Unlock()
	for _, p := range pools {
		p.Close()
	}
}

// Open is the number of open pools.
func (m *Manager) Open() int {
	m.mu.Lock()
	defer m.mu.Unlock()
	return len(m.open)
}

type ctxKey struct{}

// With returns ctx carrying c.
func With(ctx context.Context, c *Conn) context.Context { return context.WithValue(ctx, ctxKey{}, c) }

// From returns the connection of the request; handlers behind the connection middleware always
// have one.
func From(ctx context.Context) *Conn {
	c, _ := ctx.Value(ctxKey{}).(*Conn)
	return c
}

// maxRows is the default row limit of SQL results: the live setting, else the configuration.
func (m *Manager) maxRows() int {
	if m.SQLMaxRows != nil {
		return m.SQLMaxRows()
	}
	return m.cfg.SQLMaxRows
}
