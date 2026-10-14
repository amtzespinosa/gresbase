package api_test

import (
	"encoding/base64"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"

	"github.com/amtzespinosa/gresbase/internal/api"
	"github.com/amtzespinosa/gresbase/internal/pg/introspect"
	"github.com/amtzespinosa/gresbase/internal/pg/pgvalue"
	"github.com/amtzespinosa/gresbase/internal/pgtest"
)

func TestRowsEndpoints(t *testing.T) {
	pool := pgtest.Pool(t)
	h := api.Rows{Catalog: introspect.New(pool), Pool: pool, Types: pgvalue.NewTypes()}
	r := chi.NewRouter()
	r.Post("/tables/{schema}/{table}/rows:query", h.Query)
	r.Post("/tables/{schema}/{table}/rows:count", h.Count)
	r.Post("/tables/{schema}/{table}/rows:sql", h.SQL)
	r.Get("/tables/{schema}/{table}/rows/value", h.Value)
	r.Get("/tables/{schema}/{table}/rows/referenced-by", h.ReferencedBy)

	pk := url.QueryEscape(`{"id": "1"}`)
	for _, tc := range []struct {
		method, path, body string
		status             int
		contains           string
	}{
		{"POST", "/tables/public/users/rows:query", `{"limit": 2}`, 200, `"has_more":true`},
		{"POST", "/tables/public/users/rows:query", `{"filters": [{"column": "id", "op": "eq", "value": "9007199254740993"}]}`, 200, `["9007199254740993",`},
		{"POST", "/tables/public/Weird%20Table/rows:query", `{"sort": [{"column": "Column With Spaces", "dir": "asc"}]}`, 200, `"spaces are fine"`},
		{"POST", "/tables/public/nope/rows:query", `{}`, 404, `"not_found"`},
		{"POST", "/tables/public/users/rows:query", `{"filters": [{"column": "id) OR (1=1", "op": "eq", "value": 1}]}`, 400, `"bad_request"`},
		{"POST", "/tables/public/users/rows:query", `{"filters": [{"column": "id", "op": "eq", "value": "1; DROP TABLE users"}]}`, 400, `"pg_code":"22P02"`},
		{"POST", "/tables/public/users/rows:query", `{"unknown": true}`, 400, `"bad_request"`},
		{"POST", "/tables/public/users/rows:query", `not json`, 400, `"bad_request"`},
		{"POST", "/tables/public/users/rows:count", `{"filters": [{"column": "plan", "op": "eq", "value": "pro"}]}`, 200, `{"count":4000}`},
		{"POST", "/tables/public/users/rows:sql", `{"filters": [{"column": "email", "op": "eq", "value": "o'neil"}]}`, 200, `'o''neil'::text`},
		{"GET", "/tables/public/users/rows/value?column=bio&pk=" + pk, "", 200, `"value":"Lorem ipsum`},
		{"GET", "/tables/public/users/rows/value?column=bio&pk=nope", "", 400, `"bad_request"`},
		{"GET", "/tables/public/audit_log/rows/value?column=actor&pk=" + url.QueryEscape(`{}`), "", 400, `"bad_request"`},
		{"GET", "/tables/public/invoices/rows/referenced-by?pk=" + pk, "", 200, `"table":"invoice_items","columns":["invoice_id"],"ref_columns":["id"],"count":3`},
		{"GET", "/tables/public/invoices/rows/referenced-by?pk=nope", "", 400, `"bad_request"`},
		{"GET", "/tables/public/audit_log/rows/referenced-by?pk=" + url.QueryEscape(`{}`), "", 400, `"bad_request"`},
	} {
		rec := httptest.NewRecorder()
		r.ServeHTTP(rec, httptest.NewRequest(tc.method, tc.path, strings.NewReader(tc.body)))
		if rec.Code != tc.status || !strings.Contains(rec.Body.String(), tc.contains) {
			body := rec.Body.String()
			t.Errorf("%s %s %s: %d %.300s", tc.method, tc.path, tc.body, rec.Code, body)
		}
	}
}

func TestExportEndpoint(t *testing.T) {
	pool := pgtest.Pool(t)
	h := api.Rows{Catalog: introspect.New(pool), Pool: pool, Types: pgvalue.NewTypes()}
	r := chi.NewRouter()
	r.Get("/tables/{schema}/{table}/export", h.Export)

	q := func(body string) string { return base64.RawURLEncoding.EncodeToString([]byte(body)) }
	for _, tc := range []struct {
		path        string
		status      int
		contains    string
		disposition string
	}{
		{"/tables/public/users/export?format=csv&q=" + q(`{"filters":[{"column":"id","op":"eq","value":"1"}]}`), 200, "1,", `attachment; filename=users.csv`},
		{"/tables/public/users/export?format=json&q=" + q(`{"filters":[{"column":"id","op":"eq","value":"1"}]}`), 200, `"id":"1"`, `attachment; filename=users.json`},
		{"/tables/public/Weird%20Table/export?format=csv", 200, "Column With Spaces", `attachment; filename="Weird Table.csv"`},
		{"/tables/public/users/export?format=xml", 400, `"bad_request"`, ""},
		{"/tables/public/users/export?format=csv&q=not-base64!", 400, `"bad_request"`, ""},
		{"/tables/public/users/export?format=csv&q=" + q(`{"bogus":1}`), 400, `"bad_request"`, ""},
		{"/tables/public/nope/export?format=csv", 404, `"not_found"`, ""},
		{"/tables/public/users/export?format=csv&q=" + q(`{"filters":[{"column":"id","op":"eq","value":"1; DROP TABLE users"}]}`), 400, `"pg_code":"22P02"`, ""},
		{"/tables/public/users/export?format=json&q=" + q(`{"filters":[{"column":"id","op":"eq","value":"nope"}]}`), 400, `"pg_code":"22P02"`, ""},
	} {
		rec := httptest.NewRecorder()
		r.ServeHTTP(rec, httptest.NewRequest("GET", tc.path, nil))
		if rec.Code != tc.status || !strings.Contains(rec.Body.String(), tc.contains) ||
			rec.Header().Get("Content-Disposition") != tc.disposition {
			t.Errorf("%s: %d %q %.300s", tc.path, rec.Code, rec.Header().Get("Content-Disposition"), rec.Body.String())
		}
	}
}
