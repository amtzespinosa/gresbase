package api_test

import (
	"bytes"
	"context"
	"mime/multipart"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/amtzespinosa/gresbase/internal/api"
	"github.com/amtzespinosa/gresbase/internal/pg/introspect"
	"github.com/amtzespinosa/gresbase/internal/pg/pgvalue"
	"github.com/amtzespinosa/gresbase/internal/pg/write"
	"github.com/amtzespinosa/gresbase/internal/pgtest"
)

// multipartBody builds an import body with its parts in the given order (name, content pairs).
func multipartBody(t *testing.T, parts ...string) (*bytes.Buffer, string) {
	t.Helper()
	var b bytes.Buffer
	mw := multipart.NewWriter(&b)
	for i := 0; i < len(parts); i += 2 {
		w, err := mw.CreateFormFile(parts[i], "data.csv")
		if err == nil {
			_, err = w.Write([]byte(parts[i+1]))
		}
		if err != nil {
			t.Fatal(err)
		}
	}
	if err := mw.Close(); err != nil {
		t.Fatal(err)
	}
	return &b, mw.FormDataContentType()
}

func TestImportEndpoint(t *testing.T) {
	pool := pgtest.PoolFor(t, pgtest.NewDatabase(t))
	cat := introspect.New(pool)
	r := changesetRouter(api.Changesets{Catalog: cat, Writer: write.New(pool, pgvalue.NewTypes(), cat, nil),
		Session: func(context.Context) string { return "s" }})
	opts := `{"delimiter": ";", "header": true, "mapping": [{"column": "name", "source": 0}]}`
	for _, tc := range []struct {
		name     string
		path     string
		parts    []string
		status   int
		contains string
	}{
		{"ok", "/tables/public/orgs/import", []string{"options", opts, "file", "name\nImported A\nImported B\n"}, 200, `{"inserted":2,"errors":[]}`},
		{"row errors", "/tables/public/orgs/import", []string{"options", opts, "file", "name\nImported C\nImported A\n"}, 200,
			`"inserted":0,"errors":[{"row":3,"message":"duplicate key value`},
		{"file first", "/tables/public/orgs/import", []string{"file", "x\n", "options", opts}, 400, `"bad_request"`},
		{"bad options", "/tables/public/orgs/import", []string{"options", `{"delimiter": ";", "nope": 1}`, "file", "x\n"}, 400, `"bad_request"`},
		{"invalid mapping", "/tables/public/orgs/import", []string{"options", `{"delimiter": ",", "mapping": [{"column": "id", "source": 0}]}`, "file", "1\n"}, 400, `"bad_request"`},
		{"view", "/tables/public/active_users/import", []string{"options", opts, "file", "x\n"}, 422, `"not_writable"`},
		{"missing table", "/tables/public/nope/import", []string{"options", opts, "file", "x\n"}, 404, `"not_found"`},
	} {
		t.Run(tc.name, func(t *testing.T) {
			body, ctype := multipartBody(t, tc.parts...)
			req := httptest.NewRequest("POST", tc.path, body)
			req.Header.Set("Content-Type", ctype)
			rec := httptest.NewRecorder()
			r.ServeHTTP(rec, req)
			if rec.Code != tc.status || !strings.Contains(rec.Body.String(), tc.contains) {
				t.Errorf("%d %.400s", rec.Code, rec.Body)
			}
		})
	}
}
