// Package capabilities says what a PostgreSQL server can do, from its version and installed
// extensions, so code branches on named capabilities instead of scattered version checks.
//
// To add one: declare its Name, add a row to rules (minimum server_version_num and/or required
// extension) and, if the frontend uses it, call useCapability with the same name.
package capabilities

import (
	"slices"
	"strings"
)

// MinVersion is the oldest server_version_num Gresbase connects to.
const MinVersion = 120000

// Level is how well Gresbase supports a server version.
type Level string

// Support levels.
const (
	Full        Level = "full"
	Legacy      Level = "legacy"      // 12 and 13: out of upstream support, features gated
	Prerelease  Level = "prerelease"  // beta, RC or development builds
	Unsupported Level = "unsupported" // 11 and older: Gresbase refuses to connect
)

// Name identifies a capability.
type Name string

// Known capabilities.
const (
	GenRandomUUIDCore        Name = "gen_random_uuid_core"         // gen_random_uuid() without pgcrypto
	Merge                    Name = "merge"                        // MERGE statement
	NullsNotDistinct         Name = "nulls_not_distinct"           // UNIQUE NULLS NOT DISTINCT
	PgInputIsValid           Name = "pg_input_is_valid"            // pg_input_is_valid()
	PgStatStatements         Name = "pg_stat_statements"           // extension installed
	PgStatStatementsExecTime Name = "pg_stat_statements_exec_time" // total_exec_time instead of total_time
)

// Capability tells whether the server has one, and what it would take otherwise.
type Capability struct {
	Available bool `json:"available"`
	// MinVersion is the server_version_num needed (0: any supported version).
	MinVersion int `json:"min_version,omitempty"`
	// Extension is the extension that must be installed ("" if none).
	Extension string `json:"extension,omitempty"`
}

// Set maps every known capability to its availability.
type Set map[Name]Capability

var rules = map[Name]Capability{
	GenRandomUUIDCore:        {MinVersion: 130000},
	Merge:                    {MinVersion: 150000},
	NullsNotDistinct:         {MinVersion: 150000},
	PgInputIsValid:           {MinVersion: 160000},
	PgStatStatements:         {Extension: "pg_stat_statements"},
	PgStatStatementsExecTime: {MinVersion: 130000, Extension: "pg_stat_statements"},
}

// Compute returns the capabilities of a server with that version number and extensions.
func Compute(versionNum int, extensions []string) Set {
	set := make(Set, len(rules))
	for name, r := range rules {
		r.Available = versionNum >= r.MinVersion && (r.Extension == "" || slices.Contains(extensions, r.Extension))
		set[name] = r
	}
	return set
}

// Has reports whether the capability is available.
func (s Set) Has(n Name) bool { return s[n].Available }

// SupportLevel classifies a server from server_version (e.g. "19beta4") and server_version_num.
func SupportLevel(version string, versionNum int) Level {
	// Only the version token: distributions append text like "(Ubuntu 16.4-1.pgdg22.04+1)".
	v, _, _ := strings.Cut(strings.ToLower(version), " ")
	switch {
	case versionNum < MinVersion:
		return Unsupported
	case strings.Contains(v, "beta") || strings.Contains(v, "rc") || strings.Contains(v, "devel"):
		return Prerelease
	case versionNum < 140000:
		return Legacy
	default:
		return Full
	}
}
