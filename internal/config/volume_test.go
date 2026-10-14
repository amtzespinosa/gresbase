package config

import (
	"os"
	"testing"
)

// Lines from `docker run … grep " /data " /proc/self/mountinfo`, plus the container root.
const (
	rootLine  = "1600 1500 0:120 / / rw,relatime master:1 - overlay overlay rw,lowerdir=/x\n"
	anonLine  = "1624 1600 8:64 /docker/volumes/5adc8ab7c3cd61596aa0d6d50445fead2406645e03b4f490139530ae8a8bafc8/_data /data rw,relatime master:285 - ext4 /dev/sde rw\n"
	namedLine = "1624 1600 8:64 /docker/volumes/gresbase_gresbase-data/_data /data rw,relatime master:285 - ext4 /dev/sde rw\n"
	bindLine  = "1624 1600 8:32 /home/me/gresbase\\040data /data rw,relatime - ext4 /dev/sdc rw\n"
	tmpfsLine = "1624 1600 0:275 / /data rw,nosuid,nodev,noexec,relatime - tmpfs tmpfs rw\n"
)

func TestDataLoss(t *testing.T) {
	for _, tc := range []struct {
		name, info, dir string
		container       bool
		want            string
	}{
		{"anonymous volume", rootLine + anonLine, "/data", true, LossAnonymousVolume},
		{"named volume", rootLine + namedLine, "/data", true, ""},
		{"bind mount", rootLine + bindLine, "/data", true, ""},
		{"tmpfs", rootLine + tmpfsLine, "/data", true, LossTmpfs},
		{"no mount in a container", rootLine, "/data", true, LossContainerLayer},
		{"no mount outside a container", rootLine, "/var/lib/gresbase", false, ""},
		{"a folder inside a named volume", rootLine + namedLine, "/data/sub", true, ""},
		{"another path, unmounted", rootLine + namedLine, "/srv/data", true, LossContainerLayer},
		{"no mountinfo", "", "/data", true, ""},
	} {
		if got := dataLoss(tc.info, tc.dir, tc.container); got != tc.want {
			t.Errorf("%s: %q, want %q", tc.name, got, tc.want)
		}
	}
	if got := unescape(`/home/me/gresbase\040data`); got != "/home/me/gresbase data" {
		t.Errorf("unescape = %q", got)
	}
}

// A relative data dir is resolved before it is matched against the (absolute) mount points.
func TestDataLossRelativeDir(t *testing.T) {
	wd, err := os.Getwd()
	if err != nil {
		t.Fatal(err)
	}
	if got, want := DataLoss("."), DataLoss(wd); got != want {
		t.Errorf("DataLoss(.) = %q, DataLoss(%q) = %q", got, wd, want)
	}
}
