package sqlexec

import (
	"fmt"
	"strconv"
	"strings"

	"github.com/jackc/pgx/v5/pgconn"

	"github.com/amtzespinosa/gresbase/internal/pg/sqlguard"
)

// bound is a statement whose :name parameters became $1, $2…, with their values.
type bound struct {
	text string
	args [][]byte
	orig func(int) int // byte offset in text → byte offset in the script
}

// bind replaces the :name parameters of st (sqlguard.Placeholders) by $n, numbered by first use in
// the statement; nil when it has none. The values never enter the SQL text: they travel as bound
// parameters.
func bind(sql string, st sqlguard.Statement, values map[string]string) (*bound, error) {
	ps := sqlguard.Placeholders(sql, st.Tokens)
	if len(ps) == 0 {
		return nil, nil
	}
	// seg: text[at:at+width] is the $n written for sql[from:to].
	type seg struct{ at, width, from, to int }
	var (
		b    strings.Builder
		args [][]byte
		segs []seg
	)
	num := map[string]int{}
	last := st.Offset
	for _, p := range ps {
		v, ok := values[p.Name]
		if !ok {
			return nil, fmt.Errorf("%w: no value for parameter :%s", ErrInvalid, p.Name)
		}
		n, seen := num[p.Name]
		if !seen {
			args = append(args, []byte(v))
			n = len(args)
			num[p.Name] = n
		}
		b.WriteString(sql[last:p.Start])
		ref := "$" + strconv.Itoa(n)
		segs = append(segs, seg{b.Len(), len(ref), p.Start, p.End})
		b.WriteString(ref)
		last = p.End
	}
	b.WriteString(sql[last : st.Offset+len(st.Text)])
	orig := func(off int) int {
		o := st.Offset + off
		for _, s := range segs {
			if off < s.at {
				break
			}
			if off < s.at+s.width {
				return s.from
			}
			o = s.to + off - (s.at + s.width)
		}
		return o
	}
	return &bound{text: b.String(), args: args, orig: orig}, nil
}

// resultRows is what run reads: pgx.Rows, or readerRows for bound statements.
type resultRows interface {
	FieldDescriptions() []pgconn.FieldDescription
	Next() bool
	RawValues() [][]byte
	Close()
	Err() error
	CommandTag() pgconn.CommandTag
}

// readerRows reads a pgconn result (ExecParams) like pgx.Rows.
type readerRows struct {
	rr     *pgconn.ResultReader
	tag    pgconn.CommandTag
	err    error
	closed bool
}

func (r *readerRows) FieldDescriptions() []pgconn.FieldDescription { return r.rr.FieldDescriptions() }
func (r *readerRows) Next() bool                                   { return r.rr.NextRow() }
func (r *readerRows) RawValues() [][]byte                          { return r.rr.Values() }
func (r *readerRows) Err() error                                   { return r.err }
func (r *readerRows) CommandTag() pgconn.CommandTag                { return r.tag }

func (r *readerRows) Close() {
	if !r.closed {
		r.tag, r.err = r.rr.Close()
		r.closed = true
	}
}
