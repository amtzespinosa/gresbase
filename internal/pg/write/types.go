package write

import "encoding/json"

// Wire types of the changeset endpoints (exported to TypeScript by tygo).
//
// Values use the wire encoding of the rows API (see AGENTS.md): a string, number or boolean is
// the value as text, null is NULL, arrays are JSON arrays and json/jsonb columns take the JSON value
// itself. In Expected, cells that only describe a value ({"$bytea": …} or truncated {"$text": …})
// are not compared.

// Changeset is the body of changesets and changesets:preview: operations applied in order, in one
// transaction.
type Changeset struct {
	Ops []Op `json:"ops"`
}

// Op is one operation. Insert uses Values; update uses PK, Set and Expected; delete uses PK and
// Expected. PK has exactly the primary key columns. Expected holds the values the client saw: if
// the row no longer has them (or is gone), the whole changeset fails with a conflict.
type Op struct {
	Kind     string                     `json:"kind" tstype:"'insert' | 'update' | 'delete'"`
	Values   map[string]json.RawMessage `json:"values,omitempty" tstype:"CellMap"`
	PK       map[string]json.RawMessage `json:"pk,omitempty" tstype:"CellMap"`
	Set      map[string]json.RawMessage `json:"set,omitempty" tstype:"CellMap"`
	Expected map[string]json.RawMessage `json:"expected,omitempty" tstype:"CellMap"`
}

// Reasons why a changeset cannot be undone reliably.
const (
	ReasonUserTriggers  = "user_triggers"  // triggers may have changed more than the changeset
	ReasonDeleteCascade = "delete_cascade" // a delete cascades or sets NULL/DEFAULT in other tables
	ReasonUpdateCascade = "update_cascade" // an update of a referenced key cascades to other tables
)

// ChangesetResult is the response of changesets, undo and redo. ID identifies the changeset for undo/redo;
// when Undoable is false, Reasons says why and undo is refused.
type ChangesetResult struct {
	ID       string   `json:"id"`
	Applied  int      `json:"applied"`
	Undoable bool     `json:"undoable"`
	Reasons  []string `json:"reasons"`
	Undone   bool     `json:"undone"`
}

// ChangesetPreview is the response of changesets:preview: the statements that would run (values as
// literals, for display only) and whether the changeset could be undone.
type ChangesetPreview struct {
	SQL      []string `json:"sql"`
	Undoable bool     `json:"undoable"`
	Reasons  []string `json:"reasons"`
}

// Impact is the response of changesets:impact: rows of other tables that the deletes of a
// changeset would also delete (Action "cascade") or change ("set_null", "set_default").
type Impact struct {
	Tables []ImpactEntry `json:"tables"`
}

// ImpactEntry is the effect on one table.
type ImpactEntry struct {
	Schema string `json:"schema"`
	Table  string `json:"table"`
	Action string `json:"action" tstype:"'cascade' | 'set_null' | 'set_default'"`
	Rows   int64  `json:"rows"`
}

// Dependents is the response of GET …/dependents: tables TRUNCATE … CASCADE would also empty
// ("schema.table", quoted when needed) and objects DROP TABLE … CASCADE would also drop (as
// Postgres describes them, e.g. "view active_users").
type Dependents struct {
	Truncate []string `json:"truncate"`
	Drop     []string `json:"drop"`
}

// TruncateRequest is the body of …:truncate. Confirm must be the exact table name.
type TruncateRequest struct {
	RestartIdentity bool   `json:"restart_identity"`
	Cascade         bool   `json:"cascade"`
	Confirm         string `json:"confirm"`
}

// DropRequest is the body of DELETE /api/v1/tables/{schema}/{table}. Confirm must be the exact
// table name.
type DropRequest struct {
	Cascade bool   `json:"cascade"`
	Confirm string `json:"confirm"`
}

// Conflict travels in the "conflict" field of a 409 error: the operation (index in the changeset)
// whose row is gone (Missing), already exists (Exists, for inserts) or no longer has the expected
// values (Columns lists those that differ). Expected and Current use the wire encoding.
type Conflict struct {
	Op       int            `json:"op"`
	Kind     string         `json:"kind" tstype:"'insert' | 'update' | 'delete'"`
	PK       map[string]any `json:"pk" tstype:"CellMap"`
	Missing  bool           `json:"missing"`
	Exists   bool           `json:"exists"`
	Columns  []string       `json:"columns"`
	Expected map[string]any `json:"expected" tstype:"CellMap"`
	Current  map[string]any `json:"current" tstype:"CellMap | null"`
}

// ImportOptions is the "options" part of an import: how to read the CSV and which CSV column
// (Source, 0-based) goes to which table column. Table columns left out get their default.
type ImportOptions struct {
	Delimiter   string          `json:"delimiter"` // one character, e.g. "," ";" or "\t"
	Header      bool            `json:"header"`    // the first record holds column names and is skipped
	EmptyAsNull bool            `json:"empty_as_null"`
	Mapping     []ImportMapping `json:"mapping"`
}

// ImportMapping sends CSV column Source (0-based) to the table column Column.
type ImportMapping struct {
	Column string `json:"column"`
	Source int    `json:"source"`
}

// ImportResult is the response of an import. With errors nothing was inserted and Inserted is 0.
type ImportResult struct {
	Inserted int64         `json:"inserted"`
	Errors   []ImportError `json:"errors"`
}

// ImportError is a rejected record: Row is its line in the file (1 is the first line, the header
// included); Column is set when the error can be pinned to one column.
type ImportError struct {
	Row     int64  `json:"row"`
	Column  string `json:"column,omitempty"`
	Message string `json:"message"`
}

// StructureChange is the body of structure and structure:preview: one change to the structure of a
// table. Schema and Table name the table (for create_table, where it goes and its new name);
// Column is the existing column of the column changes; Name is the new name of rename_table and
// rename_column, the target schema of set_table_schema, and the existing index or constraint of
// drop_index, validate_constraint and drop_constraint.
type StructureChange struct {
	Kind       string         `json:"kind" tstype:"StructureKind"`
	Schema     string         `json:"schema"`
	Table      string         `json:"table"`
	Column     string         `json:"column,omitempty"`
	Name       string         `json:"name,omitempty"`
	Comment    *string        `json:"comment,omitempty"`     // create_table, set_table_comment (null removes it)
	Columns    []ColumnDef    `json:"columns,omitempty"`     // create_table
	PrimaryKey []string       `json:"primary_key,omitempty"` // create_table
	Def        *ColumnDef     `json:"def,omitempty"`         // add_column
	Type       *TypeSpec      `json:"type,omitempty"`        // alter_column_type
	Using      bool           `json:"using,omitempty"`       // alter_column_type: USING column::new_type
	NotNull    bool           `json:"not_null,omitempty"`    // set_not_null (false drops NOT NULL)
	Default    *Default       `json:"default,omitempty"`     // set_default (null drops the default)
	Confirm    string         `json:"confirm,omitempty"`     // drop_column, drop_index, drop_constraint: the exact name
	Index      *IndexDef      `json:"index,omitempty"`       // create_index
	Constraint *ConstraintDef `json:"constraint,omitempty"`  // add_unique, add_check, add_foreign_key
}

// IndexDef is a new index. Name is optional (Postgres picks one); Method is an index access method
// of pg_am (btree when empty); Where is the predicate of a partial index, an SQL expression shown in
// the preview as written. Concurrently builds it outside a transaction without blocking writes.
type IndexDef struct {
	Name         string        `json:"name,omitempty"`
	Columns      []IndexColumn `json:"columns"`
	Unique       bool          `json:"unique,omitempty"`
	Method       string        `json:"method,omitempty"`
	Where        string        `json:"where,omitempty"`
	Concurrently bool          `json:"concurrently,omitempty"`
}

// IndexColumn is a column of a new index and its order.
type IndexColumn struct {
	Name       string `json:"name"`
	Descending bool   `json:"descending,omitempty"`
}

// ConstraintDef is a new constraint. Name is optional (Postgres picks one). Columns are those of a
// unique constraint or the referencing columns of a foreign key; Expression is the condition of a
// check, an SQL expression shown in the preview as written; the Ref fields name the referenced table
// and columns of a foreign key and OnDelete/OnUpdate its actions (no_action when empty). NotValid
// skips checking the rows already in the table (checks and foreign keys).
type ConstraintDef struct {
	Name       string   `json:"name,omitempty"`
	Columns    []string `json:"columns,omitempty"`
	Expression string   `json:"expression,omitempty"`
	RefSchema  string   `json:"ref_schema,omitempty"`
	RefTable   string   `json:"ref_table,omitempty"`
	RefColumns []string `json:"ref_columns,omitempty"`
	OnDelete   string   `json:"on_delete,omitempty" tstype:"'' | 'no_action' | 'restrict' | 'cascade' | 'set_null' | 'set_default'"`
	OnUpdate   string   `json:"on_update,omitempty" tstype:"'' | 'no_action' | 'restrict' | 'cascade' | 'set_null' | 'set_default'"`
	NotValid   bool     `json:"not_valid,omitempty"`
}

// ColumnDef is a new column. Identity is "", "always" or "by_default" and excludes Default.
type ColumnDef struct {
	Name     string   `json:"name"`
	Type     TypeSpec `json:"type"`
	NotNull  bool     `json:"not_null"`
	Default  *Default `json:"default,omitempty"`
	Identity string   `json:"identity,omitempty" tstype:"'' | 'always' | 'by_default'"`
}

// TypeSpec is a column type: Name is a type name as Postgres parses it (e.g. "integer",
// "character varying", "public.mood"), Modifiers its type modifiers (["50"], ["10", "2"]) and Array
// makes it an array of that type. The server resolves it against pg_type and writes the type as
// format_type() returns it; the client's text never reaches the SQL.
type TypeSpec struct {
	Name      string   `json:"name"`
	Modifiers []string `json:"modifiers,omitempty"`
	Array     bool     `json:"array,omitempty"`
}

// Default is a column default: a Value (text, cast to the column type) or one of the Functions.
type Default struct {
	Kind  string `json:"kind" tstype:"'value' | 'function'"`
	Value string `json:"value"`
}

// Warnings of a structure change.
const (
	WarnRewrite      = "rewrite"        // rewrites the whole table (and its indexes)
	WarnLock         = "lock"           // takes an ACCESS EXCLUSIVE lock: blocks reads and writes
	WarnScan         = "scan"           // reads the whole table under that lock
	WarnExistingData = "existing_data"  // can fail because of the rows already in the table
	WarnBlocksWrites = "blocks_writes"  // takes a lock that blocks writes (not reads) while it runs
	WarnNoTx         = "no_transaction" // runs outside a transaction; a failure leaves an invalid index
)

// StructurePreview is the response of structure:preview and structure: the statements (run in one
// transaction, exactly as shown, except CREATE INDEX CONCURRENTLY, which runs alone outside one)
// and the warnings.
type StructurePreview struct {
	SQL      []string `json:"sql"`
	Warnings []string `json:"warnings" tstype:"('rewrite' | 'lock' | 'scan' | 'existing_data' | 'blocks_writes' | 'no_transaction')[]"`
}

// TypeInfo is an entry of GET /types: a type name for the column type picker.
type TypeInfo struct {
	Name      string `json:"name"`      // format_type(), qualified when not on the search_path
	Category  string `json:"category"`  // pg_type.typcategory (N numeric, S string, D date/time…)
	Modifiers bool   `json:"modifiers"` // takes type modifiers, e.g. varchar(50)
	User      bool   `json:"user"`      // defined outside pg_catalog (enums, domains, extensions)
}
