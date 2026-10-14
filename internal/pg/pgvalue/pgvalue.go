// Package pgvalue turns values in Postgres text output format into their JSON wire form (see the
// value encoding table in AGENTS.md). The rows API and the SQL editor results share it.
//
// Queries must ask for text results (pgx.QueryResultFormats{pgx.TextFormatCode}) so every value
// arrives exactly as Postgres prints it (DateStyle=ISO, bytea_output=hex).
package pgvalue

import (
	"context"
	"encoding/json"
	"sync"
	"unicode/utf8"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
)

// MaxText is the size in bytes above which text values are truncated in grids.
const MaxText = 10 * 1024

// byteaPreview is how many bytes of a bytea value are sent as hex.
const byteaPreview = 32

// Bytea is the wire form of a bytea value: its size and the first bytes in hex.
type Bytea struct {
	Bytea ByteaInfo `json:"$bytea"`
}

// ByteaInfo describes a bytea value without sending it.
type ByteaInfo struct {
	Size       int    `json:"size"`
	HexPreview string `json:"hex_preview"`
}

// Truncated is the wire form of a text value longer than the limit: its first bytes, a marker and
// the full size in bytes. The full value is fetched on demand.
type Truncated struct {
	Text      string `json:"$text"`
	Truncated bool   `json:"truncated"`
	Size      int    `json:"size"`
}

// Querier runs a query: a *pgxpool.Pool, *pgx.Conn or pgx.Tx.
type Querier interface {
	Query(ctx context.Context, sql string, args ...any) (pgx.Rows, error)
}

type info struct {
	elem  uint32 // element type of arrays
	base  uint32 // base type of domains
	delim byte   // array delimiter of this type when it is an element
	name  string // format_type(oid, NULL)
}

// Types caches what pg_type says about the result column types. Safe for concurrent use.
type Types struct {
	mu sync.RWMutex
	m  map[uint32]info
}

// NewTypes returns an empty cache.
func NewTypes() *Types { return &Types{m: map[uint32]info{}} }

// Resolve loads the pg_type rows of oids (and of their element and base types) not yet cached.
// Call it before Encode with the OIDs of the result columns.
func (t *Types) Resolve(ctx context.Context, q Querier, oids []uint32) error {
	for {
		t.mu.RLock()
		var missing []uint32
		for _, o := range oids {
			if _, ok := t.m[o]; !ok && o != 0 {
				missing = append(missing, o)
			}
		}
		t.mu.RUnlock()
		if len(missing) == 0 {
			return nil
		}
		rows, err := q.Query(ctx, `SELECT oid, CASE WHEN typcategory = 'A' THEN typelem ELSE 0 END,
				CASE WHEN typtype = 'd' THEN typbasetype ELSE 0 END, typdelim::text, format_type(oid, NULL)
			FROM pg_type WHERE oid = ANY($1)`, missing)
		if err != nil {
			return err
		}
		found := map[uint32]info{}
		for rows.Next() {
			var oid, elem, base uint32
			var delim, name string
			if err := rows.Scan(&oid, &elem, &base, &delim, &name); err != nil {
				return err
			}
			in := info{elem: elem, base: base, delim: ',', name: name}
			if delim != "" {
				in.delim = delim[0]
			}
			found[oid] = in
		}
		if err := rows.Err(); err != nil {
			return err
		}
		oids = nil // next round: element and base types
		t.mu.Lock()
		for _, o := range missing {
			in, ok := found[o]
			if !ok {
				in = info{delim: ','} // unknown type: encode as text
			}
			t.m[o] = in
			oids = append(oids, in.elem, in.base)
		}
		t.mu.Unlock()
	}
}

func (t *Types) info(oid uint32) info {
	t.mu.RLock()
	defer t.mu.RUnlock()
	in, ok := t.m[oid]
	if !ok {
		in.delim = ','
	}
	return in
}

// Encode converts raw (Postgres text output, nil for NULL) of type oid into its wire value.
// With max > 0, text longer than max bytes becomes a Truncated value. With max < 0 (exports) every
// value is complete: bytea travels as its Postgres hex text (\x…) instead of a size and preview.
func (t *Types) Encode(oid uint32, raw []byte, max int) any {
	if raw == nil {
		return nil
	}
	in := t.info(oid)
	switch {
	case in.base != 0:
		return t.Encode(in.base, raw, max)
	case in.elem != 0:
		return t.array(in.elem, raw, max)
	}
	switch oid {
	case pgtype.BoolOID:
		return len(raw) > 0 && raw[0] == 't'
	case pgtype.Int2OID, pgtype.Int4OID:
		return json.RawMessage(string(raw))
	case pgtype.Float4OID, pgtype.Float8OID:
		switch s := string(raw); s {
		case "NaN", "Infinity", "-Infinity":
			return s
		default:
			return json.RawMessage(s)
		}
	case pgtype.JSONOID, pgtype.JSONBOID:
		if max > 0 && len(raw) > max {
			return truncate(raw, max)
		}
		return json.RawMessage(string(raw))
	case pgtype.ByteaOID:
		if max < 0 {
			return string(raw)
		}
		return bytea(raw)
	}
	// Everything else, int8, numeric and money included, travels as text.
	if max > 0 && len(raw) > max {
		return truncate(raw, max)
	}
	return string(raw)
}

func truncate(raw []byte, max int) Truncated {
	i := max
	for i > 0 && !utf8.RuneStart(raw[i]) {
		i--
	}
	return Truncated{Text: string(raw[:i]), Truncated: true, Size: len(raw)}
}

func bytea(raw []byte) Bytea {
	hex := raw
	if len(hex) >= 2 && hex[0] == '\\' && hex[1] == 'x' {
		hex = hex[2:]
	}
	return Bytea{ByteaInfo{Size: len(hex) / 2, HexPreview: string(hex[:min(len(hex), 2*byteaPreview)])}}
}

// array parses an array literal ({a,"b c",NULL,{1,2}}, maybe with [lo:hi]= bounds) into a JSON
// array whose elements are encoded with the element type.
func (t *Types) array(elem uint32, raw []byte, max int) (v any) {
	defer func() {
		if recover() != nil { // malformed literal: never expected from Postgres, fall back to text
			v = string(raw)
		}
	}()
	s := raw
	if s[0] == '[' {
		for s[0] != '=' {
			s = s[1:]
		}
		s = s[1:]
	}
	out, _ := t.parseArray(s, 0, elem, t.info(elem).delim, max)
	return out
}

func (t *Types) parseArray(s []byte, i int, elem uint32, delim byte, max int) ([]any, int) {
	out := []any{}
	i++ // '{'
	if s[i] == '}' {
		return out, i + 1
	}
	for {
		var v any
		switch s[i] {
		case '{':
			v, i = t.parseArray(s, i, elem, delim, max)
		case '"':
			b := []byte{}
			for i++; s[i] != '"'; i++ {
				if s[i] == '\\' {
					i++
				}
				b = append(b, s[i])
			}
			i++
			v = t.Encode(elem, b, max)
		default:
			j := i
			for s[i] != delim && s[i] != '}' {
				i++
			}
			if tok := s[j:i]; string(tok) != "NULL" {
				v = t.Encode(elem, tok, max)
			}
		}
		out = append(out, v)
		if s[i] == '}' {
			return out, i + 1
		}
		i++ // delimiter
	}
}

// TextResults makes pgx return every column in text output format (pass it as the first query
// argument).
var TextResults = pgx.QueryResultFormats{pgx.TextFormatCode}

// Collect reads every row as copies of the raw text values (nil for NULL) and returns them with
// the column type OIDs (known even when there are no rows). It closes rows.
func Collect(rows pgx.Rows) ([][][]byte, []uint32, error) {
	defer rows.Close()
	fds := rows.FieldDescriptions()
	oids := make([]uint32, len(fds))
	for i, fd := range fds {
		oids[i] = fd.DataTypeOID
	}
	var out [][][]byte
	for rows.Next() {
		raw := rows.RawValues()
		row := make([][]byte, len(raw))
		for i, v := range raw {
			if v != nil {
				row[i] = append([]byte{}, v...)
			}
		}
		out = append(out, row)
	}
	return out, oids, rows.Err()
}

// Name returns the type name of oid (format_type) once resolved, or "" when unknown.
func (t *Types) Name(oid uint32) string { return t.info(oid).name }
