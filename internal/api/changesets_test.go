package api_test

import (
	"context"
	"encoding/json"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"

	"github.com/amtzespinosa/gresbase/internal/api"
	"github.com/amtzespinosa/gresbase/internal/pg/introspect"
	"github.com/amtzespinosa/gresbase/internal/pg/pgvalue"
	"github.com/amtzespinosa/gresbase/internal/pg/write"
	"github.com/amtzespinosa/gresbase/internal/pgtest"
)

func changesetRouter(h api.Changesets) *chi.Mux {
	r := chi.NewRouter()
	r.Post("/tables/{schema}/{table}/changesets", h.Apply)
	r.Post("/tables/{schema}/{table}/changesets:preview", h.Preview)
	r.Post("/changesets/{id}/undo", h.Undo)
	r.Post("/changesets/{id}/redo", h.Redo)
	r.Post("/tables/{schema}/{table}/changesets:impact", h.Impact)
	r.Get("/tables/{schema}/{table}/dependents", h.Dependents)
	r.Post("/tables/{schema}/{table}:truncate", h.Truncate)
	r.Delete("/tables/{schema}/{table}", h.Drop)
	r.Post("/tables/{schema}/{table}/import", h.Import)
	r.Get("/types", h.Types)
	r.Post("/structure:preview", h.StructurePreview)
	r.Post("/structure", h.Structure)
	return r
}

func post(r *chi.Mux, path, body string) *httptest.ResponseRecorder {
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, httptest.NewRequest("POST", path, strings.NewReader(body)))
	return rec
}

func TestChangesetEndpoints(t *testing.T) {
	pool := pgtest.PoolFor(t, pgtest.NewDatabase(t))
	cat := introspect.New(pool)
	session := func(context.Context) string { return "s" }
	r := changesetRouter(api.Changesets{Catalog: cat, Writer: write.New(pool, pgvalue.NewTypes(), cat, nil), Session: session})

	for _, tc := range []struct {
		path, body string
		status     int
		contains   string
	}{
		{"/tables/public/MixedCase/changesets:preview", `{"ops": [{"kind": "delete", "pk": {"Id": 3}}]}`, 200,
			`"sql":["DELETE FROM \"public\".\"MixedCase\" WHERE \"Id\" = '3'::integer"],"undoable":true`},
		{"/tables/public/audit_log/changesets", `{"ops": [{"kind": "insert", "values": {"action": "x"}}]}`, 422, `"no_primary_key"`},
		{"/tables/public/active_users/changesets", `{"ops": [{"kind": "delete", "pk": {"id": 1}}]}`, 422, `"not_writable"`},
		{"/tables/public/nope/changesets", `{"ops": []}`, 404, `"not_found"`},
		{"/tables/public/users/changesets", `{"ops": [{"kind": "update", "pk": {"id": 1}, "set": {"id) OR (1=1": 1}}]}`, 400, `"bad_request"`},
		{"/tables/public/users/changesets", `{"ops": [{"kind": "update", "pk": {"id": 1}, "set": {"birth_date": "yesterday-ish"}}]}`, 400, `"pg_code":"22007"`},
		{"/tables/public/MixedCase/changesets", `{"ops": [{"kind": "update", "pk": {"Id": 1}, "set": {"DisplayName": "A"}, "expected": {"DisplayName": "Nope"}}]}`, 409,
			`"conflict":{"op":0,"kind":"update","pk":{"Id":1},"missing":false,"exists":false,"columns":["DisplayName"],"expected":{"DisplayName":"Nope"},"current":{"DisplayName":"Alpha","Id":1}}`},
		{"/changesets/unknown/undo", ``, 404, `"not_found"`},
		{"/tables/public/invoices/changesets:impact", `{"ops": [{"kind": "delete", "pk": {"id": 1}}]}`, 200,
			`{"tables":[{"schema":"public","table":"invoice_items","action":"cascade","rows":`},
		{"/tables/public/invoice_items:truncate", `{"confirm": "invoice_item"}`, 409, `"confirmation_required"`},
		{"/tables/public/invoice_items:truncate", `{"confirm": "invoice_items"}`, 204, ``},
	} {
		rec := post(r, tc.path, tc.body)
		if rec.Code != tc.status || !strings.Contains(rec.Body.String(), tc.contains) {
			t.Errorf("POST %s %s: %d %.400s", tc.path, tc.body, rec.Code, rec.Body.String())
		}
	}

	// Apply, undo and redo through the API.
	rec := post(r, "/tables/public/MixedCase/changesets", `{"ops": [{"kind": "update", "pk": {"Id": 1}, "set": {"DisplayName": "A"}, "expected": {"DisplayName": "Alpha"}}]}`)
	var res write.ChangesetResult
	if err := json.Unmarshal(rec.Body.Bytes(), &res); rec.Code != 200 || err != nil || !res.Undoable {
		t.Fatalf("apply: %d %s", rec.Code, rec.Body)
	}
	if rec := post(r, "/changesets/"+res.ID+"/undo", ``); rec.Code != 200 || !strings.Contains(rec.Body.String(), `"undone":true`) {
		t.Fatalf("undo: %d %s", rec.Code, rec.Body)
	}
	if rec := post(r, "/changesets/"+res.ID+"/undo", ``); rec.Code != 422 || !strings.Contains(rec.Body.String(), `"not_undoable"`) {
		t.Fatalf("second undo: %d %s", rec.Code, rec.Body)
	}
	if rec := post(r, "/changesets/"+res.ID+"/redo", ``); rec.Code != 200 || !strings.Contains(rec.Body.String(), `"undone":false`) {
		t.Fatalf("redo: %d %s", rec.Code, rec.Body)
	}
}

// In read-only mode the API answers 403 before touching the database (no catalog, no writer here).
func TestChangesetsReadOnly(t *testing.T) {
	r := changesetRouter(api.Changesets{ReadOnly: true})
	for _, path := range []string{"/tables/public/users/changesets", "/tables/public/users/changesets:preview", "/changesets/x/undo", "/changesets/x/redo", "/tables/public/users:truncate", "/tables/public/users/import", "/structure", "/structure:preview"} {
		if rec := post(r, path, `{"ops": []}`); rec.Code != 403 || !strings.Contains(rec.Body.String(), `"read_only"`) {
			t.Errorf("%s: %d %s", path, rec.Code, rec.Body)
		}
	}
}

func TestDropEndpoint(t *testing.T) {
	pool := pgtest.PoolFor(t, pgtest.NewDatabase(t))
	cat := introspect.New(pool)
	r := changesetRouter(api.Changesets{Catalog: cat, Writer: write.New(pool, pgvalue.NewTypes(), cat, nil),
		Session: func(context.Context) string { return "s" }})
	del := func(path, body string) *httptest.ResponseRecorder {
		rec := httptest.NewRecorder()
		r.ServeHTTP(rec, httptest.NewRequest("DELETE", path, strings.NewReader(body)))
		return rec
	}
	if rec := del("/tables/public/Weird%20Table", `{"confirm": "weird table"}`); rec.Code != 409 {
		t.Fatalf("wrong name: %d %s", rec.Code, rec.Body)
	}
	if rec := del("/tables/public/Weird%20Table", `{"confirm": "Weird Table"}`); rec.Code != 204 {
		t.Fatalf("drop: %d %s", rec.Code, rec.Body)
	}
	if rec := del("/tables/public/Weird%20Table", `{"confirm": "Weird Table"}`); rec.Code != 404 {
		t.Fatalf("drop again: %d %s", rec.Code, rec.Body)
	}
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, httptest.NewRequest("GET", "/tables/public/users/dependents", nil))
	if rec.Code != 200 || !strings.Contains(rec.Body.String(), `"view active_users"`) {
		t.Fatalf("dependents: %d %s", rec.Code, rec.Body)
	}
	ro := changesetRouter(api.Changesets{ReadOnly: true})
	rec = httptest.NewRecorder()
	ro.ServeHTTP(rec, httptest.NewRequest("DELETE", "/tables/public/users", strings.NewReader(`{"confirm": "users"}`)))
	if rec.Code != 403 {
		t.Fatalf("read-only drop: %d %s", rec.Code, rec.Body)
	}
}

func TestStructureEndpoints(t *testing.T) {
	pool := pgtest.PoolFor(t, pgtest.NewDatabase(t))
	cat := introspect.New(pool)
	r := changesetRouter(api.Changesets{Catalog: cat, Writer: write.New(pool, pgvalue.NewTypes(), cat, nil),
		Session: func(context.Context) string { return "s" }})
	for _, tc := range []struct {
		path, body string
		status     int
		contains   string
	}{
		{"/structure:preview", `{"kind": "add_column", "schema": "public", "table": "users", "def": {"name": "nick", "type": {"name": "character varying", "modifiers": ["20"]}}}`, 200,
			`{"sql":["ALTER TABLE \"public\".\"users\" ADD COLUMN \"nick\" character varying(20)"],"warnings":["lock"]}`},
		{"/structure:preview", `{"kind": "add_column", "schema": "public", "table": "users", "def": {"name": "nick", "type": {"name": "int; DROP TABLE users"}}}`, 400, `"bad_request"`},
		{"/structure:preview", `{"kind": "rename_table", "schema": "public", "table": "nope", "name": "x"}`, 404, `"not_found"`},
		{"/structure:preview", `{"kind": "set_table_comment", "schema": "public", "table": "active_users"}`, 422, `"not_writable"`},
		{"/structure", `{"kind": "drop_column", "schema": "public", "table": "users", "column": "full_name", "confirm": "users"}`, 409, `"confirmation_required"`},
		{"/structure", `{"kind": "set_default", "schema": "public", "table": "users", "column": "birth_date", "default": {"kind": "value", "value": "not a date"}}`, 400, `"pg_code":"22007"`},
		{"/structure", `{"kind": "rename_column", "schema": "public", "table": "users", "column": "full_name", "name": "display_name"}`, 200,
			`"sql":["ALTER TABLE \"public\".\"users\" RENAME COLUMN \"full_name\" TO \"display_name\""]`},
	} {
		rec := post(r, tc.path, tc.body)
		if rec.Code != tc.status || !strings.Contains(rec.Body.String(), tc.contains) {
			t.Errorf("POST %s %s: %d %.400s", tc.path, tc.body, rec.Code, rec.Body.String())
		}
	}
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, httptest.NewRequest("GET", "/types", nil))
	if rec.Code != 200 || !strings.Contains(rec.Body.String(), `{"name":"character varying","category":"S","modifiers":true,"user":false}`) {
		t.Fatalf("types: %d %.300s", rec.Code, rec.Body)
	}
}
