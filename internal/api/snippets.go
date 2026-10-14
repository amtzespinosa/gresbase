package api

import (
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"

	"github.com/amtzespinosa/gresbase/internal/snippets"
)

// Snippets serves the saved queries (.sql files under GRESBASE_DATA_DIR/snippets). They are app
// data, not database writes, so they stay available in read-only mode.
type Snippets struct {
	Store *snippets.Store
	// Owner names the private store of the request's session (free mode users), or "" for the
	// shared one.
	Owner func(*http.Request) string
}

// store resolves the request's store; done releases it.
func (h Snippets) store(w http.ResponseWriter, r *http.Request) (st *snippets.Store, done func(), ok bool) {
	owner := ""
	if h.Owner != nil {
		owner = h.Owner(r)
	}
	if owner == "" {
		return h.Store, func() {}, true
	}
	st, err := h.Store.Private(owner)
	if err != nil {
		snippetError(w, err)
		return nil, nil, false
	}
	return st, func() { _ = st.Close() }, true
}

// List answers every folder and snippet as a flat, sorted list: the client builds the tree.
func (h Snippets) List(w http.ResponseWriter, r *http.Request) {
	st, done, ok := h.store(w, r)
	if !ok {
		return
	}
	defer done()
	entries, err := st.List()
	if err != nil {
		snippetError(w, err)
		return
	}
	WriteJSON(w, http.StatusOK, entries)
}

// Get answers one snippet: GET /snippets/file?path=reports/monthly.sql.
func (h Snippets) Get(w http.ResponseWriter, r *http.Request) {
	st, done, ok := h.store(w, r)
	if !ok {
		return
	}
	defer done()
	s, err := st.Get(r.URL.Query().Get("path"))
	if err != nil {
		snippetError(w, err)
		return
	}
	WriteJSON(w, http.StatusOK, s)
}

// Create saves a new snippet (409 if the path is taken).
func (h Snippets) Create(w http.ResponseWriter, r *http.Request) {
	h.save(w, r, http.StatusCreated, (*snippets.Store).Create)
}

// Update replaces an existing snippet (404 if it does not exist).
func (h Snippets) Update(w http.ResponseWriter, r *http.Request) {
	h.save(w, r, http.StatusOK, (*snippets.Store).Update)
}

func (h Snippets) save(w http.ResponseWriter, r *http.Request, status int,
	fn func(st *snippets.Store, path, sql string) (snippets.Snippet, error)) {
	var req snippets.SaveRequest
	if !decodeSnippet(w, r, &req) {
		return
	}
	st, done, ok := h.store(w, r)
	if !ok {
		return
	}
	defer done()
	s, err := fn(st, req.Path, req.SQL)
	if err != nil {
		snippetError(w, err)
		return
	}
	WriteJSON(w, status, s)
}

// Move renames or moves a snippet or a folder.
func (h Snippets) Move(w http.ResponseWriter, r *http.Request) {
	var req snippets.MoveRequest
	if !DecodeJSON(w, r, &req) {
		return
	}
	st, done, ok := h.store(w, r)
	if !ok {
		return
	}
	defer done()
	if err := st.Move(req.From, req.To); err != nil {
		snippetError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// Delete removes a snippet or a folder with its content: DELETE /snippets?path=….
func (h Snippets) Delete(w http.ResponseWriter, r *http.Request) {
	st, done, ok := h.store(w, r)
	if !ok {
		return
	}
	defer done()
	if err := st.Delete(r.URL.Query().Get("path")); err != nil {
		snippetError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// CreateFolder creates a folder.
func (h Snippets) CreateFolder(w http.ResponseWriter, r *http.Request) {
	var req snippets.FolderRequest
	if !DecodeJSON(w, r, &req) {
		return
	}
	st, done, ok := h.store(w, r)
	if !ok {
		return
	}
	defer done()
	if err := st.MkdirAll(req.Path); err != nil {
		snippetError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// decodeSnippet is DecodeJSON with room for a 1 MB query once JSON-escaped; the store enforces
// the 1 MB limit on the query itself.
func decodeSnippet(w http.ResponseWriter, r *http.Request, v any) bool {
	d := json.NewDecoder(http.MaxBytesReader(w, r.Body, 4*snippets.MaxSize))
	d.DisallowUnknownFields()
	if err := d.Decode(v); err != nil {
		var tooBig *http.MaxBytesError
		if errors.As(err, &tooBig) {
			Fail(w, http.StatusRequestEntityTooLarge, CodeBadRequest, snippets.ErrTooLarge.Error())
			return false
		}
		Fail(w, http.StatusBadRequest, CodeBadRequest, "invalid JSON body: "+err.Error())
		return false
	}
	return true
}

func snippetError(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, snippets.ErrInvalid):
		Fail(w, http.StatusBadRequest, CodeBadRequest, err.Error())
	case errors.Is(err, snippets.ErrTooLarge):
		Fail(w, http.StatusRequestEntityTooLarge, CodeBadRequest, err.Error())
	case errors.Is(err, snippets.ErrNotFound):
		Fail(w, http.StatusNotFound, CodeNotFound, err.Error())
	case errors.Is(err, snippets.ErrExists):
		Fail(w, http.StatusConflict, CodeConflict, err.Error())
	default:
		slog.Error("saved queries", "err", err)
		Fail(w, http.StatusInternalServerError, CodeInternal, "could not access the saved queries")
	}
}
