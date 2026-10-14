package write

import (
	"bytes"
	"encoding/json"
	"slices"
	"strconv"
	"strings"

	"github.com/jackc/pgx/v5"

	"github.com/amtzespinosa/gresbase/internal/pg/introspect"
)

// maxOps limits the size of one changeset.
const maxOps = 1000

// parse validates cs against t and converts its values to text.
func parse(t *introspect.Table, cs Changeset) ([]TextOp, error) {
	if err := writable(t); err != nil {
		return nil, err
	}
	if len(cs.Ops) == 0 || len(cs.Ops) > maxOps {
		return nil, invalid("a changeset needs between 1 and %d operations", maxOps)
	}
	ops := make([]TextOp, len(cs.Ops))
	for i, op := range cs.Ops {
		var err error
		if ops[i], err = parseOp(t, op); err != nil {
			return nil, invalid("operation %d: %s", i, strings.TrimPrefix(err.Error(), ErrInvalid.Error()+": "))
		}
	}
	return ops, nil
}

func parseOp(t *introspect.Table, op Op) (TextOp, error) {
	out := TextOp{Kind: op.Kind}
	var err error
	switch op.Kind {
	case "insert":
		if op.PK != nil || op.Set != nil || op.Expected != nil {
			return out, invalid("insert takes only values")
		}
		out.Values, err = texts(t, op.Values, true, false)
		return out, err
	case "update", "delete":
		if op.Values != nil {
			return out, invalid("%s does not take values", op.Kind)
		}
		if out.PK, err = parsePK(t, op.PK); err != nil {
			return out, err
		}
		if out.Expected, err = texts(t, op.Expected, false, true); err != nil {
			return out, err
		}
		if op.Kind == "delete" {
			if op.Set != nil {
				return out, invalid("delete does not take set")
			}
			return out, nil
		}
		if len(op.Set) == 0 {
			return out, invalid("update needs set")
		}
		out.Set, err = texts(t, op.Set, true, false)
		return out, err
	}
	return out, invalid("unknown kind %q", op.Kind)
}

func parsePK(t *introspect.Table, pk map[string]json.RawMessage) (map[string]string, error) {
	if len(pk) != len(t.PrimaryKey) {
		return nil, invalid("pk must have exactly the primary key columns %q", t.PrimaryKey)
	}
	vs, err := texts(t, pk, false, false)
	if err != nil {
		return nil, err
	}
	out := map[string]string{}
	for _, name := range t.PrimaryKey {
		v, ok := vs[name]
		if !ok || v == nil {
			return nil, invalid("pk needs a value for %q", name)
		}
		out[name] = *v
	}
	return out, nil
}

// texts converts column → wire value into column → text. Writes cannot target generated columns;
// in expected values, cells that only describe a value are left out.
func texts(t *introspect.Table, m map[string]json.RawMessage, writing, expected bool) (map[string]*string, error) {
	out := map[string]*string{}
	for name, raw := range m {
		c, ok := t.Column(name)
		if !ok {
			return nil, invalid("unknown column %q", name)
		}
		if writing && c.Generated != nil {
			return nil, invalid("column %q is generated", name)
		}
		v, skip, err := toText(c, raw)
		switch {
		case err != nil:
			return nil, err
		case skip && !expected:
			return nil, invalid("column %q needs a value, not a description of it", name)
		case !skip:
			out[name] = v
		}
	}
	return out, nil
}

// toText converts one wire value into Postgres text for column c. skip reports a cell that only
// describes a value ({"$bytea": …} or a truncated {"$text": …}).
func toText(c *introspect.Column, raw json.RawMessage) (v *string, skip bool, err error) {
	var x any
	d := json.NewDecoder(bytes.NewReader(raw))
	d.UseNumber()
	if err := d.Decode(&x); err != nil {
		return nil, false, invalid("value of %q is not JSON", c.Name)
	}
	if x == nil {
		return nil, false, nil
	}
	if describes(x) {
		return nil, true, nil
	}
	s := ""
	switch {
	case !c.IsArray && (c.BaseType == "json" || c.BaseType == "jsonb"):
		s = string(bytes.TrimSpace(raw))
	case c.IsArray:
		a, ok := x.([]any)
		if !ok {
			return nil, false, invalid("value of %q must be a list", c.Name)
		}
		if slices.ContainsFunc(a, describes) {
			return nil, true, nil
		}
		s = arrayLiteral(a)
	default:
		var ok bool
		if s, ok = scalar(x); !ok {
			return nil, false, invalid("value of %q must be a string, number or boolean", c.Name)
		}
	}
	return &s, false, nil
}

// describes reports whether x is a cell that describes a value instead of holding it.
func describes(x any) bool {
	m, ok := x.(map[string]any)
	if !ok {
		return false
	}
	_, isBytea := m["$bytea"]
	_, isText := m["$text"]
	return isBytea || isText && m["truncated"] == true
}

func scalar(x any) (string, bool) {
	switch x := x.(type) {
	case string:
		return x, true
	case json.Number:
		return x.String(), true
	case bool:
		return strconv.FormatBool(x), true
	}
	return "", false
}

// arrayLiteral writes a JSON array as a Postgres array literal: {"a","b c",NULL,{"1","2"}}.
// ponytail: comma delimiter and default bounds; box[] (';') and custom bounds are not supported.
func arrayLiteral(a []any) string {
	parts := make([]string, len(a))
	for i, x := range a {
		switch x := x.(type) {
		case nil:
			parts[i] = "NULL"
		case []any:
			parts[i] = arrayLiteral(x)
		default:
			s, ok := scalar(x)
			if !ok { // an object: an element of json[]/jsonb[]
				b, _ := json.Marshal(x)
				s = string(b)
			}
			parts[i] = `"` + arrayEscaper.Replace(s) + `"`
		}
	}
	return "{" + strings.Join(parts, ",") + "}"
}

var arrayEscaper = strings.NewReplacer(`\`, `\\`, `"`, `\"`)

// dml returns the INSERT, UPDATE or DELETE of op. With returning, it returns the row with
// selectList (as it is after the operation).
func dml(b *builder, t *introspect.Table, op TextOp, returning bool) string {
	var sql string
	switch op.Kind {
	case "insert":
		if len(op.Values) == 0 {
			sql = "INSERT INTO " + table(t) + " DEFAULT VALUES"
			break
		}
		names := sortedKeys(op.Values)
		cols, vals := make([]string, len(names)), make([]string, len(names))
		overriding := ""
		for i, name := range names {
			c, _ := t.Column(name)
			cols[i], vals[i] = ident(name), b.arg(op.Values[name], c.Type)
			if c.Identity == "always" {
				overriding = " OVERRIDING SYSTEM VALUE"
			}
		}
		sql = "INSERT INTO " + table(t) + " (" + strings.Join(cols, ", ") + ")" + overriding +
			" VALUES (" + strings.Join(vals, ", ") + ")"
	case "update":
		names := sortedKeys(op.Set)
		set := make([]string, len(names))
		for i, name := range names {
			c, _ := t.Column(name)
			set[i] = ident(name) + " = " + b.arg(op.Set[name], c.Type)
		}
		sql = "UPDATE " + table(t) + " SET " + strings.Join(set, ", ") + " WHERE " + pkWhere(b, t, op.PK)
	default:
		sql = "DELETE FROM " + table(t) + " WHERE " + pkWhere(b, t, op.PK)
	}
	if returning {
		sql += " RETURNING " + selectList(t)
	}
	return sql
}

func pkWhere(b *builder, t *introspect.Table, pk map[string]string) string {
	conds := make([]string, len(t.PrimaryKey))
	for i, name := range t.PrimaryKey {
		c, _ := t.Column(name)
		v := pk[name]
		conds[i] = ident(name) + " = " + b.arg(&v, c.Type)
	}
	return strings.Join(conds, " AND ")
}

func selectList(t *introspect.Table) string {
	cols := make([]string, len(t.Columns))
	for i, c := range t.Columns {
		cols[i] = ident(c.Name)
	}
	return strings.Join(cols, ", ")
}

// builder collects parameters, or writes literals when the SQL is only for display.
type builder struct {
	literal bool
	args    []any
}

// arg returns a placeholder (or literal) for the text value v (nil is NULL) cast to the catalog
// type typ.
func (b *builder) arg(v *string, typ string) string {
	if b.literal {
		if v == nil {
			return "NULL::" + typ
		}
		return "'" + strings.ReplaceAll(*v, "'", "''") + "'::" + typ
	}
	if v == nil {
		b.args = append(b.args, nil)
	} else {
		b.args = append(b.args, *v)
	}
	return "$" + strconv.Itoa(len(b.args)) + "::" + typ
}

func table(t *introspect.Table) string { return pgx.Identifier{t.Schema, t.Name}.Sanitize() }

func ident(name string) string { return pgx.Identifier{name}.Sanitize() }

func sortedKeys[V any](m map[string]V) []string {
	keys := make([]string, 0, len(m))
	for k := range m {
		keys = append(keys, k)
	}
	slices.Sort(keys)
	return keys
}
