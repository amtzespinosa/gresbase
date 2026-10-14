package ui

import (
	"bytes"
	"embed"
	"html"
	"io/fs"
	"net/http"
	"path"
	"strings"
)

// dist is filled by `pnpm build` (vite outDir). A committed .gitkeep keeps the embed valid before the
// first build.
//
//go:embed all:dist
var dist embed.FS

// Dist returns the compiled frontend.
func Dist() fs.FS {
	sub, err := fs.Sub(dist, "dist")
	if err != nil {
		panic(err) // "dist" is a literal that always exists in the embed
	}
	return sub
}

// Handler serves the frontend from fsys. Existing files are served as they are (hashed assets under
// /assets are cached forever). A missing file with an extension is a 404 when it is top level or
// under /assets (a missing asset); anything else gets index.html so the client router can take over
// (client routes such as /sql/reports%2Fmonthly.sql or /tables/public/v1.2 contain dots too). basePath ("" or "/prefix") is injected as <base href> so relative asset URLs resolve from any
// route. The handler expects r.URL.Path with the base path already stripped.
func Handler(fsys fs.FS, basePath string) http.Handler {
	index, err := fs.ReadFile(fsys, "index.html")
	if err == nil {
		tag := `<head><base href="` + html.EscapeString(basePath+"/") + `">`
		index = bytes.Replace(index, []byte("<head>"), []byte(tag), 1)
	}

	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet && r.Method != http.MethodHead {
			w.Header().Set("Allow", "GET, HEAD")
			http.Error(w, http.StatusText(http.StatusMethodNotAllowed), http.StatusMethodNotAllowed)
			return
		}
		name := strings.TrimPrefix(path.Clean(r.URL.Path), "/")
		info, err := fs.Stat(fsys, name)
		if path.Ext(name) != "" && (err != nil || info.IsDir()) &&
			(!strings.Contains(name, "/") || strings.HasPrefix(name, "assets/")) {
			http.NotFound(w, r)
			return
		}
		if err == nil && !info.IsDir() && name != "index.html" {
			if strings.HasPrefix(name, "assets/") {
				w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
			} else {
				w.Header().Set("Cache-Control", "no-cache")
			}
			// name is cleaned from a rooted path and fs.FS rejects "..": no traversal possible.
			http.ServeFileFS(w, r, fsys, name) //nolint:gosec // see above
			return
		}
		if index == nil {
			http.Error(w, "frontend not built: run `task build`", http.StatusServiceUnavailable)
			return
		}
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		w.Header().Set("Cache-Control", "no-cache, no-store, must-revalidate")
		_, _ = w.Write(index)
	})
}
