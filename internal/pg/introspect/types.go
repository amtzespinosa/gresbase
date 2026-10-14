package introspect

// Wire types of the introspection endpoints (exported to TypeScript by tygo).

// Relation kinds.
const (
	KindTable            = "table"
	KindView             = "view"
	KindMaterializedView = "materialized_view"
	KindForeignTable     = "foreign_table"
	KindPartitionedTable = "partitioned_table"
)

// Relation is an entry of the table browser.
type Relation struct {
	Schema        string     `json:"schema"`
	Name          string     `json:"name"`
	Kind          string     `json:"kind"`
	EstimatedRows *int64     `json:"estimated_rows"`
	TotalBytes    int64      `json:"total_bytes"`
	Comment       *string    `json:"comment"`
	Partitions    []Relation `json:"partitions"`
}

// Table is the full description of a relation.
type Table struct {
	Schema          string       `json:"schema"`
	Name            string       `json:"name"`
	Kind            string       `json:"kind"`
	Comment         *string      `json:"comment"`
	EstimatedRows   *int64       `json:"estimated_rows"`
	Sizes           Sizes        `json:"sizes"`
	Columns         []Column     `json:"columns"`
	PrimaryKey      []string     `json:"primary_key"`
	Constraints     []Constraint `json:"constraints"`
	ForeignKeys     []ForeignKey `json:"foreign_keys"`
	ReferencedBy    []ForeignKey `json:"referenced_by"`
	Indexes         []Index      `json:"indexes"`
	Triggers        []Trigger    `json:"triggers"`
	HasPrimaryKey   bool         `json:"has_primary_key"`
	HasUserTriggers bool         `json:"has_user_triggers"`
}

// Sizes of a relation in bytes.
type Sizes struct {
	Total   int64 `json:"total"`
	Table   int64 `json:"table"`
	Indexes int64 `json:"indexes"`
}

// Column describes one column. Type is format_type() and is what writes cast to; BaseType is the
// element type of arrays and the base type of domains (e.g. "int4", "text", "plan_t").
type Column struct {
	Position   int      `json:"position"`
	Name       string   `json:"name"`
	Type       string   `json:"type"`
	BaseType   string   `json:"base_type"`
	IsArray    bool     `json:"is_array"`
	EnumValues []string `json:"enum_values"`
	NotNull    bool     `json:"not_null"`
	Default    *string  `json:"default"`
	Identity   string   `json:"identity"`  // "", "always" or "by_default"
	Generated  *string  `json:"generated"` // generation expression of stored generated columns
	Comment    *string  `json:"comment"`
}

// Constraint is a primary key, unique, check, foreign key or exclusion constraint.
type Constraint struct {
	Name       string   `json:"name"`
	Type       string   `json:"type"` // primary_key, unique, check, foreign_key, exclusion
	Columns    []string `json:"columns"`
	Definition string   `json:"definition"`
	Validated  bool     `json:"validated"` // false for a NOT VALID check or foreign key
}

// ForeignKey goes from Schema.Table(Columns) to RefSchema.RefTable(RefColumns).
type ForeignKey struct {
	Name       string   `json:"name"`
	Schema     string   `json:"schema"`
	Table      string   `json:"table"`
	Columns    []string `json:"columns"`
	RefSchema  string   `json:"ref_schema"`
	RefTable   string   `json:"ref_table"`
	RefColumns []string `json:"ref_columns"`
	OnDelete   string   `json:"on_delete"` // no_action, restrict, cascade, set_null, set_default
	OnUpdate   string   `json:"on_update"`
}

// Index describes one index.
type Index struct {
	Name       string `json:"name"`
	Definition string `json:"definition"`
	IsUnique   bool   `json:"is_unique"`
	IsPrimary  bool   `json:"is_primary"`
	SizeBytes  int64  `json:"size_bytes"`
	Scans      int64  `json:"scans"`
}

// Trigger is a user (non-internal) trigger.
type Trigger struct {
	Name       string `json:"name"`
	Definition string `json:"definition"`
	Enabled    bool   `json:"enabled"`
}

// DDLResult is the response of tables/{schema}/{table}/ddl.
type DDLResult struct {
	DDL string `json:"ddl"`
}

// Completions is what the SQL editor autocompletes: the columns of every relation in user schemas
// and the names of callable functions (user schemas and pg_catalog).
type Completions struct {
	Tables    []CompletionTable `json:"tables"`
	Functions []string          `json:"functions"`
	// SearchPath is current_schemas(false): where unqualified table names resolve, in order.
	SearchPath []string `json:"search_path"`
}

// CompletionTable is a relation and its column names, in column order.
type CompletionTable struct {
	Schema  string   `json:"schema"`
	Name    string   `json:"name"`
	Columns []string `json:"columns"`
	// Partition is true for partitions: the palette lists only their parent.
	Partition bool `json:"partition"`
}
