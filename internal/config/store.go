package config

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io/fs"
	"maps"
	"net"
	"net/url"
	"os"
	"path/filepath"
	"slices"
	"strconv"
	"strings"
	"sync"
)

// Key is a server setting that can live in the settings file (and be changed through the API)
// unless its environment variable is set, which locks it.
type Key struct {
	Name    string
	Env     string
	Default string
	// Live keys take effect immediately; the others when Gresbase restarts.
	Live bool
}

// Keys are the server settings stored in gresbase.json, in display order. Bootstrap settings
// (port, base path, data dir, logging) and DATABASE_URL stay environment-only.
var Keys = []Key{
	{Name: "lang", Env: "GRESBASE_LANG", Default: "en", Live: true},
	{Name: "session_ttl", Env: "GRESBASE_SESSION_TTL", Default: "12h"},
	{Name: "allowed_hosts", Env: "GRESBASE_ALLOWED_HOSTS", Default: ""},
	{Name: "read_only", Env: "GRESBASE_READ_ONLY", Default: "false"},
	{Name: "statement_timeout", Env: "GRESBASE_STATEMENT_TIMEOUT", Default: "30s"},
	{Name: "sql_max_rows", Env: "GRESBASE_SQL_MAX_ROWS", Default: "1000", Live: true},
	{Name: "import_timeout", Env: "GRESBASE_IMPORT_TIMEOUT", Default: "10m"},
	{Name: "max_conns", Env: "GRESBASE_MAX_CONNS", Default: "10"},
	{Name: "max_pools", Env: "GRESBASE_MAX_POOLS", Default: "20"},
	{Name: "pool_idle_timeout", Env: "GRESBASE_POOL_IDLE_TIMEOUT", Default: "10m"},
}

// Sources of a setting value, by precedence.
const (
	SourceEnv     = "env"
	SourceFile    = "file"
	SourceDefault = "default"
)

// Errors of Store.Patch (the API maps them to 400 and 409 locked_by_env).
var (
	ErrUnknownKey = errors.New("unknown setting")
	ErrLocked     = errors.New("setting is defined by an environment variable")
	ErrInvalid    = errors.New("invalid setting value")
)

// FileName is the settings file inside the data dir; SecretKeyFile holds the generated
// encryption key when GRESBASE_SECRET_KEY is not set.
const (
	FileName      = "gresbase.json"
	SecretKeyFile = "secret.key"
	// SchemaVersion is the current version of gresbase.json; older files are migrated on open.
	SchemaVersion = 1
)

// fileData is the content of gresbase.json.
type fileData struct {
	Version  int               `json:"version"`
	Settings map[string]string `json:"settings,omitempty"`
	// Secrets are sealed with AES-GCM ("v1:" + base64(nonce|ciphertext)), never stored in clear.
	Secrets map[string]string `json:"secrets,omitempty"`
	// Users are the local accounts. This version has at most one, the administrator.
	Users []User `json:"users,omitempty"`
	// Mode is the one chosen in the setup wizard (ModeSaved, ModeFree); "" until setup is done.
	Mode string `json:"mode,omitempty"`
	// Connections are the saved connections; their passwords are in Secrets.
	Connections []SavedConnection `json:"connections,omitempty"`
}

// Store resolves every setting from three layers (environment > gresbase.json > default) and
// persists the file layer. Without a writable data dir it keeps the file layer in memory.
type Store struct {
	mu     sync.Mutex
	path   string // gresbase.json; "" when not persistent
	getenv func(string) string
	aead   cipher.AEAD
	data   fileData
	boot   map[string]string // effective value of each key when the server started
	// Persistent is false when the data dir is not writable: settings are lost on restart.
	Persistent bool
	// Loss says why the data dir would not keep its files (Loss* constants), "" when it would.
	Loss string
}

// Open loads the configuration: the bootstrap settings and the secret key come from the
// environment, the rest from the three layers. The returned Config is the effective one at boot.
func Open(getenv func(string) string) (*Store, Config, error) {
	env := func(name string) string { return strings.TrimSpace(getenv(name)) }
	dir := env("GRESBASE_DATA_DIR")
	if dir == "" {
		dir = "/data"
	}
	s := &Store{getenv: env, data: fileData{Version: SchemaVersion}}
	if os.MkdirAll(dir, 0o750) == nil && writable(dir) {
		s.path, s.Persistent = filepath.Join(dir, FileName), true
		s.Loss = DataLoss(dir)
	} else {
		s.Loss = LossNotWritable
	}

	key, err := s.secretKey(dir, env("GRESBASE_SECRET_KEY"))
	if err != nil {
		return nil, Config{}, err
	}
	block, _ := aes.NewCipher(key) // a 32-byte key never fails
	s.aead, _ = cipher.NewGCM(block)

	if s.Persistent {
		if err := s.read(); err != nil {
			return nil, Config{}, err
		}
	}

	cfg, err := Load(s.lookup)
	if err != nil {
		return nil, Config{}, err
	}
	// Keep the session secret across restarts so sessions survive them, unless the environment
	// sets one. An unreadable sealed value (the key changed) is replaced: old sessions end.
	if env("GRESBASE_SESSION_SECRET") == "" {
		if v, err := s.open(s.data.Secrets["session_secret"]); err == nil && len(v) >= 32 {
			cfg.SessionSecret = Secret(v)
		} else if err := s.setSecret("session_secret", cfg.SessionSecret.Reveal()); err != nil {
			return nil, Config{}, err
		}
	}

	s.boot = map[string]string{}
	for _, k := range Keys {
		s.boot[k.Name], _ = s.value(k)
	}
	return s, cfg, nil
}

// secretKey returns the AES-256 key: from GRESBASE_SECRET_KEY, from dir/secret.key (created on
// first start) or, without a persistent dir, a random one for this run.
func (s *Store) secretKey(dir, fromEnv string) ([]byte, error) {
	if fromEnv != "" {
		if len(fromEnv) < 32 {
			return nil, errors.New("GRESBASE_SECRET_KEY: must be at least 32 characters")
		}
		k := sha256.Sum256([]byte(fromEnv))
		return k[:], nil
	}
	k := make([]byte, 32)
	_, _ = rand.Read(k)
	if !s.Persistent {
		return k, nil
	}
	path := filepath.Join(dir, SecretKeyFile)
	if raw, err := os.ReadFile(path); err == nil { //nolint:gosec // path is under the configured data dir
		if b, err := hex.DecodeString(strings.TrimSpace(string(raw))); err == nil && len(b) == 32 {
			return b, nil
		}
		return nil, fmt.Errorf("%s is not a valid key (64 hex characters)", path)
	} else if !errors.Is(err, fs.ErrNotExist) {
		return nil, fmt.Errorf("read secret key: %w", err)
	}
	if err := writeAtomic(path, []byte(hex.EncodeToString(k)+"\n")); err != nil {
		return nil, fmt.Errorf("create secret key: %w", err)
	}
	return k, nil
}

func (s *Store) read() error {
	raw, err := os.ReadFile(s.path)
	if errors.Is(err, fs.ErrNotExist) {
		return nil
	}
	if err != nil {
		return fmt.Errorf("read %s: %w", FileName, err)
	}
	data, migrated, err := migrate(raw)
	if err != nil {
		return fmt.Errorf("%s: %w", s.path, err)
	}
	s.data = data
	if migrated {
		return s.save()
	}
	return nil
}

// migrate upgrades gresbase.json to SchemaVersion. Version 0 (no "version" field) was a flat
// object of settings.
func migrate(raw []byte) (fileData, bool, error) {
	var probe struct {
		Version int `json:"version"`
	}
	if err := json.Unmarshal(raw, &probe); err != nil {
		return fileData{}, false, fmt.Errorf("invalid JSON: %w", err)
	}
	switch {
	case probe.Version > SchemaVersion:
		return fileData{}, false, fmt.Errorf("written by a newer Gresbase (schema %d, this one reads up to %d)",
			probe.Version, SchemaVersion)
	case probe.Version == 0:
		var flat map[string]string
		if err := json.Unmarshal(raw, &flat); err != nil {
			return fileData{}, false, fmt.Errorf("invalid schema 0 file: %w", err)
		}
		return fileData{Version: SchemaVersion, Settings: flat}, true, nil
	}
	var d fileData
	if err := json.Unmarshal(raw, &d); err != nil {
		return fileData{}, false, fmt.Errorf("invalid JSON: %w", err)
	}
	return d, false, nil
}

// save writes the file layer atomically (temporary file + rename, mode 0600). In memory only
// when not persistent.
func (s *Store) save() error {
	if !s.Persistent {
		return nil
	}
	raw, err := json.MarshalIndent(s.data, "", "  ")
	if err != nil {
		return err
	}
	if err := writeAtomic(s.path, append(raw, '\n')); err != nil {
		return fmt.Errorf("write %s: %w", FileName, err)
	}
	return nil
}

func writeAtomic(path string, data []byte) error {
	f, err := os.CreateTemp(filepath.Dir(path), "."+filepath.Base(path)+".tmp-*")
	if err != nil {
		return err
	}
	tmp := f.Name()
	defer func() { _ = os.Remove(tmp) }() // no-op after a successful rename
	if err := f.Chmod(0o600); err != nil {
		_ = f.Close()
		return err
	}
	if _, err := f.Write(data); err != nil {
		_ = f.Close()
		return err
	}
	if err := f.Sync(); err != nil {
		_ = f.Close()
		return err
	}
	if err := f.Close(); err != nil {
		return err
	}
	return os.Rename(tmp, path)
}

func writable(dir string) bool {
	f, err := os.CreateTemp(dir, ".probe-*")
	if err != nil {
		return false
	}
	_ = f.Close()
	_ = os.Remove(f.Name())
	return true
}

// lookup is the getenv Load sees: the environment, then the file layer.
func (s *Store) lookup(name string) string {
	if v := s.getenv(name); v != "" {
		return v
	}
	for _, k := range Keys {
		if k.Env == name {
			return s.data.Settings[k.Name]
		}
	}
	return ""
}

// value returns the effective raw value of k and its source.
func (s *Store) value(k Key) (string, string) {
	if v := s.getenv(k.Env); v != "" {
		return v, SourceEnv
	}
	if v, ok := s.data.Settings[k.Name]; ok {
		return v, SourceFile
	}
	return k.Default, SourceDefault
}

// Settings lists every key with its effective value and origin. None of them is a secret.
func (s *Store) Settings() []Setting {
	s.mu.Lock()
	defer s.mu.Unlock()
	out := make([]Setting, 0, len(Keys))
	for _, k := range Keys {
		v, src := s.value(k)
		out = append(out, Setting{Key: k.Name, Env: k.Env, Value: v, Source: src, Locked: src == SourceEnv,
			RestartRequired: !k.Live && v != s.boot[k.Name]})
	}
	return out
}

// Value returns the effective raw value of a key ("" for unknown keys).
func (s *Store) Value(name string) string {
	s.mu.Lock()
	defer s.mu.Unlock()
	for _, k := range Keys {
		if k.Name == name {
			v, _ := s.value(k)
			return v
		}
	}
	return ""
}

// Patch validates and stores changes in the file layer; an empty value removes the key (back to
// its default). Nothing is stored if any change is rejected.
func (s *Store) Patch(changes map[string]string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	next := make(map[string]string, len(s.data.Settings)+len(changes))
	for k, v := range s.data.Settings {
		next[k] = v
	}
	for name, v := range changes {
		k, ok := keyByName(name)
		if !ok {
			return fmt.Errorf("%w: %q", ErrUnknownKey, name)
		}
		if s.getenv(k.Env) != "" {
			return fmt.Errorf("%w: %s (%s)", ErrLocked, name, k.Env)
		}
		v = strings.TrimSpace(v)
		if v == "" {
			delete(next, name)
			continue
		}
		// Validate the value alone with the same rules as the environment variable.
		if _, err := Load(func(n string) string {
			switch n {
			case k.Env:
				return v
			case "DATABASE_URL":
				return "postgres://validate"
			}
			return ""
		}); err != nil {
			return fmt.Errorf("%w: %w", ErrInvalid, err)
		}
		next[name] = v
	}
	prev := s.data.Settings
	s.data.Settings = next
	if err := s.save(); err != nil {
		s.data.Settings = prev
		return err
	}
	return nil
}

func keyByName(name string) (Key, bool) {
	for _, k := range Keys {
		if k.Name == name {
			return k, true
		}
	}
	return Key{}, false
}

// setSecret seals value under name and saves the file.
func (s *Store) setSecret(name, value string) error {
	sealed, err := s.seal(value)
	if err != nil {
		return err
	}
	if s.data.Secrets == nil {
		s.data.Secrets = map[string]string{}
	}
	s.data.Secrets[name] = sealed
	return s.save()
}

func (s *Store) seal(plain string) (string, error) {
	nonce := make([]byte, s.aead.NonceSize())
	if _, err := rand.Read(nonce); err != nil {
		return "", err
	}
	return "v1:" + base64.StdEncoding.EncodeToString(s.aead.Seal(nonce, nonce, []byte(plain), nil)), nil
}

func (s *Store) open(sealed string) (string, error) {
	b64, ok := strings.CutPrefix(sealed, "v1:")
	if !ok {
		return "", errors.New("unknown secret format")
	}
	raw, err := base64.StdEncoding.DecodeString(b64)
	if err != nil || len(raw) < s.aead.NonceSize() {
		return "", errors.New("malformed secret")
	}
	n := s.aead.NonceSize()
	plain, err := s.aead.Open(nil, raw[:n], raw[n:], nil)
	if err != nil {
		return "", errors.New("cannot decrypt secret (was the secret key changed?)")
	}
	return string(plain), nil
}

// RoleAdmin is the role of the administrator account.
const RoleAdmin = "admin"

// RoleUser is the role of a free mode session: it uses its own connection, nothing else.
const RoleUser = "user"

// User is a local account stored in gresbase.json. PasswordHash is an argon2id PHC string
// (internal/auth); the plain password is never stored.
type User struct {
	Username     string `json:"username"`
	Role         string `json:"role"`
	PasswordHash string `json:"password_hash"`
}

// Admin returns the administrator account of the file, if any.
func (s *Store) Admin() (User, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	for _, u := range s.data.Users {
		if u.Role == RoleAdmin {
			return u, true
		}
	}
	return User{}, false
}

// SetAdmin creates or replaces the administrator account and saves the file.
func (s *Store) SetAdmin(u User) error {
	if u.Username == "" || u.PasswordHash == "" {
		return errors.New("username and password hash are required")
	}
	u.Role = RoleAdmin
	s.mu.Lock()
	defer s.mu.Unlock()
	prev := s.data.Users
	// ponytail: a single administrator; the list leaves room for more users and roles later.
	next := []User{u}
	for _, o := range prev {
		if o.Role != RoleAdmin {
			next = append(next, o)
		}
	}
	s.data.Users = next
	if err := s.save(); err != nil {
		s.data.Users = prev
		return err
	}
	return nil
}

// Modes chosen in the setup wizard.
const (
	ModeSaved = "saved" // an administrator and saved connections
	ModeFree  = "free"  // free mode: sign in with Postgres credentials, nothing saved
)

// Mode returns the mode chosen in the setup wizard, "" while setup has not been completed.
func (s *Store) Mode() string {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.data.Mode
}

// SavedConnection is a connection stored in gresbase.json. The password is sealed apart, in
// Secrets under "connection:<id>".
type SavedConnection struct {
	ID       string `json:"id"`
	Name     string `json:"name"`
	Host     string `json:"host"`
	Port     int    `json:"port"`
	Database string `json:"database"`
	User     string `json:"user"`
	SSLMode  string `json:"sslmode"`
	ReadOnly bool   `json:"read_only"`
	// Color is one of LabelColors ("" reads as gray): tells production from test at a glance.
	Color string `json:"color,omitempty"`
}

// DSN builds the connection string of c with password.
func (c SavedConnection) DSN(password string) Secret {
	return BuildDSN(c.Host, c.Port, c.Database, c.User, password, c.SSLMode)
}

// BuildDSN assembles a postgres:// URL from its parts.
func BuildDSN(host string, port int, database, user, password, sslmode string) Secret {
	u := url.URL{Scheme: "postgres", Host: net.JoinHostPort(host, strconv.Itoa(port)), Path: "/" + database}
	if password != "" {
		u.User = url.UserPassword(user, password)
	} else {
		u.User = url.User(user)
	}
	q := url.Values{"connect_timeout": {"10"}}
	if sslmode != "" {
		q.Set("sslmode", sslmode)
	}
	u.RawQuery = q.Encode()
	return Secret(u.String())
}

// Connections returns the saved connections.
func (s *Store) Connections() []SavedConnection {
	s.mu.Lock()
	defer s.mu.Unlock()
	return slices.Clone(s.data.Connections)
}

// ConnectionDSN returns the connection string of c, password included. A password that cannot be
// decrypted (the secret key changed) leaves the DSN without one.
func (s *Store) ConnectionDSN(c SavedConnection) Secret {
	s.mu.Lock()
	defer s.mu.Unlock()
	pw, _ := s.open(s.data.Secrets["connection:"+c.ID])
	return c.DSN(pw)
}

// CompleteSetup stores everything the setup wizard collected at once: the server language (unless
// locked), the administrator (nil to keep none), the connection (nil in free mode) and the mode,
// which ends setup. Nothing is kept if saving fails.
func (s *Store) CompleteSetup(mode, lang string, admin *User, conn *SavedConnection, password string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.data.Mode != "" {
		return errors.New("setup already completed")
	}
	prev := s.data
	next := prev
	next.Settings = maps.Clone(prev.Settings)
	next.Secrets = maps.Clone(prev.Secrets)
	if next.Secrets == nil {
		next.Secrets = map[string]string{}
	}
	if lang != "" && s.getenv("GRESBASE_LANG") == "" {
		if next.Settings == nil {
			next.Settings = map[string]string{}
		}
		next.Settings["lang"] = lang
	}
	if admin != nil {
		a := *admin
		a.Role = RoleAdmin
		next.Users = []User{a}
	}
	if conn != nil {
		if password != "" {
			sealed, err := s.seal(password)
			if err != nil {
				return err
			}
			next.Secrets["connection:"+conn.ID] = sealed
		}
		next.Connections = append(slices.Clone(prev.Connections), *conn)
	}
	next.Mode = mode
	s.data = next
	if err := s.save(); err != nil {
		s.data = prev
		return err
	}
	return nil
}

// ErrNoConnection is returned when a saved connection id does not exist.
var ErrNoConnection = errors.New("no such saved connection")

// LabelColors are the label colors a saved connection can have (docs/design.md → --label-*).
var LabelColors = []string{"gray", "red", "orange", "green", "blue", "purple"}

// PutConnection creates or replaces (same ID) a saved connection. A nil password keeps the stored
// one; a non-nil one replaces it ("" removes it). Nothing changes if saving fails.
func (s *Store) PutConnection(c SavedConnection, password *string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	prev := s.data
	next := prev
	next.Secrets = maps.Clone(prev.Secrets)
	if next.Secrets == nil {
		next.Secrets = map[string]string{}
	}
	if password != nil {
		delete(next.Secrets, "connection:"+c.ID)
		if *password != "" {
			sealed, err := s.seal(*password)
			if err != nil {
				return err
			}
			next.Secrets["connection:"+c.ID] = sealed
		}
	}
	next.Connections = slices.Clone(prev.Connections)
	if i := slices.IndexFunc(next.Connections, func(o SavedConnection) bool { return o.ID == c.ID }); i >= 0 {
		next.Connections[i] = c
	} else {
		next.Connections = append(next.Connections, c)
	}
	s.data = next
	if err := s.save(); err != nil {
		s.data = prev
		return err
	}
	return nil
}

// DeleteConnection forgets a saved connection and its password.
func (s *Store) DeleteConnection(id string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	i := slices.IndexFunc(s.data.Connections, func(o SavedConnection) bool { return o.ID == id })
	if i < 0 {
		return ErrNoConnection
	}
	prev := s.data
	next := prev
	next.Connections = slices.Delete(slices.Clone(prev.Connections), i, i+1)
	next.Secrets = maps.Clone(prev.Secrets)
	delete(next.Secrets, "connection:"+id)
	s.data = next
	if err := s.save(); err != nil {
		s.data = prev
		return err
	}
	return nil
}

// Connection returns the saved connection id.
func (s *Store) Connection(id string) (SavedConnection, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	i := slices.IndexFunc(s.data.Connections, func(o SavedConnection) bool { return o.ID == id })
	if i < 0 {
		return SavedConnection{}, false
	}
	return s.data.Connections[i], true
}
