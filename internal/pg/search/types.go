package search

// SearchRequest is the body of POST /api/v1/search.
type SearchRequest struct { //nolint:revive // the TS name (types.gen.ts) must not clash with the DOM's Request and Event
	// Q is the term: matched with ILIKE in text columns, and exactly in number, uuid and date columns
	// when it looks like one. At least two characters.
	Q string `json:"q"`
	// IncludeLarge also searches tables with more than LargeRows estimated rows.
	IncludeLarge bool `json:"include_large,omitempty"`
	// Schemas limits the search to these schemas; empty searches every schema the role can use.
	Schemas []string `json:"schemas,omitempty"`
	// Tables limits the search to these tables (to retry one that was too slow).
	Tables []SearchTableRef `json:"tables,omitempty"`
	// TimeoutMS is the time limit per table; 0 uses DefaultTimeout. At most MaxTimeout.
	TimeoutMS int `json:"timeout_ms,omitempty"`
}

// SearchTableRef names a table.
type SearchTableRef struct { //nolint:revive // the TS name (types.gen.ts) must not clash with the DOM's Request and Event
	Schema string `json:"schema"`
	Table  string `json:"table"`
}

// SearchEvent is one line of the streamed answer (NDJSON), in this order: one "start", then one "table" or
// "skipped" per table as each finishes, then one "done".
type SearchEvent struct { //nolint:revive // the TS name (types.gen.ts) must not clash with the DOM's Request and Event
	Type string `json:"type" tstype:"'start' | 'table' | 'skipped' | 'done'"`
	// start: how many tables will be searched, and how many large ones were left out.
	Tables       int `json:"tables,omitempty"`
	SkippedLarge int `json:"skipped_large,omitempty"`
	// table and skipped: which table.
	Schema string `json:"schema,omitempty"`
	Table  string `json:"table,omitempty"`
	// table: its primary key columns (empty when it has none) and the rows that matched.
	PrimaryKey []string      `json:"primary_key,omitempty"`
	Rows       []SearchMatch `json:"rows,omitempty"`
	// skipped: why (permission, timeout or error) and the database message for an error.
	Reason  string `json:"reason,omitempty" tstype:"'permission' | 'timeout' | 'error'"`
	Message string `json:"message,omitempty"`
	// done: rows found, and whether the total limit cut the search short.
	Found     int  `json:"found,omitempty"`
	Truncated bool `json:"truncated,omitempty"`
}

// SearchMatch is one row that matched: its primary key (as text), the first column that matched and a
// snippet of that column's value around the match.
type SearchMatch struct { //nolint:revive // the TS name (types.gen.ts) must not clash with the DOM's Request and Event
	Key     map[string]string `json:"key,omitempty"`
	Column  string            `json:"column"`
	Value   string            `json:"value,omitempty"` // the exact value, for a non-text match
	Snippet string            `json:"snippet"`
}
