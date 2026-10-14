package config

import (
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func openStore(t *testing.T, kv map[string]string) (*Store, Config) {
	t.Helper()
	if _, ok := kv["DATABASE_URL"]; !ok {
		kv["DATABASE_URL"] = testDSN
	}
	s, c, err := Open(env(kv))
	if err != nil {
		t.Fatal(err)
	}
	return s, c
}

func setting(s *Store, key string) Setting {
	for _, st := range s.Settings() {
		if st.Key == key {
			return st
		}
	}
	return Setting{}
}

func TestKeyDefaultsMatchLoad(t *testing.T) {
	base, err := Load(env(map[string]string{"DATABASE_URL": testDSN}))
	if err != nil {
		t.Fatal(err)
	}
	for _, k := range Keys {
		c, err := Load(env(map[string]string{"DATABASE_URL": testDSN, k.Env: k.Default}))
		if err != nil {
			t.Fatalf("%s: %v", k.Name, err)
		}
		c.SessionSecret = base.SessionSecret
		if c.String() != base.String() || c.SessionTTL != base.SessionTTL || c.StatementTimeout != base.StatementTimeout ||
			c.ImportTimeout != base.ImportTimeout || c.MaxConns != base.MaxConns || len(c.AllowedHosts) != len(base.AllowedHosts) {
			t.Errorf("%s: default %q differs from Load's default", k.Name, k.Default)
		}
	}
}

func TestStorePrecedence(t *testing.T) {
	dir := t.TempDir()
	if err := os.WriteFile(filepath.Join(dir, FileName),
		[]byte(`{"version":1,"settings":{"lang":"es","statement_timeout":"5s"}}`), 0o600); err != nil {
		t.Fatal(err)
	}
	s, c := openStore(t, map[string]string{"GRESBASE_DATA_DIR": dir, "GRESBASE_STATEMENT_TIMEOUT": "7s"})
	if c.Lang != "es" || c.StatementTimeout != 7*time.Second || c.SessionTTL != 12*time.Hour {
		t.Fatalf("effective config: lang=%s timeout=%s ttl=%s", c.Lang, c.StatementTimeout, c.SessionTTL)
	}
	for key, want := range map[string]Setting{
		"lang":              {Value: "es", Source: SourceFile},
		"statement_timeout": {Value: "7s", Source: SourceEnv, Locked: true},
		"session_ttl":       {Value: "12h", Source: SourceDefault},
	} {
		got := setting(s, key)
		if got.Value != want.Value || got.Source != want.Source || got.Locked != want.Locked {
			t.Errorf("%s: got %+v, want %+v", key, got, want)
		}
	}
}

func TestStorePatch(t *testing.T) {
	dir := t.TempDir()
	s, _ := openStore(t, map[string]string{"GRESBASE_DATA_DIR": dir, "GRESBASE_READ_ONLY": "true"})

	if err := s.Patch(map[string]string{"read_only": "false"}); !errors.Is(err, ErrLocked) {
		t.Fatalf("locked key: %v", err)
	}
	if err := s.Patch(map[string]string{"nope": "1"}); !errors.Is(err, ErrUnknownKey) {
		t.Fatalf("unknown key: %v", err)
	}
	if err := s.Patch(map[string]string{"lang": "es", "session_ttl": "soon"}); !errors.Is(err, ErrInvalid) {
		t.Fatalf("invalid value: %v", err)
	}
	if setting(s, "lang").Source != SourceDefault {
		t.Fatal("a rejected patch must not store anything")
	}

	if err := s.Patch(map[string]string{"lang": "es", "session_ttl": "2h"}); err != nil {
		t.Fatal(err)
	}
	if got := setting(s, "lang"); got.Value != "es" || got.Source != SourceFile || got.RestartRequired {
		t.Fatalf("live key: %+v", got)
	}
	if got := setting(s, "session_ttl"); !got.RestartRequired {
		t.Fatalf("restart key: %+v", got)
	}

	// Persisted: a new store sees the values, the effective config uses them.
	s2, c := openStore(t, map[string]string{"GRESBASE_DATA_DIR": dir})
	if c.Lang != "es" || c.SessionTTL != 2*time.Hour || setting(s2, "session_ttl").RestartRequired {
		t.Fatalf("after reopen: lang=%s ttl=%s", c.Lang, c.SessionTTL)
	}
	// An empty value resets to the default.
	if err := s2.Patch(map[string]string{"lang": ""}); err != nil {
		t.Fatal(err)
	}
	if got := setting(s2, "lang"); got.Source != SourceDefault || got.Value != "en" {
		t.Fatalf("reset: %+v", got)
	}
}

func TestStoreFileIsAtomicAndPrivate(t *testing.T) {
	dir := t.TempDir()
	s, _ := openStore(t, map[string]string{"GRESBASE_DATA_DIR": dir})
	if err := s.Patch(map[string]string{"max_conns": "20"}); err != nil {
		t.Fatal(err)
	}
	for _, name := range []string{FileName, SecretKeyFile} {
		fi, err := os.Stat(filepath.Join(dir, name))
		if err != nil {
			t.Fatal(err)
		}
		if fi.Mode().Perm() != 0o600 {
			t.Errorf("%s mode %v, want 0600", name, fi.Mode().Perm())
		}
	}
	entries, _ := os.ReadDir(dir)
	for _, e := range entries {
		if strings.Contains(e.Name(), ".tmp-") {
			t.Errorf("temporary file left behind: %s", e.Name())
		}
	}
	// A failed write leaves the previous file intact.
	if err := os.Chmod(dir, 0o500); err != nil {
		t.Fatal(err)
	}
	defer func() { _ = os.Chmod(dir, 0o700) }()
	if err := s.Patch(map[string]string{"max_conns": "30"}); err == nil {
		t.Fatal("expected a write error in a read-only dir")
	}
	if got := setting(s, "max_conns").Value; got != "20" {
		t.Fatalf("in-memory value after failed save: %s", got)
	}
	raw, _ := os.ReadFile(filepath.Join(dir, FileName))
	if !strings.Contains(string(raw), `"max_conns": "20"`) {
		t.Fatalf("file changed after a failed save: %s", raw)
	}
}

func TestStoreSecrets(t *testing.T) {
	dir := t.TempDir()
	_, c1 := openStore(t, map[string]string{"GRESBASE_DATA_DIR": dir})
	raw, _ := os.ReadFile(filepath.Join(dir, FileName))
	if strings.Contains(string(raw), c1.SessionSecret.Reveal()) || !strings.Contains(string(raw), `"session_secret": "v1:`) {
		t.Fatalf("session secret must be stored sealed: %s", raw)
	}
	// Same secret after a restart (sessions survive), and the env var still wins.
	_, c2 := openStore(t, map[string]string{"GRESBASE_DATA_DIR": dir})
	if c2.SessionSecret.Reveal() != c1.SessionSecret.Reveal() {
		t.Fatal("session secret changed across restarts")
	}
	fromEnv := strings.Repeat("e", 32)
	if _, c := openStore(t, map[string]string{"GRESBASE_DATA_DIR": dir, "GRESBASE_SESSION_SECRET": fromEnv}); c.SessionSecret.Reveal() != fromEnv {
		t.Fatal("GRESBASE_SESSION_SECRET must win over the file")
	}

	// Round trip and tamper detection.
	s, _ := openStore(t, map[string]string{"GRESBASE_DATA_DIR": dir})
	sealed, err := s.seal("pw")
	if err != nil {
		t.Fatal(err)
	}
	if got, err := s.open(sealed); err != nil || got != "pw" {
		t.Fatalf("open: %q %v", got, err)
	}
	if _, err := s.open(sealed[:len(sealed)-4] + "AAAA"); err == nil {
		t.Fatal("tampered secret must not decrypt")
	}

	// GRESBASE_SECRET_KEY replaces secret.key; with another key the old sealed value is unreadable
	// and the session secret is regenerated.
	key := strings.Repeat("k", 32)
	_, c3 := openStore(t, map[string]string{"GRESBASE_DATA_DIR": dir, "GRESBASE_SECRET_KEY": key})
	if c3.SessionSecret.Reveal() == c1.SessionSecret.Reveal() {
		t.Fatal("a different key cannot read the old session secret")
	}
	_, c4 := openStore(t, map[string]string{"GRESBASE_DATA_DIR": dir, "GRESBASE_SECRET_KEY": key})
	if c4.SessionSecret.Reveal() != c3.SessionSecret.Reveal() {
		t.Fatal("session secret sealed with GRESBASE_SECRET_KEY must survive restarts")
	}
	if _, _, err := Open(env(map[string]string{"DATABASE_URL": testDSN, "GRESBASE_DATA_DIR": dir, "GRESBASE_SECRET_KEY": "short"})); err == nil {
		t.Fatal("short GRESBASE_SECRET_KEY must be rejected")
	}
}

func TestStoreMigration(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, FileName)
	if err := os.WriteFile(path, []byte(`{"lang":"es"}`), 0o600); err != nil { // schema 0: flat object
		t.Fatal(err)
	}
	s, c := openStore(t, map[string]string{"GRESBASE_DATA_DIR": dir})
	if c.Lang != "es" || setting(s, "lang").Source != SourceFile {
		t.Fatalf("migrated value not used: %s", c.Lang)
	}
	raw, _ := os.ReadFile(path)
	if !strings.Contains(string(raw), `"version": 1`) {
		t.Fatalf("file not rewritten with the current schema: %s", raw)
	}

	if err := os.WriteFile(path, []byte(`{"version":99}`), 0o600); err != nil {
		t.Fatal(err)
	}
	if _, _, err := Open(env(map[string]string{"DATABASE_URL": testDSN, "GRESBASE_DATA_DIR": dir})); err == nil ||
		!strings.Contains(err.Error(), "newer Gresbase") {
		t.Fatalf("newer schema: %v", err)
	}
}

func TestStoreWithoutVolume(t *testing.T) {
	file := filepath.Join(t.TempDir(), "not-a-dir")
	if err := os.WriteFile(file, nil, 0o600); err != nil {
		t.Fatal(err)
	}
	s, c := openStore(t, map[string]string{"GRESBASE_DATA_DIR": filepath.Join(file, "data")})
	if s.Persistent || len(c.SessionSecret.Reveal()) != 64 {
		t.Fatalf("persistent=%t", s.Persistent)
	}
	if err := s.Patch(map[string]string{"lang": "es"}); err != nil {
		t.Fatal(err)
	}
	if s.Value("lang") != "es" {
		t.Fatal("in-memory settings must still work")
	}
}

func TestStoreConnections(t *testing.T) {
	dir := t.TempDir()
	s, _ := openStore(t, map[string]string{"GRESBASE_DATA_DIR": dir})
	pw := "s3cret-pw"
	c := SavedConnection{ID: "c1", Name: "prod", Host: "db", Port: 5432, Database: "app", User: "u", Color: "red"}
	if err := s.PutConnection(c, &pw); err != nil {
		t.Fatal(err)
	}
	raw, _ := os.ReadFile(filepath.Join(dir, FileName))
	if strings.Contains(string(raw), pw) {
		t.Fatalf("connection password stored in clear: %s", raw)
	}

	// Update without password keeps it; survives a restart.
	c.Name = "production"
	if err := s.PutConnection(c, nil); err != nil {
		t.Fatal(err)
	}
	s2, _ := openStore(t, map[string]string{"GRESBASE_DATA_DIR": dir})
	got, ok := s2.Connection("c1")
	if !ok || got.Name != "production" || got.Color != "red" || len(s2.Connections()) != 1 {
		t.Fatalf("after update: %+v %v", got, ok)
	}
	if !strings.Contains(s2.ConnectionDSN(got).Reveal(), pw) {
		t.Fatal("password lost on update without password")
	}
	// An empty password removes it.
	empty := ""
	if err := s2.PutConnection(got, &empty); err != nil {
		t.Fatal(err)
	}
	if strings.Contains(s2.ConnectionDSN(got).Reveal(), pw) {
		t.Fatal("empty password must remove the stored one")
	}

	if err := s2.DeleteConnection("c1"); err != nil {
		t.Fatal(err)
	}
	if _, ok := s2.Connection("c1"); ok || !errors.Is(s2.DeleteConnection("c1"), ErrNoConnection) {
		t.Fatal("delete must forget the connection")
	}
}
