package capabilities

import "testing"

func TestCompute(t *testing.T) {
	stmt := []string{"pg_stat_statements"}
	tests := []struct {
		version int
		ext     []string
		want    map[Name]bool
	}{
		{120022, nil, map[Name]bool{GenRandomUUIDCore: false, Merge: false, NullsNotDistinct: false,
			PgInputIsValid: false, PgStatStatements: false, PgStatStatementsExecTime: false}},
		{120022, stmt, map[Name]bool{PgStatStatements: true, PgStatStatementsExecTime: false}},
		{130018, stmt, map[Name]bool{GenRandomUUIDCore: true, Merge: false, PgStatStatementsExecTime: true}},
		{140015, nil, map[Name]bool{GenRandomUUIDCore: true, NullsNotDistinct: false, PgStatStatements: false}},
		{150010, nil, map[Name]bool{Merge: true, NullsNotDistinct: true, PgInputIsValid: false}},
		{160006, nil, map[Name]bool{PgInputIsValid: true}},
		{190000, stmt, map[Name]bool{GenRandomUUIDCore: true, Merge: true, NullsNotDistinct: true,
			PgInputIsValid: true, PgStatStatements: true, PgStatStatementsExecTime: true}},
	}
	for _, tt := range tests {
		set := Compute(tt.version, tt.ext)
		if len(set) != len(rules) {
			t.Errorf("%d: %d capabilities, want %d", tt.version, len(set), len(rules))
		}
		for name, want := range tt.want {
			if got := set.Has(name); got != want {
				t.Errorf("%d %v: %s = %v, want %v", tt.version, tt.ext, name, got, want)
			}
		}
	}
	if c := Compute(120000, nil)[Merge]; c.MinVersion != 150000 || c.Extension != "" {
		t.Errorf("merge requirement = %+v", c)
	}
}

func TestSupportLevel(t *testing.T) {
	tests := []struct {
		version string
		num     int
		want    Level
	}{
		{"9.6.24", 90624, Unsupported},
		{"11.22 (Debian 11.22-1.pgdg120+1)", 110022, Unsupported},
		{"12.22", 120022, Legacy},
		{"13.18 (Debian 13.18-1.pgdg120+1)", 130018, Legacy},
		{"14.15", 140015, Full},
		{"16.4 (Ubuntu 16.4-1.pgdg22.04+1)", 160004, Full},
		{"18.0", 180000, Full},
		{"19beta4", 190000, Prerelease},
		{"19rc1", 190000, Prerelease},
		{"19devel", 190000, Prerelease},
		{"19.0 (Source rc build)", 190000, Full},
	}
	for _, tt := range tests {
		if got := SupportLevel(tt.version, tt.num); got != tt.want {
			t.Errorf("SupportLevel(%q, %d) = %s, want %s", tt.version, tt.num, got, tt.want)
		}
	}
}
