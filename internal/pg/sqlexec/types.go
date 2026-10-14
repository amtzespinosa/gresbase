package sqlexec

import (
	"time"

	"github.com/amtzespinosa/gresbase/internal/pg/rows"
)

// Wire types of the SQL endpoints (exported to TypeScript by tygo). Offsets and positions are in
// UTF-16 code units of the submitted text, the unit of the browser editor.

// SQLRequest is the body of POST /api/v1/sql/execute.
type SQLRequest struct {
	SQL string `json:"sql"`
	// TimeoutMS is the statement_timeout of this execution (default GRESBASE_STATEMENT_TIMEOUT).
	TimeoutMS int `json:"timeout_ms,omitempty"`
	// MaxRows caps the rows returned per statement (default 1000); reading stops there.
	MaxRows int `json:"max_rows,omitempty"`
	// TxID runs the statements inside an open transaction (POST /api/v1/sql/transactions).
	TxID string `json:"tx_id,omitempty"`
	// ConfirmDestructive runs destructive statements outside a transaction without a 409.
	ConfirmDestructive bool `json:"confirm_destructive,omitempty"`
	// ExecutionID, chosen by the client, lets it cancel the execution while it runs.
	ExecutionID string `json:"execution_id,omitempty"`
	// Params gives the values of the :name parameters. When set, each statement that has some runs
	// with them as bound parameters ($1, $2… in order of first use, typed by the server), never
	// written into the SQL; a parameter without a value is a 400.
	Params map[string]string `json:"params,omitempty"`
}

// SQLResponse is the result of an execution: one StatementResult per statement
// run. Execution stops at the first error, which is in the last result.
type SQLResponse struct {
	ExecutionID string            `json:"execution_id"`
	Results     []StatementResult `json:"results"`
	Tx          *TxInfo           `json:"tx" tstype:"TxInfo | null"` // the transaction after running, when TxID was given
}

// StatementResult is the outcome of one statement. From and To locate it in the submitted text.
type StatementResult struct {
	Statement    int                 `json:"statement"`
	From         int                 `json:"from"`
	To           int                 `json:"to"`
	Columns      []rows.ResultColumn `json:"columns" tstype:"ResultColumn[]"`
	Rows         [][]any             `json:"rows" tstype:"Cell[][]"`
	Truncated    bool                `json:"truncated"` // more rows than max_rows
	RowsAffected int64               `json:"rows_affected"`
	CommandTag   string              `json:"command_tag"`
	DurationMS   float64             `json:"duration_ms"`
	Notices      []Notice            `json:"notices"`
	Error        *StatementError     `json:"error" tstype:"StatementError | null"`
}

// Notice is a message the server sent while running (RAISE NOTICE, warnings…).
type Notice struct {
	Severity string `json:"severity"`
	Message  string `json:"message"`
	Detail   string `json:"detail,omitempty"`
	Hint     string `json:"hint,omitempty"`
	Code     string `json:"code"`
}

// StatementError is a statement error in the shape of the API errors. Position is 1-based in the
// submitted text (absent when Postgres gave none).
type StatementError struct {
	Code     string `json:"code"`
	Message  string `json:"message"`
	Detail   string `json:"detail,omitempty"`
	Hint     string `json:"hint,omitempty"`
	Position int    `json:"position,omitempty"`
	PgCode   string `json:"pg_code,omitempty"`
}

// TxInfo describes an open transaction. Status is "failed" after an error: only rollback is left.
type TxInfo struct {
	ID           string        `json:"id"`
	Status       string        `json:"status" tstype:"'active' | 'failed'"`
	CreatedAt    time.Time     `json:"created_at"`
	ExpiresAt    time.Time     `json:"expires_at"`
	RowsAffected int64         `json:"rows_affected"`
	Statements   []TxStatement `json:"statements"`
}

// TxStatement is a statement run successfully inside a transaction. Kind and Level are the
// destructive classification (sqlguard), empty for harmless statements.
type TxStatement struct {
	SQL          string `json:"sql"`
	CommandTag   string `json:"command_tag"`
	RowsAffected int64  `json:"rows_affected"`
	Kind         string `json:"kind,omitempty"`
	Level        string `json:"level,omitempty"`
}

// TxResult is the response of commit and rollback. Committed is false when Postgres rolled back
// instead (COMMIT of a failed transaction).
type TxResult struct {
	Committed bool `json:"committed"`
}

// AnalyzeRequest is the body of POST /api/v1/sql/analyze (the response is a sqlguard Analysis).
type AnalyzeRequest struct {
	SQL string `json:"sql"`
}
