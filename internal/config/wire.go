package config

// Wire types of the settings endpoints (exported to TypeScript by tygo).

// Setting is one entry of GET /api/v1/settings. No setting is a secret.
type Setting struct {
	Key    string `json:"key"`
	Env    string `json:"env"`
	Value  string `json:"value"`
	Source string `json:"source" tstype:"'env' | 'file' | 'default'"`
	// Locked settings are set by their environment variable and cannot be changed here.
	Locked bool `json:"locked"`
	// RestartRequired is true when the value changed since start and only applies on restart.
	RestartRequired bool `json:"restart_required"`
}

// SettingsResponse is the body of GET and PATCH /api/v1/settings.
type SettingsResponse struct {
	Settings []Setting `json:"settings"`
	// DataPersistent is false when the data dir would not keep the settings (see DataLoss).
	DataPersistent bool `json:"data_persistent"`
	// DataLoss says why (Loss* constants), empty when they are kept.
	DataLoss string `json:"data_loss,omitempty"`
}

// SettingsPatch is the body of PATCH /api/v1/settings: key → raw value ("" resets to default).
type SettingsPatch struct {
	Settings map[string]string `json:"settings"`
}
