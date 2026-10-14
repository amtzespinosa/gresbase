package api

import (
	"encoding/json"
	"errors"
	"io"
	"net/http"

	"github.com/amtzespinosa/gresbase/internal/pg/write"
)

// MaxImportBytes is the largest CSV file an import accepts.
const MaxImportBytes = 100 << 20

// Import handles POST /api/v1/tables/{schema}/{table}/import: a multipart body with an "options"
// part (write.ImportOptions as JSON) followed by a "file" part (the CSV). The file is streamed into
// the database, never held in memory. The answer is 200 with the inserted count, or 200 with the
// rejected records (and nothing inserted).
func (h Changesets) Import(w http.ResponseWriter, r *http.Request) {
	if h.readOnly(w) {
		return
	}
	t, ok := h.lookup(w, r)
	if !ok {
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, MaxImportBytes+maxBody)
	mr, err := r.MultipartReader()
	if err != nil {
		Fail(w, http.StatusBadRequest, CodeBadRequest, "expected a multipart body: "+err.Error())
		return
	}
	var opts write.ImportOptions
	part, err := mr.NextPart()
	if err != nil || part.FormName() != "options" {
		Fail(w, http.StatusBadRequest, CodeBadRequest, `the first part must be "options"`)
		return
	}
	d := json.NewDecoder(io.LimitReader(part, maxBody))
	d.DisallowUnknownFields()
	if err := d.Decode(&opts); err != nil {
		Fail(w, http.StatusBadRequest, CodeBadRequest, "invalid options: "+err.Error())
		return
	}
	if part, err = mr.NextPart(); err != nil || part.FormName() != "file" {
		Fail(w, http.StatusBadRequest, CodeBadRequest, `the second part must be "file"`)
		return
	}
	res, err := h.Writer.Import(r.Context(), h.Session(r.Context()), t, opts, part)
	var tooBig *http.MaxBytesError
	switch {
	case errors.As(err, &tooBig):
		Fail(w, http.StatusRequestEntityTooLarge, CodeBadRequest, "the file is larger than 100 MB")
	case err != nil:
		writeError(w, err)
	default:
		WriteJSON(w, http.StatusOK, res)
	}
}
