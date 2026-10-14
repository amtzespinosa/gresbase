// Package rows reads table rows with filters, sorting and pagination (keyset when the table has a
// primary key, offset otherwise).
//
// The client's column names are only used after checking them against the catalog metadata
// (introspect.Table, obtained through Catalog.Lookup) and are always escaped; values are always
// parameters cast to the catalog type of their column.
package rows

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"slices"
	"strconv"
	"strings"

	"github.com/jackc/pgx/v5"

	"github.com/amtzespinosa/gresbase/internal/pg/introspect"
	"github.com/amtzespinosa/gresbase/internal/pg/pgvalue"
)

// ErrInvalid is returned (wrapped) when the request is not valid: unknown column or operator,
// operator not allowed for the column type, bad value, cursor or limit.
var ErrInvalid = errors.New("invalid request")

// ErrRowNotFound is returned by Value when no row has the given primary key.
var ErrRowNotFound = errors.New("row not found")

// MaxLimit is the largest page size.
const MaxLimit = 500

const (
	defaultLimit = 50
	maxInList    = 1000
)

func invalid(format string, a ...any) error {
	return fmt.Errorf("%w: %s", ErrInvalid, fmt.Sprintf(format, a...))
}

// Read returns one page of rows of t.
func Read(ctx context.Context, q pgvalue.Querier, types *pgvalue.Types, t *introspect.Table, query Query) (*Page, error) {
	s, err := build(t, query, false)
	if err != nil {
		return nil, err
	}
	rows, err := q.Query(ctx, s.selectSQL(s.limit+1), append([]any{pgvalue.TextResults}, s.args...)...)
	if err != nil {
		return nil, err
	}
	raws, oids, err := pgvalue.Collect(rows)
	if err != nil {
		return nil, err
	}
	if err := types.Resolve(ctx, q, oids); err != nil {
		return nil, err
	}

	page := &Page{Columns: make([]ResultColumn, len(t.Columns)), Rows: [][]any{}}
	for i, c := range t.Columns {
		page.Columns[i] = ResultColumn{Name: c.Name, Type: c.Type}
	}
	if len(raws) > s.limit {
		raws = raws[:s.limit]
		page.HasMore = true
		if s.keyset {
			c := s.cursorFor(raws[len(raws)-1])
			page.NextCursor = &c
		}
	}
	for _, raw := range raws {
		row := make([]any, len(raw))
		for i, v := range raw {
			row[i] = types.Encode(oids[i], v, pgvalue.MaxText)
		}
		page.Rows = append(page.Rows, row)
	}
	return page, nil
}

// Count returns the exact number of rows matching the filters of query.
func Count(ctx context.Context, q pgvalue.Querier, t *introspect.Table, query Query) (int64, error) {
	query.Cursor, query.Offset, query.Sort = "", 0, nil
	s, err := build(t, query, false)
	if err != nil {
		return 0, err
	}
	rows, err := q.Query(ctx, "SELECT count(*) FROM "+s.table+s.where(), s.args...)
	if err != nil {
		return 0, err
	}
	return pgx.CollectExactlyOneRow(rows, pgx.RowTo[int64])
}

// SQL returns the SELECT equivalent to query with values as escaped literals. It is only for
// showing it or opening it in the SQL editor, never executed by this package.
func SQL(t *introspect.Table, query Query) (string, error) {
	s, err := build(t, query, true)
	if err != nil {
		return "", err
	}
	return s.selectSQL(s.limit), nil
}

// Value returns the full value of column in the row whose primary key is pk (column → value).
func Value(ctx context.Context, q pgvalue.Querier, types *pgvalue.Types, t *introspect.Table, pk map[string]json.RawMessage, column string) (any, error) {
	if !t.HasPrimaryKey {
		return nil, invalid("table has no primary key")
	}
	c, ok := t.Column(column)
	if !ok {
		return nil, invalid("unknown column %q", column)
	}
	b := &builder{}
	where, err := b.pkWhere(t, pk)
	if err != nil {
		return nil, err
	}
	sql := "SELECT " + ident(c.Name) + " FROM " + pgx.Identifier{t.Schema, t.Name}.Sanitize() + " WHERE " + where
	rows, err := q.Query(ctx, sql, append([]any{pgvalue.TextResults}, b.args...)...)
	if err != nil {
		return nil, err
	}
	raws, oids, err := pgvalue.Collect(rows)
	if err != nil {
		return nil, err
	}
	if len(raws) == 0 {
		return nil, ErrRowNotFound
	}
	if err := types.Resolve(ctx, q, oids); err != nil {
		return nil, err
	}
	return types.Encode(oids[0], raws[0][0], 0), nil
}

// ReferencedBy counts, for each foreign key pointing at t, the rows that reference the row of t
// whose primary key is pk. Table and column names come from the catalog, never from the client.
func ReferencedBy(ctx context.Context, q pgvalue.Querier, t *introspect.Table, pk map[string]json.RawMessage) ([]Reference, error) {
	if !t.HasPrimaryKey {
		return nil, invalid("table has no primary key")
	}
	b := &builder{}
	where, err := b.pkWhere(t, pk)
	if err != nil {
		return nil, err
	}
	refs := make([]Reference, 0, len(t.ReferencedBy))
	for _, fk := range t.ReferencedBy {
		sql := "SELECT count(*) FROM " + pgx.Identifier{fk.Schema, fk.Table}.Sanitize() +
			" WHERE (" + idents(fk.Columns) + ") IN (SELECT " + idents(fk.RefColumns) + " FROM " +
			pgx.Identifier{t.Schema, t.Name}.Sanitize() + " WHERE " + where + ")"
		res, _ := q.Query(ctx, sql, b.args...)
		n, err := pgx.CollectExactlyOneRow(res, pgx.RowTo[int64])
		if err != nil {
			return nil, fmt.Errorf("count references from %q.%q: %w", fk.Schema, fk.Table, err)
		}
		refs = append(refs, Reference{Constraint: fk.Name, Schema: fk.Schema, Table: fk.Table,
			Columns: fk.Columns, RefColumns: fk.RefColumns, Count: n})
	}
	return refs, nil
}

// pkWhere returns the condition that selects the row whose primary key is pk (column → value).
func (b *builder) pkWhere(t *introspect.Table, pk map[string]json.RawMessage) (string, error) {
	if len(pk) != len(t.PrimaryKey) {
		return "", invalid("pk must have exactly the primary key columns %q", t.PrimaryKey)
	}
	conds := make([]string, len(t.PrimaryKey))
	for i, name := range t.PrimaryKey {
		raw, ok := pk[name]
		if !ok {
			return "", invalid("pk is missing column %q", name)
		}
		v, err := scalar(raw)
		if err != nil {
			return "", err
		}
		pc, _ := t.Column(name)
		conds[i] = ident(name) + " = " + b.arg(v, pc.Type)
	}
	return strings.Join(conds, " AND "), nil
}

func idents(names []string) string {
	out := make([]string, len(names))
	for i, n := range names {
		out[i] = ident(n)
	}
	return strings.Join(out, ", ")
}

// key is one ORDER BY column. idx is its position in the select list.
type key struct {
	col  *introspect.Column
	idx  int
	desc bool
}

// statement is a validated query, ready to be turned into SQL.
type statement struct {
	t       *introspect.Table
	table   string
	conds   []string // filters, already joined with AND/OR, then the keyset predicate
	keys    []key
	keyset  bool
	limit   int
	offset  int
	args    []any
	builder *builder
}

func (s *statement) where() string {
	if len(s.conds) == 0 {
		return ""
	}
	return " WHERE " + strings.Join(s.conds, " AND ")
}

func (s *statement) selectSQL(limit int) string {
	cols := make([]string, len(s.t.Columns))
	for i, c := range s.t.Columns {
		cols[i] = ident(c.Name)
	}
	var b strings.Builder
	b.WriteString("SELECT " + strings.Join(cols, ", ") + " FROM " + s.table + s.where())
	if len(s.keys) > 0 {
		order := make([]string, len(s.keys))
		for i, k := range s.keys {
			order[i] = ident(k.col.Name) + " ASC NULLS LAST"
			if k.desc {
				order[i] = ident(k.col.Name) + " DESC NULLS FIRST"
			}
		}
		b.WriteString(" ORDER BY " + strings.Join(order, ", "))
	}
	if limit > 0 {
		b.WriteString(" LIMIT " + strconv.Itoa(limit))
	}
	if s.offset > 0 {
		b.WriteString(" OFFSET " + strconv.Itoa(s.offset))
	}
	return b.String()
}

// cursor is what next_cursor encodes: the sort key names and the last row's values as text.
type cursor struct {
	Keys   []string  `json:"k"`
	Values []*string `json:"v"`
}

func (s *statement) cursorFor(row [][]byte) string {
	c := cursor{}
	for _, k := range s.keys {
		c.Keys = append(c.Keys, k.col.Name)
		var v *string
		if raw := row[k.idx]; raw != nil {
			str := string(raw)
			v = &str
		}
		c.Values = append(c.Values, v)
	}
	b, _ := json.Marshal(c)
	return base64.RawURLEncoding.EncodeToString(b)
}

func build(t *introspect.Table, q Query, literal bool) (*statement, error) {
	b := &builder{literal: literal}
	s := &statement{t: t, table: pgx.Identifier{t.Schema, t.Name}.Sanitize(), keyset: t.HasPrimaryKey,
		limit: q.Limit, offset: q.Offset, builder: b}
	switch {
	case s.limit == 0:
		s.limit = defaultLimit
	case s.limit < 0 || s.limit > MaxLimit:
		return nil, invalid("limit must be between 1 and %d", MaxLimit)
	}
	if s.offset < 0 {
		return nil, invalid("offset must not be negative")
	}
	if q.Cursor != "" && (!s.keyset || s.offset > 0) {
		return nil, invalid("cursor needs a table with a primary key and no offset")
	}

	sep := " AND "
	switch q.Logic {
	case "", "and":
	case "or":
		sep = " OR "
	default:
		return nil, invalid("logic must be and or or")
	}
	var filters []string
	for _, f := range q.Filters {
		c, ok := t.Column(f.Column)
		if !ok {
			return nil, invalid("unknown column %q", f.Column)
		}
		cond, err := b.filter(c, f)
		if err != nil {
			return nil, err
		}
		filters = append(filters, cond)
	}
	if len(filters) > 0 {
		s.conds = append(s.conds, "("+strings.Join(filters, sep)+")")
	}

	seen := map[string]bool{}
	addKey := func(name string, desc bool) error {
		idx := slices.IndexFunc(t.Columns, func(c introspect.Column) bool { return c.Name == name })
		if idx < 0 {
			return invalid("unknown column %q", name)
		}
		c := &t.Columns[idx]
		if seen[name] {
			return nil
		}
		if !c.IsArray && c.BaseType == "json" || c.BaseType == "xml" {
			return invalid("cannot sort by %s column %q", c.Type, name)
		}
		seen[name] = true
		s.keys = append(s.keys, key{col: c, idx: idx, desc: desc})
		return nil
	}
	for _, k := range q.Sort {
		if k.Dir != "asc" && k.Dir != "desc" {
			return nil, invalid("sort dir must be asc or desc")
		}
		if err := addKey(k.Column, k.Dir == "desc"); err != nil {
			return nil, err
		}
	}
	if s.keyset { // the primary key breaks ties so every row has a unique position
		for _, name := range t.PrimaryKey {
			if err := addKey(name, false); err != nil {
				return nil, err
			}
		}
	}
	if q.Cursor != "" {
		pred, err := s.keysetPredicate(q.Cursor)
		if err != nil {
			return nil, err
		}
		s.conds = append(s.conds, pred)
	}
	s.args = b.args
	return s, nil
}

// keysetPredicate is the condition "comes after the cursor row" for the sort keys, with NULLs
// ordered last in ascending keys and first in descending ones (Postgres defaults).
func (s *statement) keysetPredicate(raw string) (string, error) {
	data, err := base64.RawURLEncoding.DecodeString(raw)
	var c cursor
	if err == nil {
		err = json.Unmarshal(data, &c)
	}
	if err != nil || len(c.Keys) != len(s.keys) || len(c.Values) != len(s.keys) {
		return "", invalid("cursor does not match this query")
	}
	for i, k := range s.keys {
		if c.Keys[i] != k.col.Name {
			return "", invalid("cursor does not match this query")
		}
	}
	b := s.builder
	var ors []string
	for i, k := range s.keys {
		var ands []string
		for j := range i {
			if v := c.Values[j]; v == nil {
				ands = append(ands, ident(s.keys[j].col.Name)+" IS NULL")
			} else {
				ands = append(ands, ident(s.keys[j].col.Name)+" = "+b.arg(*v, s.keys[j].col.Type))
			}
		}
		col, v := ident(k.col.Name), c.Values[i]
		switch {
		case !k.desc && v == nil: // only NULLs come after a NULL: no row is strictly after it here
			continue
		case !k.desc:
			ands = append(ands, "("+col+" > "+b.arg(*v, k.col.Type)+" OR "+col+" IS NULL)")
		case v == nil:
			ands = append(ands, col+" IS NOT NULL")
		default:
			ands = append(ands, col+" < "+b.arg(*v, k.col.Type))
		}
		ors = append(ors, "("+strings.Join(ands, " AND ")+")")
	}
	if len(ors) == 0 {
		return "false", nil
	}
	return "(" + strings.Join(ors, " OR ") + ")", nil
}

// builder collects parameters, or writes literals when the SQL is only for display.
type builder struct {
	literal bool
	args    []any
}

// arg returns a placeholder (or literal) for the text value v cast to the catalog type typ.
func (b *builder) arg(v, typ string) string {
	if b.literal {
		return "'" + strings.ReplaceAll(v, "'", "''") + "'::" + typ
	}
	b.args = append(b.args, v)
	return "$" + strconv.Itoa(len(b.args)) + "::" + typ
}

var textTypes = map[string]bool{"text": true, "varchar": true, "bpchar": true, "name": true, "citext": true}

var comparisons = map[string]string{"eq": "=", "neq": "IS DISTINCT FROM", "lt": "<", "lte": "<=", "gt": ">", "gte": ">="}

var likeEscaper = strings.NewReplacer(`\`, `\\`, `%`, `\%`, `_`, `\_`)

func (b *builder) filter(c *introspect.Column, f Filter) (string, error) {
	col := ident(c.Name)
	isJSON := !c.IsArray && (c.BaseType == "json" || c.BaseType == "jsonb")
	unordered := isJSON || c.BaseType == "bool" || c.IsArray
	notFor := func() error { return invalid("operator %s is not valid for %s column %q", f.Op, c.Type, c.Name) }

	switch f.Op {
	case "is_null":
		return col + " IS NULL", nil
	case "not_null":
		return col + " IS NOT NULL", nil
	case "eq", "neq", "lt", "lte", "gt", "gte":
		if !c.IsArray && c.BaseType == "json" || f.Op != "eq" && f.Op != "neq" && unordered {
			return "", notFor()
		}
		v, err := scalar(f.Value)
		if err != nil {
			return "", err
		}
		return col + " " + comparisons[f.Op] + " " + b.arg(v, c.Type), nil
	case "contains", "starts_with":
		if c.IsArray || !textTypes[c.BaseType] {
			return "", notFor()
		}
		v, err := scalar(f.Value)
		if err != nil {
			return "", err
		}
		pattern := likeEscaper.Replace(v) + "%"
		if f.Op == "contains" {
			pattern = "%" + pattern
		}
		return col + " ILIKE " + b.arg(pattern, "text"), nil
	case "in", "between":
		if isJSON || c.IsArray || f.Op == "between" && unordered {
			return "", notFor()
		}
		vs, err := list(f.Value)
		if err != nil {
			return "", err
		}
		if f.Op == "between" {
			if len(vs) != 2 {
				return "", invalid("between needs two values")
			}
			return col + " BETWEEN " + b.arg(vs[0], c.Type) + " AND " + b.arg(vs[1], c.Type), nil
		}
		if len(vs) == 0 || len(vs) > maxInList {
			return "", invalid("in needs between 1 and %d values", maxInList)
		}
		ph := make([]string, len(vs))
		for i, v := range vs {
			ph[i] = b.arg(v, c.Type)
		}
		return col + " IN (" + strings.Join(ph, ", ") + ")", nil
	case "json_contains":
		if !isJSON {
			return "", notFor()
		}
		v, err := jsonValue(f.Value)
		if err != nil {
			return "", err
		}
		return col + "::jsonb @> " + b.arg(v, "jsonb"), nil
	}
	return "", invalid("unknown operator %q", f.Op)
}

// scalar reads a filter value: a JSON string, number or boolean, as text.
func scalar(raw json.RawMessage) (string, error) {
	var v any
	d := json.NewDecoder(strings.NewReader(string(raw)))
	d.UseNumber()
	if len(raw) == 0 || d.Decode(&v) != nil {
		return "", invalid("value is required")
	}
	switch v := v.(type) {
	case string:
		return v, nil
	case json.Number:
		return v.String(), nil
	case bool:
		return strconv.FormatBool(v), nil
	}
	return "", invalid("value must be a string, number or boolean")
}

func list(raw json.RawMessage) ([]string, error) {
	var items []json.RawMessage
	if err := json.Unmarshal(raw, &items); err != nil {
		return nil, invalid("value must be a list")
	}
	out := make([]string, len(items))
	for i, it := range items {
		v, err := scalar(it)
		if err != nil {
			return nil, err
		}
		out[i] = v
	}
	return out, nil
}

// jsonValue reads the value of json_contains: any JSON, or a string holding JSON text.
func jsonValue(raw json.RawMessage) (string, error) {
	var s string
	if json.Unmarshal(raw, &s) == nil {
		raw = json.RawMessage(s)
	}
	if len(raw) == 0 || !json.Valid(raw) {
		return "", invalid("value must be JSON")
	}
	return string(raw), nil
}

func ident(name string) string { return pgx.Identifier{name}.Sanitize() }
