package api

import (
	"context"
	"errors"
	"net/http"

	"github.com/go-chi/chi/v5"

	"github.com/amtzespinosa/gresbase/internal/pg/introspect"
	"github.com/amtzespinosa/gresbase/internal/pg/sqlexec"
	"github.com/amtzespinosa/gresbase/internal/pg/sqlguard"
)

// SQL serves the SQL editor endpoints.
type SQL struct {
	Exec    *sqlexec.Executor
	Catalog *introspect.Catalog // invalidated after anything that may change the schema
	// Session returns the session id of a request (auth.SessionID): executions and transactions
	// belong to one session.
	Session func(context.Context) string
}

// Execute handles POST /api/v1/sql/execute.
func (h SQL) Execute(w http.ResponseWriter, r *http.Request) {
	var req sqlexec.SQLRequest
	if !DecodeJSON(w, r, &req) {
		return
	}
	res, err := h.Exec.Execute(r.Context(), h.Session(r.Context()), req)
	if err != nil {
		sqlError(w, err)
		return
	}
	if req.TxID == "" {
		h.Catalog.Invalidate()
	}
	WriteJSON(w, http.StatusOK, res)
}

// Analyze handles POST /api/v1/sql/analyze: the destructive statements of a script.
func (h SQL) Analyze(w http.ResponseWriter, r *http.Request) {
	var req sqlexec.AnalyzeRequest
	if DecodeJSON(w, r, &req) {
		WriteJSON(w, http.StatusOK, sqlguard.Analyze(req.SQL))
	}
}

// Cancel handles POST /api/v1/sql/executions/{id}/cancel.
func (h SQL) Cancel(w http.ResponseWriter, r *http.Request) {
	if err := h.Exec.Cancel(r.Context(), h.Session(r.Context()), chi.URLParam(r, "id")); err != nil {
		sqlError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// Begin handles POST /api/v1/sql/transactions.
func (h SQL) Begin(w http.ResponseWriter, r *http.Request) {
	info, err := h.Exec.Begin(r.Context(), h.Session(r.Context()))
	if err != nil {
		sqlError(w, err)
		return
	}
	WriteJSON(w, http.StatusCreated, info)
}

// Txs handles GET /api/v1/sql/transactions: the open transactions of the session.
func (h SQL) Txs(w http.ResponseWriter, r *http.Request) {
	WriteJSON(w, http.StatusOK, h.Exec.Txs(h.Session(r.Context())))
}

// Tx handles GET /api/v1/sql/transactions/{id}.
func (h SQL) Tx(w http.ResponseWriter, r *http.Request) {
	info, err := h.Exec.Tx(h.Session(r.Context()), chi.URLParam(r, "id"))
	if err != nil {
		sqlError(w, err)
		return
	}
	WriteJSON(w, http.StatusOK, info)
}

// Commit handles POST /api/v1/sql/transactions/{id}/commit.
func (h SQL) Commit(w http.ResponseWriter, r *http.Request) { h.finish(w, r, h.Exec.Commit) }

// Rollback handles POST /api/v1/sql/transactions/{id}/rollback.
func (h SQL) Rollback(w http.ResponseWriter, r *http.Request) { h.finish(w, r, h.Exec.Rollback) }

func (h SQL) finish(w http.ResponseWriter, r *http.Request, fn func(context.Context, string, string) (*sqlexec.TxResult, error)) {
	res, err := fn(r.Context(), h.Session(r.Context()), chi.URLParam(r, "id"))
	if err != nil {
		sqlError(w, err)
		return
	}
	h.Catalog.Invalidate()
	WriteJSON(w, http.StatusOK, res)
}

func sqlError(w http.ResponseWriter, err error) {
	var ce *sqlexec.ConfirmationError
	switch {
	case errors.As(err, &ce):
		WriteError(w, http.StatusConflict, Error{Code: CodeConfirmationRequired, Message: err.Error(), Analysis: ce.Analysis})
	case errors.Is(err, sqlexec.ErrInvalid):
		Fail(w, http.StatusBadRequest, CodeBadRequest, err.Error())
	case errors.Is(err, sqlexec.ErrNotFound):
		Fail(w, http.StatusNotFound, CodeNotFound, err.Error())
	case errors.Is(err, sqlexec.ErrBusy), errors.Is(err, sqlexec.ErrTooManyTx):
		Fail(w, http.StatusConflict, CodeConflict, err.Error())
	case errors.Is(err, sqlexec.ErrReadOnly):
		Fail(w, http.StatusForbidden, CodeReadOnly, err.Error())
	default:
		DBError(w, err)
	}
}
