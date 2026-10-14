package pg

import (
	"context"
	"fmt"
	"slices"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/amtzespinosa/gresbase/internal/pg/capabilities"
)

// ConnectionInfo is the body of GET /api/v1/connection. It never includes the password.
type ConnectionInfo struct {
	Database         string             `json:"database"`
	User             string             `json:"user"`
	Host             string             `json:"host"`
	Port             uint16             `json:"port"`
	ServerVersion    string             `json:"server_version"`
	ServerVersionNum int                `json:"server_version_num"`
	ReadOnly         bool               `json:"read_only"`
	Extensions       Extensions         `json:"extensions"`
	SupportLevel     capabilities.Level `json:"support_level"`
	Capabilities     capabilities.Set   `json:"capabilities"`
}

// Extensions reports optional extensions the UI cares about.
type Extensions struct {
	PgStatStatements bool `json:"pg_stat_statements"`
}

// Info describes the server the pool talks to.
func Info(ctx context.Context, pool *pgxpool.Pool) (ConnectionInfo, error) {
	cc := pool.Config().ConnConfig
	ci := ConnectionInfo{Host: cc.Host, Port: cc.Port}
	var exts []string
	err := pool.QueryRow(ctx, `SELECT current_database(), current_user,
		current_setting('server_version'), current_setting('server_version_num')::int,
		current_setting('default_transaction_read_only') = 'on',
		ARRAY(SELECT extname::text FROM pg_extension)`).
		Scan(&ci.Database, &ci.User, &ci.ServerVersion, &ci.ServerVersionNum, &ci.ReadOnly, &exts)
	if err != nil {
		return ConnectionInfo{}, fmt.Errorf("connection info: %w", err)
	}
	ci.Extensions.PgStatStatements = slices.Contains(exts, "pg_stat_statements")
	ci.SupportLevel = capabilities.SupportLevel(ci.ServerVersion, ci.ServerVersionNum)
	ci.Capabilities = capabilities.Compute(ci.ServerVersionNum, exts)
	return ci, nil
}
