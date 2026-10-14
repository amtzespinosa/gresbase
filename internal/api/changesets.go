package api

import (
	"context"
	"errors"
	"net/http"

	"github.com/go-chi/chi/v5"

	"github.com/amtzespinosa/gresbase/internal/pg/introspect"
	"github.com/amtzespinosa/gresbase/internal/pg/write"
)

// Changesets serves the data writing endpoints. In read-only mode every one answers 403 before
// touching the database.
type Changesets struct {
	Catalog  *introspect.Catalog
	Writer   *write.Writer
	ReadOnly bool
	// Session returns the session id of a request (auth.SessionID): changesets are undone per session.
	Session func(context.Context) string
}

// Apply handles POST /api/v1/tables/{schema}/{table}/changesets.
func (h Changesets) Apply(w http.ResponseWriter, r *http.Request) {
	t, cs, ok := h.request(w, r)
	if !ok {
		return
	}
	res, err := h.Writer.Apply(r.Context(), h.Session(r.Context()), t, cs)
	if err != nil {
		writeError(w, err)
		return
	}
	WriteJSON(w, http.StatusOK, res)
}

// Preview handles POST /api/v1/tables/{schema}/{table}/changesets:preview.
func (h Changesets) Preview(w http.ResponseWriter, r *http.Request) {
	t, cs, ok := h.request(w, r)
	if !ok {
		return
	}
	p, err := h.Writer.Preview(t, cs)
	if err != nil {
		writeError(w, err)
		return
	}
	WriteJSON(w, http.StatusOK, p)
}

// Undo handles POST /api/v1/changesets/{id}/undo.
func (h Changesets) Undo(w http.ResponseWriter, r *http.Request) { h.toggle(w, r, h.Writer.Undo) }

// Redo handles POST /api/v1/changesets/{id}/redo.
func (h Changesets) Redo(w http.ResponseWriter, r *http.Request) { h.toggle(w, r, h.Writer.Redo) }

func (h Changesets) toggle(w http.ResponseWriter, r *http.Request, fn func(ctx context.Context, session, id string) (*write.ChangesetResult, error)) {
	if h.readOnly(w) {
		return
	}
	res, err := fn(r.Context(), h.Session(r.Context()), chi.URLParam(r, "id"))
	if err != nil {
		writeError(w, err)
		return
	}
	WriteJSON(w, http.StatusOK, res)
}

func (h Changesets) readOnly(w http.ResponseWriter) bool {
	if h.ReadOnly {
		Fail(w, http.StatusForbidden, CodeReadOnly, "Gresbase is in read-only mode")
	}
	return h.ReadOnly
}

func (h Changesets) request(w http.ResponseWriter, r *http.Request) (*introspect.Table, write.Changeset, bool) {
	var cs write.Changeset
	if h.readOnly(w) || !DecodeJSON(w, r, &cs) {
		return nil, cs, false
	}
	t, ok := h.lookup(w, r)
	return t, cs, ok
}

// writeError maps errors of the write package. Values Postgres rejects as input (SQLSTATE class
// 22) are the client's fault, like in rowsError.
func writeError(w http.ResponseWriter, err error) {
	var conflict *write.ConflictError
	switch {
	case errors.As(err, &conflict):
		WriteError(w, http.StatusConflict, Error{Code: CodeConflict, Message: err.Error(), Conflict: &conflict.Conflict})
	case errors.Is(err, write.ErrNoPrimaryKey):
		Fail(w, http.StatusUnprocessableEntity, CodeNoPrimaryKey, err.Error())
	case errors.Is(err, write.ErrNotWritable):
		Fail(w, http.StatusUnprocessableEntity, CodeNotWritable, err.Error())
	case errors.Is(err, write.ErrNotFound):
		Fail(w, http.StatusNotFound, CodeNotFound, err.Error())
	case errors.Is(err, write.ErrNotUndoable):
		Fail(w, http.StatusUnprocessableEntity, CodeNotUndoable, err.Error())
	case errors.Is(err, write.ErrConfirmation):
		Fail(w, http.StatusConflict, CodeConfirmationRequired, err.Error())
	case errors.Is(err, write.ErrInvalid):
		Fail(w, http.StatusBadRequest, CodeBadRequest, err.Error())
	case errors.Is(err, introspect.ErrNotFound):
		Fail(w, http.StatusNotFound, CodeNotFound, err.Error())
	default:
		rowsError(w, err)
	}
}

// Impact handles POST /api/v1/tables/{schema}/{table}/changesets:impact: what the deletes of a
// changeset would also delete or change in other tables. It only reads.
func (h Changesets) Impact(w http.ResponseWriter, r *http.Request) {
	var cs write.Changeset
	if !DecodeJSON(w, r, &cs) {
		return
	}
	t, ok := h.lookup(w, r)
	if !ok {
		return
	}
	im, err := h.Writer.Impact(r.Context(), t, cs)
	if err != nil {
		writeError(w, err)
		return
	}
	WriteJSON(w, http.StatusOK, im)
}

// Dependents handles GET /api/v1/tables/{schema}/{table}/dependents.
func (h Changesets) Dependents(w http.ResponseWriter, r *http.Request) {
	t, ok := h.lookup(w, r)
	if !ok {
		return
	}
	d, err := h.Writer.Dependents(r.Context(), t)
	if err != nil {
		DBError(w, err)
		return
	}
	WriteJSON(w, http.StatusOK, d)
}

// Truncate handles POST /api/v1/tables/{schema}/{table}:truncate.
func (h Changesets) Truncate(w http.ResponseWriter, r *http.Request) {
	var req write.TruncateRequest
	if h.readOnly(w) || !DecodeJSON(w, r, &req) {
		return
	}
	if t, ok := h.lookup(w, r); ok {
		h.done(w, h.Writer.Truncate(r.Context(), h.Session(r.Context()), t, req))
	}
}

// Drop handles DELETE /api/v1/tables/{schema}/{table}.
func (h Changesets) Drop(w http.ResponseWriter, r *http.Request) {
	var req write.DropRequest
	if h.readOnly(w) || !DecodeJSON(w, r, &req) {
		return
	}
	if t, ok := h.lookup(w, r); ok {
		h.done(w, h.Writer.Drop(r.Context(), h.Session(r.Context()), t, req))
	}
}

func (h Changesets) done(w http.ResponseWriter, err error) {
	if err != nil {
		writeError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h Changesets) lookup(w http.ResponseWriter, r *http.Request) (*introspect.Table, bool) {
	t, err := h.Catalog.Lookup(r.Context(), PathParam(r, "schema"), PathParam(r, "table"))
	if err != nil {
		CatalogError(w, err)
		return nil, false
	}
	return t, true
}

// StructurePreview handles POST /api/v1/structure:preview: the SQL of a structure change and its
// warnings, without running it.
func (h Changesets) StructurePreview(w http.ResponseWriter, r *http.Request) {
	h.structure(w, r, h.Writer.PreviewStructure)
}

// Structure handles POST /api/v1/structure: runs a structure change in one transaction.
func (h Changesets) Structure(w http.ResponseWriter, r *http.Request) {
	h.structure(w, r, h.Writer.ApplyStructure)
}

func (h Changesets) structure(w http.ResponseWriter, r *http.Request, fn func(context.Context, write.StructureChange) (*write.StructurePreview, error)) {
	var c write.StructureChange
	if h.readOnly(w) || !DecodeJSON(w, r, &c) {
		return
	}
	p, err := fn(r.Context(), c)
	if err != nil {
		writeError(w, err)
		return
	}
	WriteJSON(w, http.StatusOK, p)
}

// Types handles GET /api/v1/types: the types a column can have.
func (h Changesets) Types(w http.ResponseWriter, r *http.Request) {
	ts, err := h.Writer.Types(r.Context())
	if err != nil {
		DBError(w, err)
		return
	}
	WriteJSON(w, http.StatusOK, ts)
}
