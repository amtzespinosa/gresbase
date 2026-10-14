package api_test

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"

	"github.com/amtzespinosa/gresbase/internal/api"
	"github.com/amtzespinosa/gresbase/internal/pg/introspect"
	"github.com/amtzespinosa/gresbase/internal/pgtest"
)

func TestMain(m *testing.M) { pgtest.Main(m) }

func TestIntrospectionEndpoints(t *testing.T) {
	cat := introspect.New(pgtest.Pool(t))
	r := chi.NewRouter()
	r.Get("/schemas", api.Schemas(cat))
	r.Get("/schemas/{schema}/relations", api.Relations(cat))
	r.Get("/tables/{schema}/{table}", api.TableDetail(cat))
	r.Get("/tables/{schema}/{table}/ddl", api.TableDDL(cat))
	r.Get("/sql/completions", api.Completions(cat))

	for _, tc := range []struct {
		path   string
		status int
		name   string // expected "name" in a table detail
	}{
		{"/schemas", 200, ""},
		{"/schemas/billing/relations", 200, ""},
		{"/schemas/public/relations", 200, ""},
		{"/schemas/nope/relations", 404, ""},
		{"/tables/public/users", 200, "users"},
		{"/tables/public/Weird%20Table", 200, "Weird Table"},
		{"/tables/public/MixedCase", 200, "MixedCase"},
		{"/tables/public/nope", 404, ""},
		{"/tables/public/users%2F..", 404, ""},
		{"/tables/public/users/ddl", 200, ""},
		{"/tables/public/nope/ddl", 404, ""},
		{"/sql/completions", 200, ""},
	} {
		rec := httptest.NewRecorder()
		r.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, tc.path, nil))
		if rec.Code != tc.status {
			t.Errorf("%s: status %d, want %d: %s", tc.path, rec.Code, tc.status, rec.Body)
			continue
		}
		// TS types declare these lists as arrays: null would crash the UI.
		for _, k := range []string{`"partitions":null`, `"enum_values":null`} {
			if strings.Contains(rec.Body.String(), k) {
				t.Errorf("%s: %s in body", tc.path, k)
			}
		}
		var body map[string]any
		_ = json.Unmarshal(rec.Body.Bytes(), &body)
		if tc.status == 404 {
			if e, _ := body["error"].(map[string]any); e["code"] != "not_found" {
				t.Errorf("%s: body %s", tc.path, rec.Body)
			}
		}
		if tc.name != "" && body["name"] != tc.name {
			t.Errorf("%s: name %v", tc.path, body["name"])
		}
	}
}
