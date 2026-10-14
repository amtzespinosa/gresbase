package config

import (
	"bytes"
	"encoding/json"
	"fmt"
	"log/slog"
	"strings"
	"testing"
	"time"
)

const testDSN = "postgres://app:s3cr3t-pw@db:5432/app?sslmode=disable"

func env(kv map[string]string) func(string) string {
	return func(k string) string { return kv[k] }
}

func TestLoadDefaults(t *testing.T) {
	c, err := Load(env(map[string]string{"DATABASE_URL": testDSN}))
	if err != nil {
		t.Fatal(err)
	}
	if c.Port != 8080 || c.BasePath != "" || c.SessionTTL != 12*time.Hour ||
		c.StatementTimeout != 30*time.Second || c.ImportTimeout != 10*time.Minute || c.MaxConns != 10 || c.DataDir != "/data" ||
		c.Lang != "en" || c.LogLevel != slog.LevelInfo || c.LogFormat != "text" ||
		c.ReadOnly || c.AuthEnabled() || len(c.AllowedHosts) != 0 {
		t.Fatalf("unexpected defaults: %+v", c)
	}
	if len(c.SessionSecret.Reveal()) != 64 {
		t.Fatalf("random session secret has length %d", len(c.SessionSecret.Reveal()))
	}
}

func TestLoadValid(t *testing.T) {
	tests := []struct {
		name  string
		env   map[string]string
		check func(Config) bool
	}{
		{"port", map[string]string{"GRESBASE_PORT": "9000"}, func(c Config) bool { return c.Port == 9000 }},
		{"base path", map[string]string{"GRESBASE_BASE_PATH": "/gresbase/"}, func(c Config) bool { return c.BasePath == "/gresbase" }},
		{"nested base path", map[string]string{"GRESBASE_BASE_PATH": "/tools/db"}, func(c Config) bool { return c.BasePath == "/tools/db" }},
		{"root base path", map[string]string{"GRESBASE_BASE_PATH": "/"}, func(c Config) bool { return c.BasePath == "" }},
		{"auth", map[string]string{"GRESBASE_USER": "admin", "GRESBASE_PASSWORD": "pw"}, func(c Config) bool { return c.AuthEnabled() }},
		{"ttl", map[string]string{"GRESBASE_SESSION_TTL": "90m"}, func(c Config) bool { return c.SessionTTL == 90*time.Minute }},
		{"timeout", map[string]string{"GRESBASE_STATEMENT_TIMEOUT": "5s"}, func(c Config) bool { return c.StatementTimeout == 5*time.Second }},
		{"import timeout", map[string]string{"GRESBASE_IMPORT_TIMEOUT": "1h"}, func(c Config) bool { return c.ImportTimeout == time.Hour }},
		{"hosts", map[string]string{"GRESBASE_ALLOWED_HOSTS": " DB.example.com , ,gres.lan"}, func(c Config) bool {
			return fmt.Sprint(c.AllowedHosts) == "[db.example.com gres.lan]"
		}},
		{"read only", map[string]string{"GRESBASE_READ_ONLY": "true"}, func(c Config) bool { return c.ReadOnly }},
		{"lang", map[string]string{"GRESBASE_LANG": "ES"}, func(c Config) bool { return c.Lang == "es" }},
		{"log", map[string]string{"GRESBASE_LOG_LEVEL": "debug", "GRESBASE_LOG_FORMAT": "json"}, func(c Config) bool {
			return c.LogLevel == slog.LevelDebug && c.LogFormat == "json"
		}},
		{"secret", map[string]string{"GRESBASE_SESSION_SECRET": strings.Repeat("x", 32)}, func(c Config) bool {
			return c.SessionSecret.Reveal() == strings.Repeat("x", 32)
		}},
		{"postgresql scheme", map[string]string{"DATABASE_URL": "postgresql://u@h/db"}, func(Config) bool { return true }},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			e := map[string]string{"DATABASE_URL": testDSN}
			for k, v := range tt.env {
				e[k] = v
			}
			c, err := Load(env(e))
			if err != nil {
				t.Fatal(err)
			}
			if !tt.check(c) {
				t.Fatalf("unexpected config: %+v", c)
			}
		})
	}
}

func TestLoadInvalid(t *testing.T) {
	tests := []struct {
		name string
		env  map[string]string
		want string
	}{
		{"db port", map[string]string{"GRESBASE_DB_PORT": "0"}, "GRESBASE_DB_PORT"},
		{"setup token", map[string]string{"GRESBASE_SETUP_TOKEN": "short"}, "GRESBASE_SETUP_TOKEN"},
		{"free mode with url", map[string]string{"GRESBASE_MODE_FREE": "true"}, "GRESBASE_MODE_FREE"},
		{"bad cidr", map[string]string{"GRESBASE_ALLOWED_DB_HOSTS": "10.0.0.0/99"}, "GRESBASE_ALLOWED_DB_HOSTS"},
		{"bad proxy", map[string]string{"GRESBASE_TRUSTED_PROXIES": "proxy.local"}, "GRESBASE_TRUSTED_PROXIES"},
		{"sessions", map[string]string{"GRESBASE_MAX_SESSIONS": "0"}, "GRESBASE_MAX_SESSIONS"},
		{"bad scheme", map[string]string{"DATABASE_URL": "mysql://u:p@h/db"}, "DATABASE_URL: must be"},
		{"port text", map[string]string{"GRESBASE_PORT": "http"}, "GRESBASE_PORT"},
		{"port range", map[string]string{"GRESBASE_PORT": "70000"}, "GRESBASE_PORT"},
		{"base path", map[string]string{"GRESBASE_BASE_PATH": "gres base"}, "GRESBASE_BASE_PATH"},
		{"ttl", map[string]string{"GRESBASE_SESSION_TTL": "forever"}, "GRESBASE_SESSION_TTL"},
		{"negative timeout", map[string]string{"GRESBASE_STATEMENT_TIMEOUT": "-1s"}, "GRESBASE_STATEMENT_TIMEOUT"},
		{"import timeout", map[string]string{"GRESBASE_IMPORT_TIMEOUT": "10"}, "GRESBASE_IMPORT_TIMEOUT"},
		{"lang", map[string]string{"GRESBASE_LANG": "fr"}, "GRESBASE_LANG"},
		{"log level", map[string]string{"GRESBASE_LOG_LEVEL": "trace"}, "GRESBASE_LOG_LEVEL"},
		{"log format", map[string]string{"GRESBASE_LOG_FORMAT": "xml"}, "GRESBASE_LOG_FORMAT"},
		{"read only", map[string]string{"GRESBASE_READ_ONLY": "maybe"}, "GRESBASE_READ_ONLY"},
		{"max conns", map[string]string{"GRESBASE_MAX_CONNS": "0"}, "GRESBASE_MAX_CONNS"},
		{"user without password", map[string]string{"GRESBASE_USER": "admin"}, "GRESBASE_USER/GRESBASE_PASSWORD"},
		{"short secret", map[string]string{"GRESBASE_SESSION_SECRET": "short"}, "GRESBASE_SESSION_SECRET"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			e := map[string]string{"DATABASE_URL": testDSN}
			for k, v := range tt.env {
				e[k] = v
			}
			_, err := Load(env(e))
			if err == nil || !strings.Contains(err.Error(), tt.want) {
				t.Fatalf("error = %v, want it to contain %q", err, tt.want)
			}
		})
	}
}

func TestLoadAggregatesErrors(t *testing.T) {
	_, err := Load(env(map[string]string{"DATABASE_URL": "mysql://x", "GRESBASE_PORT": "x", "GRESBASE_LANG": "fr", "GRESBASE_SESSION_TTL": "0"}))
	if err == nil {
		t.Fatal("want error")
	}
	for _, name := range []string{"DATABASE_URL", "GRESBASE_PORT", "GRESBASE_LANG", "GRESBASE_SESSION_TTL"} {
		if !strings.Contains(err.Error(), name) {
			t.Errorf("error does not mention %s: %v", name, err)
		}
	}
}

func TestInvalidURLErrorHidesPassword(t *testing.T) {
	_, err := Load(env(map[string]string{"DATABASE_URL": "postgres://u:s3cr3t-pw@h:bad port/db"}))
	if err == nil || strings.Contains(err.Error(), "s3cr3t-pw") {
		t.Fatalf("error = %v", err)
	}
}

func TestRedactDSN(t *testing.T) {
	tests := []struct{ in, want string }{
		{testDSN, "postgres://app:****@db:5432/app?sslmode=disable"},
		{"postgres://app@db/app", "postgres://app@db/app"},
		{"postgres://db/app?password=s3cr3t-pw&sslmode=require", "postgres://db/app?password=****&sslmode=require"},
		{"postgres://u:p%40ss@db/app", "postgres://u:****@db/app"},
		{"::not a url", "****"},
	}
	for _, tt := range tests {
		if got := RedactDSN(tt.in); got != tt.want {
			t.Errorf("RedactDSN(%q) = %q, want %q", tt.in, got, tt.want)
		}
	}
}

func TestSecretsNeverPrinted(t *testing.T) {
	c, err := Load(env(map[string]string{
		"DATABASE_URL": testDSN, "GRESBASE_USER": "admin", "GRESBASE_PASSWORD": "login-pw-123",
		"GRESBASE_SESSION_SECRET": "session-secret-0123456789abcdef0123",
	}))
	if err != nil {
		t.Fatal(err)
	}
	var logs bytes.Buffer
	slog.New(slog.NewTextHandler(&logs, nil)).Info("cfg", "config", c)
	slog.New(slog.NewJSONHandler(&logs, nil)).Info("cfg", "config", c, "raw", c.DatabaseURL)
	js, _ := json.Marshal(c)
	out := fmt.Sprintf("%v %+v %#v %s %s", c, c, c, c, js) + logs.String()
	for _, secret := range []string{"s3cr3t-pw", "login-pw-123", "session-secret"} {
		if strings.Contains(out, secret) {
			t.Fatalf("secret %q leaked in: %s", secret, out)
		}
	}
	if !strings.Contains(out, "app:****@db") {
		t.Fatalf("redacted DSN missing from: %s", out)
	}
}

func TestLoadWithoutDatabaseURL(t *testing.T) {
	c, err := Load(env(map[string]string{"GRESBASE_DB_HOST": "db", "GRESBASE_DB_PORT": "6432",
		"GRESBASE_DB_NAME": " app ", "GRESBASE_DB_USER": "reader"}))
	if err != nil || c.DatabaseURL != "" || c.DBHost != "db" || c.DBPort != 6432 || c.DBName != "app" ||
		c.DBUser != "reader" {
		t.Fatalf("got %+v, %v", c, err)
	}
}

func TestLoadFreeMode(t *testing.T) {
	c, err := Load(env(map[string]string{"GRESBASE_MODE_FREE": "true", "GRESBASE_ALLOWED_DB_HOSTS": "db, 10.0.0.0/8 ,192.168.1.5"}))
	if err != nil || !c.ModeFree || c.MaxSessions != 10 ||
		strings.Join(c.AllowedDBHosts, ",") != "db,10.0.0.0/8,192.168.1.5" {
		t.Fatalf("got %+v, %v", c, err)
	}
}

func TestLoadTrustedProxies(t *testing.T) {
	c, err := Load(env(map[string]string{"GRESBASE_TRUSTED_PROXIES": "10.0.0.1, 172.16.5.0/12 ,::1"}))
	if err != nil {
		t.Fatal(err)
	}
	var got []string
	for _, p := range c.TrustedProxies {
		got = append(got, p.String())
	}
	if strings.Join(got, ",") != "10.0.0.1/32,172.16.0.0/12,::1/128" {
		t.Errorf("got %v", got)
	}
	if c, _ := Load(env(nil)); len(c.TrustedProxies) != 0 {
		t.Errorf("default trusts %v", c.TrustedProxies)
	}
}
