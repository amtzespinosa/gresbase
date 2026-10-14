package server

// ConfigResponse is the body of GET /api/v1/config (exported to TypeScript by tygo).
type ConfigResponse struct {
	Version        string `json:"version"`
	Lang           string `json:"lang"`
	ReadOnly       bool   `json:"read_only"`
	AuthEnabled    bool   `json:"auth_enabled"`
	BasePath       string `json:"base_path"`
	DataPersistent bool   `json:"data_persistent"`
	// DataLoss says why the data dir would not keep saved queries and settings (empty when it would):
	// not_writable and tmpfs lose them on restart, anonymous_volume and container_layer when the
	// container is removed. DataPersistent is DataLoss == "".
	DataLoss string `json:"data_loss,omitempty"`
	// StatementTimeoutMS is GRESBASE_STATEMENT_TIMEOUT, the default timeout of SQL executions.
	StatementTimeoutMS int64 `json:"statement_timeout_ms"`
	// SQLMaxRows is the default row limit of SQL editor results (GRESBASE_SQL_MAX_ROWS, live).
	SQLMaxRows int `json:"sql_max_rows"`
	// SetupRequired is true until the setup wizard (or DATABASE_URL) configures a connection.
	SetupRequired bool `json:"setup_required"`
	// FreeMode: sign in with Postgres credentials (POST /api/v1/auth/connect), nothing saved.
	FreeMode bool `json:"free_mode"`
	// DBHost, DBPort, DBName and DBUser are fixed by GRESBASE_DB_HOST/PORT/NAME/USER ("" and 0 when
	// free to choose).
	DBHost string `json:"db_host"`
	DBPort int    `json:"db_port"`
	DBName string `json:"db_name"`
	DBUser string `json:"db_user"`
}

// SetupStatus is the body of GET /api/v1/setup.
type SetupStatus struct {
	// Required is true while Gresbase has no connection and the wizard has not been completed.
	Required bool `json:"required"`
	// TokenRequired is true when the request does not come from this machine: the wizard needs the
	// setup token printed in the logs (or GRESBASE_SETUP_TOKEN).
	TokenRequired bool `json:"token_required"`
	// Container is the hostname (container id) to name in "docker exec <container> /gresbase
	// setup-token"; empty outside a container or with GRESBASE_SETUP_TOKEN.
	Container      string `json:"container,omitempty"`
	DataPersistent bool   `json:"data_persistent"`
	// DataLoss says why the data dir would not keep saved queries and settings (empty when it would):
	// not_writable and tmpfs lose them on restart, anonymous_volume and container_layer when the
	// container is removed. DataPersistent is DataLoss == "".
	DataLoss   string `json:"data_loss,omitempty"`
	LangLocked bool   `json:"lang_locked"`
	// AccountLocked: GRESBASE_USER/GRESBASE_PASSWORD define the administrator; the wizard skips it.
	AccountLocked   bool   `json:"account_locked"`
	AccountUsername string `json:"account_username,omitempty"`
	// DBHost, DBPort, DBName and DBUser are fixed by GRESBASE_DB_HOST/PORT/NAME/USER ("" and 0 when
	// free).
	DBHost string `json:"db_host,omitempty"`
	DBPort int    `json:"db_port,omitempty"`
	DBName string `json:"db_name,omitempty"`
	DBUser string `json:"db_user,omitempty"`
}

// ConnectionInput is a connection typed in a form. The password is never sent back.
type ConnectionInput struct {
	Host     string `json:"host"`
	Port     int    `json:"port"`
	Database string `json:"database"`
	User     string `json:"user"`
	Password string `json:"password"`
	SSLMode  string `json:"sslmode" tstype:"'disable' | 'prefer' | 'require' | 'verify-ca' | 'verify-full'"`
	ReadOnly bool   `json:"read_only"`
}

// ConnectionTest is the body of a successful "Test connection".
type ConnectionTest struct {
	ServerVersion    string `json:"server_version"`
	ServerVersionNum int    `json:"server_version_num"`
	SupportLevel     string `json:"support_level" tstype:"SupportLevel"`
}

// SetupAdmin is the administrator account created by the wizard.
type SetupAdmin struct {
	Username string `json:"username"`
	Password string `json:"password"`
}

// SetupRequest is the body of POST /api/v1/setup: everything the wizard collected.
type SetupRequest struct {
	Mode string `json:"mode" tstype:"'saved' | 'free'"`
	// Lang becomes the server language unless GRESBASE_LANG sets it.
	Lang       string           `json:"lang"`
	Admin      *SetupAdmin      `json:"admin"`
	Connection *ConnectionInput `json:"connection"`
}

// SetupResult is the body of a completed setup.
type SetupResult struct {
	// SignedIn is true when the wizard left the new administrator signed in.
	SignedIn bool `json:"signed_in"`
}

// ConnectionEntry is one connection of GET /api/v1/connections. It never includes the password.
type ConnectionEntry struct {
	ID       string `json:"id"`
	Source   string `json:"source" tstype:"'env' | 'saved'"`
	Name     string `json:"name"`
	Color    string `json:"color" tstype:"LabelColor"`
	Host     string `json:"host"`
	Port     int    `json:"port"`
	Database string `json:"database"`
	User     string `json:"user"`
	SSLMode  string `json:"sslmode"`
	ReadOnly bool   `json:"read_only"`
	// Locked is the DATABASE_URL connection: the environment defines it, the app cannot change it.
	Locked bool `json:"locked"`
}

// ConnectionList is the body of GET /api/v1/connections.
type ConnectionList struct {
	// DefaultID is the connection of the routes without one (the session's own in free mode);
	// "" when there is none.
	DefaultID string `json:"default_id"`
	// Connections are the ones an administrator can pick and manage; empty for other sessions.
	Connections []ConnectionEntry `json:"connections"`
}

// SavedConnectionInput creates (POST) or replaces (PUT) a saved connection. On PUT an empty
// password keeps the stored one.
type SavedConnectionInput struct {
	Name       string          `json:"name"`
	Color      string          `json:"color" tstype:"LabelColor"`
	Connection ConnectionInput `json:"connection"`
}

// ConnectionTestRequest is the body of POST /api/v1/connections:test. With the ID of a saved
// connection, an empty password tests with the stored one (editing without retyping it).
type ConnectionTestRequest struct {
	ID         string          `json:"id,omitempty"`
	Connection ConnectionInput `json:"connection"`
}
