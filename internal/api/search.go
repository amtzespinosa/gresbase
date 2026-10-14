package api

import (
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/amtzespinosa/gresbase/internal/pg/search"
)

// Search finds a term in every table of the connection (internal/pg/search).
type Search struct {
	Pool *pgxpool.Pool
}

// Run handles POST /api/v1/search. The answer is NDJSON: one event per line, sent as soon as each
// table finishes, so results start arriving at once and a proxy never sees an idle response. An
// error before the first event is the usual JSON error; after it, the stream just ends.
func (h Search) Run(w http.ResponseWriter, r *http.Request) {
	var req search.SearchRequest
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 64<<10)).Decode(&req); err != nil {
		Fail(w, http.StatusBadRequest, CodeBadRequest, "invalid body")
		return
	}
	rc := http.NewResponseController(w)
	enc := json.NewEncoder(w)
	started := false
	err := search.Run(r.Context(), h.Pool, req, func(e search.SearchEvent) error {
		if !started {
			started = true
			w.Header().Set("Content-Type", "application/x-ndjson; charset=utf-8")
			// Nginx and Cloudflare must pass each line on at once: no buffering, no compression.
			w.Header().Set("X-Accel-Buffering", "no")
			w.Header().Set("Cache-Control", "no-store, no-transform")
			w.WriteHeader(http.StatusOK)
		}
		if err := enc.Encode(e); err != nil {
			return err
		}
		return rc.Flush()
	})
	switch {
	case err == nil || started:
		if err != nil && r.Context().Err() == nil {
			slog.Debug("search stream", "err", err)
		}
	case errors.Is(err, search.ErrInvalid):
		Fail(w, http.StatusBadRequest, CodeBadRequest, err.Error())
	default:
		DBError(w, err)
	}
}
