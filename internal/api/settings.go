package api

import (
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"

	"github.com/amtzespinosa/gresbase/internal/config"
)

// Settings serves GET and PATCH /api/v1/settings: the server settings with their origin.
type Settings struct {
	Store *config.Store
}

func (h Settings) response() config.SettingsResponse {
	return config.SettingsResponse{Settings: h.Store.Settings(), DataPersistent: h.Store.Loss == "", DataLoss: h.Store.Loss}
}

// Get lists every setting with its value, source and lock.
func (h Settings) Get(w http.ResponseWriter, _ *http.Request) {
	WriteJSON(w, http.StatusOK, h.response())
}

// Patch stores settings in gresbase.json; keys set by environment variables are rejected.
func (h Settings) Patch(w http.ResponseWriter, r *http.Request) {
	var req config.SettingsPatch
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 64<<10)).Decode(&req); err != nil {
		Fail(w, http.StatusBadRequest, CodeBadRequest, "invalid settings body")
		return
	}
	switch err := h.Store.Patch(req.Settings); {
	case err == nil:
		WriteJSON(w, http.StatusOK, h.response())
	case errors.Is(err, config.ErrLocked):
		Fail(w, http.StatusConflict, CodeLockedByEnv, err.Error())
	case errors.Is(err, config.ErrUnknownKey), errors.Is(err, config.ErrInvalid):
		Fail(w, http.StatusBadRequest, CodeBadRequest, err.Error())
	default:
		slog.Error("save settings", "err", err)
		Fail(w, http.StatusInternalServerError, CodeInternal, "could not save settings")
	}
}
