package api_test

import (
	"io"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"

	"github.com/amtzespinosa/gresbase/internal/api"
	"github.com/amtzespinosa/gresbase/internal/config"
)

func TestSettingsEndpoints(t *testing.T) {
	secret := strings.Repeat("s", 40)
	kv := map[string]string{
		"DATABASE_URL":            "postgres://app:pw-in-dsn@db/app",
		"GRESBASE_DATA_DIR":       t.TempDir(),
		"GRESBASE_READ_ONLY":      "true",
		"GRESBASE_SESSION_SECRET": secret,
		"GRESBASE_PASSWORD":       "admin-pw",
		"GRESBASE_USER":           "admin",
	}
	store, _, err := config.Open(func(k string) string { return kv[k] })
	if err != nil {
		t.Fatal(err)
	}
	h := api.Settings{Store: store}
	r := chi.NewRouter()
	r.Get("/settings", h.Get)
	r.Patch("/settings", h.Patch)

	for _, tc := range []struct {
		method, body string
		status       int
		contains     string
	}{
		{"GET", "", 200, `{"key":"read_only","env":"GRESBASE_READ_ONLY","value":"true","source":"env","locked":true`},
		{"PATCH", `{"settings":{"read_only":"false"}}`, 409, `"locked_by_env"`},
		{"PATCH", `{"settings":{"port":"1"}}`, 400, `"bad_request"`},
		{"PATCH", `{"settings":{"statement_timeout":"-1s"}}`, 400, `"bad_request"`},
		{"PATCH", `{"settings":`, 400, `"bad_request"`},
		{"PATCH", `{"settings":{"lang":"es","statement_timeout":"45s"}}`, 200,
			`{"key":"lang","env":"GRESBASE_LANG","value":"es","source":"file","locked":false,"restart_required":false}`},
		{"GET", "", 200, `{"key":"statement_timeout","env":"GRESBASE_STATEMENT_TIMEOUT","value":"45s","source":"file","locked":false,"restart_required":true}`},
	} {
		w := httptest.NewRecorder()
		r.ServeHTTP(w, httptest.NewRequest(tc.method, "/settings", strings.NewReader(tc.body)))
		body, _ := io.ReadAll(w.Body)
		if w.Code != tc.status || !strings.Contains(string(body), tc.contains) {
			t.Errorf("%s %s: %d %s", tc.method, tc.body, w.Code, body)
		}
		for _, s := range []string{secret, "pw-in-dsn", "admin-pw"} {
			if strings.Contains(string(body), s) {
				t.Errorf("%s %s: response leaks a secret", tc.method, tc.body)
			}
		}
	}
}
