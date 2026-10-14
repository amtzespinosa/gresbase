package api

import (
	"encoding/json"
	"log/slog"
	"net/http"
)

// Stable error codes. The frontend translates them with i18n.
const (
	CodeBadRequest           = "bad_request"
	CodeNotFound             = "not_found"
	CodeUnauthorized         = "unauthorized"
	CodeForbidden            = "forbidden"
	CodeReadOnly             = "read_only"
	CodeConflict             = "conflict"
	CodeConfirmationRequired = "confirmation_required"
	CodeNoPrimaryKey         = "no_primary_key"
	CodeTimeout              = "timeout"
	CodeCanceled             = "canceled"
	CodePgError              = "pg_error"
	CodeInternal             = "internal"
	CodeRateLimited          = "rate_limited"
	CodeNotWritable          = "not_writable"
	CodeNotUndoable          = "not_undoable"
	CodeUnsupportedVersion   = "unsupported_version"
	CodeLockedByEnv          = "locked_by_env"
	CodeTooManyConnections   = "too_many_connections"
	CodeSetupRequired        = "setup_required"
	CodeSetupToken           = "setup_token_invalid"
	CodeConnectionFailed     = "connection_failed"
	CodeDBHostNotAllowed     = "db_host_not_allowed"
	CodeTooManySessions      = "too_many_sessions"
)

// Error is the body of every API error: {"error": {...}}.
type Error struct {
	Code     string `json:"code"`
	Message  string `json:"message"`
	Detail   string `json:"detail,omitempty"`
	Hint     string `json:"hint,omitempty"`
	Position int    `json:"position,omitempty"`
	PgCode   string `json:"pg_code,omitempty"`
	// Reason says why a connection_failed happened (pg.Kind*: dns, connection_refused, authentication…).
	Reason string `json:"reason,omitempty"`
	// Conflict details the row of a 409 conflict (write.Conflict).
	Conflict any `json:"conflict,omitempty"`
	// Analysis lists the destructive statements of a 409 confirmation_required (sqlguard.Analysis).
	Analysis any `json:"analysis,omitempty"`
}

// WriteJSON writes v as JSON with the given status.
func WriteJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(v); err != nil {
		slog.Debug("write json response", "err", err)
	}
}

// WriteError writes e in the common error envelope.
func WriteError(w http.ResponseWriter, status int, e Error) {
	WriteJSON(w, status, struct {
		Error Error `json:"error"`
	}{e})
}

// Fail is a shorthand for WriteError with only a code and a message.
func Fail(w http.ResponseWriter, status int, code, message string) {
	WriteError(w, status, Error{Code: code, Message: message})
}
