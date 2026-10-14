package pgvalue_test

import (
	"context"
	"encoding/json"
	"strings"
	"testing"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"

	"github.com/amtzespinosa/gresbase/internal/pg/pgvalue"
	"github.com/amtzespinosa/gresbase/internal/pgtest"
)

func TestMain(m *testing.M) { pgtest.Main(m) }

func TestEncode(t *testing.T) {
	pool := pgtest.Pool(t)
	ctx := context.Background()
	types := pgvalue.NewTypes()
	long := strings.Repeat("ñ", 6000) // 12000 bytes, 2 bytes per rune

	for _, tc := range []struct {
		expr, want string
	}{
		{`NULL::int4`, `null`},
		{`true`, `true`},
		{`42::int2`, `42`},
		{`-7::int4`, `-7`},
		{`1.5::float8`, `1.5`},
		{`'NaN'::float8`, `"NaN"`},
		{`'-Infinity'::float4`, `"-Infinity"`},
		{`9007199254740993::int8`, `"9007199254740993"`},
		{`12345678901234567890.123::numeric`, `"12345678901234567890.123"`},
		{`'{"a": [1, null]}'::jsonb`, `{"a":[1,null]}`},
		{`'[1, 2]'::json`, `[1,2]`},
		{`'\xdeadbeef'::bytea`, `{"$bytea":{"size":4,"hex_preview":"deadbeef"}}`},
		{`'2025-01-02'::date`, `"2025-01-02"`},
		{`'pro'::plan_t`, `"pro"`},
		{`'10.0.0.1'::inet`, `"10.0.0.1"`},
		{`ARRAY[1, NULL, 3]`, `[1,null,3]`},
		{`'{{1,2},{3,4}}'::int8[]`, `[["1","2"],["3","4"]]`},
		{`'[0:1]={a,b}'::text[]`, `["a","b"]`},
		{`ARRAY['', 'a"b', 'c\d', 'NULL', 'x,y', NULL]`, `["","a\"b","c\\d","NULL","x,y",null]`},
		{`ARRAY['{"k": 1}'::jsonb]`, `[{"k":1}]`},
		{`ARRAY['pro', 'team']::plan_t[]`, `["pro","team"]`},
		{`ARRAY[true, false]`, `[true,false]`},
		{`'{}'::text[]`, `[]`},
	} {
		got := encodeOne(ctx, t, pool, types, tc.expr)
		if got != tc.want {
			t.Errorf("%s: got %s, want %s", tc.expr, got, tc.want)
		}
	}

	var tr pgvalue.Truncated
	if err := json.Unmarshal([]byte(encodeOne(ctx, t, pool, types, "'"+long+"'::text")), &tr); err != nil {
		t.Fatal(err)
	}
	if !tr.Truncated || tr.Size != 12000 || len(tr.Text) != pgvalue.MaxText || !strings.HasPrefix(long, tr.Text) {
		t.Errorf("truncated: %v %d %d", tr.Truncated, tr.Size, len(tr.Text))
	}
}

func encodeOne(ctx context.Context, t *testing.T, pool pgvalue.Querier, types *pgvalue.Types, expr string) string {
	t.Helper()
	rows, err := pool.Query(ctx, "SELECT "+expr, pgx.QueryResultFormats{pgx.TextFormatCode})
	if err != nil {
		t.Fatalf("%s: %v", expr, err)
	}
	oid := rows.FieldDescriptions()[0].DataTypeOID
	var raw []byte
	for rows.Next() {
		if v := rows.RawValues()[0]; v != nil {
			raw = append([]byte{}, v...)
		}
	}
	if err := rows.Err(); err != nil {
		t.Fatalf("%s: %v", expr, err)
	}
	if err := types.Resolve(ctx, pool, []uint32{oid}); err != nil {
		t.Fatal(err)
	}
	b, err := json.Marshal(types.Encode(oid, raw, pgvalue.MaxText))
	if err != nil {
		t.Fatalf("%s: %v", expr, err)
	}
	return string(b)
}

func TestEncodeFull(t *testing.T) {
	types := pgvalue.NewTypes()
	if got := types.Encode(pgtype.ByteaOID, []byte(`\xdeadbeef`), -1); got != `\xdeadbeef` {
		t.Errorf("bytea = %v, want hex text", got)
	}
	long := strings.Repeat("x", 2*pgvalue.MaxText)
	if got := types.Encode(pgtype.TextOID, []byte(long), -1); got != long {
		t.Errorf("text truncated in full mode")
	}
}
