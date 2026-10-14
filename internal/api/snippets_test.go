package api_test

import (
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"

	"github.com/amtzespinosa/gresbase/internal/api"
	"github.com/amtzespinosa/gresbase/internal/snippets"
)

func TestSnippetEndpoints(t *testing.T) {
	store, err := snippets.Open(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = store.Close() })
	h := api.Snippets{Store: store}
	r := chi.NewRouter()
	r.Get("/snippets", h.List)
	r.Post("/snippets", h.Create)
	r.Put("/snippets", h.Update)
	r.Delete("/snippets", h.Delete)
	r.Get("/snippets/file", h.Get)
	r.Post("/snippets:move", h.Move)
	r.Post("/snippets/folders", h.CreateFolder)

	big := `{"path": "big.sql", "sql": "` + strings.Repeat("x", snippets.MaxSize+1) + `"}`
	for _, tc := range []struct {
		method, path, body string
		status             int
		contains           string
	}{
		{"POST", "/snippets", `{"path": "reports/a.sql", "sql": "select 1"}`, 201, `"path":"reports/a.sql","sql":"select 1"`},
		{"POST", "/snippets", `{"path": "reports/a.sql", "sql": "select 1"}`, 409, `"conflict"`},
		{"POST", "/snippets", `{"path": "../escape.sql", "sql": "x"}`, 400, `"bad_request"`},
		{"POST", "/snippets", `{"path": "/etc/passwd.sql", "sql": "x"}`, 400, `"bad_request"`},
		{"POST", "/snippets", `{"path": "notes.txt", "sql": "x"}`, 400, `"bad_request"`},
		{"POST", "/snippets", big, 413, `"bad_request"`},
		{"PUT", "/snippets", `{"path": "reports/a.sql", "sql": "select 2"}`, 200, `"sql":"select 2"`},
		{"PUT", "/snippets", `{"path": "missing.sql", "sql": "x"}`, 404, `"not_found"`},
		{"GET", "/snippets/file?path=reports/a.sql", "", 200, `"sql":"select 2"`},
		{"GET", "/snippets/file?path=..%2F..%2Fetc%2Fpasswd", "", 400, `"bad_request"`},
		{"POST", "/snippets/folders", `{"path": "drafts"}`, 204, ""},
		{"POST", "/snippets:move", `{"from": "reports/a.sql", "to": "drafts/b.sql"}`, 204, ""},
		{"POST", "/snippets:move", `{"from": "drafts/b.sql", "to": "../b.sql"}`, 400, `"bad_request"`},
		{"GET", "/snippets", "", 200, `[{"path":"drafts","folder":true`},
		{"DELETE", "/snippets?path=..", "", 400, `"bad_request"`},
		{"DELETE", "/snippets?path=drafts", "", 204, ""},
		{"GET", "/snippets/file?path=drafts/b.sql", "", 404, `"not_found"`},
	} {
		w := httptest.NewRecorder()
		r.ServeHTTP(w, httptest.NewRequest(tc.method, tc.path, strings.NewReader(tc.body)))
		if w.Code != tc.status || !strings.Contains(w.Body.String(), tc.contains) {
			body := w.Body.String()
			if len(body) > 300 {
				body = body[:300]
			}
			t.Errorf("%s %s = %d %s, want %d containing %s", tc.method, tc.path, w.Code, body, tc.status, tc.contains)
		}
	}
}
