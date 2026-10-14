package rows

import "encoding/json"

// Wire types of the rows endpoints (exported to TypeScript by tygo).

// Query is the body of rows:query, rows:count and rows:sql.
type Query struct {
	Filters []Filter `json:"filters"`
	Logic   string   `json:"logic" tstype:"'and' | 'or'"`
	Sort    []Sort   `json:"sort"`
	Limit   int      `json:"limit"`
	Cursor  string   `json:"cursor,omitempty"`
	Offset  int      `json:"offset,omitempty"`
}

// Filter is one condition. Value is a string or number for scalar operators, a list for in and
// between (two items), any JSON for json_contains and absent for is_null/not_null.
type Filter struct {
	Column string          `json:"column"`
	Op     string          `json:"op" tstype:"FilterOp"`
	Value  json.RawMessage `json:"value,omitempty" tstype:"unknown"`
}

// Sort is one ORDER BY key.
type Sort struct {
	Column string `json:"column"`
	Dir    string `json:"dir" tstype:"'asc' | 'desc'"`
}

// ResultColumn is a column of a page of rows (named so it does not clash with introspect.Column
// in the generated TypeScript).
type ResultColumn struct {
	Name string `json:"name"`
	Type string `json:"type"`
}

// Page is the response of rows:query. Each row has one cell per column, in column order.
type Page struct {
	Columns    []ResultColumn `json:"columns"`
	Rows       [][]any        `json:"rows" tstype:"Cell[][]"`
	NextCursor *string        `json:"next_cursor"`
	HasMore    bool           `json:"has_more"`
}

// CountResult is the response of rows:count.
type CountResult struct {
	Count int64 `json:"count"`
}

// SQLResult is the response of rows:sql.
type SQLResult struct {
	SQL string `json:"sql"`
}

// ValueResult is the response of rows/value: the full (untruncated) value of one cell.
type ValueResult struct {
	Value any `json:"value" tstype:"Cell"`
}

// Reference is the response item of rows/referenced-by: how many rows of Schema.Table point at the
// row through the foreign key Constraint (Columns → RefColumns).
type Reference struct {
	Constraint string   `json:"constraint"`
	Schema     string   `json:"schema"`
	Table      string   `json:"table"`
	Columns    []string `json:"columns"`
	RefColumns []string `json:"ref_columns"`
	Count      int64    `json:"count"`
}
