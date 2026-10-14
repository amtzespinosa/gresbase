package api

import (
	"context"
	"errors"
	"log/slog"
	"net/http"

	"github.com/jackc/pgx/v5/pgconn"
)

// DBError writes err from a database call in the common envelope: Postgres errors keep their
// SQLSTATE, message, detail, hint and position; read-only, timeout and cancel get their own codes.
func DBError(w http.ResponseWriter, err error) {
	var pgErr *pgconn.PgError
	switch {
	case errors.As(err, &pgErr):
		e := Error{Code: CodePgError, Message: pgErr.Message, Detail: pgErr.Detail, Hint: pgErr.Hint,
			Position: int(pgErr.Position), PgCode: pgErr.Code}
		status := http.StatusUnprocessableEntity
		switch pgErr.Code {
		case "25006": // read_only_sql_transaction
			e.Code, status = CodeReadOnly, http.StatusForbidden
		case "57014": // query_canceled: statement_timeout or explicit cancel
			e.Code, status = CodeTimeout, http.StatusGatewayTimeout
		}
		WriteError(w, status, e)
	case errors.Is(err, context.DeadlineExceeded):
		Fail(w, http.StatusGatewayTimeout, CodeTimeout, "the database did not answer in time")
	case errors.Is(err, context.Canceled):
		Fail(w, http.StatusBadRequest, CodeCanceled, "request canceled")
	default:
		slog.Error("database error", "err", err)
		Fail(w, http.StatusServiceUnavailable, CodeInternal, "database unavailable")
	}
}
